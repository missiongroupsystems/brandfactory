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

/** A job that has said "uploading" this long was cut off by a restart. */
const STUCK_MS = 15 * 60 * 1000

/**
 * Sends the jobs that are due. Each job is claimed by moving it to `uploading` in the same
 * statement that picks it, so two runs never send one job twice. A job cut off mid-upload is
 * failed, not retried: it may have reached the platform, and a person retries it knowingly.
 */
export async function runDueJobs(
  deps: { db: Db; now: () => Date; publisher: Publisher },
  limit = 10,
) {
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

  const due = db
    .select({ id: postJobs.id })
    .from(postJobs)
    .where(and(eq(postJobs.status, 'scheduled'), lte(postJobs.runAt, now)))
    .orderBy(postJobs.runAt)
    .limit(limit)
    .for('update', { skipLocked: true })
  const claimed = await db
    .update(postJobs)
    .set({ status: 'uploading', attempts: sql`${postJobs.attempts} + 1`, updatedAt: now })
    .where(inArray(postJobs.id, due))
    .returning()

  for (const job of claimed) {
    const [row] = await db
      .select({ post: posts, brand: brands })
      .from(posts)
      .innerJoin(brands, eq(brands.id, posts.brandId))
      .where(eq(posts.id, job.postId))
    try {
      if (!row) throw new PublishError('The post was deleted.')
      const { externalId } = await deps.publisher.publish({ job, post: row.post, brand: row.brand })
      await db
        .update(postJobs)
        .set({ status: 'live', externalId, error: null, updatedAt: deps.now() })
        .where(eq(postJobs.id, job.id))
    } catch (err) {
      const reason = err instanceof PublishError ? err.message : 'The platform did not answer.'
      if (!(err instanceof PublishError)) console.error('publish failed', job.id, err)
      await db
        .update(postJobs)
        .set({ status: 'failed', error: reason, updatedAt: deps.now() })
        .where(eq(postJobs.id, job.id))
    }
  }
  return claimed.length
}
