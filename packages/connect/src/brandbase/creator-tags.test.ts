import { createCore } from '@brandfactory/core/src/app'
import { call } from '@brandfactory/core/src/run'
import { describe, expect, it } from 'vitest'
import {
  creatorTags,
  DEFAULT_MODEL,
  SYSTEM,
  tagOf,
  tagsFromEnv,
  tagsOf,
  type TagsConfig,
} from './creator-tags'
import { metaApp } from './meta'
import { testCore } from './test-core'

const NOW = new Date('2026-11-24T04:00:00Z')
const ANA = '00000000-0000-4000-8000-00000000a001'
const MIA = '00000000-0000-4000-8000-00000000a003'
const IG = '17841400000000001'
const TOKEN = 'page-token'
const KEY = 'sk-or-test-key'

const config = (over: Partial<TagsConfig> = {}): TagsConfig => ({
  apiKey: KEY,
  as: 'owner',
  model: DEFAULT_MODEL,
  providers: ['together'],
  dailyUsd: 1,
  upstream: 'https://openrouter.test/api/v1',
  ...over,
})

type Answer = { status?: number; content?: string; cost?: number }

/**
 * OpenRouter and Meta's Graph API as stand-ins: every request is kept, and anything else fails
 * the test, so nothing reaches the network.
 */
function fakes() {
  const asked: { headers: Headers; body: Record<string, unknown> }[] = []
  const bios: string[] = []
  const state = {
    answers: [] as Answer[],
    otherwise: { content: '{"tags": ["home cooking"]}', cost: 0.0002 } as Answer,
    bio: 'Pasta & vino lover' as string | null,
    /** Meta's error code for every bio read, if any. */
    error: null as number | null,
  }
  const openrouter = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    expect(url).toBe('https://openrouter.test/api/v1/chat/completions')
    asked.push({
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    })
    const a = state.answers.shift() ?? state.otherwise
    if (a.status && a.status !== 200) {
      return Response.json({ error: { message: 'busy' } }, { status: a.status })
    }
    return Response.json({
      choices: [{ message: { content: a.content } }],
      ...(a.cost !== undefined && { usage: { cost: a.cost } }),
    })
  }) as typeof fetch
  const graph = (async (input: string | URL | Request) => {
    const url = new URL(String(input))
    expect(url.pathname).toBe(`/v26.0/${IG}`)
    expect(url.searchParams.get('access_token')).toBe(TOKEN)
    const name = /username\(([^)]+)\)\{biography\}/.exec(url.searchParams.get('fields') ?? '')?.[1]
    bios.push(name ?? '?')
    if (state.error !== null) {
      return Response.json({ error: { message: 'no', code: state.error } }, { status: 400 })
    }
    if (state.bio === null) {
      return Response.json({ error: { message: 'Cannot find User', code: 110 } }, { status: 400 })
    }
    return Response.json({ business_discovery: { id: '1', biography: state.bio } })
  }) as typeof fetch
  const meta = metaApp({
    appId: 'a',
    appSecret: 's',
    configId: 'c',
    redirectUrl: 'https://brandbase.test/connect/meta',
    masterKey: Buffer.alloc(32, 7),
    fetch: graph,
  })
  return { openrouter, meta, asked, bios, state }
}

async function setUp({ linked = false, over = {} as Partial<TagsConfig> } = {}) {
  const f = fakes()
  const t = await testCore(NOW)
  // Ana's last edit before the clock, so a try of the model counts as after it.
  await t.db.exec(`
    update brandbase.influencers set updated_at = '2026-11-20T00:00:00Z';
    insert into brandbase.influencers (id, org_id, slug, name, category, notes, tags_team, updated_at) values
      ('${MIA}', 'co-a', 'mia-ho', 'Mia Ho', 'travel', 'Hotels.', '{wine,fine dining}', '2026-11-20T00:00:00Z');
  `)
  if (linked) {
    await t.db.query(
      `insert into brandbase.accounts (brand_id, platform, account_id, username, tokens, details, connected_by) values
        ('casa', 'instagram', $1, 'casavostra', $2, '{"via": "meta"}', 'owner')`,
      [IG, f.meta.sealToken(TOKEN, `instagram:casa:${IG}`)],
    )
  }
  const job = creatorTags(t.core, f.meta, config(over), {
    fetch: f.openrouter,
    gapMs: 0,
  })
  const tagsOfAna = async () =>
    (
      await t.db.query<{ team: string[]; ai: string[]; hidden: string[]; tried: boolean }>(
        `select tags_team as team, tags_ai as ai, tags_hidden as hidden, tagged_at is not null as tried
         from brandbase.influencers where id = '${ANA}'`,
      )
    )[0]!
  const asOwner = (op: string, input: Record<string, unknown>) =>
    call(t.core, { authorization: 'Bearer owner', pack: 'brandbase', op, input })
  return { ...f, ...t, job, tagsOfAna, asOwner }
}

describe('the creator tags settings', () => {
  it('are off without a key, and off without a principal to run as', () => {
    expect(tagsFromEnv({})).toBeUndefined()
    expect(tagsFromEnv({ TAGS_OPENROUTER_API_KEY: KEY })).toBeUndefined()
    expect(tagsFromEnv({ TAGS_OPENROUTER_API_KEY: KEY, META_WEBHOOK_AS: 'p/meta' })).toEqual({
      apiKey: KEY,
      as: 'p/meta',
      model: 'deepseek/deepseek-v4.1-flash',
      providers: ['together', 'alibaba', 'novita', 'deepinfra'],
      dailyUsd: 1,
      upstream: 'https://openrouter.ai/api/v1',
    })
    expect(
      tagsFromEnv({
        TAGS_OPENROUTER_API_KEY: KEY,
        TAGS_AS: 'p/tags',
        META_WEBHOOK_AS: 'p/meta',
        TAGS_MODEL: 'other/model',
        TAGS_DAILY_USD: '0.5',
      }),
    ).toMatchObject({ as: 'p/tags', model: 'other/model', dailyUsd: 0.5 })
  })

  it('stop the server on a daily cap that is no amount', () => {
    for (const v of ['0', '-1', 'lots']) {
      expect(() =>
        tagsFromEnv({ TAGS_OPENROUTER_API_KEY: KEY, TAGS_AS: 'p', TAGS_DAILY_USD: v }),
      ).toThrow(/TAGS_DAILY_USD/)
    }
  })
})

describe("the model's answer", () => {
  it('gives at most six valid tags, each once, in one spelling', () => {
    expect(
      tagsOf(
        '```json\n{"tags": ["#Italian  Food", "italian food", "wine", "!!", 7, "family", "a", "b", "c", "d"]}\n```',
      ),
    ).toEqual(['italian food', 'wine', 'family', 'a', 'b', 'c'])
    expect(tagsOf('{"tags": []}')).toEqual([])
  })

  it('is no list when it holds no JSON, no tags or tags that are no list', () => {
    for (const c of ['wine, pasta', '{"tags": "wine"}', '{"labels": []}', '{"tags": [', null, 3]) {
      expect(tagsOf(c)).toBeNull()
    }
    expect(tagOf('  ')).toBeNull()
    expect(tagOf('x'.repeat(31))).toBeNull()
  })
})

describe('the creator tags job', () => {
  it('sends only the handle, the category, the bio, the notes and the company tags, with the provider rules', async () => {
    const t = await setUp({ linked: true })
    const run = await t.job.once()
    expect(run).toMatchObject({ due: 2, bios: 1, tagged: 2, stopped: null })
    expect(t.bios).toEqual(['ana.cooks'])
    const first = t.asked.find((a) =>
      String((a.body.messages as { content: string }[])[1]!.content).includes('ana.cooks'),
    )!
    expect(first.headers.get('authorization')).toBe(`Bearer ${KEY}`)
    expect(first.body).toMatchObject({
      model: 'deepseek/deepseek-v4.1-flash',
      response_format: { type: 'json_object' },
      provider: { only: ['together'], data_collection: 'deny' },
      usage: { include: true },
    })
    const [system, user] = first.body.messages as { role: string; content: string }[]
    expect(system).toEqual({ role: 'system', content: SYSTEM })
    expect(JSON.parse(user!.content)).toEqual({
      handle: 'ana.cooks',
      category: 'food',
      bio: 'Pasta & vino lover',
      notes: 'Cooks at home.',
      companyTags: ['fine dining', 'wine'],
    })
    // Nothing else of the person, and nothing of the account's token.
    const sent = JSON.stringify(t.asked.map((a) => a.body))
    for (const word of ['Ana Lee', 'Mia Ho', TOKEN, 'sealed', IG]) expect(sent).not.toContain(word)
    expect(await t.tagsOfAna()).toEqual({ team: [], ai: ['home cooking'], hidden: [], tried: true })
    // Tagged: nothing is due until the notes, the category or the bio change.
    expect(await t.job.once()).toMatchObject({ due: 0 })
    expect(t.asked).toHaveLength(2)
    t.setNow(new Date('2026-11-24T04:05:00Z'))
    await t.asOwner('influencer.edit', { id: ANA, notes: 'Cooks at home. Wine pairings.' })
    expect(await t.job.once()).toMatchObject({ due: 1, bios: 0, tagged: 1 })
    expect(JSON.parse((t.asked[2]!.body.messages as { content: string }[])[1]!.content)).toEqual(
      expect.objectContaining({ notes: 'Cooks at home. Wine pairings.' }),
    )
  })

  it("keeps a person's edits: a tag the team added stays, one it removed never comes back", async () => {
    const t = await setUp()
    await t.asOwner('influencer.tag_add', { id: ANA, tag: 'Budget Eats' })
    await t.asOwner('influencer.tag_drop', { id: ANA, tag: 'pasta' })
    t.state.otherwise = { content: '{"tags": ["pasta", "budget eats", "family"]}', cost: 0.0001 }
    await t.job.once()
    expect(await t.tagsOfAna()).toMatchObject({
      team: ['budget eats'],
      ai: ['family'],
      hidden: ['pasta'],
    })
    const ana = (await t.asOwner('influencer.read', { id: ANA })) as { tags: string[] }
    expect(ana.tags).toEqual(['budget eats', 'family'])
    // A tag edit is no edit of the notes: nothing is due again.
    await t.asOwner('influencer.tag_drop', { id: ANA, tag: 'family' })
    expect(await t.job.once()).toMatchObject({ due: 0 })
  })

  it('changes no tag on an answer with no list, and tries again only after six hours', async () => {
    const t = await setUp()
    t.state.otherwise = { content: 'Sure! Here are some tags: pasta, wine', cost: 0.0001 }
    expect(await t.job.once()).toMatchObject({ due: 2, malformed: 2, tagged: 0 })
    expect(await t.tagsOfAna()).toMatchObject({ ai: [], tried: true })
    expect(await t.job.once()).toMatchObject({ due: 0 })
    t.setNow(new Date('2026-11-24T10:01:00Z'))
    t.state.otherwise = { content: '{"tags": ["pasta"]}', cost: 0.0001 }
    expect(await t.job.once()).toMatchObject({ due: 2, tagged: 2 })
    expect(await t.tagsOfAna()).toMatchObject({ ai: ['pasta'] })
  })

  it('stops at the daily cap, by the cost OpenRouter states, until the next UTC day', async () => {
    const t = await setUp({ over: { dailyUsd: 0.01 } })
    t.state.otherwise = { content: '{"tags": ["pasta"]}', cost: 0.02 }
    expect(await t.job.once()).toMatchObject({ due: 2, tagged: 1, stopped: 'budget' })
    expect(t.asked).toHaveLength(1)
    expect(t.job.spentToday).toBeCloseTo(0.02)
    expect(await t.job.once()).toMatchObject({ due: 0, stopped: 'budget' })
    expect(t.asked).toHaveLength(1)
    t.setNow(new Date('2026-11-25T00:01:00Z'))
    expect(await t.job.once()).toMatchObject({ due: 1, tagged: 1, stopped: null })
    expect(t.asked).toHaveLength(2)
  })

  it('keeps the hold of an answer that states no cost, and owes nothing for a refusal', async () => {
    const t = await setUp()
    t.state.answers = [{ status: 429 }]
    expect(await t.job.once()).toMatchObject({ tagged: 0, stopped: 'upstream' })
    expect(t.job.spentToday).toBe(0)
    // Nothing recorded: the person is due on the next run.
    expect(await t.tagsOfAna()).toMatchObject({ tried: false })
    t.state.otherwise = { content: '{"tags": ["pasta"]}' }
    expect(await t.job.once()).toMatchObject({ tagged: 2 })
    expect(t.job.spentToday).toBeCloseTo(0.01)
  })

  it('lets a person whose input OpenRouter refuses wait six hours, and tags the rest', async () => {
    const t = await setUp()
    t.state.answers = [{ status: 400 }]
    t.state.otherwise = { content: '{"tags": ["pasta"]}', cost: 0.0001 }
    expect(await t.job.once()).toMatchObject({ due: 2, refused: 1, tagged: 1, stopped: null })
    expect(await t.job.once()).toMatchObject({ due: 0 })
    // Our key, our credit, a limit or OpenRouter down: the run stops and records nothing.
    await t.asOwner('influencer.edit', { id: ANA, notes: 'Pasta nights.' })
    t.setNow(new Date('2026-11-24T04:05:00Z'))
    await t.asOwner('influencer.edit', { id: ANA, notes: 'Pasta nights, often.' })
    for (const status of [401, 402, 429]) {
      t.state.answers = [{ status }]
      expect(await t.job.once()).toMatchObject({ due: 1, refused: 0, stopped: 'upstream' })
    }
    // A server error may be this person's input: the run stops, and they wait six hours.
    t.state.answers = [{ status: 500 }]
    expect(await t.job.once()).toMatchObject({ due: 1, stopped: 'upstream' })
    expect(await t.job.once()).toMatchObject({ due: 0 })
  })

  it('tags from the notes alone where no bio can be read, and keeps a bio Meta does not find', async () => {
    const t = await setUp({ linked: true })
    t.state.bio = null
    await t.job.once()
    expect(t.bios).toEqual(['ana.cooks'])
    const user = JSON.parse((t.asked[0]!.body.messages as { content: string }[])[1]!.content)
    expect(user).toMatchObject({ handle: 'ana.cooks', bio: null })
    expect(
      await t.db.query(`select bio, bio_read_at is not null as read from brandbase.influencers
        where id = '${ANA}'`),
    ).toEqual([{ bio: null, read: true }])
  })

  it('tags on when the principal may not list the brands, and leaves the bios due', async () => {
    const t = await setUp({ linked: true })
    await t.db.exec(
      `update packs.loadouts set ops = array_remove(ops, 'brand.list') where principal = 'owner'`,
    )
    expect(await t.job.once()).toMatchObject({ due: 2, bios: 0, tagged: 2, failed: 0 })
    expect(t.bios).toEqual([])
    expect(
      await t.db.query(`select bio_read_at from brandbase.influencers where id = '${ANA}'`),
    ).toEqual([{ bio_read_at: null }])
  })

  it('reads no bio of a company whose sign-in expired, and waits out a rate limit', async () => {
    const t = await setUp({ linked: true })
    // Six creators of company A with an Instagram account each, none due a tag.
    for (let n = 0; n < 6; n++) {
      const id = `00000000-0000-4000-8000-0000000000c${n}`
      await t.db.exec(`
        insert into brandbase.influencers (id, org_id, slug, name, tags_source, tagged_at) values
          ('${id}', 'co-a', 'bio-${n}', 'Bio ${n}', md5(chr(10) || chr(10)), '2026-01-01T00:00:00Z');
        insert into brandbase.influencer_accounts (influencer_id, org_id, position, platform, handle) values
          ('${id}', 'co-a', 0, 'instagram', 'bio.${n}');
      `)
    }
    // A rate limit: one read, then the company's bios wait; the two due a tag are tagged.
    t.state.error = 4
    // Ana's bio was put off: she is tagged once it is read, so only Mia is tagged now.
    expect(await t.job.once()).toMatchObject({ due: 8, bios: 0, tagged: 1 })
    expect(t.bios).toHaveLength(1)
    // An expired sign-in: one read, then every bio of the company counts as read, so the next
    // runs move on.
    t.state.error = 190
    expect(await t.job.once()).toMatchObject({ due: 7, bios: 5 })
    expect(t.bios).toHaveLength(2)
    expect(await t.job.once()).toMatchObject({ due: 2, bios: 2 })
    expect(await t.job.once()).toMatchObject({ due: 0 })
  })

  it('asks no model for a person with nothing to tag from', async () => {
    const t = await setUp()
    await t.db.exec(`update brandbase.influencers set notes = '', category = null`)
    expect(await t.job.once()).toMatchObject({ due: 2, empty: 2, tagged: 0 })
    expect(t.asked).toHaveLength(0)
    expect(await t.job.once()).toMatchObject({ due: 0 })
  })

  it("reaches only the principal's companies", async () => {
    const t = await setUp()
    await t.job.once()
    const sent = JSON.stringify(t.asked.map((a) => a.body))
    expect(sent).not.toContain('bentan')
    expect(
      await t.db.query(`select tagged_at from brandbase.influencers where org_id = 'co-b'`),
    ).toEqual([{ tagged_at: null }])
  })
})

describe('the internal tag moves', () => {
  it('are refused at the door, to a screen and to an agent', async () => {
    const t = await setUp()
    const app = createCore(t.core)
    for (const [op, input] of [
      ['influencer.tag_due', { limit: 5 }],
      ['influencer.bio_set', { id: ANA, bio: 'x' }],
      ['influencer.tag_set', { id: ANA, source: '0'.repeat(32), tags: ['wine'] }],
    ] as const) {
      const res = await app.request(`/ops/brandbase/${op}`, {
        method: 'POST',
        headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      expect(res.status).toBe(404)
      expect(((await res.json()) as { code: string }).code).toBe('OP_NOT_FOUND')
    }
    expect(await t.tagsOfAna()).toMatchObject({ ai: [], tried: false })
  })
})
