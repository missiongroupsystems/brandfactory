import { and, eq, inArray, lt, lte, sql } from 'drizzle-orm'
import { type Db } from './db/client'
import { brands, postJobs, posts } from './db/schema'

export type JobRow = typeof postJobs.$inferSelect

/** Puts one job's post on one account. Throws `PublishError` with the reason a person reads. */
export interface Publisher {
  publish(input: {
    job: JobRow
    post: typeof posts.$inferSelect
    brand: typeof brands.$inferSelect
  }): Promise<{ externalId: string }>
}

export class PublishError extends Error {}

/**
 * Stands in for the platforms until their app reviews pass (accounts doc): every job goes live.
 * Nothing leaves the server.
 */
export const simulatedPublisher: Publisher = {
  async publish({ job }) {
    return { externalId: `simulated-${job.id}` }
  },
}

/**
 * A job that has said "uploading" this long was cut off (a restart, a crash). It is longer than a
 * job's whole budget on a platform (`JOB_BUDGET_MS`, twenty minutes, plus one call of at most a
 * minute), so a job still running is not taken for one cut off.
 */
const STUCK_MS = 30 * 60 * 1000

/** A job this far past its time is not posted at all: a post an hour late is a different post. */
export const MISSED_MS = 60 * 60 * 1000

type RunnerDeps = { db: Db; now: () => Date; publisher: Publisher }

/**
 * Fails the jobs cut off mid-upload and the ones an hour past their time, then claims up to `limit`
 * due jobs. Each is claimed by moving
 * it to `uploading` in the same statement that picks it, so two runs never send one job twice. A
 * job cut off is failed, not retried: it may have reached the platform, and a person retries it
 * knowingly.
 */
export async function claimDueJobs(deps: Omit<RunnerDeps, 'publisher'>, limit = 10) {
  const { db } = deps
  const now = deps.now()
  await db
    .update(postJobs)
    .set({
      status: 'failed',
      error: 'Interrupted. Check the account before you retry.',
      updatedAt: now,
    })
    .where(
      and(
        eq(postJobs.status, 'uploading'),
        lt(postJobs.updatedAt, new Date(now.getTime() - STUCK_MS)),
      ),
    )
  // A job long past its time is not posted late (posting was off, or the server was down): the
  // person picks a new time instead.
  await db
    .update(postJobs)
    .set({
      status: 'failed',
      error: 'This post missed its time. Nothing was posted; pick a new time.',
      updatedAt: now,
    })
    .where(
      and(
        eq(postJobs.status, 'scheduled'),
        lt(postJobs.runAt, new Date(now.getTime() - MISSED_MS)),
      ),
    )
  if (limit <= 0) return []
  const due = db
    .select({ id: postJobs.id })
    .from(postJobs)
    .where(and(eq(postJobs.status, 'scheduled'), lte(postJobs.runAt, now)))
    .orderBy(postJobs.runAt)
    .limit(limit)
    .for('update', { skipLocked: true })
  return db
    .update(postJobs)
    .set({ status: 'uploading', attempts: sql`${postJobs.attempts} + 1`, updatedAt: now })
    .where(inArray(postJobs.id, due))
    .returning()
}

/**
 * Sends one claimed job. Once the platform has the post, the job is never marked failed: a write
 * that fails then is logged and the job stays `uploading`, until the stuck sweep fails it with
 * "check the account". Both writes touch only a job still `uploading`, so a job already swept is
 * not overwritten.
 */
export async function sendJob(deps: RunnerDeps, job: JobRow) {
  const { db } = deps
  const still = and(eq(postJobs.id, job.id), eq(postJobs.status, 'uploading'))
  let externalId: string
  try {
    const [row] = await db
      .select({ post: posts, brand: brands })
      .from(posts)
      .innerJoin(brands, eq(brands.id, posts.brandId))
      .where(eq(posts.id, job.postId))
    if (!row) throw new PublishError('The post was deleted.')
    externalId = (await deps.publisher.publish({ job, post: row.post, brand: row.brand }))
      .externalId
  } catch (err) {
    const reason = err instanceof PublishError ? err.message : 'The platform did not answer.'
    if (!(err instanceof PublishError)) console.error('publish failed', job.id, err)
    await db
      .update(postJobs)
      .set({ status: 'failed', error: reason, updatedAt: deps.now() })
      .where(still)
      .catch((e: unknown) => console.error('could not mark the job failed', job.id, e))
    return
  }
  const recorded = await db
    .update(postJobs)
    .set({ status: 'live', externalId, error: null, updatedAt: deps.now() })
    .where(still)
    .returning({ id: postJobs.id })
    .catch((e: unknown) => {
      console.error('POSTED but not recorded: the job stays uploading', job.id, externalId, e)
      return null
    })
  // Swept as cut off while it was still going: it says "check the account", and it did post.
  if (recorded?.length === 0) {
    console.error('POSTED after the sweep failed the job', job.id, externalId)
  }
}

/** Claims the due jobs and sends them side by side, waiting for all of them. */
export async function runDueJobs(deps: RunnerDeps, limit = 10) {
  const claimed = await claimDueJobs(deps, limit)
  await Promise.all(claimed.map((job) => sendJob(deps, job)))
  return claimed.length
}
