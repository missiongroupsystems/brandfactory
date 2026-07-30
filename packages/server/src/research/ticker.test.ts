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

  // The ticker and a reconcile-on-read hitting one job is the ordinary case.
  it('lets the first finisher win a race, and the second write nothing', async () => {
    const { db } = createFakeDb()
    const job = await seedInFlightJob(db)
    const deps = {
      db,
      research: {
        start: vi.fn(),
        poll: vi.fn(() =>
          Promise.resolve({
            status: 'completed' as const,
            report: REPORT,
            sources: [],
            usage: USAGE,
          }),
        ),
      },
      env,
    }

    const [a, b] = await Promise.all([
      reconcileResearchJob(deps, job),
      reconcileResearchJob(deps, job),
    ])
    // Both callers get a job back; only one `completedAt` was ever written.
    expect(a.status).toBe('COMPLETED')
    expect(b.status).toBe('IN_PROGRESS')
    expect((await db.getResearchJob(job.brandId, job.id))?.status).toBe('COMPLETED')
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
})
