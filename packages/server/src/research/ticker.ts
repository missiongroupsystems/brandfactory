import type { Db } from '../db'
import type { Logger } from '../logger'
import { reconcileResearchJob, type ResearchServiceDeps } from './service'

// ---------------------------------------------------------------------------
// The ticker — the thing that finishes a job nobody is watching
// ---------------------------------------------------------------------------
//
// Decision 7: the job is a row, so a closed browser costs nothing. The row is
// only half of that promise — something has to ask the vendor whether the run
// finished when no client is polling. This is that something.
//
// **Single-instance**, and this adds no new constraint: `native-ws` realtime has
// pinned the server to one instance since 0.9.1. Written down here anyway so it
// is not rediscovered during a scale-out — two instances would both sweep the
// same rows. That is *safe* (`finishResearchJob` requires `IN_PROGRESS`, so the
// loser writes nothing) but it is twice the vendor calls, and the fix is an
// advisory lock or a claim column. Recorded, not scheduled.
//
// **The period is 30 seconds, and it is a reconciler rather than a progress
// bar.** 3A measured a real deep-research run at 4.0 minutes and the vendor
// documents 3–15, so a faster sweep buys nothing: the client that actually cares
// is polling its own summary every 5 seconds, and it reconciles on read. This
// exists for the browser that closed.

export const TICKER_PERIOD_MS = 30_000

export interface ResearchTickerDeps extends ResearchServiceDeps {
  db: ResearchServiceDeps['db'] & Pick<Db, 'listInFlightResearchJobs'>
  logger?: Logger
  periodMs?: number
}

export interface ResearchTicker {
  /** One sweep. Exported so a test never has to wait on a timer. */
  tick: () => Promise<void>
  start: () => void
  /**
   * Stop sweeping, **and wait for the sweep already in flight**.
   *
   * Async for the reason `main.ts` calls it first at shutdown: clearing the
   * interval does nothing about the sweep that is currently sitting inside a
   * vendor poll, which the adapter allows up to 30 seconds. That sweep resumes
   * after `pool.end()` and writes against a dead pool — and the write it loses
   * is `finishResearchJob` for a run that had genuinely completed, leaving a
   * paid job `IN_PROGRESS` until the ceiling closes it an hour later.
   */
  stop: () => Promise<void>
}

export function createResearchTicker(deps: ResearchTickerDeps): ResearchTicker {
  let timer: NodeJS.Timeout | null = null
  // The sweep in flight, or `null`. Doubles as the overlap guard the `running`
  // boolean used to be — holding the promise rather than a flag is what lets
  // `stop()` await it.
  let sweep: Promise<void> | null = null

  async function runSweep(): Promise<void> {
    try {
      const jobs = await deps.db.listInFlightResearchJobs()
      for (const job of jobs) {
        try {
          await reconcileResearchJob(deps, job)
        } catch (cause) {
          // One job's failure must not end the sweep — the others are equally
          // paid for. `reconcileResearchJob` already swallows a failed poll;
          // this catches anything else, including a DB error.
          deps.logger?.error('research reconcile failed', {
            jobId: job.id,
            err: cause instanceof Error ? cause.message : String(cause),
          })
        }
      }
    } catch (cause) {
      deps.logger?.error('research ticker sweep failed', {
        err: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  // Overlap guard, unchanged in behaviour: a sweep that runs long — one slow
  // vendor call against a handful of jobs — must not have the next interval
  // start a second one on the same rows. A refused tick still **returns
  // immediately** rather than joining the sweep in flight; joining would make
  // `tick()` block for as long as the vendor takes, which is not what any caller
  // of a "sweep now" method wants and would deadlock a test driving both.
  function tick(): Promise<void> {
    if (sweep) return Promise.resolve()
    // `runSweep` catches everything, so this promise never rejects — which is
    // what makes `await sweep` in `stop()` safe without a handler of its own.
    const started = runSweep().finally(() => {
      sweep = null
    })
    sweep = started
    return started
  }

  return {
    tick,
    start() {
      if (timer) return
      timer = setInterval(() => void tick(), deps.periodMs ?? TICKER_PERIOD_MS)
      // The sweep must not be the reason a process stays alive at shutdown.
      timer.unref?.()
    },
    async stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      // Read once: the `finally` above may have nulled it between these lines.
      await sweep
    },
  }
}
