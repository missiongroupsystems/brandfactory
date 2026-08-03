import type {
  BrandId,
  ProjectId,
  ResearchDraft,
  ResearchJobId,
  ResearchSource,
  ResearchStatus,
  UserId,
  WorkspaceId,
} from '@brandfactory/shared'
import { and, count, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '../client'
import { toIsoTimestamp, toIsoTimestampOrNull } from '../mappers'
import { brandResearchJobs, brands } from '../schema'

// ---------------------------------------------------------------------------
// Research jobs — the row, and the three questions asked before spending money
// ---------------------------------------------------------------------------

/**
 * The full row. **Wider than `ResearchJobSummary` on purpose**: the report is
 * tens of thousands of characters — 3A's live run came back at 67,780 — and the
 * hub polls its summary every 5 seconds while a job is in flight. Shipping the
 * report on that wire would send a novel per poll to render one footer row, so
 * the route narrows this to the summary and the report stays server-side until
 * something actually wants it (3F).
 */
export interface ResearchJob {
  id: ResearchJobId
  brandId: BrandId
  status: ResearchStatus
  provider: string
  model: string
  /** Brand name and website **as they were at submission**. */
  input: { brandName: string; websiteUrl: string }
  externalId: string | null
  report: string | null
  citations: ResearchSource[]
  drafts: ResearchDraft[]
  error: string | null
  /**
   * The brand-context thread the report was landed in (3F), or `null`.
   *
   * Null on three different histories and readers must not tell them apart: the
   * run has not finished, the landing failed, or the row predates migration
   * 0007. All three mean the same thing to a client — there is no thread to link
   * straight to — and the report itself is on this row either way.
   */
  reportProjectId: ProjectId | null
  /** What the vendor said this run cost. `null` means unknown, never zero. */
  costUsd: number | null
  createdBy: UserId | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

type Row = typeof brandResearchJobs.$inferSelect

function rowToResearchJob(row: Row): ResearchJob {
  return {
    id: row.id as ResearchJobId,
    brandId: row.brandId as BrandId,
    status: row.status,
    provider: row.provider,
    model: row.model,
    input: row.input as ResearchJob['input'],
    externalId: row.externalId,
    report: row.report,
    citations: (row.citations ?? []) as ResearchSource[],
    drafts: (row.drafts ?? []) as ResearchDraft[],
    error: row.error,
    reportProjectId: (row.reportProjectId as ProjectId | null) ?? null,
    // `numeric` comes back as a string from pg — it is arbitrary precision and
    // a float would silently round it. Parsed here, at the one boundary that
    // knows the column's scale.
    costUsd: row.costUsd === null ? null : Number(row.costUsd),
    createdBy: (row.createdBy as UserId | null) ?? null,
    createdAt: toIsoTimestamp(row.createdAt),
    startedAt: toIsoTimestampOrNull(row.startedAt),
    completedAt: toIsoTimestampOrNull(row.completedAt),
  }
}

export interface CreateResearchJobInput {
  brandId: BrandId
  provider: string
  model: string
  input: { brandName: string; websiteUrl: string }
  createdBy: UserId | null
}

/**
 * Insert an `IN_PROGRESS` row **before** the outbound call.
 *
 * The order matters and is the opposite of the obvious one: submit first, then
 * record, loses the job entirely if the process dies between them — and it has
 * already been paid for. Recording first can leave a row whose `externalId` is
 * null, which the reconciler can see and clean up. One failure mode is
 * recoverable and the other is money on the floor.
 */
export async function createResearchJob(input: CreateResearchJobInput): Promise<ResearchJob> {
  const [row] = await db
    .insert(brandResearchJobs)
    .values({
      brandId: input.brandId,
      provider: input.provider,
      model: input.model,
      input: input.input,
      createdBy: input.createdBy,
      startedAt: sql`now()`,
    })
    .returning()
  return rowToResearchJob(row!)
}

export async function getResearchJob(
  brandId: BrandId,
  jobId: ResearchJobId,
): Promise<ResearchJob | null> {
  const [row] = await db
    .select()
    .from(brandResearchJobs)
    // Scoped by brand as well as id, so a job id from another brand misses here
    // rather than being read across the boundary `requireBrandAccess` checked.
    .where(and(eq(brandResearchJobs.brandId, brandId), eq(brandResearchJobs.id, jobId)))
    .limit(1)
  return row ? rowToResearchJob(row) : null
}

/** The hub's read: this brand's most recent job, in whatever state. */
export async function getLatestResearchJob(brandId: BrandId): Promise<ResearchJob | null> {
  const [row] = await db
    .select()
    .from(brandResearchJobs)
    .where(eq(brandResearchJobs.brandId, brandId))
    .orderBy(desc(brandResearchJobs.createdAt))
    .limit(1)
  return row ? rowToResearchJob(row) : null
}

/**
 * The run whose report was landed in this thread (3F), if any.
 *
 * The chat surface's read: a brand-context thread that *is* a research report
 * renders that report's `[n]` markers, and the citations they number live on
 * the job row, not in the message. Threads are created fresh per run, so at
 * most one row matches; `createdAt DESC` is belt-and-braces against a manual
 * repoint, not an expected tie. No brand scope — the caller has already passed
 * `requireProjectAccess`, and the project id *is* the boundary being read.
 */
export async function getResearchJobByReportProject(
  projectId: ProjectId,
): Promise<ResearchJob | null> {
  const [row] = await db
    .select()
    .from(brandResearchJobs)
    .where(eq(brandResearchJobs.reportProjectId, projectId))
    .orderBy(desc(brandResearchJobs.createdAt))
    .limit(1)
  return row ? rowToResearchJob(row) : null
}

/**
 * Guard 1 — one active job per brand.
 *
 * **In the table, not process memory**, unlike `AgentConcurrencyGuard`: this job
 * outlives its request by minutes, so an in-memory set is emptied by exactly the
 * restart that leaves a run in flight.
 */
export async function hasActiveResearchJob(brandId: BrandId): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(brandResearchJobs)
    .where(and(eq(brandResearchJobs.brandId, brandId), eq(brandResearchJobs.status, 'IN_PROGRESS')))
  return (row?.n ?? 0) > 0
}

/** Guard 2 — `RESEARCH_MAX_ACTIVE_PER_WORKSPACE`, across all of its brands. */
export async function countActiveResearchJobsForWorkspace(
  workspaceId: WorkspaceId,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(brandResearchJobs)
    .innerJoin(brands, eq(brands.id, brandResearchJobs.brandId))
    .where(and(eq(brands.workspaceId, workspaceId), eq(brandResearchJobs.status, 'IN_PROGRESS')))
  return row?.n ?? 0
}

/**
 * Guard 3 — `RESEARCH_MAX_JOBS_PER_DAY` (decision 12), the only guard here that
 * protects money rather than data.
 *
 * **A rolling 24 hours, not "since midnight".** A calendar day needs a timezone
 * to be a fact, and the one the server runs in is not the one the user lives in;
 * a rolling window is the same protection without inventing an answer to a
 * question nobody asked. Counts **every** job, including failures: a run that
 * failed at the vendor may still have been billed, and a guard that only counts
 * successes is a guard that lets a broken loop spend all night.
 */
export async function countResearchJobsTodayForWorkspace(
  workspaceId: WorkspaceId,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(brandResearchJobs)
    .innerJoin(brands, eq(brands.id, brandResearchJobs.brandId))
    .where(
      and(
        eq(brands.workspaceId, workspaceId),
        gte(brandResearchJobs.createdAt, sql`now() - interval '24 hours'`),
      ),
    )
  return row?.n ?? 0
}

/** Every job still in flight, oldest first — the ticker's sweep. */
export async function listInFlightResearchJobs(): Promise<ResearchJob[]> {
  const rows = await db
    .select()
    .from(brandResearchJobs)
    .where(eq(brandResearchJobs.status, 'IN_PROGRESS'))
    .orderBy(brandResearchJobs.createdAt)
  return rows.map(rowToResearchJob)
}

/** Records the vendor's id, once `start()` has returned one. */
export async function setResearchJobExternalId(
  jobId: ResearchJobId,
  externalId: string,
): Promise<ResearchJob | null> {
  const [row] = await db
    .update(brandResearchJobs)
    .set({ externalId })
    .where(eq(brandResearchJobs.id, jobId))
    .returning()
  return row ? rowToResearchJob(row) : null
}

/**
 * Record which thread the report was landed in.
 *
 * **Not folded into `finishResearchJob`, and the ordering is the reason.** That
 * write is the arbiter — `WHERE status = 'IN_PROGRESS'` is what makes exactly one
 * caller the finisher, and 3F hangs the thread creation off *winning* it. So the
 * project does not exist yet when the job is finished, and the only honest place
 * for its id is a second, narrow write afterwards.
 *
 * **Deliberately unscoped by status.** The row is `COMPLETED` by the time this
 * runs, so a `WHERE` on it would be decoration — and `landReportInThread` must
 * never fail a paid run, which means the one thing this must not do is find a
 * reason to reject a thread that already exists.
 */
export async function setResearchJobReportProject(
  jobId: ResearchJobId,
  projectId: ProjectId,
): Promise<ResearchJob | null> {
  const [row] = await db
    .update(brandResearchJobs)
    .set({ reportProjectId: projectId })
    .where(eq(brandResearchJobs.id, jobId))
    .returning()
  return row ? rowToResearchJob(row) : null
}

export interface FinishResearchJobInput {
  status: Exclude<ResearchStatus, 'IN_PROGRESS'>
  report?: string | null
  citations?: ResearchSource[]
  drafts?: ResearchDraft[]
  error?: string | null
  costUsd?: number | null
}

/**
 * Move a job to a terminal state.
 *
 * **Terminal states are terminal** — the `WHERE` requires `IN_PROGRESS`, so two
 * racing finishers (the ticker and a reconcile-on-read, which is the ordinary
 * case) cannot overwrite each other's outcome, and a `null` return is how the
 * loser finds out. Without it, a late poll could reopen a completed job's
 * `completedAt` and make a job that finished look like one that just did.
 */
export async function finishResearchJob(
  jobId: ResearchJobId,
  input: FinishResearchJobInput,
): Promise<ResearchJob | null> {
  const [row] = await db
    .update(brandResearchJobs)
    .set({
      status: input.status,
      report: input.report ?? null,
      citations: input.citations ?? [],
      drafts: input.drafts ?? [],
      error: input.error ?? null,
      costUsd: input.costUsd === null || input.costUsd === undefined ? null : String(input.costUsd),
      completedAt: sql`now()`,
    })
    .where(and(eq(brandResearchJobs.id, jobId), eq(brandResearchJobs.status, 'IN_PROGRESS')))
    .returning()
  return row ? rowToResearchJob(row) : null
}

/**
 * Forget the drafts, once they have landed in the brand's guidelines.
 *
 * **This is the writer the rail's `N drafts ready — Review` row always needed
 * and never had.** That row renders on `status === 'COMPLETED' && drafts.length
 * > 0`, and nothing ever emptied `drafts` — so after research populated an empty
 * brand, or after you accepted and saved, the rail went on offering the same five
 * drafts forever, and taking them again wrote a second copy of every section.
 * `BrandContextRail`'s own fall-through comment described "a completed run whose
 * drafts have already been dealt with", a state the code could not reach.
 *
 * A predecessor existed as `setResearchJobDrafts` from 3E, wired into `Db` and
 * faked in `test-helpers`, and called by **nothing** — the same reachable-from-
 * nothing shape 1.11.1 found in `reorderAssets`. It is narrowed rather than
 * revived: the only operation anyone needs is *forget*, and a general setter on
 * this column would let a route hand the client a way to write draft bodies the
 * shaping pass never produced.
 *
 * **The report is deliberately untouched.** Drafts are derived from it and cost a
 * shaping pass to rebuild; the report is the $0.40 artefact and stays on the row,
 * as does the thread 3F made of it. So this destroys something cheap and
 * re-derivable, which is the only reason clearing is an acceptable way to record
 * "dealt with" at all.
 *
 * Scoped by brand as well as id, like `getResearchJob`, and restricted to a
 * finished run: an `IN_PROGRESS` job's drafts are about to be written by
 * `finishResearchJob`, so clearing them there would be a race with the write
 * that produces them.
 */
export async function clearResearchJobDrafts(
  brandId: BrandId,
  jobId: ResearchJobId,
): Promise<ResearchJob | null> {
  const [row] = await db
    .update(brandResearchJobs)
    .set({ drafts: [] })
    .where(
      and(
        eq(brandResearchJobs.brandId, brandId),
        eq(brandResearchJobs.id, jobId),
        eq(brandResearchJobs.status, 'COMPLETED'),
      ),
    )
    .returning()
  return row ? rowToResearchJob(row) : null
}
