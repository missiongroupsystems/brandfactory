import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { type Brand } from '../authz'
import { type Conn } from '../db/client'
import { ideas, media, postJobs, posts } from '../db/schema'
import { conflict, invalid, notFound } from '../errors'
import { DAY, TIME, isDay, todayIn, type Day } from '../time'

export type PostRow = typeof posts.$inferSelect
export type JobRow = typeof postJobs.$inferSelect
export type Stage = 'draft' | 'scheduled' | 'posted' | 'failed'
export type Format = PostRow['format']
export type ChannelKey = 'ig' | 'tt' | 'yt' | 'li' | 'fb'

/** The earliest time a post may go out (`EARLIEST_POST` in `publish/model.ts`). */
export const EARLIEST_POST = '07:00'

/**
 * A post's stage, from its jobs (decision 5): a failed account makes it failed, every account
 * live makes it posted, any other job makes it scheduled. With no job, it is what a person
 * marked by hand (decision 3), else a draft.
 */
export function stageOf(post: Pick<PostRow, 'marked'>, jobs: Pick<JobRow, 'status'>[]): Stage {
  if (jobs.length > 0) {
    if (jobs.some((j) => j.status === 'failed')) return 'failed'
    if (jobs.every((j) => j.status === 'live')) return 'posted'
    return 'scheduled'
  }
  return post.marked ?? 'draft'
}

/** The accounts a format goes to when the post names none (`calendar-items.ts`). */
const DEFAULT_CHANNELS: Record<Format, ChannelKey[]> = {
  reel: ['ig', 'tt'],
  carousel: ['ig', 'fb'],
  story: ['ig'],
}

export function defaultChannels(format: Format, linked: string[]): ChannelKey[] {
  return DEFAULT_CHANNELS[format].filter((k) => linked.includes(k))
}

export async function jobsOf(db: Conn, postId: string): Promise<JobRow[]> {
  return db.select().from(postJobs).where(eq(postJobs.postId, postId))
}

/** Posted is final (decision 2): every write to a post runs this first. */
export function assertNotPosted(post: PostRow, jobs: JobRow[]) {
  if (stageOf(post, jobs) === 'posted') {
    throw conflict('this post is posted and cannot change', 'POST_POSTED')
  }
}

export function assertDay(brand: Brand, day: string, now: Date): Day {
  if (!DAY.test(day) || !isDay(day)) throw invalid('the day is not a date', 'BAD_DAY')
  if (day < todayIn(brand.timezone, now)) throw invalid('the day has passed', 'PAST_DAY')
  return day
}

export function assertTime(time: string): string {
  if (!TIME.test(time)) throw invalid('the time is not HH:MM', 'BAD_TIME')
  if (time < EARLIEST_POST) throw invalid(`a post goes out from ${EARLIEST_POST}`, 'TOO_EARLY')
  return time
}

/**
 * A day's story row holds one planned story, and none once stories went out that day
 * (`storyTaken` in `move-post.ts`).
 */
export async function assertStoryFree(db: Conn, brandId: string, day: Day, postId: string) {
  // Two stories moved onto one day at once would both see it free; the lock queues them. It is
  // held to the end of the caller's transaction.
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`story:${brandId}:${day}`}))`)
  const others = await db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.brandId, brandId),
        eq(posts.format, 'story'),
        eq(posts.day, day),
        ne(posts.id, postId),
      ),
    )
  if (others.length > 0) throw conflict('the story row on that day is taken', 'STORY_TAKEN')
}

/** A post in a brand, with its jobs; another brand's post answers 404. */
export async function loadPost(db: Conn, brandId: string, id: string) {
  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, id), eq(posts.brandId, brandId)))
    // Inside a transaction the row stays locked until it commits, so a check made here (posted,
    // a version) still holds when the write lands.
    .for('update')
  if (!post) throw notFound('post not found')
  return { post, jobs: await jobsOf(db, id) }
}

/** A post as the client reads it: the row, its derived stage and its jobs. */
export function postView(post: PostRow, jobs: JobRow[]) {
  return {
    ...post,
    stage: stageOf(post, jobs),
    jobs: jobs.map((j) => ({
      channel: j.channel,
      status: j.status,
      error: j.error,
      runAt: j.runAt,
    })),
  }
}

export async function postViews(db: Conn, rows: PostRow[]) {
  if (rows.length === 0) return []
  const jobs = await db
    .select()
    .from(postJobs)
    .where(
      inArray(
        postJobs.postId,
        rows.map((p) => p.id),
      ),
    )
  return rows.map((p) =>
    postView(
      p,
      jobs.filter((j) => j.postId === p.id),
    ),
  )
}

/** The idea a post came from, if any. */
export async function ideaOfPost(db: Conn, postId: string) {
  const [idea] = await db.select().from(ideas).where(eq(ideas.postId, postId))
  return idea ?? null
}

/** Where each format can go (`KIND` in `publish/model.ts`). */
const ALLOWED: Record<Format, ChannelKey[]> = {
  reel: ['ig', 'tt', 'yt', 'li', 'fb'],
  carousel: ['ig', 'tt', 'li', 'fb'],
  story: ['ig', 'fb'],
}

export function canTake(format: Format, channel: ChannelKey): boolean {
  return ALLOWED[format].includes(channel)
}

/** Refuses a channel the brand does not post on or the format cannot go to. */
export function assertChannels(brand: Brand, format: Format, channels: ChannelKey[]) {
  for (const c of channels) {
    if (!brand.linked.includes(c)) throw invalid(`${c} is not linked to this brand`, 'BAD_CHANNEL')
    if (!canTake(format, c)) throw invalid(`a ${format} cannot go to ${c}`, 'BAD_CHANNEL')
  }
  return [...new Set(channels)]
}

/** A new hook on an idea carries to its post, unless the post is out: posted is final. */
export async function carryHook(db: Conn, postId: string | null, hook: string) {
  if (!postId) return
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).for('update')
  if (!post || stageOf(post, await jobsOf(db, postId)) === 'posted') return
  await db
    .update(posts)
    .set({ hook, version: sql`${posts.version} + 1`, updatedAt: new Date() })
    .where(eq(posts.id, postId))
}

/** Media named by id must be this brand's upload. */
export async function assertMediaIds(db: Conn, brandId: string, items: { mediaId?: string }[]) {
  const ids = [...new Set(items.flatMap((m) => (m.mediaId ? [m.mediaId] : [])))]
  if (ids.length === 0) return
  const found = await db
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.brandId, brandId), inArray(media.id, ids)))
  if (found.length !== ids.length) throw invalid('a file is not in this brand', 'BAD_MEDIA')
}
