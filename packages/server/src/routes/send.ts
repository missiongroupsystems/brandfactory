import { randomUUID } from 'node:crypto'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { type Deps } from '../app'
import { postJobs, postSends, posts } from '../db/schema'
import { sendBlockers, type DraftRules } from '../domain/publish'
import {
  assertChannels,
  assertNotPosted,
  jobsOf,
  loadPost,
  postView,
  type ChannelKey,
} from '../domain/posts'
import { conflict, invalid } from '../errors'
import { body } from '../http'
import { todayIn } from '../time'
import { publishingOf } from './accounts'
import { MISSED_MS } from '../jobs'
import { bump, Channel, type BrandEnv } from './shared'

const Send = z.object({
  when: z.enum(['slot', 'now']),
  /** A retry names the accounts it retries; a first send goes to the post's accounts. */
  channels: z.array(Channel).optional(),
})

/** The accounts that publish through a connection of the same key. */
const PUBLISHING: ChannelKey[] = ['ig', 'tt', 'fb']

function localTime(timezone: string, now: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now)
}

/**
 * `POST /brands/:id/posts/:postId/send`: one job per account (decision 5). The post's stage then
 * follows the jobs, so "Publish now" is not posted until each account says so. A repeat with the
 * same `Idempotency-Key` returns the first answer.
 */
export function sendRoute(deps: Deps) {
  const { db } = deps
  return new Hono<BrandEnv>().post('/:id/send', async (c) => {
    const brand = c.var.brand
    const input = await body(c, Send)
    const key = c.req.header('idempotency-key')
    if (key !== undefined && !/^[A-Za-z0-9_-]{8,100}$/.test(key)) {
      throw invalid('the Idempotency-Key is 8-100 letters, digits, - or _')
    }
    const result = await db.transaction(async (tx) => {
      // The post first: it is brand-scoped and locked, so a key replays only this brand's post,
      // and a second press waits here until the first one's answer is stored.
      const { post, jobs } = await loadPost(tx, brand.id, c.req.param('id'))
      if (key) {
        const [seen] = await tx.select().from(postSends).where(eq(postSends.key, key))
        if (seen) {
          if (seen.postId !== post.id) throw conflict('this key was used', 'KEY_REUSED')
          return seen.result
        }
      }
      assertNotPosted(post, jobs)
      if (jobs.some((j) => j.status === 'uploading')) {
        throw conflict('this post is on its way out', 'PUBLISHING')
      }
      const live = jobs.filter((j) => j.status === 'live').map((j) => j.channel as ChannelKey)
      const wanted = assertChannels(
        brand,
        post.format,
        input.channels ?? (post.channels as ChannelKey[]),
      )
      const channels = wanted.filter((ch) => !live.includes(ch))

      const now = deps.now()
      const day = input.when === 'now' ? todayIn(brand.timezone, now) : post.day
      const time = input.when === 'now' ? localTime(brand.timezone, now) : post.time
      // Linked means tokens to post with: the brand's accounts, not a status someone set.
      const linked = await publishingOf(tx, brand.id)
      const disconnected = channels.filter(
        (ch) => PUBLISHING.includes(ch) && linked[ch as keyof typeof linked] !== 'connected',
      )
      let storyTaken = false
      if (post.format === 'story' && day) {
        const others = await tx
          .select({ id: posts.id })
          .from(posts)
          .where(
            and(
              eq(posts.brandId, brand.id),
              eq(posts.format, 'story'),
              eq(posts.day, day),
              ne(posts.id, post.id),
            ),
          )
        storyTaken = others.length > 0
      }
      const blockers = sendBlockers({
        post: { ...post, media: post.media as unknown[] },
        draft: post.draft as DraftRules,
        channels,
        disconnected,
        storyTaken,
        needsDay: !day || !time,
      })
      if (blockers.length > 0) throw invalid(blockers[0]!, 'BLOCKED', blockers)
      if (input.when === 'slot' && day! < todayIn(brand.timezone, now)) {
        throw invalid('the day has passed', 'PAST_DAY')
      }

      const runAt = input.when === 'now' ? now : deps.instantOf(day!, time!, brand.timezone)
      // The runner would only fail it as missed: say so now.
      if (input.when === 'slot' && runAt.getTime() < now.getTime() - MISSED_MS) {
        throw invalid('the time has passed', 'PAST_TIME')
      }
      for (const channel of channels) {
        await tx
          .insert(postJobs)
          .values({
            id: randomUUID(),
            postId: post.id,
            brandId: brand.id,
            channel,
            status: 'scheduled',
            runAt,
          })
          .onConflictDoUpdate({
            target: [postJobs.postId, postJobs.channel],
            set: { status: 'scheduled', runAt, attempts: 0, error: null, updatedAt: new Date() },
            // Never a job the runner claimed or published in the meantime.
            setWhere: inArray(postJobs.status, ['scheduled', 'failed']),
          })
      }
      // The accounts a post goes to: the ones it reached, the ones still due, and the ones sent
      // now (`sentChannels`).
      const due = jobs.filter((j) => j.status === 'scheduled').map((j) => j.channel)
      const [next] = await tx
        .update(posts)
        .set({
          channels: [...new Set([...live, ...due, ...channels])],
          day,
          time,
          marked: null,
          ...bump(posts),
        })
        .where(eq(posts.id, post.id))
        .returning()
      const view = postView(next!, await jobsOf(tx, post.id))
      if (key) await tx.insert(postSends).values({ key, postId: post.id, result: view })
      return view
    })
    return c.json(result)
  })
}
