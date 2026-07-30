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
  const job = await deps.db.createResearchJob({
    brandId: input.brandId,
    provider: deps.env.RESEARCH_PROVIDER,
    model: deps.env.RESEARCH_MODEL,
    input: { brandName: input.brandName, websiteUrl: input.websiteUrl },
    createdBy: input.userId,
  })

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
 * Ask the vendor where a job got to, and record it if it is finished.
 *
 * Safe to call from anywhere, including twice at once: `finishResearchJob`
 * requires `IN_PROGRESS`, so the loser of a race gets `null` back and the
 * outcome that landed first stands. That is not a theoretical race — the ticker
 * and a reconcile-on-read hitting the same job is the ordinary case.
 */
export async function reconcileResearchJob(
  deps: ResearchServiceDeps,
  job: ResearchJob,
  now: number = Date.now(),
): Promise<ResearchJob> {
  if (job.status !== 'IN_PROGRESS') return job

  if (!job.externalId) {
    const age = now - Date.parse(job.createdAt)
    if (age < UNSUBMITTED_GRACE_MS) return job
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
    // next sweep asks again.
    deps.logger?.warn('research poll failed', {
      jobId: job.id,
      err: cause instanceof Error ? cause.message : String(cause),
    })
    return job
  }

  if (state.status === 'running') return job

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
