import type { ResearchJob } from '@brandfactory/db'
import type { ResearchProvider } from '@brandfactory/adapter-research'
import type {
  BrandId,
  ResearchDraft,
  ResearchJobId,
  ResearchJobSummary,
  UserId,
  WorkspaceId,
} from '@brandfactory/shared'
import type { Db } from '../db'
import type { Env } from '../env'
import { ConflictError, HttpError, ValidationError } from '../errors'
import type { Logger } from '../logger'
import type { ShapeResearchFn } from './shape'
import { landReportInThread, type ResearchThreadDbDeps } from './thread'

// ---------------------------------------------------------------------------
// The research lifecycle — everything that happens around a paid call
// ---------------------------------------------------------------------------
//
// Kept out of the route module because two callers need it: the route (start,
// and reconcile-on-read) and the ticker (reconcile, on a timer). A guard that
// lives in a handler is a guard the background sweep does not have.

export type ResearchDbDeps = Pick<
  Db,
  | 'createResearchJob'
  | 'getResearchJob'
  | 'getLatestResearchJob'
  | 'hasActiveResearchJob'
  | 'countActiveResearchJobsForWorkspace'
  | 'countResearchJobsTodayForWorkspace'
  | 'listInFlightResearchJobs'
  | 'setResearchJobExternalId'
  | 'finishResearchJob'
> &
  // 3F, and the only two that are not about the job row itself: the report
  // lands as a brand-context thread once the run is finished.
  ResearchThreadDbDeps

export type ResearchEnv = Pick<
  Env,
  | 'RESEARCH_PROVIDER'
  | 'RESEARCH_MODEL'
  | 'RESEARCH_MAX_ACTIVE_PER_WORKSPACE'
  | 'RESEARCH_MAX_JOBS_PER_DAY'
  | 'RESEARCH_JOB_MAX_MINUTES'
>

export interface ResearchServiceDeps {
  db: ResearchDbDeps
  research: ResearchProvider
  env: ResearchEnv
  /**
   * Stage 2 (3D). **Optional, and absent means "land the report, shape
   * nothing"** — which is exactly what 3C shipped and what a deployment with a
   * broken writing model degrades to. A research run that found something must
   * never be thrown away because the shaping step could not run.
   */
  shape?: ShapeResearchFn
  logger?: Logger
}

/**
 * A report shorter than this is treated as `NO_FINDINGS` rather than as a
 * result. The prompt tells the finder to *"say so plainly and stop"* when a site
 * gives it too little, so the honest outcome of a one-page holding site is a
 * short paragraph — and rendering that as five sections of brand guidance would
 * be the confabulation the whole design is built to avoid.
 *
 * **Provisional, and deliberately generous.** 3A's real report was 67,780
 * characters, so the gap between "found something" and "found nothing" is three
 * orders of magnitude wide and no honest report lands near this line. 3D can
 * replace the heuristic with the better signal it will have — *shaping produced
 * zero sections* — at which point this becomes a fallback rather than the rule.
 */
export const NO_FINDINGS_MAX_CHARS = 500

/** 501, because the deployment has not enabled a feature — nothing is broken. */
export class ResearchNotEnabledError extends HttpError {
  constructor() {
    super(
      501,
      'RESEARCH_NOT_ENABLED',
      'Brand research is not enabled on this deployment. Set RESEARCH_PROVIDER to switch it on.',
    )
    this.name = 'ResearchNotEnabledError'
  }
}

/** 429: a cap was hit. Distinct from 409, which means *this brand* is busy. */
export class ResearchLimitError extends HttpError {
  constructor(message: string) {
    super(429, 'RESEARCH_LIMIT', message)
    this.name = 'ResearchLimitError'
  }
}

/**
 * The wire shape. **Narrower than the row, on purpose** — see `ResearchJob`.
 * The report is tens of thousands of characters and the hub re-reads this every
 * 5 seconds while a job is in flight.
 */
export function toResearchJobSummary(job: ResearchJob): ResearchJobSummary {
  return {
    id: job.id,
    status: job.status,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
    drafts: job.drafts,
    sourceCount: job.citations.length,
  }
}

/**
 * Postgres `23505 unique_violation`, narrowed to the one index that means
 * "someone else started this brand's run a moment ago".
 *
 * **Checked by constraint name, not by code alone.** Any other unique violation
 * reaching this line is a bug, and reporting it as a friendly 409 would hide it
 * behind a message about research already running. `pg` puts both fields on the
 * error, and neither is typed, so this reads them defensively rather than
 * importing a driver type into the service layer.
 */
export function isInFlightUniqueViolation(cause: unknown): boolean {
  if (typeof cause !== 'object' || cause === null) return false
  const err = cause as { code?: unknown; constraint?: unknown }
  return err.code === '23505' && err.constraint === 'brand_research_jobs_in_flight_idx'
}

export interface StartResearchInput {
  brandId: BrandId
  workspaceId: WorkspaceId
  brandName: string
  websiteUrl: string | null
  userId: UserId | null
}

/**
 * Start a run. **Every guard fires before the outbound call**, because that is
 * the only place enforcement is worth anything: after the call, the money is
 * spent and all a check can do is hide the result.
 */
export async function startResearch(
  deps: ResearchServiceDeps,
  input: StartResearchInput,
): Promise<ResearchJob> {
  if (deps.env.RESEARCH_PROVIDER === 'none') throw new ResearchNotEnabledError()

  // The hard URL gate (decision 4). A deep pass over the bare string "Casa
  // Vostra" finds *a* Casa Vostra and writes a confident, cited, entirely wrong
  // profile — and the citations make it *more* convincing, not less.
  if (!input.websiteUrl) {
    throw new ValidationError(
      'This brand has no website recorded. Add one before researching it — research works from the site, not from the name.',
    )
  }

  // Guard 1: one active job per brand. In the table, because the job outlives
  // the request that started it.
  if (await deps.db.hasActiveResearchJob(input.brandId)) {
    throw new ConflictError('This brand already has research running.', 'RESEARCH_ALREADY_RUNNING')
  }

  // Guard 2: the workspace's concurrent cap.
  const active = await deps.db.countActiveResearchJobsForWorkspace(input.workspaceId)
  if (active >= deps.env.RESEARCH_MAX_ACTIVE_PER_WORKSPACE) {
    throw new ResearchLimitError(
      `This workspace already has ${active} research runs going. Wait for one to finish.`,
    )
  }

  // Guard 3: the money one (decision 12). Rolling 24 hours, every status.
  const today = await deps.db.countResearchJobsTodayForWorkspace(input.workspaceId)
  if (today >= deps.env.RESEARCH_MAX_JOBS_PER_DAY) {
    throw new ResearchLimitError(
      `This workspace has used its ${deps.env.RESEARCH_MAX_JOBS_PER_DAY} research runs for today.`,
    )
  }

  // Recorded before submitted — see `createResearchJob`. A row with no
  // `externalId` is recoverable; a paid run with no row is not.
  //
  // **The insert is also the last guard.** Guard 1 above is a check-then-act, and
  // what fits between the check and this line is a second submission: two clicks
  // inside one round trip, neither request seeing the other's row. Migration 0006
  // makes `(brand_id) WHERE status = 'IN_PROGRESS'` unique so the database
  // settles it, and the loser is turned back into the 409 the non-racing path
  // already returns — reported identically, because from the user's side it is
  // the same fact.
  let job: ResearchJob
  try {
    job = await deps.db.createResearchJob({
      brandId: input.brandId,
      provider: deps.env.RESEARCH_PROVIDER,
      model: deps.env.RESEARCH_MODEL,
      input: { brandName: input.brandName, websiteUrl: input.websiteUrl },
      createdBy: input.userId,
    })
  } catch (cause) {
    if (isInFlightUniqueViolation(cause)) {
      throw new ConflictError(
        'This brand already has research running.',
        'RESEARCH_ALREADY_RUNNING',
      )
    }
    throw cause
  }

  try {
    const { externalId } = await deps.research.start({
      jobId: job.id,
      brandName: input.brandName,
      websiteUrl: input.websiteUrl,
      model: job.model,
    })
    return (await deps.db.setResearchJobExternalId(job.id, externalId)) ?? job
  } catch (cause) {
    // The submission failed, so nothing is running and nothing was charged.
    // Fail the row here rather than leaving the reconciler to work it out —
    // the brand would otherwise look busy for as long as the sweep takes.
    const message = cause instanceof Error ? cause.message : String(cause)
    deps.logger?.error('research submission failed', { jobId: job.id, err: message })
    const failed = await deps.db.finishResearchJob(job.id, { status: 'FAILED', error: message })
    return failed ?? { ...job, status: 'FAILED', error: message }
  }
}

/**
 * How long a row may sit with no `externalId` before it is declared dead.
 *
 * That state is the window between the insert and a successful `start()`, which
 * is one HTTP round trip — but if the process dies inside it, nothing will ever
 * fill the id in and the brand would look busy forever. Generous enough that a
 * slow submission is never mistaken for a dead one.
 */
export const UNSUBMITTED_GRACE_MS = 2 * 60 * 1000

/**
 * Reconciles in flight, keyed by job id — **the guard the shaping spend did not
 * have.**
 *
 * `finishResearchJob` arbitrates the *write*, which is what keeps two finishers
 * from overwriting each other and what makes 3F's one-thread-per-run true. It
 * arbitrates nothing above itself, and above itself is a vendor poll and a full
 * `generateObject` pass over a ~68,000-character report.
 *
 * That was not an edge case, it was the ordinary path. The client polls its
 * summary every 5 seconds and the ticker sweeps every 30, while a shaping pass
 * over that much input runs for tens of seconds:
 *
 * ```
 * t+0s    vendor finishes
 * t+5s    client poll   → reconcile → poll vendor → SHAPE  (paid)
 * t+30s   ticker sweep  → row still IN_PROGRESS → SHAPE    (paid, discarded)
 * t+60s   ticker sweep  → row still IN_PROGRESS → SHAPE    (paid, discarded)
 * ```
 *
 * Stage 3's own rule is that *every guard fires above the line that spends* —
 * and `RESEARCH_MAX_JOBS_PER_DAY` guards the $0.40 search while nothing guarded
 * the inference stacked on top of it. `routes/research.test.ts`'s
 * "creates exactly one thread when two reconcilers finish the same job" fired
 * three concurrent reads and asserted one thread; there were three shaping
 * passes, and nothing was watching that number.
 *
 * **In-process, and that is sufficient rather than a compromise.** The ticker
 * pins this server to one instance (see `ticker.ts`), so the racers are always
 * threads of one process. A restart mid-shape loses the entry, which costs one
 * repeated pass rather than a wrong answer — the same trade `getFreshAuthToken`
 * makes for token refresh, and the same idiom: de-dupe by *sharing the promise*,
 * so the second caller gets the first caller's result instead of its own copy of
 * the work.
 */
const reconcilesInFlight = new Map<ResearchJobId, Promise<ResearchJob>>()

/**
 * Ask the vendor where a job got to, and record it if it is finished.
 *
 * Safe to call from anywhere, including twice at once — and now **cheap** to,
 * which it was not. Two layers, doing different jobs:
 *
 * - `reconcilesInFlight` collapses concurrent calls for one job into one piece
 *   of work, so the vendor is polled once and the writing model is paid once.
 * - `finishResearchJob` still requires `IN_PROGRESS`, so even if a future
 *   deployment runs two instances past the single-instance invariant, the write
 *   remains arbitrated by the database rather than by this map.
 *
 * The second is not made redundant by the first. In-process de-duplication is an
 * optimisation of spend; the `WHERE` clause is the correctness guarantee, and
 * they are kept separate on purpose.
 */
export function reconcileResearchJob(
  deps: ResearchServiceDeps,
  job: ResearchJob,
  now: number = Date.now(),
): Promise<ResearchJob> {
  if (job.status !== 'IN_PROGRESS') return Promise.resolve(job)

  const existing = reconcilesInFlight.get(job.id)
  if (existing) return existing

  const run = reconcileNow(deps, job, now).finally(() => {
    // Cleared on settle, so this de-dupes *concurrent* callers only. A later
    // sweep must always be able to ask again — the vendor's answer changes.
    reconcilesInFlight.delete(job.id)
  })
  reconcilesInFlight.set(job.id, run)
  return run
}

async function reconcileNow(
  deps: ResearchServiceDeps,
  job: ResearchJob,
  now: number,
): Promise<ResearchJob> {
  const ageMs = now - Date.parse(job.createdAt)

  if (!job.externalId) {
    if (ageMs < UNSUBMITTED_GRACE_MS) return job
    return (
      (await deps.db.finishResearchJob(job.id, {
        status: 'FAILED',
        error: 'The run was never submitted to the provider.',
      })) ?? job
    )
  }

  let state
  try {
    state = await deps.research.poll(job.externalId)
  } catch (cause) {
    // A poll that could not reach the vendor says nothing about the job, which
    // is very likely still running — and already paid for. Leave it alone; the
    // next sweep asks again, unless the job is past the age at which "still
    // running" has stopped being credible.
    deps.logger?.warn('research poll failed', {
      jobId: job.id,
      err: cause instanceof Error ? cause.message : String(cause),
    })
    return abandonIfStale(deps, job, ageMs)
  }

  if (state.status === 'running') return abandonIfStale(deps, job, ageMs)

  if (state.status === 'failed') {
    return (
      (await deps.db.finishResearchJob(job.id, { status: 'FAILED', error: state.error })) ?? job
    )
  }

  const status = state.report.trim().length <= NO_FINDINGS_MAX_CHARS ? 'NO_FINDINGS' : 'COMPLETED'

  // **Shaping runs before the job is finished, and never decides its outcome.**
  // The drafts land in the same write as the report, so a client that sees
  // `COMPLETED` sees the drafts too — no window where the rail says "ready" and
  // the review sheet is empty.
  //
  // `NO_FINDINGS` is still decided by the report's length alone. Making "the
  // shaper returned nothing" mean "nothing was found" would let a broken
  // writing model masquerade as an honest empty result, and the two need
  // telling apart: one is the brand's site, the other is our configuration.
  let drafts: ResearchDraft[] = []
  if (deps.shape && status === 'COMPLETED') {
    try {
      drafts = await deps.shape({
        brandId: job.brandId,
        brandName: job.input.brandName,
        report: state.report,
        citations: state.sources,
      })
    } catch (cause) {
      // A paid-for report is not lost because the second stage failed. The job
      // completes with zero drafts and the report is still on the row.
      deps.logger?.error('research shaping failed', {
        jobId: job.id,
        err: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  const finished = await deps.db.finishResearchJob(job.id, {
    status,
    report: state.report,
    citations: state.sources,
    drafts,
    costUsd: state.usage.costUsd,
  })

  // **3F, and it hangs off `finished` being non-null on purpose.** That write
  // requires `IN_PROGRESS`, so exactly one caller can win it — which makes this
  // the only place in the lifecycle where "this run just finished, and we are
  // the ones who finished it" is a fact rather than a guess. The ticker and a
  // reconcile-on-read landing on the same job is the ordinary case (3C), and
  // hanging the thread off the poll result instead would give that brand two
  // copies of a 67,780-character report.
  //
  // `NO_FINDINGS` gets no thread. Its report is the finder saying plainly that
  // the site gave it too little, which the rail already says in four words —
  // a conversation named after the run whose first message is an apology is
  // worse than silence.
  if (finished?.status === 'COMPLETED') await landReportInThread(deps, finished)

  return finished ?? job
}

/**
 * Declare a job dead once "still running" has stopped being credible.
 *
 * **The gap this closes: `IN_PROGRESS` had no ceiling.** `UNSUBMITTED_GRACE_MS`
 * covered the window before an `externalId` exists and nothing covered the one
 * after it. A vendor that purges the job (so every poll 404s), or that simply
 * never leaves its running state, left the row `IN_PROGRESS` **forever** — and
 * that row is not inert:
 *
 *   - `hasActiveResearchJob` permanently refuses to research that brand again
 *   - it permanently occupies a slot in `RESEARCH_MAX_ACTIVE_PER_WORKSPACE`,
 *     which defaults to **2**
 *
 * So two stuck rows disabled research for a whole workspace, with no cancel
 * route, no `CANCELLED` producer and no way out short of a database console.
 * That is a worse failure than being wrong about a slow run, which is the
 * trade-off being made here and the reason the default is generous: the vendor
 * documents 3–15 minutes and 3G measured 5.2, so an hour is four times the
 * documented ceiling.
 *
 * **`externalId` is deliberately left on the row.** The run may well have
 * completed and been billed, so the pointer to a recoverable report has to
 * survive the row being closed — which is also why the message says what
 * happened rather than claiming the research failed.
 */
async function abandonIfStale(
  deps: ResearchServiceDeps,
  job: ResearchJob,
  ageMs: number,
): Promise<ResearchJob> {
  const maxMs = deps.env.RESEARCH_JOB_MAX_MINUTES * 60 * 1000
  // `loadEnv` validates and defaults this, so a non-number cannot reach here in
  // a running server. Checked anyway because of which way the comparison fails:
  // `ageMs < NaN` is `false`, so a missing value does not disable the ceiling —
  // it abandons **every job on its first poll**. A guard that turns a
  // configuration slip into a no-op is worth two lines when the alternative
  // silently fails every paid run in the deployment.
  if (!Number.isFinite(maxMs) || maxMs <= 0) return job
  if (ageMs < maxMs) return job

  deps.logger?.warn('research job abandoned as stale', {
    jobId: job.id,
    externalId: job.externalId,
    ageMinutes: Math.round(ageMs / 60_000),
  })
  return (
    (await deps.db.finishResearchJob(job.id, {
      status: 'FAILED',
      error: `The provider did not finish this run within ${deps.env.RESEARCH_JOB_MAX_MINUTES} minutes. It has been closed so the brand can be researched again.`,
    })) ?? job
  )
}

/**
 * Reconcile-on-read.
 *
 * The ticker only exists in a process that has been running the whole time. A
 * restart mid-job leaves a row `IN_PROGRESS` with nobody watching it, and
 * without this the hub would poll that row forever. Reading it is exactly when
 * someone cares, so reading it is when we check.
 */
export async function readResearchJob(
  deps: ResearchServiceDeps,
  brandId: BrandId,
  jobId: ResearchJobId,
): Promise<ResearchJob | null> {
  const job = await deps.db.getResearchJob(brandId, jobId)
  if (!job) return null
  return reconcileResearchJob(deps, job)
}

export async function readLatestResearchJob(
  deps: ResearchServiceDeps,
  brandId: BrandId,
): Promise<ResearchJob | null> {
  const job = await deps.db.getLatestResearchJob(brandId)
  if (!job) return null
  return reconcileResearchJob(deps, job)
}
