import type { ResearchProvider } from '@brandfactory/adapter-research'
import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../env'
import type { ShapeResearchFn } from '../research/shape'
import { createTestApp, shaped, type TestHarness } from '../test-helpers'

// ---------------------------------------------------------------------------
// The routes, and the three guards that stand between a click and a bill
// ---------------------------------------------------------------------------
//
// Every test here runs against a fake provider. The real one has its own suite
// in `@brandfactory/adapter-research`, against 3A's captured bodies; what is
// checked here is the *lifecycle* — who may start a run, what happens when one
// fails, and what the wire says about it.

const USER = { id: 'u-1', token: 't-1' }
const auth = () => ({ authorization: `Bearer ${USER.token}`, 'content-type': 'application/json' })

// Long enough to clear `NO_FINDINGS_MAX_CHARS`. 3A's real one was 67,780 chars.
const REPORT = `# Brand Profile\n\n${'A real report runs to tens of thousands of characters. '.repeat(20)}`

const USAGE = {
  costUsd: 0.377,
  searchQueries: 38,
  inputTokens: 139,
  outputTokens: 12_817,
  reasoningTokens: 26_112,
  citationTokens: 2_933,
}

function fakeProvider(over: Partial<ResearchProvider> = {}): ResearchProvider {
  return {
    start: vi.fn(() => Promise.resolve({ externalId: 'ext-1' })),
    poll: vi.fn(() => Promise.resolve({ status: 'running' as const })),
    ...over,
  }
}

/**
 * A signed-in workspace with one brand. `research` defaults to on, which the
 * shipped default is not — `RESEARCH_PROVIDER=none` has its own test below.
 */
async function seed(
  opts: {
    websiteUrl?: string | null
    research?: ResearchProvider
    env?: Partial<Env>
  } = {},
) {
  const research = opts.research ?? fakeProvider()
  const harness = createTestApp({
    users: [USER],
    env: { RESEARCH_PROVIDER: 'perplexity', PERPLEXITY_API_KEY: 'k', ...opts.env },
    research,
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

  const post = (brandId = brand.id) =>
    app.request(`/brands/${brandId}/research`, { method: 'POST', headers: auth() })
  const latest = (brandId = brand.id) =>
    app.request(`/brands/${brandId}/research`, { headers: auth() })

  return { ...harness, workspaceId: ws.id, brandId: brand.id, research, post, latest }
}

async function newBrand(app: ReturnType<typeof createTestApp>['app'], wsId: string, url: string) {
  return (await (
    await app.request(`/workspaces/${wsId}/brands`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'Other', websiteUrl: url }),
    })
  ).json()) as { id: string }
}

const completedPoll = (report = REPORT, sources: { title: string; url: string }[] = []) =>
  vi.fn(() => Promise.resolve({ status: 'completed' as const, report, sources, usage: USAGE }))

// A brand's threads. Module-scoped because two suites read them now — 3F's, which
// asserts the report becomes one, and the drafts-clearing suite, which asserts
// clearing the drafts does *not* disturb it.
//
// `TestHarness['app']`, not `Awaited<ReturnType<typeof seed>>['app']`: resolving
// the latter walks hono's route generics far enough to hit TS2589 ("type
// instantiation is excessively deep"). The named type is the same app.
const threads = async (
  app: TestHarness['app'],
  brandId: string,
): Promise<{ id: string; name: string; kind: string; templateId?: string }[]> =>
  (await (await app.request(`/brands/${brandId}/projects`, { headers: auth() })).json()) as never

describe('POST /brands/:id/research', () => {
  it('starts a run and returns the job summary', async () => {
    const { post, research } = await seed()

    const res = await post()
    expect(res.status).toBe(201)
    const body = (await res.json()) as { status: string; drafts: unknown[]; sourceCount: number }
    expect(body.status).toBe('IN_PROGRESS')
    expect(body.drafts).toEqual([])
    expect(body.sourceCount).toBe(0)

    // The brand's own name and URL went out — nothing a client supplied,
    // because the request has no body at all (decision 3).
    expect(research.start).toHaveBeenCalledWith(
      expect.objectContaining({
        websiteUrl: 'https://casavostra.example',
        brandName: 'Casa Vostra',
        model: 'sonar-deep-research',
      }),
    )
  })

  // Decision 4, the hard gate. A deep pass over a bare brand name finds *a*
  // company of that name and writes a cited, confident, wrong profile.
  it('refuses a brand with no website, before spending anything', async () => {
    const { post, research } = await seed({ websiteUrl: null })
    const res = await post()
    expect(res.status).toBe(400)
    expect(research.start).not.toHaveBeenCalled()
  })

  it('refuses a second run while one is in flight', async () => {
    const { post } = await seed()
    expect((await post()).status).toBe(201)

    const second = await post()
    expect(second.status).toBe(409)
    expect(((await second.json()) as { code: string }).code).toBe('RESEARCH_ALREADY_RUNNING')
  })

  it('enforces the workspace active cap across brands', async () => {
    const { app, post, workspaceId, research } = await seed({
      env: { RESEARCH_MAX_ACTIVE_PER_WORKSPACE: 1 },
    })
    const other = await newBrand(app, workspaceId, 'https://other.example')

    expect((await post()).status).toBe(201)
    const res = await post(other.id)
    expect(res.status).toBe(429)
    // One outbound call, not two: the cap ran before the second submission.
    expect(research.start).toHaveBeenCalledTimes(1)
  })

  // Decision 12 — the only guard here that protects money rather than data.
  it('enforces the per-day cap, and counts a finished run against it', async () => {
    const { post, latest } = await seed({
      env: { RESEARCH_MAX_JOBS_PER_DAY: 1 },
      research: fakeProvider({ poll: completedPoll() }),
    })

    expect((await post()).status).toBe(201)
    // Finish it, so the active-job guard is not what refuses the next one.
    expect(((await (await latest()).json()) as { job: { status: string } }).job.status).toBe(
      'COMPLETED',
    )

    const res = await post()
    expect(res.status).toBe(429)
    expect(((await res.json()) as { code: string }).code).toBe('RESEARCH_LIMIT')
  })

  it('is not enabled at all on the shipped default', async () => {
    const { post } = await seed({ env: { RESEARCH_PROVIDER: 'none' } })
    const res = await post()
    expect(res.status).toBe(501)
    expect(((await res.json()) as { code: string }).code).toBe('RESEARCH_NOT_ENABLED')
  })

  // A submission that never left the building must not leave the brand looking
  // busy — the next attempt would be refused by a job that does not exist.
  it('fails the job when the provider refuses the submission, and frees the brand', async () => {
    const { post } = await seed({
      research: fakeProvider({ start: vi.fn(() => Promise.reject(new Error('402 no credit'))) }),
    })

    const res = await post()
    expect(res.status).toBe(201)
    expect(((await res.json()) as { status: string }).status).toBe('FAILED')

    expect((await post()).status).toBe(201)
  })
})

describe('GET /brands/:id/research', () => {
  it('says research is available, and that this brand has none', async () => {
    const { latest } = await seed()
    const res = await latest()
    expect(res.status).toBe(200)
    // `maxMinutes` rides the same envelope: the in-flight row states the age at
    // which `abandonIfStale` closes a run, and it cannot state a number it was
    // never sent. Default from `EnvSchema`.
    expect(await res.json()).toEqual({ enabled: true, maxMinutes: 60, job: null })
  })

  it('reports the configured ceiling, not a hardcoded one', async () => {
    const { latest } = await seed({ env: { RESEARCH_JOB_MAX_MINUTES: 25 } })
    expect(await (await latest()).json()).toMatchObject({ maxMinutes: 25 })
  })

  // The callback gate, at its source: a deployment with no provider reports
  // `enabled: false`, and the hub renders no research row at all.
  it('reports the feature as unavailable when no provider is configured', async () => {
    const { latest } = await seed({ env: { RESEARCH_PROVIDER: 'none' } })
    expect(await (await latest()).json()).toEqual({
      enabled: false,
      maxMinutes: 60,
      job: null,
    })
  })

  // Reconcile-on-read: the ticker only exists in a process that has been up the
  // whole time, and reading the job is exactly when someone cares.
  it('reconciles an in-flight job on read, and completes it', async () => {
    const { post, latest } = await seed({
      research: fakeProvider({
        poll: completedPoll(REPORT, [{ title: 'About', url: 'https://casavostra.example/about' }]),
      }),
    })
    await post()

    const body = (
      (await (await latest()).json()) as { job: { status: string; sourceCount: number } }
    ).job
    expect(body.status).toBe('COMPLETED')
    expect(body.sourceCount).toBe(1)
  })

  // The honest outcome of a one-page holding site: a *completed* run to the
  // vendor, and a distinct state to us.
  it('records a run that found nothing as NO_FINDINGS, not as success', async () => {
    const { post, latest } = await seed({
      research: fakeProvider({
        poll: completedPoll('The site is one page with a logo and an email address.'),
      }),
    })
    await post()

    expect(((await (await latest()).json()) as { job: { status: string } }).job.status).toBe(
      'NO_FINDINGS',
    )
  })

  it('reports a vendor failure with its own message', async () => {
    const { post, latest } = await seed({
      research: fakeProvider({
        poll: vi.fn(() =>
          Promise.resolve({ status: 'failed' as const, error: 'the provider timed out' }),
        ),
      }),
    })
    await post()

    const body = ((await (await latest()).json()) as { job: { status: string; error: string } }).job
    expect(body.status).toBe('FAILED')
    expect(body.error).toBe('the provider timed out')
  })

  it('leaves the job alone when the vendor cannot be reached', async () => {
    const { post, latest } = await seed({
      research: fakeProvider({ poll: vi.fn(() => Promise.reject(new Error('ECONNRESET'))) }),
    })
    await post()

    // Still in flight: a failed poll says nothing about a job that is very
    // likely still running, and has already been paid for.
    expect(((await (await latest()).json()) as { job: { status: string } }).job.status).toBe(
      'IN_PROGRESS',
    )
  })

  it('does not read another brand’s job through the by-id route', async () => {
    const { app, post, workspaceId, brandId } = await seed()
    const other = await newBrand(app, workspaceId, 'https://other.example')
    const created = (await (await post(brandId)).json()) as { id: string }

    const res = await app.request(`/brands/${other.id}/research/${created.id}`, {
      headers: auth(),
    })
    expect(res.status).toBe(404)
  })

  it('requires a token', async () => {
    const { app, brandId } = await seed()
    expect((await app.request(`/brands/${brandId}/research`)).status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// 3D — shaping, where the lifecycle meets it
// ---------------------------------------------------------------------------
//
// The shaper itself is tested in `@brandfactory/agent`, against a fake model.
// What matters here is what the *job* does with it: when it runs, what happens
// when it fails, and what it is never allowed to decide.

describe('shaping, as the lifecycle sees it', () => {
  const DRAFT = {
    label: 'Voice & tone',
    html: '<p>Warm, direct.</p>',
    text: 'Warm, direct.',
    sources: [{ title: 'About', url: 'https://casavostra.example/about' }],
  }

  async function seedWithShaper(shape: ShapeResearchFn) {
    const research = fakeProvider({ poll: completedPoll() })
    const harness = createTestApp({
      users: [USER],
      env: { RESEARCH_PROVIDER: 'perplexity', PERPLEXITY_API_KEY: 'k' },
      research,
      shapeResearch: shape,
    })
    const { app } = harness
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
    return {
      post: () => app.request(`/brands/${brand.id}/research`, { method: 'POST', headers: auth() }),
      latest: () => app.request(`/brands/${brand.id}/research`, { headers: auth() }),
      brandId: brand.id,
      app,
    }
  }

  // The drafts land in the same write as the report, so there is no window
  // where the rail says "ready" and the review sheet is empty.
  it('lands drafts in the same write that completes the job', async () => {
    const { post, latest } = await seedWithShaper(() => Promise.resolve(shaped([DRAFT])))
    await post()

    const body = (await (await latest()).json()) as {
      job: { status: string; drafts: { label: string }[] }
    }
    expect(body.job.status).toBe('COMPLETED')
    expect(body.job.drafts.map((d) => d.label)).toEqual(['Voice & tone'])
  })

  // A paid-for report is not thrown away because the second stage failed.
  it('completes with the report and no drafts when shaping throws', async () => {
    const { post, latest } = await seedWithShaper(() => Promise.reject(new Error('model down')))
    await post()

    const body = (await (await latest()).json()) as { job: { status: string; drafts: unknown[] } }
    expect(body.job.status).toBe('COMPLETED')
    expect(body.job.drafts).toEqual([])
  })

  // "The shaper returned nothing" and "the site had nothing" are different
  // facts: one is our configuration, the other is the brand's website.
  it('does not let an empty shaping pass masquerade as NO_FINDINGS', async () => {
    const { post, latest } = await seedWithShaper(() => Promise.resolve(shaped([])))
    await post()

    const body = (await (await latest()).json()) as { job: { status: string } }
    expect(body.job.status).toBe('COMPLETED')
  })
})

// ---------------------------------------------------------------------------
// The report joins the conversation (3F)
// ---------------------------------------------------------------------------
//
// Driven through the real routes rather than against the service, because the
// claim being made is about what a *client* can reach afterwards: an ordinary
// brand-context thread, holding an ordinary assistant message. Everything the
// 1.5.0 capture gesture needs follows from those two words being true.

describe('research — the report as a thread', () => {
  it('lands a completed report as the first message of a new brand-context thread', async () => {
    const { app, brandId, post, latest } = await seed({
      research: fakeProvider({ poll: completedPoll(REPORT) }),
    })
    await post()
    // Reconcile-on-read is what finishes the job, and therefore what creates it.
    await latest()

    const [thread, ...rest] = await threads(app, brandId)
    expect(rest).toEqual([])
    expect(thread).toMatchObject({
      kind: 'standardized',
      templateId: 'brand-context',
      name: expect.stringContaining('Brand research — Casa Vostra,') as unknown as string,
    })

    // Read back the way any client reads any thread. The report is a plain
    // assistant message on a plain project — which is the whole of 3F's claim
    // that capture works on it by construction, with no code to make it so.
    const detail = (await (
      await app.request(`/projects/${thread!.id}`, { headers: auth() })
    ).json()) as { recentMessages: { role: string; content: string }[] }
    expect(detail.recentMessages).toHaveLength(1)
    expect(detail.recentMessages[0]?.role).toBe('assistant')
    expect(detail.recentMessages[0]?.content).toBe(REPORT)
  })

  // The rail already says "Nothing found" in four words. A conversation named
  // after the run whose only message is an apology is worse than silence.
  it('creates no thread for a run that found nothing', async () => {
    const { app, brandId, post, latest } = await seed({
      research: fakeProvider({
        poll: completedPoll('The site is one page with a logo and an email address.'),
      }),
    })
    await post()
    await latest()

    expect(await threads(app, brandId)).toEqual([])
  })

  it('creates no thread for a run that failed', async () => {
    const { app, brandId, post, latest } = await seed({
      research: fakeProvider({
        poll: vi.fn(() =>
          Promise.resolve({ status: 'failed' as const, error: 'the vendor gave up' }),
        ),
      }),
    })
    await post()
    await latest()

    expect(await threads(app, brandId)).toEqual([])
  })

  // The ticker and a reconcile-on-read hitting the same job is the ordinary
  // case, not a rare race (3C). Two finishers must not produce two copies of a
  // 67,780-character report — which is why the thread hangs off the *return* of
  // `finishResearchJob` rather than off the poll result.
  it('creates exactly one thread when two reconcilers finish the same job', async () => {
    const { app, brandId, post, latest } = await seed({
      research: fakeProvider({ poll: completedPoll(REPORT) }),
    })
    await post()

    await Promise.all([latest(), latest(), latest()])

    expect(await threads(app, brandId)).toHaveLength(1)
  })

  // Re-running research is a second run and a second report, so it gets its own
  // thread — the same rule the brand-context list already states: "resume the
  // most recent" is wrong the first time you want a fresh line of thinking.
  it('gives a re-run its own thread', async () => {
    const { app, brandId, post, latest } = await seed({
      research: fakeProvider({ poll: completedPoll(REPORT) }),
    })
    await post()
    await latest()
    await post()
    await latest()

    expect(await threads(app, brandId)).toHaveLength(2)
  })

  // The thread is a side effect of finishing, never a precondition for it.
  it('completes the run even when the thread cannot be created', async () => {
    const harness = await seed({ research: fakeProvider({ poll: completedPoll(REPORT) }) })
    await harness.post()
    harness.state.projects = {
      set() {
        throw new Error('disk full')
      },
    } as never

    const body = (await (await harness.latest()).json()) as { job: { status: string } }
    expect(body.job.status).toBe('COMPLETED')
  })
})

// ---------------------------------------------------------------------------
// DELETE /brands/:id/research/:jobId/drafts
// ---------------------------------------------------------------------------
//
// The rail's `N drafts ready — Review` row reads `COMPLETED && drafts.length >
// 0`, and until this route existed nothing ever emptied `drafts`. So a brand
// that had already taken its drafts advertised them forever, and accepting a
// second time wrote a second copy of every section. The db writer had been
// sitting there since 3E with no caller — the same shape 1.11.1 found in
// `reorderAssets`.

describe('DELETE /brands/:id/research/:jobId/drafts', () => {
  const DRAFT = {
    label: 'Voice & tone',
    html: '<p>Warm, direct.</p>',
    text: 'Warm, direct.',
    sources: [],
  }

  async function seedCompleted() {
    const research = fakeProvider({ poll: completedPoll() })
    const harness = createTestApp({
      users: [USER],
      env: { RESEARCH_PROVIDER: 'perplexity', PERPLEXITY_API_KEY: 'k' },
      research,
      shapeResearch: () => Promise.resolve(shaped([DRAFT])),
    })
    const { app } = harness
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

    await app.request(`/brands/${brand.id}/research`, { method: 'POST', headers: auth() })
    const state = (await (
      await app.request(`/brands/${brand.id}/research`, { headers: auth() })
    ).json()) as { job: { id: string; status: string; drafts: unknown[] } }
    expect(state.job.status).toBe('COMPLETED')
    expect(state.job.drafts).toHaveLength(1)

    return {
      app,
      workspaceId: ws.id,
      brandId: brand.id,
      jobId: state.job.id,
      clear: (brandId = brand.id, jobId = state.job.id) =>
        app.request(`/brands/${brandId}/research/${jobId}/drafts`, {
          method: 'DELETE',
          headers: auth(),
        }),
      latest: () => app.request(`/brands/${brand.id}/research`, { headers: auth() }),
    }
  }

  it('forgets the drafts, so the rail stops offering them', async () => {
    const { clear, latest } = await seedCompleted()

    const res = await clear()
    expect(res.status).toBe(200)
    expect(((await res.json()) as { drafts: unknown[] }).drafts).toEqual([])

    // And the state the hub re-reads agrees — this is the actual defect.
    const after = (await (await latest()).json()) as { job: { status: string; drafts: unknown[] } }
    expect(after.job.status).toBe('COMPLETED')
    expect(after.job.drafts).toEqual([])
  })

  // The report is the $0.40 artefact; the drafts are derived from it and cost a
  // shaping pass to rebuild. Clearing one must never touch the other — which is
  // also the only reason clearing is an acceptable way to record "dealt with".
  it('leaves the report and its thread alone', async () => {
    const { app, brandId, clear } = await seedCompleted()
    const before = await threads(app, brandId)
    expect(before).toHaveLength(1)

    await clear()

    expect(await threads(app, brandId)).toHaveLength(1)
  })

  // The client calls this after a save it has already been told succeeded, so a
  // retry is the ordinary way to arrive twice. Failing it would put an error
  // toast on a screen where everything worked.
  it('is idempotent — clearing twice is still a success', async () => {
    const { clear } = await seedCompleted()

    expect((await clear()).status).toBe(200)
    const second = await clear()
    expect(second.status).toBe(200)
    expect(((await second.json()) as { drafts: unknown[] }).drafts).toEqual([])
  })

  it('does not clear a job through another brand', async () => {
    const { app, workspaceId, clear } = await seedCompleted()
    const other = await newBrand(app, workspaceId, 'https://other.example')

    const res = await clear(other.id)
    expect(res.status).toBe(404)
  })

  it('404s an unknown job', async () => {
    const { clear } = await seedCompleted()
    const res = await clear(undefined, '11111111-1111-4111-8111-111111111111')
    expect(res.status).toBe(404)
  })

  it('requires a token', async () => {
    const { app, brandId, jobId } = await seedCompleted()
    const res = await app.request(`/brands/${brandId}/research/${jobId}/drafts`, {
      method: 'DELETE',
    })
    expect(res.status).toBe(401)
  })
})
