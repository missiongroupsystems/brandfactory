import type { ResearchProvider } from '@brandfactory/adapter-research'
import type { ResearchJob } from '@brandfactory/db'
import { describe, expect, it, vi } from 'vitest'
import { createFakeDb } from '../test-helpers'
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
    const ticker = createResearchTicker({ db, research: { start: vi.fn(), poll }, env })

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

  it('start is idempotent and stop clears the timer', () => {
    const { db } = createFakeDb()
    const ticker = createResearchTicker({
      db,
      research: { start: vi.fn(), poll: vi.fn() },
      env,
      periodMs: 10_000,
    })
    ticker.start()
    ticker.start()
    ticker.stop()
    ticker.stop()
  })
})

describe('reconcileResearchJob', () => {
  it('leaves a just-created job alone while its submission is still in flight', async () => {
    const { db } = createFakeDb()
    const job = await seedInFlightJob(db, '')
    const research: ResearchProvider = { start: vi.fn(), poll: vi.fn() }

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
    const research: ResearchProvider = { start: vi.fn(), poll: vi.fn() }

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
    const shape = vi.fn(() => Promise.resolve([]))
    const deps = { db, research: { start: vi.fn(), poll }, env, shape }

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
    const deps = { db, research: { start: vi.fn(), poll }, env }

    await reconcileResearchJob(deps, job)
    await reconcileResearchJob(deps, job)

    expect(poll).toHaveBeenCalledTimes(2)
  })

  it('is a no-op on a job that already finished', async () => {
    const { db } = createFakeDb()
    const job = await seedInFlightJob(db)
    await db.finishResearchJob(job.id, { status: 'FAILED', error: 'done already' })
    const finished = (await db.getResearchJob(job.brandId, job.id))!
    const research: ResearchProvider = { start: vi.fn(), poll: vi.fn() }

    const after = await reconcileResearchJob({ db, research, env }, finished)
    expect(after.status).toBe('FAILED')
    expect(research.poll).not.toHaveBeenCalled()
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
