import { ResearchProviderError, type ResearchProvider } from '@brandfactory/adapter-research'
import type { ResearchJob } from '@brandfactory/db'
import type { BrandGuidelineSection, BrandId, ResearchJobId } from '@brandfactory/shared'
import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../env'
import type { ShapeSectionFn } from './shape'
import { createTestApp, type FakeDbState } from '../test-helpers'

// ---------------------------------------------------------------------------
// POST /brands/:id/guidelines/autofill — path selection, guards, the ledger
// ---------------------------------------------------------------------------
//
// Every test runs the real Hono app over the fake db, like its research
// sibling. The vendor adapter has its own suite against the A0 capture; the
// agent shaper has its own against a fake `doGenerate`. What is checked here
// is the *service*: which path a request takes, which guards fire before the
// money line, and what lands on the event ledger.

const USER = { id: 'u-1', token: 't-1' }
const auth = () => ({ authorization: `Bearer ${USER.token}`, 'content-type': 'application/json' })

const SECTION_SOURCES = [
  { title: 'Our story', url: 'https://casavostra.example/about' },
  { title: 'Menu', url: 'https://casavostra.example/menu' },
]

// The A0 capture's shape: vendor-reported cost, single-digit cents.
const SECTION_USAGE = {
  costUsd: 0.011193,
  searchQueries: 11,
  inputTokens: 141,
  outputTokens: 419,
  reasoningTokens: null,
  citationTokens: null,
}

const searchOk = (content = 'Warm, plainspoken, generous with detail.') =>
  vi.fn(() => Promise.resolve({ content, sources: SECTION_SOURCES, usage: SECTION_USAGE }))

function fakeProvider(over: Partial<ResearchProvider> = {}): ResearchProvider {
  return {
    start: vi.fn(() => Promise.reject(new Error('start not expected here'))),
    poll: vi.fn(() => Promise.reject(new Error('poll not expected here'))),
    searchSection: vi.fn(() => Promise.reject(new Error('searchSection not expected here'))),
    ...over,
  }
}

/** A Path R fake that answers `ok`, echoing the label like the real shaper. */
const shaperOk = () =>
  vi.fn<ShapeSectionFn>((input) =>
    Promise.resolve({
      draft: {
        label: input.label,
        html: '<p>Warm, direct.</p>',
        text: 'Warm, direct.',
        sources: [SECTION_SOURCES[0]!],
      },
      outcome: 'ok',
      reportChars: input.report.length,
      model: 'claude-sonnet-4-6',
    }),
  )

const shaperEmpty = (outcome: 'no-material' | 'invalid-shape') =>
  vi.fn<ShapeSectionFn>((input) =>
    Promise.resolve({
      draft: null,
      outcome,
      reportChars: input.report.length,
      model: 'claude-sonnet-4-6',
    }),
  )

/**
 * A signed-in workspace with one brand. `research` defaults to on — the
 * shipped default (`none`) has its own tests below.
 */
async function seed(
  opts: {
    websiteUrl?: string | null
    research?: ResearchProvider
    env?: Partial<Env>
    shapeSection?: ShapeSectionFn
  } = {},
) {
  const research = opts.research ?? fakeProvider()
  const harness = createTestApp({
    users: [USER],
    env: { RESEARCH_PROVIDER: 'perplexity', PERPLEXITY_API_KEY: 'k', ...opts.env },
    research,
    shapeSection:
      opts.shapeSection ?? (() => Promise.reject(new Error('shapeSection not expected here'))),
  })
  const { app } = harness
  const ws = (await (
    await app.request('/workspaces', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'W' }),
    })
  ).json()) as { id: string }
  const body: Record<string, unknown> = { name: 'Casa Vostra' }
  if (opts.websiteUrl !== null) body.websiteUrl = opts.websiteUrl ?? 'https://casavostra.example'
  const brand = (await (
    await app.request(`/workspaces/${ws.id}/brands`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify(body),
    })
  ).json()) as { id: string }

  const autofill = (label: string, brandId = brand.id) =>
    app.request(`/brands/${brandId}/guidelines/autofill`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ label }),
    })

  return { ...harness, workspaceId: ws.id, brandId: brand.id, research, autofill }
}

/**
 * A finished deep run, planted on the row directly. The lifecycle that
 * produces this state — polls, arbiters, thread landing — has its own suite in
 * `routes/research.test.ts`; path selection reads exactly one fact off it
 * (`COMPLETED`, report present), so the tests here state that fact instead of
 * re-running the machinery.
 */
function plantJob(
  state: FakeDbState,
  brandId: string,
  over: Partial<ResearchJob> = {},
): ResearchJob {
  const job: ResearchJob = {
    id: `job-${state.researchJobs.size + 1}` as ResearchJobId,
    brandId: brandId as BrandId,
    status: 'COMPLETED',
    provider: 'perplexity',
    model: 'sonar-deep-research',
    input: { brandName: 'Casa Vostra', websiteUrl: 'https://casavostra.example' },
    externalId: 'ext-1',
    report: '# Brand Profile\n\nA long, already-paid-for report about Casa Vostra.',
    citations: SECTION_SOURCES,
    drafts: [],
    error: null,
    reportProjectId: null,
    costUsd: 0.377,
    createdBy: null,
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    ...over,
  }
  state.researchJobs.set(job.id, job)
  return job
}

function plantSection(state: FakeDbState, brandId: string, label: string) {
  const id = `sec-${state.sections.size + 1}`
  state.sections.set(id, {
    id,
    brandId,
    label,
    body: { type: 'doc', content: [] },
    priority: state.sections.size,
    createdBy: 'user',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as BrandGuidelineSection)
}

describe('POST /brands/:id/guidelines/autofill — Path S (no report)', () => {
  it('searches the brand site and returns the draft, ready to edit', async () => {
    const research = fakeProvider({ searchSection: searchOk() })
    const { autofill } = await seed({ research })

    const res = await autofill('Voice & tone')
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      outcome: string
      source: string
      draft: { label: string; html: string; text: string; sources: unknown[] }
    }
    expect(body.outcome).toBe('ok')
    expect(body.source).toBe('search')
    expect(body.draft.label).toBe('Voice & tone')
    expect(body.draft.html).toContain('Warm, plainspoken')
    expect(body.draft.sources).toEqual(SECTION_SOURCES)

    // The brand's own name and URL went out, on the section model — nothing a
    // client supplied beyond the label (decision 3's posture).
    expect(research.searchSection).toHaveBeenCalledWith(
      expect.objectContaining({
        brandName: 'Casa Vostra',
        websiteUrl: 'https://casavostra.example',
        label: 'Voice & tone',
        model: 'sonar-pro',
      }),
    )
  })

  it('sends the SUGGESTED_SECTIONS description for a known label, none for a custom one', async () => {
    const research = fakeProvider({ searchSection: searchOk() })
    const { autofill } = await seed({ research })

    await autofill('Voice & tone')
    const known = vi.mocked(research.searchSection).mock.calls[0]![0]
    expect(known.description).toContain('How the brand sounds')

    await autofill('Menu philosophy')
    const custom = vi.mocked(research.searchSection).mock.calls[1]![0]
    expect(custom.description).toBeUndefined()
  })

  it('tells the search which sections already exist — excluding the one being filled', async () => {
    const research = fakeProvider({ searchSection: searchOk() })
    const { autofill, state, brandId } = await seed({ research })
    plantSection(state, brandId, 'Target audience')
    // The lazy path saves the empty row first sometimes; its own label must
    // not come back as "already covered".
    plantSection(state, brandId, 'Voice & tone')

    await autofill('Voice & tone')
    expect(research.searchSection).toHaveBeenCalledWith(
      expect.objectContaining({ existingLabels: ['Target audience'] }),
    )
  })

  it('strips citation markers — a TipTap row has no renderer for them', async () => {
    const research = fakeProvider({
      searchSection: searchOk('Warm and direct. [1][2] Quality first. [3]'),
    })
    const { autofill } = await seed({ research })

    const body = (await (await autofill('Voice & tone')).json()) as {
      draft: { html: string; text: string }
    }
    expect(body.draft.text).not.toContain('[1]')
    expect(body.draft.html).not.toContain('[2]')
    expect(body.draft.text).toContain('Quality first.')
  })

  it('records the search on the ledger — model, cost, sources, author', async () => {
    const research = fakeProvider({ searchSection: searchOk() })
    const { autofill, state } = await seed({ research })

    await autofill('Voice & tone')
    expect(state.sectionAutofillEvents).toHaveLength(1)
    expect(state.sectionAutofillEvents[0]).toMatchObject({
      label: 'Voice & tone',
      source: 'search',
      model: 'sonar-pro',
      costUsd: 0.011193,
      sources: SECTION_SOURCES,
      createdBy: 'u-1',
    })
  })

  // **The Phase E live pass's finding, pinned.** The vendor never returns an
  // empty completion; asked for a section it has no material for, it obeys the
  // honesty rule in prose. Before the sentinel, that 600-character refusal was
  // classified `ok` and the client pasted the model's apology into a guideline
  // row as agent-written text.
  it('reads the sentinel as no-material, not as a section', async () => {
    const research = fakeProvider({ searchSection: searchOk('NO_MATERIAL') })
    const { autofill } = await seed({ research })

    const body = (await (await autofill('Franchise fee schedule')).json()) as {
      outcome: string
      draft: unknown
    }
    expect(body.outcome).toBe('no-material')
    expect(body.draft).toBeNull()
  })

  it('accepts the sentinel through markdown emphasis and trailing punctuation', async () => {
    // The vendor is not reliably literal — it bolds things and ends sentences.
    const research = fakeProvider({ searchSection: searchOk('**NO_MATERIAL.**') })
    const { autofill } = await seed({ research })

    expect(
      ((await (await autofill('Franchise fee schedule')).json()) as { outcome: string }).outcome,
    ).toBe('no-material')
  })

  // The other half of the rule: matching a substring would delete real
  // sections. A `Values` section may legitimately say "no material waste".
  it('does not mistake a real section that mentions the sentinel words', async () => {
    const research = fakeProvider({
      searchSection: searchOk('We aim for no material waste in any kitchen we run.'),
    })
    const { autofill } = await seed({ research })

    const body = (await (await autofill('Values & positioning')).json()) as {
      outcome: string
      draft: { text: string } | null
    }
    expect(body.outcome).toBe('ok')
    expect(body.draft?.text).toContain('no material waste')
  })

  it('an empty search is no-material on the wire — and still on the ledger', async () => {
    // The vendor said so plainly and stopped, as instructed; the work was
    // still billed, so the cap must still count it.
    const research = fakeProvider({ searchSection: searchOk('') })
    const { autofill, state } = await seed({ research })

    const res = await autofill('Visual guidelines')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { outcome: string; source: string; draft: unknown }
    expect(body).toEqual({ outcome: 'no-material', source: 'search', draft: null })
    expect(state.sectionAutofillEvents).toHaveLength(1)
    expect(state.sectionAutofillEvents[0]).toMatchObject({ source: 'search' })
  })

  it('clamps a long label rather than rejecting it', async () => {
    const research = fakeProvider({ searchSection: searchOk() })
    const { autofill } = await seed({ research })

    const long = 'M'.repeat(200)
    const res = await autofill(long)
    expect(res.status).toBe(200)
    const sent = vi.mocked(research.searchSection).mock.calls[0]![0]
    expect(sent.label).toBe('M'.repeat(120))
    const body = (await res.json()) as { draft: { label: string } }
    expect(body.draft.label).toBe('M'.repeat(120))
  })
})

describe('POST /brands/:id/guidelines/autofill — the guards, above the money line', () => {
  it('refuses a blank label before anything runs', async () => {
    const { autofill, research, state } = await seed()

    const res = await autofill('   ')
    expect(res.status).toBe(400)
    expect(research.searchSection).not.toHaveBeenCalled()
    expect(state.sectionAutofillEvents).toHaveLength(0)
  })

  it('501 when research is off and there is no report to read', async () => {
    const { autofill, research } = await seed({ env: { RESEARCH_PROVIDER: 'none' } })

    const res = await autofill('Voice & tone')
    expect(res.status).toBe(501)
    expect(((await res.json()) as { code: string }).code).toBe('RESEARCH_NOT_ENABLED')
    expect(research.searchSection).not.toHaveBeenCalled()
  })

  it('refuses a brand with no website, before spending — the Casa Vostra rule', async () => {
    const { autofill, research } = await seed({ websiteUrl: null })

    const res = await autofill('Voice & tone')
    expect(res.status).toBe(400)
    expect(research.searchSection).not.toHaveBeenCalled()
  })

  it('enforces the per-day search cap', async () => {
    const research = fakeProvider({ searchSection: searchOk() })
    const { autofill } = await seed({ research, env: { RESEARCH_SECTION_MAX_PER_DAY: 1 } })

    expect((await autofill('Voice & tone')).status).toBe(200)
    const second = await autofill('Target audience')
    expect(second.status).toBe(429)
    expect(((await second.json()) as { code: string }).code).toBe('RESEARCH_LIMIT')
    expect(research.searchSection).toHaveBeenCalledTimes(1)
  })

  it('401s an unauthenticated request before anything runs', async () => {
    const { app, research } = await seed({ research: fakeProvider({ searchSection: searchOk() }) })

    const res = await app.request('/brands/whatever/guidelines/autofill', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Voice & tone' }),
    })
    expect(res.status).toBe(401)
    expect(research.searchSection).not.toHaveBeenCalled()
  })

  it('is scoped by workspace ownership, like every brand route', async () => {
    const { app } = createTestApp({ users: [USER, { id: 'u-2', token: 't-2' }] })
    const ws = (await (
      await app.request('/workspaces', {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'W' }),
      })
    ).json()) as { id: string }
    const brand = (await (
      await app.request(`/workspaces/${ws.id}/brands`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'Casa Vostra', websiteUrl: 'https://casavostra.example' }),
      })
    ).json()) as { id: string }

    // The other user's token resolves the brand and is refused at its
    // workspace — the same boundary every brand route enforces.
    const res = await app.request(`/brands/${brand.id}/guidelines/autofill`, {
      method: 'POST',
      headers: { authorization: 'Bearer t-2', 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Voice & tone' }),
    })
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// Upstream failure — the first synchronous outbound call this repo has
// ---------------------------------------------------------------------------
//
// The deep run's vendor failures land on a job row. These reach a person who is
// watching a spinner, and they shipped as a bare `500 Internal Server Error`:
// honest about our side, useless about theirs.

describe('POST /brands/:id/guidelines/autofill — when an upstream fails', () => {
  it('502s a vendor failure with something the reader can act on', async () => {
    const research = fakeProvider({
      searchSection: vi.fn(() =>
        Promise.reject(new ResearchProviderError('Research provider returned 503', 503)),
      ),
    })
    const { autofill, state } = await seed({ research })

    const res = await autofill('Voice & tone')
    expect(res.status).toBe(502)
    const body = (await res.json()) as { code: string; message: string }
    expect(body.code).toBe('AUTOFILL_UPSTREAM')
    expect(body.message).toContain('could not be reached')
    // The vendor's own words never reach the client.
    expect(body.message).not.toContain('503')
    // A call that did not land was not billed, so it is not on the ledger.
    expect(state.sectionAutofillEvents).toHaveLength(0)
  })

  it('names rate-limiting as rate-limiting — "try again" is different advice at 429', async () => {
    const research = fakeProvider({
      searchSection: vi.fn(() => Promise.reject(new ResearchProviderError('429', 429))),
    })
    const { autofill } = await seed({ research })

    const body = (await (await autofill('Voice & tone')).json()) as { message: string }
    expect(body.message).toContain('rate-limiting')
  })

  it('502s a writing-model failure and points at the model settings', async () => {
    // The Phase E environment, exactly: a placeholder `OPENROUTER_API_KEY`, so
    // every `generateObject` call dies at the vendor and the editor's toast
    // read "Internal Server Error".
    const shapeSection = vi.fn<ShapeSectionFn>(() =>
      Promise.reject(new Error('AI_APICallError: Unauthorized')),
    )
    const { autofill, state, brandId } = await seed({ shapeSection })
    plantJob(state, brandId)

    const res = await autofill('Voice & tone')
    expect(res.status).toBe(502)
    const body = (await res.json()) as { code: string; message: string }
    expect(body.code).toBe('AUTOFILL_UPSTREAM')
    expect(body.message).toContain('model settings')
    expect(body.message).not.toContain('Unauthorized')
  })

  // The expensive half already succeeded. Losing it to a bookkeeping failure
  // would mean the user pays for the same section twice.
  it('returns a paid-for draft even when the ledger write fails', async () => {
    const research = fakeProvider({ searchSection: searchOk() })
    const { autofill, state } = await seed({ research })
    state.failNextSectionAutofillRecord = true

    const res = await autofill('Voice & tone')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { outcome: string; draft: { text: string } }
    expect(body.outcome).toBe('ok')
    expect(body.draft.text).toContain('Warm, plainspoken')
    expect(state.sectionAutofillEvents).toHaveLength(0)
  })
})

describe('POST /brands/:id/guidelines/autofill — Path R (a report exists)', () => {
  it('reads the stored report instead of searching', async () => {
    const shapeSection = shaperOk()
    const { autofill, state, brandId, research } = await seed({ shapeSection })
    const job = plantJob(state, brandId)

    const res = await autofill('Voice & tone')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { outcome: string; source: string; draft: { label: string } }
    expect(body.outcome).toBe('ok')
    expect(body.source).toBe('report')
    expect(body.draft.label).toBe('Voice & tone')

    // The paid artefact was the source; no vendor money moved.
    expect(research.searchSection).not.toHaveBeenCalled()
    expect(shapeSection).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Voice & tone',
        report: job.report,
        citations: job.citations,
      }),
    )
  })

  it('works even when research is off — the report is already paid for', async () => {
    const { autofill, state, brandId } = await seed({
      env: { RESEARCH_PROVIDER: 'none' },
      shapeSection: shaperOk(),
    })
    plantJob(state, brandId)

    const res = await autofill('Voice & tone')
    expect(res.status).toBe(200)
    expect(((await res.json()) as { source: string }).source).toBe('report')
  })

  it('records the fill with the writing model and no invented cost', async () => {
    const { autofill, state, brandId } = await seed({ shapeSection: shaperOk() })
    plantJob(state, brandId)

    await autofill('Voice & tone')
    expect(state.sectionAutofillEvents).toHaveLength(1)
    expect(state.sectionAutofillEvents[0]).toMatchObject({
      source: 'report',
      model: 'claude-sonnet-4-6',
      // The user's own LLM tokens: unknown, never zero.
      costUsd: null,
    })
  })

  it('report fills do not consume the search budget', async () => {
    const research = fakeProvider({ searchSection: searchOk() })
    const { app, autofill, state, brandId, workspaceId } = await seed({
      research,
      env: { RESEARCH_SECTION_MAX_PER_DAY: 1 },
      shapeSection: shaperOk(),
    })
    plantJob(state, brandId)
    expect((await autofill('Voice & tone')).status).toBe(200)

    // A sibling brand with no report still has its one search of the day.
    const other = (await (
      await app.request(`/workspaces/${workspaceId}/brands`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'Other', websiteUrl: 'https://other.example' }),
      })
    ).json()) as { id: string }
    expect((await autofill('Voice & tone', other.id)).status).toBe(200)
    expect((await autofill('Target audience', other.id)).status).toBe(429)
  })

  it('no-material rides the wire and skips the ledger — nothing landed, nothing spent', async () => {
    const { autofill, state, brandId } = await seed({ shapeSection: shaperEmpty('no-material') })
    plantJob(state, brandId)

    const res = await autofill('Visual guidelines')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ outcome: 'no-material', source: 'report', draft: null })
    expect(state.sectionAutofillEvents).toHaveLength(0)
  })

  it('invalid-shape rides the wire as a fact about the model, not a 5xx', async () => {
    const { autofill, state, brandId } = await seed({ shapeSection: shaperEmpty('invalid-shape') })
    plantJob(state, brandId)

    const res = await autofill('Voice & tone')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ outcome: 'invalid-shape', source: 'report', draft: null })
    expect(state.sectionAutofillEvents).toHaveLength(0)
  })

  // The Phase E finding, applied to the path it was not found on. The batch
  // schema gives this model a compliant way to say nothing, which is why the
  // shaper's own `!text.trim()` was thought sufficient — but an in-schema,
  // non-empty refusal is exactly the artefact the sentinel exists to catch, and
  // Path R had no reader for it.
  it('reads a prose refusal from the writing model as no-material', async () => {
    const shapeSection = vi.fn<ShapeSectionFn>((input) =>
      Promise.resolve({
        draft: {
          label: input.label,
          html: '<p>NO_MATERIAL</p>',
          text: 'NO_MATERIAL',
          sources: [],
        },
        outcome: 'ok' as const,
        reportChars: input.report.length,
        model: 'claude-sonnet-4-6',
      }),
    )
    const { autofill, state, brandId } = await seed({ shapeSection })
    plantJob(state, brandId)

    const res = await autofill('Franchise fee schedule')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ outcome: 'no-material', source: 'report', draft: null })
    // Nothing landed, so nothing is on the ledger — the same rule the shaper's
    // own `no-material` follows.
    expect(state.sectionAutofillEvents).toHaveLength(0)
  })

  it('a report section that mentions the sentinel words is still a section', async () => {
    const shapeSection = vi.fn<ShapeSectionFn>((input) =>
      Promise.resolve({
        draft: {
          label: input.label,
          html: '<p>We aim for no material waste.</p>',
          text: 'We aim for no material waste.',
          sources: [],
        },
        outcome: 'ok' as const,
        reportChars: input.report.length,
        model: 'claude-sonnet-4-6',
      }),
    )
    const { autofill, state, brandId } = await seed({ shapeSection })
    plantJob(state, brandId)

    const body = (await (await autofill('Values & positioning')).json()) as {
      outcome: string
      draft: { text: string } | null
    }
    expect(body.outcome).toBe('ok')
    expect(body.draft?.text).toContain('no material waste')
    expect(state.sectionAutofillEvents).toHaveLength(1)
  })

  it('NO_FINDINGS falls through to the search — its report is an apology, not a source', async () => {
    const research = fakeProvider({ searchSection: searchOk() })
    const { autofill, state, brandId } = await seed({ research })
    plantJob(state, brandId, { status: 'NO_FINDINGS', report: 'One page, one email address.' })

    const res = await autofill('Voice & tone')
    expect(res.status).toBe(200)
    expect(((await res.json()) as { source: string }).source).toBe('search')
    expect(research.searchSection).toHaveBeenCalledTimes(1)
  })
})
