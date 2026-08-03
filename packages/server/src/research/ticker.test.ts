import type { ShapeResearchResult } from '@brandfactory/agent'
import type { ResearchProvider } from '@brandfactory/adapter-research'
import type { ResearchJob } from '@brandfactory/db'
import { describe, expect, it, vi } from 'vitest'
import { createLogger } from '../logger'
import { createFakeDb, shaped } from '../test-helpers'
import { reconcileResearchJob, UNSUBMITTED_GRACE_MS } from './service'
import { createResearchTicker } from './ticker'

// The ticker exists for the browser that closed. Every test drives `tick()`
// directly — a test that waits on a real interval is a slow test that also
// tests `setInterval`.

const USAGE = {
  costUsd: 0.377,
  searchQueries: 38,
  inputTokens: 1,
  outputTokens: 1,
  reasoningTokens: 1,
  citationTokens: 1,
}
const REPORT = 'x'.repeat(2000)

// The ticker reconciles jobs; it never section-searches. Spread into every
// fake so the port's third method (guideline auto-fill Phase A) fails by name
// if a reconcile path ever reaches it.
const neverSearches = () => ({
  searchSection: vi.fn(() => Promise.reject(new Error('searchSection not expected in a sweep'))),
})

const env = {
  RESEARCH_PROVIDER: 'perplexity' as const,
  RESEARCH_MODEL: 'sonar-deep-research',
  RESEARCH_MAX_ACTIVE_PER_WORKSPACE: 2,
  RESEARCH_MAX_JOBS_PER_DAY: 10,
  RESEARCH_JOB_MAX_MINUTES: 60,
}

async function seedInFlightJob(db: ReturnType<typeof createFakeDb>['db'], externalId = 'ext-1') {
  const job = await db.createResearchJob({
    brandId: 'b-1' as ResearchJob['brandId'],
    provider: 'perplexity',
    model: 'sonar-deep-research',
    input: { brandName: 'Casa Vostra', websiteUrl: 'https://casavostra.example' },
    createdBy: null,
  })
  return externalId ? ((await db.setResearchJobExternalId(job.id, externalId)) ?? job) : job
}

describe('the ticker', () => {
  it('finishes a job nobody is watching', async () => {
    const { db } = createFakeDb()
    const job = await seedInFlightJob(db)
    const research: ResearchProvider = {
      ...neverSearches(),
      start: vi.fn(),
      poll: vi.fn(() =>
        Promise.resolve({
          status: 'completed' as const,
          report: REPORT,
          sources: [],
          usage: USAGE,
        }),
      ),
    }

    await createResearchTicker({ db, research, env }).tick()

    const after = await db.getResearchJob(job.brandId, job.id)
    expect(after?.status).toBe('COMPLETED')
    expect(after?.costUsd).toBe(0.377)
  })

  it('sweeps every in-flight job even when one of them throws', async () => {
    const { db } = createFakeDb()
    const bad = await seedInFlightJob(db, 'ext-bad')
    const good = await seedInFlightJob(db, 'ext-good')
    const research: ResearchProvider = {
      ...neverSearches(),
      start: vi.fn(),
      poll: vi.fn((id: string) =>
        id === 'ext-bad'
          ? Promise.reject(new Error('boom'))
          : Promise.resolve({
              status: 'completed' as const,
              report: REPORT,
              sources: [],
              usage: USAGE,
            }),
      ),
    }

    await createResearchTicker({ db, research, env }).tick()

    expect((await db.getResearchJob(bad.brandId, bad.id))?.status).toBe('IN_PROGRESS')
    expect((await db.getResearchJob(good.brandId, good.id))?.status).toBe('COMPLETED')
  })

  // A slow sweep must not have the next interval start a second one on the
  // same rows — that is duplicate vendor calls for the same paid-for job.
  it('does not overlap with itself', async () => {
    const { db } = createFakeDb()
    await seedInFlightJob(db)
    let release: (() => void) | null = null
    const poll = vi.fn(
      () =>
        new Promise<{ status: 'running' }>((resolve) => {
          release = () => resolve({ status: 'running' })
        }),
    )
    const ticker = createResearchTicker({
      db,
      research: { start: vi.fn(), poll, ...neverSearches() },
      env,
    })

    const first = ticker.tick()
    // The first sweep has to actually reach the provider before a second one
    // can prove it was refused — `tick()` awaits its DB read first, so a bare
    // microtask flush is not enough.
    await new Promise((r) => setTimeout(r, 20))
    expect(poll).toHaveBeenCalledTimes(1)

    await ticker.tick() // returns immediately, sweeps nothing
    expect(poll).toHaveBeenCalledTimes(1)
    release!()
    await first

    // And once the sweep is done, the next one is allowed through.
    const second = ticker.tick()
    await new Promise((r) => setTimeout(r, 20))
    expect(poll).toHaveBeenCalledTimes(2)
    release!()
    await second
  })

  it('start is idempotent and stop clears the timer', async () => {
    const { db } = createFakeDb()
    const ticker = createResearchTicker({
      db,
      research: { start: vi.fn(), poll: vi.fn(), ...neverSearches() },
      env,
      periodMs: 10_000,
    })
    ticker.start()
    ticker.start()
    await ticker.stop()
    await ticker.stop()
  })

  // **Shutdown, and the write that used to be lost in it.** `main.ts` stops the
  // ticker before `pool.end()` precisely so a sweep does not query a dead pool —
  // but clearing an interval says nothing about the sweep already sitting inside
  // a vendor poll, which the adapter allows 30 seconds. That sweep came back
  // after the pool closed, and the write it was on its way to make is
  // `finishResearchJob` for a run that had completed and been billed: losing it
  // strands a paid job `IN_PROGRESS` until the hour-long ceiling closes it.
  it('waits for the sweep already in flight before resolving', async () => {
    const { db } = createFakeDb()
    const job = await seedInFlightJob(db)
    let release: (() => void) | null = null
    const poll = vi.fn(
      () =>
        new Promise<{
          status: 'completed'
          report: string
          sources: []
          usage: typeof USAGE
        }>((resolve) => {
          release = () =>
            resolve({ status: 'completed', report: REPORT, sources: [], usage: USAGE })
        }),
    )
    const ticker = createResearchTicker({
      db,
      research: { start: vi.fn(), poll, ...neverSearches() },
      env,
    })

    void ticker.tick()
    await new Promise((r) => setTimeout(r, 20))

    let stopped = false
    const stopping = ticker.stop().then(() => {
      stopped = true
    })
    // Still inside the vendor call: `stop()` must not have resolved yet, or the
    // pool would close underneath the write below.
    await new Promise((r) => setTimeout(r, 20))
    expect(stopped).toBe(false)

    release!()
    await stopping
    expect(stopped).toBe(true)
    // The whole point of waiting: the sweep's write landed.
    expect((await db.getResearchJob(job.brandId, job.id))?.status).toBe('COMPLETED')
  })

  // Nothing running, nothing to wait for — `stop()` on an idle ticker must not
  // hang the shutdown path it sits on.
  it('resolves immediately when no sweep is in flight', async () => {
    const { db } = createFakeDb()
    const ticker = createResearchTicker({
      db,
      research: { start: vi.fn(), poll: vi.fn(), ...neverSearches() },
      env,
    })
    await ticker.stop()
  })
})

describe('reconcileResearchJob', () => {
  it('leaves a just-created job alone while its submission is still in flight', async () => {
    const { db } = createFakeDb()
    const job = await seedInFlightJob(db, '')
    const research: ResearchProvider = { start: vi.fn(), poll: vi.fn(), ...neverSearches() }

    // One second after it was created: the submission is a single round trip,
    // so this is the ordinary in-between state, not a stuck job. (The fake
    // clock is fixed in the past, so `now` is passed explicitly.)
    const after = await reconcileResearchJob(
      { db, research, env },
      job,
      Date.parse(job.createdAt) + 1000,
    )
    expect(after.status).toBe('IN_PROGRESS')
    expect(research.poll).not.toHaveBeenCalled()
  })

  // If the process died between the insert and the submission, nothing will
  // ever fill the id in and the brand would look busy forever.
  it('fails a job that never got an external id, once the grace has passed', async () => {
    const { db } = createFakeDb()
    const job = await seedInFlightJob(db, '')
    const research: ResearchProvider = { start: vi.fn(), poll: vi.fn(), ...neverSearches() }

    const after = await reconcileResearchJob(
      { db, research, env },
      job,
      Date.parse(job.createdAt) + UNSUBMITTED_GRACE_MS + 1,
    )
    expect(after.status).toBe('FAILED')
    expect(after.error).toMatch(/never submitted/)
  })

  // The guard the shaping spend did not have. Concurrent reconciles of one job
  // are the ordinary case — a 5-second client poll against a 30-second sweep —
  // and each one used to buy its own vendor poll and its own `generateObject`
  // pass over a report measured at 67,780 characters. Only one write could land,
  // so every other pass was paid for and discarded.
  it('collapses concurrent reconciles into one poll and one shaping pass', async () => {
    const { db } = createFakeDb()
    const job = await seedInFlightJob(db)
    const poll = vi.fn(() =>
      Promise.resolve({
        status: 'completed' as const,
        report: REPORT,
        sources: [],
        usage: USAGE,
      }),
    )
    const shape = vi.fn(() => Promise.resolve(shaped([])))
    const deps = { db, research: { start: vi.fn(), poll, ...neverSearches() }, env, shape }

    const results = await Promise.all([
      reconcileResearchJob(deps, job),
      reconcileResearchJob(deps, job),
      reconcileResearchJob(deps, job),
    ])

    expect(poll).toHaveBeenCalledTimes(1)
    expect(shape).toHaveBeenCalledTimes(1)
    // Every caller gets the real outcome, not a stale row — they share the work
    // rather than one of them losing a race.
    expect(results.map((r) => r.status)).toEqual(['COMPLETED', 'COMPLETED', 'COMPLETED'])
    expect((await db.getResearchJob(job.brandId, job.id))?.status).toBe('COMPLETED')
  })

  // The de-duplication above is in-process, so it is an optimisation of spend.
  // **This is the correctness guarantee underneath it**, and it has to keep
  // working independently: if a deployment ever runs two instances past the
  // single-instance invariant, `finishResearchJob`'s `WHERE status =
  // 'IN_PROGRESS'` is what stops a second finisher overwriting the first — and
  // what makes 3F's one-thread-per-run true.
  it('still lets only the first finisher write, whatever raced above it', async () => {
    const { db } = createFakeDb()
    const job = await seedInFlightJob(db)

    const first = await db.finishResearchJob(job.id, { status: 'COMPLETED', report: REPORT })
    const second = await db.finishResearchJob(job.id, { status: 'FAILED', error: 'too late' })

    expect(first?.status).toBe('COMPLETED')
    expect(second).toBeNull()
    expect((await db.getResearchJob(job.brandId, job.id))?.status).toBe('COMPLETED')
  })

  // The map is keyed by job id and cleared on settle, so it must never stop a
  // *later* sweep asking again — the vendor's answer is what changes.
  it('asks again on the next sweep, once the previous answer has settled', async () => {
    const { db } = createFakeDb()
    const job = await seedInFlightJob(db)
    const poll = vi.fn(() => Promise.resolve({ status: 'running' as const }))
    const deps = { db, research: { start: vi.fn(), poll, ...neverSearches() }, env }

    await reconcileResearchJob(deps, job)
    await reconcileResearchJob(deps, job)

    expect(poll).toHaveBeenCalledTimes(2)
  })

  it('is a no-op on a job that already finished', async () => {
    const { db } = createFakeDb()
    const job = await seedInFlightJob(db)
    await db.finishResearchJob(job.id, { status: 'FAILED', error: 'done already' })
    const finished = (await db.getResearchJob(job.brandId, job.id))!
    const research: ResearchProvider = { start: vi.fn(), poll: vi.fn(), ...neverSearches() }

    const after = await reconcileResearchJob({ db, research, env }, finished)
    expect(after.status).toBe('FAILED')
    expect(research.poll).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // A completed run with no drafts, said out loud
  // -------------------------------------------------------------------------
  //
  // The first watched production run reached `COMPLETED` with zero drafts and
  // the release that responded to it proposed diagnosing the next one by
  // streaming logs for `research shaping failed`. That could not have worked:
  // the line fires only from the `catch`, and shaping had four ways to come back
  // empty *without throwing*. The most likely of them — a writing model that
  // answers outside the schema — produced a finished job, an empty review sheet
  // and a clean log. These tests are the guarantee that never happens again.
  describe('an empty shaping pass', () => {
    async function reconcileWithShape(shape: () => Promise<ShapeResearchResult>) {
      const { db } = createFakeDb()
      const job = await seedInFlightJob(db)
      const lines: { level: string; msg: string; outcome?: string }[] = []
      const logger = createLogger({
        level: 'debug',
        write: (line) => lines.push(JSON.parse(line) as (typeof lines)[number]),
      })
      const poll = vi.fn(() =>
        Promise.resolve({
          status: 'completed' as const,
          report: REPORT,
          sources: [],
          usage: USAGE,
        }),
      )
      await reconcileResearchJob(
        { db, research: { start: vi.fn(), poll, ...neverSearches() }, env, shape, logger },
        job,
      )
      return { lines, jobId: job.id }
    }

    // Our configuration, not the brand's website — which is why it is the one
    // that gets `error`.
    it('reports an out-of-schema answer at error, with the numbers to act on', async () => {
      const { lines, jobId } = await reconcileWithShape(() =>
        Promise.resolve({
          drafts: [],
          outcome: 'invalid-shape',
          reportChars: 48_607,
          sectionsReturned: 0,
        }),
      )

      const line = lines.find((l) => l.msg === 'research shaping produced no drafts')
      expect(line).toBeDefined()
      expect(line).toMatchObject({
        level: 'error',
        outcome: 'invalid-shape',
        reportChars: 48_607,
        sectionsReturned: 0,
        jobId,
      })
    })

    // The prompt's first rule is *omit rather than invent*, so this can be the
    // honest answer about a thin site. Reported, but not as a fault.
    it('reports an honestly empty answer at warn', async () => {
      const { lines } = await reconcileWithShape(() => Promise.resolve(shaped([])))
      expect(lines.find((l) => l.msg === 'research shaping produced no drafts')).toMatchObject({
        level: 'warn',
        outcome: 'no-sections',
      })
    })

    // Sections came back and every one was rejected on our side. Distinct from
    // the above precisely so a prompt drift is not read as a thin website.
    it('reports sections it dropped itself, and says how many there were', async () => {
      const { lines } = await reconcileWithShape(() => Promise.resolve(shaped([], 4)))
      expect(lines.find((l) => l.msg === 'research shaping produced no drafts')).toMatchObject({
        level: 'warn',
        outcome: 'sections-dropped',
        sectionsReturned: 4,
      })
    })

    // A successful pass must stay quiet, or the line means nothing.
    it('says nothing at all when drafts landed', async () => {
      const { lines } = await reconcileWithShape(() =>
        Promise.resolve(
          shaped([{ label: 'Voice & tone', html: '<p>Warm.</p>', text: 'Warm.', sources: [] }]),
        ),
      )
      expect(lines.find((l) => l.msg === 'research shaping produced no drafts')).toBeUndefined()
    })
  })

  // `IN_PROGRESS` had no ceiling once an `externalId` existed. A vendor that
  // purges the job (every poll 404s) or never leaves its running state left the
  // row in flight forever — and that row permanently fails the per-brand guard
  // *and* holds a slot in a workspace cap that defaults to 2.
  describe('the stale ceiling', () => {
    const staleNow = (job: ResearchJob, minutes: number) =>
      Date.parse(job.createdAt) + minutes * 60 * 1000

    it('leaves a job the vendor is still working on alone', async () => {
      const { db } = createFakeDb()
      const job = await seedInFlightJob(db)
      const research: ResearchProvider = {
        ...neverSearches(),
        start: vi.fn(),
        poll: vi.fn(() => Promise.resolve({ status: 'running' as const })),
      }

      const after = await reconcileResearchJob({ db, research, env }, job, staleNow(job, 59))
      expect(after.status).toBe('IN_PROGRESS')
    })

    it('closes a run the vendor never finished, so the brand is researchable again', async () => {
      const { db } = createFakeDb()
      const job = await seedInFlightJob(db)
      const research: ResearchProvider = {
        ...neverSearches(),
        start: vi.fn(),
        poll: vi.fn(() => Promise.resolve({ status: 'running' as const })),
      }

      const after = await reconcileResearchJob({ db, research, env }, job, staleNow(job, 61))
      expect(after.status).toBe('FAILED')
      expect(after.error).toMatch(/did not finish this run within 60 minutes/)
      // The whole point: the guard that was permanently blocked lets go.
      expect(await db.hasActiveResearchJob(job.brandId)).toBe(false)
      // And the pointer to a report that may well exist — and have been billed —
      // survives being closed.
      expect(after.externalId).toBe('ext-1')
    })

    // The case that motivated the ceiling: the vendor purged the job, so no poll
    // will ever answer. Below the ceiling this must still change nothing.
    it('closes a job whose polls have stopped answering, but only past the ceiling', async () => {
      const { db } = createFakeDb()
      const job = await seedInFlightJob(db)
      const research: ResearchProvider = {
        ...neverSearches(),
        start: vi.fn(),
        poll: vi.fn(() => Promise.reject(new Error('404 job not found'))),
      }
      const deps = { db, research, env }

      expect((await reconcileResearchJob(deps, job, staleNow(job, 10))).status).toBe('IN_PROGRESS')
      expect((await reconcileResearchJob(deps, job, staleNow(job, 61))).status).toBe('FAILED')
    })

    // A misconfigured ceiling must be a no-op, never "abandon everything" —
    // `ageMs < NaN` is `false`, which would fail every job on its first poll.
    it('does nothing at all when the ceiling is not a usable number', async () => {
      const { db } = createFakeDb()
      const job = await seedInFlightJob(db)
      const research: ResearchProvider = {
        ...neverSearches(),
        start: vi.fn(),
        poll: vi.fn(() => Promise.resolve({ status: 'running' as const })),
      }
      const broken = { ...env, RESEARCH_JOB_MAX_MINUTES: undefined as unknown as number }

      const after = await reconcileResearchJob(
        { db, research, env: broken },
        job,
        staleNow(job, 999),
      )
      expect(after.status).toBe('IN_PROGRESS')
    })
  })
})
