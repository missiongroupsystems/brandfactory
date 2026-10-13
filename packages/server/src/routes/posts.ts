import { and, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { type Deps } from '../app'
import { ideas, postJobs, posts } from '../db/schema'
import {
  assertChannels,
  assertMediaIds,
  assertDay,
  assertNotPosted,
  assertStoryFree,
  assertTime,
  defaultChannels,
  ideaOfPost,
  jobsOf,
  loadPost,
  postView,
  stageOf,
} from '../domain/posts'
import { conflict, invalid } from '../errors'
import { body, Id } from '../http'
import {
  assertSameBrand,
  assertVersion,
  bump,
  Channel,
  Format,
  IfVersion,
  MediaItem,
  type BrandEnv,
} from './shared'

const Draft = z.record(z.string(), z.unknown())

const CreatePost = z.object({
  id: Id,
  format: Format,
  hook: z.string().max(500),
  day: z.string().optional(),
  time: z.string().optional(),
  caption: z.string().max(70000).optional(),
  channels: z.array(Channel).optional(),
  media: z.array(MediaItem).max(10).optional(),
  draft: Draft.optional(),
})

const EditPost = z.object({
  hook: z.string().max(500).optional(),
  caption: z.string().max(70000).optional(),
  channels: z.array(Channel).optional(),
  media: z.array(MediaItem).max(10).optional(),
  draft: Draft.optional(),
  ifVersion: IfVersion,
})

const Move = z.object({ day: z.string(), time: z.string().optional() })

const Mark = z.object({ stage: z.enum(['draft', 'scheduled', 'posted']) })

export function postRoutes(deps: Deps) {
  const { db } = deps
  return (
    new Hono<BrandEnv>()
      /** A post made in the composer. A repeat of the same id returns the post it made. */
      .post('/', async (c) => {
        const brand = c.var.brand
        const input = await body(c, CreatePost)
        const { post, created } = await db.transaction(async (tx) => {
          const [existing] = await tx.select().from(posts).where(eq(posts.id, input.id))
          if (existing) return { post: existing, created: false }
          const day = input.day === undefined ? null : assertDay(brand, input.day, deps.now())
          const time = input.time === undefined ? null : assertTime(input.time)
          const channels = assertChannels(
            brand,
            input.format,
            input.channels ?? defaultChannels(input.format, brand.linked),
          )
          if (input.format === 'story' && day) await assertStoryFree(tx, brand.id, day, input.id)
          await assertMediaIds(tx, brand.id, input.media ?? [])
          const [made] = await tx
            .insert(posts)
            .values({
              id: input.id,
              brandId: brand.id,
              format: input.format,
              hook: input.hook,
              day,
              time,
              caption: input.caption ?? '',
              channels,
              media: input.media ?? [],
              draft: input.draft ?? {},
            })
            // Two first creates at once: the second reads the first's row.
            .onConflictDoNothing()
            .returning()
          if (made) return { post: made, created: true }
          return {
            post: (await tx.select().from(posts).where(eq(posts.id, input.id)))[0]!,
            created: false,
          }
        })
        assertSameBrand(post, brand.id)
        return c.json(postView(post, await jobsOf(db, post.id)), created ? 201 : 200)
      })

      .patch('/:id', async (c) => {
        const brand = c.var.brand
        const input = await body(c, EditPost)
        const result = await db.transaction(async (tx) => {
          const { post, jobs } = await loadPost(tx, brand.id, c.req.param('id'))
          assertNotPosted(post, jobs)
          assertVersion(post, input.ifVersion)
          await assertMediaIds(tx, brand.id, input.media ?? [])
          const channels =
            input.channels === undefined
              ? undefined
              : assertChannels(brand, post.format, input.channels)
          // A post marked Scheduled keeps an account (decision 3).
          if (channels?.length === 0 && stageOf(post, jobs) === 'scheduled') {
            throw invalid('a scheduled post needs an account', 'NO_CHANNELS')
          }
          const [next] = await tx
            .update(posts)
            .set({
              ...(input.hook !== undefined && { hook: input.hook }),
              ...(input.caption !== undefined && { caption: input.caption }),
              ...(channels !== undefined && { channels }),
              ...(input.media !== undefined && { media: input.media }),
              ...(input.draft !== undefined && { draft: input.draft }),
              ...bump(posts),
            })
            .where(eq(posts.id, post.id))
            .returning()
          return postView(next!, jobs)
        })
        return c.json(result)
      })

      /**
       * A drag on the calendar or a new day and time in the composer. Refused in the demo's order:
       * posted, then a bad or past day, then a taken story row. The same day and time changes
       * nothing, not even the version, since the composer calls this from an effect.
       */
      .post('/:id/move', async (c) => {
        const brand = c.var.brand
        const input = await body(c, Move)
        const result = await db.transaction(async (tx) => {
          const { post, jobs } = await loadPost(tx, brand.id, c.req.param('id'))
          assertNotPosted(post, jobs)
          const day = assertDay(brand, input.day, deps.now())
          const time = input.time === undefined ? (post.time ?? '12:00') : assertTime(input.time)
          if (day === post.day && time === post.time) return postView(post, jobs)
          if (post.format === 'story') await assertStoryFree(tx, brand.id, day, post.id)
          const [next] = await tx
            .update(posts)
            .set({ day, time, ...bump(posts) })
            .where(eq(posts.id, post.id))
            .returning()
          // A job not yet sent goes out at the new time.
          if (jobs.some((j) => j.status === 'scheduled')) {
            await tx
              .update(postJobs)
              .set({ runAt: deps.instantOf(day, time, brand.timezone), updatedAt: new Date() })
              .where(and(eq(postJobs.postId, post.id), eq(postJobs.status, 'scheduled')))
          }
          return postView(next!, await jobsOf(tx, post.id))
        })
        return c.json(result)
      })

      /**
       * A stage picked by hand on the idea page (decision 3). Kept apart from publishing: it
       * cancels jobs not yet sent and never touches a job on its way out. Scheduled needs a day
       * and an account; Posted is final.
       */
      .post('/:id/mark', async (c) => {
        const brand = c.var.brand
        const { stage } = await body(c, Mark)
        const result = await db.transaction(async (tx) => {
          const { post, jobs } = await loadPost(tx, brand.id, c.req.param('id'))
          assertNotPosted(post, jobs)
          if (stageOf(post, jobs) === stage) return postView(post, jobs)
          // A job on its way out cannot be called back. An account already live stays live: a
          // post marked Posted by hand keeps it, and it cannot go back to a draft or a schedule.
          const live = jobs.filter((j) => j.status === 'live')
          if (jobs.some((j) => j.status === 'uploading') || (stage !== 'posted' && live.length)) {
            throw conflict('this post is on its way out', 'PUBLISHING')
          }
          if (stage === 'scheduled') {
            if (post.channels.length === 0) throw invalid('pick an account first', 'NO_CHANNELS')
            if (!post.day || !post.time) throw invalid('pick a day first', 'NO_DAY')
          }
          const cancel = jobs.filter((j) => j.status !== 'live')
          if (cancel.length > 0) {
            await tx.delete(postJobs).where(
              inArray(
                postJobs.id,
                cancel.map((j) => j.id),
              ),
            )
          }
          const [next] = await tx
            .update(posts)
            .set({ marked: stage === 'draft' ? null : stage, ...bump(posts) })
            .where(eq(posts.id, post.id))
            .returning()
          return postView(next!, live)
        })
        return c.json(result)
      })

      /**
       * Takes a post off the calendar and deletes it. The idea it came from goes back on the
       * same day with its own words, and a suggestion stays a suggestion (`unplanPost`).
       */
      .delete('/:id', async (c) => {
        const brand = c.var.brand
        const idea = await db.transaction(async (tx) => {
          const { post, jobs } = await loadPost(tx, brand.id, c.req.param('id'))
          assertNotPosted(post, jobs)
          if (jobs.some((j) => j.status === 'uploading' || j.status === 'live')) {
            throw conflict('this post is partly out and cannot be taken back', 'PUBLISHING')
          }
          const from = await ideaOfPost(tx, post.id)
          let restored = null
          if (from) {
            const before = (post.fromIdea ?? {}) as { why?: string; suggested?: boolean }
            ;[restored] = await tx
              .update(ideas)
              .set({
                postId: null,
                // A story has no tile: its slot opens again.
                day: post.format === 'story' ? null : post.day,
                why: before.why ?? from.why,
                status: before.suggested ? 'suggested' : from.status,
                ...bump(ideas),
              })
              .where(eq(ideas.id, from.id))
              .returning()
          }
          await tx.delete(posts).where(eq(posts.id, post.id))
          return restored
        })
        return c.json({ deleted: c.req.param('id'), idea })
      })
  )
}
