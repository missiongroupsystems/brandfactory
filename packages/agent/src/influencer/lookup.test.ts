import { describe, expect, it } from 'vitest'
import type { GroundedRequest, GroundedResult, LLMProvider } from '@brandfactory/adapter-llm'
import type { LookupPlatform, ResearchSource } from '@brandfactory/shared'
import { LOOKUP_PLATFORMS, LookupDraftSchema, LookupPlatformSchema } from '@brandfactory/shared'
import { applyLookupBoundaries, buildLookupPrompt, extractJson, lookupCreator } from './lookup'

// ---------------------------------------------------------------------------
// The boundary test is the important one in this release
// ---------------------------------------------------------------------------
//
// Every case below is a thing a real model did in the Phase E spike, not a shape
// somebody imagined. The captures are in `src/influencer/fixtures/` and the
// write-up is `docs/completions/influencer-quick-add-phase-e-the-lookup-spike.md`.

/** A retrieval log that names the handle — grounding satisfied. */
function retrievedFor(handle: string): ResearchSource[] {
  return [
    { title: `${handle} on Instagram`, url: `https://www.instagram.com/${handle}/` },
    { title: 'Some unrelated page', url: 'https://example.com/other' },
  ]
}

/** A well-formed answer, which each test then breaks in exactly one way. */
function answer(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outcome: 'ok',
    name: 'Lennard Yeong',
    vertical: 'food',
    accounts: [
      {
        platform: 'instagram',
        handle: 'lennardy',
        followers: 570_000,
        engagementRate: null,
        url: 'https://www.instagram.com/lennardy/',
        sourceUrl: 'https://www.instagram.com/lennardy/',
      },
    ],
    ...over,
  }
}

const INPUT = {
  platform: 'instagram' as LookupPlatform,
  handle: 'lennardy',
  retrieved: retrievedFor('lennardy'),
}

describe('applyLookupBoundaries', () => {
  it('keeps a complete, grounded, sourced answer', () => {
    const { draft, found, matched } = applyLookupBoundaries(answer(), INPUT)
    expect(matched).toBe(true)
    expect(draft.name).toBe('Lennard Yeong')
    expect(draft.vertical).toBe('food')
    expect(draft.accounts[0]?.followers).toBe(570_000)
    expect(found).toEqual({ name: true, followers: true, vertical: true, url: true })
  })

  // ---- Rule 3: the retrieval log, not the model's citation ----------------

  it('drops a figure whose handle was never retrieved, however it was cited', () => {
    // `openai/gpt-5.1:online` fetched nothing across 26 spike calls and still
    // returned this: a confident figure sourced to a page it had not read.
    const { draft, found } = applyLookupBoundaries(answer(), { ...INPUT, retrieved: [] })
    expect(draft.accounts[0]?.followers).toBeNull()
    expect(draft.accounts[0]?.sourceUrl).toBeNull()
    expect(found.followers).toBe(false)
  })

  it('drops a figure when the retrieval log is about somebody else', () => {
    const { draft } = applyLookupBoundaries(answer(), {
      ...INPUT,
      // The live `@novitalam` run really did retrieve a LinkedIn profile for a
      // different person with a similar name.
      retrieved: [{ title: 'Novita Halim', url: 'https://linkedin.com/in/novita-halim-5b87a47b' }],
    })
    expect(draft.accounts[0]?.followers).toBeNull()
  })

  it('accepts grounding proved by the page title alone', () => {
    const { draft } = applyLookupBoundaries(answer(), {
      ...INPUT,
      retrieved: [{ title: 'Lennard Yeong (@lennardy) — profile', url: 'https://storify.me/x/1' }],
    })
    expect(draft.accounts[0]?.followers).toBe(570_000)
  })

  // ---- Rules 1 and 2: a figure needs a source -----------------------------

  it('drops an uncited figure even when the handle was retrieved', () => {
    const account = {
      ...(answer()['accounts'] as Record<string, unknown>[])[0],
      sourceUrl: null,
    }
    const { draft, found } = applyLookupBoundaries(answer({ accounts: [account] }), INPUT)
    expect(draft.accounts[0]?.followers).toBeNull()
    expect(found.followers).toBe(false)
  })

  it('drops a zero follower count rather than filing a creator in Nano', () => {
    const account = { ...(answer()['accounts'] as Record<string, unknown>[])[0], followers: 0 }
    const { draft, found } = applyLookupBoundaries(answer({ accounts: [account] }), INPUT)
    expect(draft.accounts[0]?.followers).toBeNull()
    expect(found.followers).toBe(false)
  })

  it('keeps the account itself when only the figure is dropped', () => {
    // The person still gets a pre-filled platform and handle to type a number
    // into, which is most of the typing gone.
    const { draft, matched } = applyLookupBoundaries(answer(), { ...INPUT, retrieved: [] })
    expect(matched).toBe(true)
    expect(draft.accounts).toHaveLength(1)
    expect(draft.accounts[0]?.handle).toBe('lennardy')
  })

  // ---- Rule 4: the account that was asked about ---------------------------

  it('matches the platform case-insensitively', () => {
    // Every winning spike capture returned `"Instagram"` against an enum listing
    // `instagram`. An exact match would discard the whole answer.
    const account = {
      ...(answer()['accounts'] as Record<string, unknown>[])[0],
      platform: 'Instagram',
    }
    const { draft, matched } = applyLookupBoundaries(answer({ accounts: [account] }), INPUT)
    expect(matched).toBe(true)
    expect(draft.accounts[0]?.platform).toBe('instagram')
  })

  it('strips a leading @ from the handle', () => {
    // `InfluencerHandleSchema` refuses one, so an unstripped handle would fail
    // the create the person submits afterwards.
    const account = {
      ...(answer()['accounts'] as Record<string, unknown>[])[0],
      handle: '@lennardy',
    }
    const { draft, matched } = applyLookupBoundaries(answer({ accounts: [account] }), INPUT)
    expect(matched).toBe(true)
    expect(draft.accounts[0]?.handle).toBe('lennardy')
  })

  it('does not match an account on a different platform', () => {
    const account = {
      ...(answer()['accounts'] as Record<string, unknown>[])[0],
      platform: 'tiktok',
    }
    const { matched, draft } = applyLookupBoundaries(answer({ accounts: [account] }), INPUT)
    expect(matched).toBe(false)
    expect(draft.accounts).toEqual([])
  })

  it('drops accounts that were not asked about', () => {
    const [wanted] = answer()['accounts'] as Record<string, unknown>[]
    const extra = { ...wanted, platform: 'tiktok', handle: 'lennardy' }
    const { draft } = applyLookupBoundaries(answer({ accounts: [wanted, extra] }), INPUT)
    expect(draft.accounts).toHaveLength(1)
    expect(draft.accounts[0]?.platform).toBe('instagram')
  })

  it('reads the requested account out of any position in the list', () => {
    const [wanted] = answer()['accounts'] as Record<string, unknown>[]
    const other = { ...wanted, platform: 'tiktok', handle: 'someone-else' }
    const { draft, matched } = applyLookupBoundaries(answer({ accounts: [other, wanted] }), INPUT)
    expect(matched).toBe(true)
    expect(draft.accounts[0]?.followers).toBe(570_000)
  })

  // ---- Rule 5: the closed enum --------------------------------------------

  it('maps a vertical outside the enum to null', () => {
    const { draft, found } = applyLookupBoundaries(answer({ vertical: 'lifestyle' }), INPUT)
    expect(draft.vertical).toBeNull()
    expect(found.vertical).toBe(false)
  })

  it('folds a capitalised vertical onto the enum', () => {
    const { draft } = applyLookupBoundaries(answer({ vertical: 'Food' }), INPUT)
    expect(draft.vertical).toBe('food')
  })

  // ---- Rule 6: engagement is never taken ----------------------------------

  it('drops an engagement rate unconditionally', () => {
    const account = {
      ...(answer()['accounts'] as Record<string, unknown>[])[0],
      engagementRate: 4.2,
    }
    const { draft } = applyLookupBoundaries(answer({ accounts: [account] }), INPUT)
    expect(draft.accounts[0]?.engagementRate).toBeNull()
  })

  // ---- Rule 7: a name is not the handle -----------------------------------

  it('discards a name that is just the handle echoed back', () => {
    // What `generateObject` returned every time it failed to ground.
    const { draft, found } = applyLookupBoundaries(answer({ name: 'lennardy' }), INPUT)
    expect(draft.name).toBeNull()
    expect(found.name).toBe(false)
  })

  it('discards an ungrounded name', () => {
    const { draft, found } = applyLookupBoundaries(answer(), { ...INPUT, retrieved: [] })
    expect(draft.name).toBeNull()
    expect(found.name).toBe(false)
  })

  it('discards a name longer than the record can hold, and keeps the figure beside it', () => {
    // A channel title with its tagline attached. `InfluencerNameSchema` is
    // `.max(200)`, and this used to pass through unchecked — producing a draft
    // that failed `LookupDraftSchema`, crossed the wire, and was refused by the
    // *create* the person submitted after paying for the lookup.
    const { draft, found } = applyLookupBoundaries(answer({ name: 'L'.repeat(201) }), INPUT)
    expect(draft.name).toBeNull()
    expect(found.name).toBe(false)
    // Refusing the name must not cost the answer: the same rule as `readUrl`.
    expect(draft.accounts[0]?.followers).toBe(570_000)
    expect(found.followers).toBe(true)
  })

  it('keeps a name of exactly the length the record accepts', () => {
    const name = 'L'.repeat(200)
    const { draft, found } = applyLookupBoundaries(answer({ name }), INPUT)
    expect(draft.name).toBe(name)
    expect(found.name).toBe(true)
  })

  // ---- The invariant the three cases above are instances of ----------------

  it('always returns a draft its own wire type accepts', () => {
    // The property, rather than one more field's rule. `routes/influencers.ts`
    // answers `c.json(result)` with no output parse, so anything this function
    // builds is what a browser receives — and a `LookupDraft` that is not one is
    // a contract broken in the one place nothing checks it.
    const hostile = [
      answer({ name: 'L'.repeat(5000) }),
      answer({ name: '   ' }),
      answer({ name: 42 }),
      answer({ vertical: 'lifestyle' }),
      answer({ accounts: [{ platform: 'Instagram', handle: '@lennardy', followers: -1 }] }),
      answer({ accounts: [{ platform: 'instagram', handle: 'lennardy', url: 'javascript:1' }] }),
    ]
    for (const raw of hostile) {
      const { draft } = applyLookupBoundaries(raw, INPUT)
      expect(LookupDraftSchema.safeParse(draft).success).toBe(true)
    }
  })

  // ---- Shape failures ------------------------------------------------------

  it('returns unmatched for an answer with no accounts', () => {
    const { matched, draft, found } = applyLookupBoundaries(answer({ accounts: [] }), INPUT)
    expect(matched).toBe(false)
    expect(draft.accounts).toEqual([])
    expect(found.followers).toBe(false)
  })

  it('survives a malformed account beside a good one', () => {
    const [wanted] = answer()['accounts'] as Record<string, unknown>[]
    const { draft, matched } = applyLookupBoundaries(
      answer({ accounts: [null, 'nonsense', 42, wanted] }),
      INPUT,
    )
    expect(matched).toBe(true)
    expect(draft.accounts[0]?.followers).toBe(570_000)
  })

  // ---- Malformed fields lose themselves, not the account ------------------
  //
  // The account survives and the bad field becomes the blank it always meant.
  // Losing the whole account here reported `not-found` for a creator whose
  // figure was grounded and real, and told the reader nothing could be verified.

  it('drops a url that is not http(s) without taking the account with it', () => {
    // `WebsiteUrlSchema`'s reason: the value is rendered into an `href`, and zod
    // accepts `javascript:alert(1)` as a valid URL.
    const account = {
      ...(answer()['accounts'] as Record<string, unknown>[])[0],
      url: 'javascript:alert(1)',
    }
    const { matched, draft, found } = applyLookupBoundaries(answer({ accounts: [account] }), INPUT)
    expect(matched).toBe(true)
    expect(draft.accounts[0]?.url).toBeNull()
    expect(found.url).toBe(false)
    // The grounded figure is untouched — it was never what was wrong.
    expect(draft.accounts[0]?.followers).toBe(570_000)
  })

  it('keeps the figure when the profile url arrives with no scheme', () => {
    // The ordinary model answer, and the one this used to report `not-found` for.
    const account = {
      ...(answer()['accounts'] as Record<string, unknown>[])[0],
      url: 'instagram.com/lennardy',
    }
    const { matched, draft } = applyLookupBoundaries(answer({ accounts: [account] }), INPUT)
    expect(matched).toBe(true)
    expect(draft.accounts[0]?.url).toBeNull()
    expect(draft.accounts[0]?.followers).toBe(570_000)
    expect(draft.name).toBe('Lennard Yeong')
  })

  it('drops a malformed source url, and the figure goes with that one', () => {
    // Unlike `url`, this field *is* the reason to believe the number — rule 2.
    const account = {
      ...(answer()['accounts'] as Record<string, unknown>[])[0],
      sourceUrl: 'not a url at all',
    }
    const { matched, draft, found } = applyLookupBoundaries(answer({ accounts: [account] }), INPUT)
    expect(matched).toBe(true)
    expect(draft.accounts[0]?.followers).toBeNull()
    expect(found.followers).toBe(false)
  })

  it('blanks a non-integer follower count rather than discarding the answer', () => {
    const account = { ...(answer()['accounts'] as Record<string, unknown>[])[0], followers: 1200.5 }
    const { matched, draft, found } = applyLookupBoundaries(answer({ accounts: [account] }), INPUT)
    expect(matched).toBe(true)
    expect(draft.accounts[0]?.followers).toBeNull()
    expect(found.followers).toBe(false)
    expect(draft.name).toBe('Lennard Yeong')
  })

  it('blanks an out-of-range engagement rate rather than discarding the answer', () => {
    const account = {
      ...(answer()['accounts'] as Record<string, unknown>[])[0],
      engagementRate: 4200,
    }
    const { matched, draft } = applyLookupBoundaries(answer({ accounts: [account] }), INPUT)
    expect(matched).toBe(true)
    expect(draft.accounts[0]?.engagementRate).toBeNull()
  })

  it('still discards an account whose platform is not one of the six', () => {
    // Identity, not decoration: an answer that cannot say which account it is
    // about is not an answer.
    const account = { ...(answer()['accounts'] as Record<string, unknown>[])[0], platform: 'vine' }
    expect(applyLookupBoundaries(answer({ accounts: [account] }), INPUT).matched).toBe(false)
  })

  // ---- Rule 3 again: the handle must be named as a handle -----------------

  it('does not accept a handle that is merely a run of letters inside a word', () => {
    const { matched, found } = applyLookupBoundaries(
      answer({
        name: 'Lennard Yeong',
        accounts: [
          {
            ...(answer()['accounts'] as Record<string, unknown>[])[0],
            handle: 'nard',
          },
        ],
      }),
      { platform: 'instagram', handle: 'nard', retrieved: retrievedFor('lennardy') },
    )
    // The account matched — it is the one asked about — but nothing retrieved
    // names `nard`, so the figure and the name both go.
    expect(matched).toBe(true)
    expect(found.followers).toBe(false)
    expect(found.name).toBe(false)
  })

  it('does not let a one-character handle be grounded by any page at all', () => {
    // `InfluencerHandleSchema` is `.min(1)`, and a bare `includes` made this the
    // hole in the rule the whole feature rests on: `a` appears in nearly every
    // URL ever retrieved.
    const short = {
      ...(answer()['accounts'] as Record<string, unknown>[])[0],
      handle: 'a',
      sourceUrl: 'https://www.instagram.com/a/',
    }
    const { found } = applyLookupBoundaries(answer({ accounts: [short] }), {
      platform: 'instagram',
      handle: 'a',
      retrieved: [
        { title: 'Instagram API and analytics', url: 'https://openrouter.ai/models' },
        // The second title names `a` by any boundary rule that can be written,
        // because it is an English article. This is why a short handle is
        // grounded by a URL and never by a title — see `MIN_TITLE_HANDLE`.
        { title: 'How to read a follower count', url: 'https://example.com/marketing' },
      ],
    })
    expect(found.followers).toBe(false)
    expect(found.name).toBe(false)
  })

  it('will not ground a two-character handle on prose either', () => {
    const short = { ...(answer()['accounts'] as Record<string, unknown>[])[0], handle: 'me' }
    const { found } = applyLookupBoundaries(answer({ accounts: [short] }), {
      platform: 'instagram',
      handle: 'me',
      retrieved: [{ title: 'Follow me on Instagram', url: 'https://example.com/blog/post' }],
    })
    expect(found.followers).toBe(false)
  })

  it('grounds a three-character handle on a title, which is prose enough to trust', () => {
    const short = { ...(answer()['accounts'] as Record<string, unknown>[])[0], handle: 'ec2' }
    const { found } = applyLookupBoundaries(answer({ accounts: [short] }), {
      platform: 'instagram',
      handle: 'ec2',
      retrieved: [{ title: 'ec2 (@ec2) on Instagram', url: 'https://example.com/x' }],
    })
    expect(found.followers).toBe(true)
  })

  it('grounds a one-character handle on a page that really names it', () => {
    const short = {
      ...(answer()['accounts'] as Record<string, unknown>[])[0],
      handle: 'a',
      sourceUrl: 'https://www.instagram.com/a/',
    }
    const { found } = applyLookupBoundaries(answer({ accounts: [short] }), {
      platform: 'instagram',
      handle: 'a',
      retrieved: [{ title: 'a on Instagram', url: 'https://www.instagram.com/a/' }],
    })
    expect(found.followers).toBe(true)
  })

  it('grounds a handle carrying a dot, and treats the dot as a literal', () => {
    const dotted = {
      ...(answer()['accounts'] as Record<string, unknown>[])[0],
      handle: 'nova.lam',
    }
    const grounded = applyLookupBoundaries(answer({ accounts: [dotted] }), {
      platform: 'instagram',
      handle: 'nova.lam',
      retrieved: [{ title: 'Nova', url: 'https://www.instagram.com/nova.lam/' }],
    })
    expect(grounded.found.followers).toBe(true)

    // `.` must not match any character — `novaxlam` is somebody else.
    const wrong = applyLookupBoundaries(answer({ accounts: [dotted] }), {
      platform: 'instagram',
      handle: 'nova.lam',
      retrieved: [{ title: 'Nova', url: 'https://www.instagram.com/novaxlam/' }],
    })
    expect(wrong.found.followers).toBe(false)
  })
})

describe('buildLookupPrompt', () => {
  it('puts a bare search query in the user turn and nothing else', () => {
    // Finding 2. A grounding layer searches this string, so an instruction in it
    // becomes a search term — worth 1/10 against 6/10 on identity.
    const { query } = buildLookupPrompt('instagram', 'lennardy')
    expect(query).toBe('Instagram @lennardy followers')
    expect(query).not.toContain('http')
    expect(query).not.toMatch(/return|read|json/i)
  })

  it('sends the platform, the handle and the canonical profile URL to the model', () => {
    const { system } = buildLookupPrompt('tiktok', 'thepantryboy')
    expect(system).toContain('TikTok')
    expect(system).toContain('thepantryboy')
    expect(system).toContain('https://www.tiktok.com/@thepantryboy')
  })

  it('states the response shape in the prompt as well as sending a schema', () => {
    // Finding 3: `response_format` is not enforced, so this paragraph is what
    // actually produces well-formed JSON.
    const { system } = buildLookupPrompt('instagram', 'x')
    expect(system).toContain('"outcome"')
    expect(system).toContain('"sourceUrl"')
  })

  it('names every vertical in the closed enum', () => {
    const { system } = buildLookupPrompt('instagram', 'x')
    for (const vertical of ['beauty', 'fashion', 'food', 'motoring', 'family']) {
      expect(system).toContain(vertical)
    }
  })

  it('builds a profile URL for every platform quick add offers', () => {
    for (const platform of LOOKUP_PLATFORMS) {
      const { system, query } = buildLookupPrompt(platform, 'somebody')
      expect(system).toMatch(/https:\/\/[^\s]+somebody/)
      expect(query).toContain('@somebody')
    }
  })
})

describe('LOOKUP_PLATFORMS', () => {
  it('offers five platforms and excludes xiaohongshu', () => {
    // Phase E: nought of three XHS creators named, and the model that retrieved
    // nothing produced the most convincing XHS answers of the run.
    expect([...LOOKUP_PLATFORMS]).toEqual([
      'instagram',
      'tiktok',
      'youtube',
      'facebook',
      'linkedin',
    ])
    expect(LookupPlatformSchema.safeParse('xiaohongshu').success).toBe(false)
  })
})

describe('extractJson', () => {
  it('reads a bare object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('reads an object out of a fenced block', () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```\nHope that helps.')).toEqual({ a: 1 })
  })

  it('reads an object out of surrounding prose', () => {
    expect(extractJson('I found this. {"a":1} Note that counts change.')).toEqual({ a: 1 })
  })

  it('returns null for an answer with no object in it', () => {
    expect(extractJson('I could not find that account.')).toBeNull()
    expect(extractJson('')).toBeNull()
  })
})

describe('lookupCreator', () => {
  function provider(result: Partial<GroundedResult>, capture?: (r: GroundedRequest) => void) {
    const full: GroundedResult = { text: '', retrieved: [], costUsd: null, ...result }
    return {
      getModel: () => {
        throw new Error('getModel: the lookup must not use generateObject')
      },
      completeGrounded: (req: GroundedRequest) => {
        capture?.(req)
        return Promise.resolve(full)
      },
    } as unknown as LLMProvider
  }

  const settings = { providerId: 'openrouter' as const, modelId: 'test:online' }

  it('returns a draft for a grounded answer', async () => {
    const result = await lookupCreator({
      platform: 'instagram',
      handle: 'lennardy',
      llmProvider: provider({
        text: JSON.stringify(answer()),
        retrieved: retrievedFor('lennardy'),
      }),
      llmSettings: settings,
    })
    expect(result.outcome).toBe('ok')
    expect(result.draft?.name).toBe('Lennard Yeong')
    expect(result.draft?.accounts[0]?.followers).toBe(570_000)
  })

  it('reports the retrieval log as the sources, not the model’s citations', async () => {
    const retrieved = retrievedFor('lennardy')
    const result = await lookupCreator({
      platform: 'instagram',
      handle: 'lennardy',
      llmProvider: provider({ text: JSON.stringify(answer()), retrieved }),
      llmSettings: settings,
    })
    expect(result.sources).toEqual(retrieved)
  })

  it('believes the model when it says not-found', async () => {
    const result = await lookupCreator({
      platform: 'instagram',
      handle: 'lennardy',
      llmProvider: provider({
        text: JSON.stringify(answer({ outcome: 'not-found' })),
        retrieved: retrievedFor('lennardy'),
      }),
      llmSettings: settings,
    })
    expect(result.outcome).toBe('not-found')
    expect(result.draft).toBeNull()
  })

  it('does not believe the model when it says ok over an ungrounded answer', async () => {
    const result = await lookupCreator({
      platform: 'instagram',
      handle: 'lennardy',
      llmProvider: provider({
        text: JSON.stringify(answer({ accounts: [] })),
        retrieved: retrievedFor('lennardy'),
      }),
      llmSettings: settings,
    })
    expect(result.outcome).toBe('not-found')
  })

  it('reports invalid-shape when the answer is not an object at all', async () => {
    const result = await lookupCreator({
      platform: 'instagram',
      handle: 'lennardy',
      llmProvider: provider({ text: 'I am afraid I cannot help with that.' }),
      llmSettings: settings,
    })
    expect(result.outcome).toBe('invalid-shape')
    expect(result.draft).toBeNull()
  })

  it('sends the schema and the two messages through the port', async () => {
    let seen: GroundedRequest | undefined
    await lookupCreator({
      platform: 'instagram',
      handle: 'lennardy',
      llmProvider: provider({ text: JSON.stringify(answer()) }, (r) => (seen = r)),
      llmSettings: settings,
    })
    expect(seen?.query).toBe('Instagram @lennardy followers')
    expect(seen?.system).toContain('Rules, in order of importance')
    expect(seen?.jsonSchema).toBeDefined()
    expect(seen?.settings).toEqual(settings)
  })

  it('passes the abort signal to the provider', async () => {
    const controller = new AbortController()
    let seen: GroundedRequest | undefined
    await lookupCreator({
      platform: 'instagram',
      handle: 'lennardy',
      llmProvider: provider({ text: JSON.stringify(answer()) }, (r) => (seen = r)),
      llmSettings: settings,
      signal: controller.signal,
    })
    expect(seen?.signal).toBe(controller.signal)
  })

  it('reports what the call cost, before it judges the answer', async () => {
    const seen: { costUsd: number | null }[] = []
    // A `not-found` costs exactly what a hit costs, which is the whole reason
    // this is reported before the outcome is decided.
    await lookupCreator({
      platform: 'instagram',
      handle: 'lennardy',
      llmProvider: provider({ text: '{"outcome":"not-found","accounts":[]}', costUsd: 0.0182 }),
      llmSettings: settings,
      onUsage: (usage) => seen.push(usage),
    })
    expect(seen).toEqual([{ costUsd: 0.0182 }])
  })

  it('reports an unknown cost as null rather than as free', async () => {
    const seen: { costUsd: number | null }[] = []
    await lookupCreator({
      platform: 'instagram',
      handle: 'lennardy',
      llmProvider: provider({ text: '{}' }),
      llmSettings: settings,
      onUsage: (usage) => seen.push(usage),
    })
    expect(seen).toEqual([{ costUsd: null }])
  })

  it('lets a provider failure through rather than dressing it as not-found', async () => {
    const failing = {
      getModel: () => {
        throw new Error('unused')
      },
      completeGrounded: () => Promise.reject(new Error('provider exploded')),
    } as unknown as LLMProvider
    await expect(
      lookupCreator({
        platform: 'instagram',
        handle: 'lennardy',
        llmProvider: failing,
        llmSettings: settings,
      }),
    ).rejects.toThrow('provider exploded')
  })
})
