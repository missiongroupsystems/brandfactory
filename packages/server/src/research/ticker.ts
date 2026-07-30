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
  stop: () => void
}

export function createResearchTicker(deps: ResearchTickerDeps): ResearchTicker {
  let timer: NodeJS.Timeout | null = null
  let running = false

  async function tick(): Promise<void> {
    // Overlap guard. A sweep that runs long — one slow vendor call against a
    // handful of jobs — must not have the next interval start a second one on
    // the same rows.
    if (running) return
    running = true
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
    } finally {
      running = false
    }
  }

  return {
    tick,
    start() {
      if (timer) return
      timer = setInterval(() => void tick(), deps.periodMs ?? TICKER_PERIOD_MS)
      // The sweep must not be the reason a process stays alive at shutdown.
      timer.unref?.()
    },
    stop() {
      if (!timer) return
      clearInterval(timer)
      timer = null
    },
  }
}
