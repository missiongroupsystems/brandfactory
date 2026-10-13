import { and, eq, isNotNull, ne } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { type Deps } from '../app'
import { type Conn } from '../db/client'
import { ideas, posts } from '../db/schema'
import {
  assertChannels,
  assertMediaIds,
  carryHook,
  assertDay,
  assertStoryFree,
  assertTime,
  defaultChannels,
  jobsOf,
  postView,
} from '../domain/posts'
import { pruneShoots, takeOutOfShoots } from '../domain/shoots'
import { conflict, invalid, notFound } from '../errors'
import { body, Id } from '../http'
import { addDays, endOfWeek, isDay, todayIn, type Day } from '../time'
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

const Shot = z.object({
  id: z.string().max(80),
  title: z.string().max(500),
  ref: z.string().max(2048).optional(),
  media: z.string().max(2048).optional(),
  captured: z.boolean().optional(),
})

const Fields = {
  format: Format,
  pillar: z.string().max(200),
  hook: z.string().max(500),
  angle: z.string().max(5000),
  feature: z.string().max(2000),
  image: z.string().max(2048).nullable(),
  source: z.record(z.string(), z.unknown()),
  status: z.enum(['suggested', 'idea']),
  why: z.string().max(500).nullable(),
  inspiration: z.array(z.string().max(2048)).max(50),
  shots: z.array(Shot).max(100),
  cut: z.string().max(2048).nullable(),
  sharper: z.array(z.object({ text: z.string().max(500), tag: z.string().max(100) })).max(20),
  builtOn: z.record(z.string(), z.unknown()).nullable(),
}

const CreateIdea = z.object({ id: Id, day: z.string().nullable().optional() }).extend({
  ...Fields,
  pillar: Fields.pillar.optional(),
  angle: Fields.angle.optional(),
  feature: Fields.feature.optional(),
  image: Fields.image.optional(),
  source: Fields.source.optional(),
  status: Fields.status.optional(),
  why: Fields.why.optional(),
  inspiration: Fields.inspiration.optional(),
  shots: Fields.shots.optional(),
  cut: Fields.cut.optional(),
  sharper: Fields.sharper.optional(),
  builtOn: Fields.builtOn.optional(),
})

const EditIdea = z.object(Fields).partial().extend({ ifVersion: IfVersion })

const Plan = z.object({
  postId: Id,
  day: z.string(),
  time: z.string(),
  stage: z.enum(['draft', 'scheduled', 'posted']),
  channels: z.array(Channel).optional(),
  media: z.array(MediaItem).max(10).optional(),
})

const Place = z.object({ day: z.string().nullable(), why: z.string().max(500).optional() })

const ToCalendar = z.object({
  preferDay: z.string().refine(isDay, 'not a date').optional(),
  why: z.string().max(500),
})

/** How far ahead an idea looks for an empty day before the calendar counts as full. */
const HORIZON_DAYS = 120

async function loadIdea(db: Conn, brandId: string, id: string) {
  const [idea] = await db
    .select()
    .from(ideas)
    .where(and(eq(ideas.id, id), eq(ideas.brandId, brandId)))
    .for('update')
  if (!idea) throw notFound('idea not found')
  return idea
}

/**
 * The day an idea lands on (`landingDay` in `calendar-slot.ts`): the day asked for, if it is
 * ahead and holds no post; else the first day after this week with nothing on it, since a shoot
 * needs lead time. Stories sit in their own row and do not fill a day. Null when none is free.
 */
async function landingDay(db: Conn, brandId: string, today: Day, prefer?: string) {
  const feedPosts = await db
    .select({ day: posts.day })
    .from(posts)
    .where(and(eq(posts.brandId, brandId), ne(posts.format, 'story'), isNotNull(posts.day)))
  const tiles = await db
    .select({ day: ideas.day })
    .from(ideas)
    .where(and(eq(ideas.brandId, brandId), ne(ideas.format, 'story'), isNotNull(ideas.day)))
  const withPost = new Set(feedPosts.map((p) => p.day))
  const filled = new Set([...withPost, ...tiles.map((t) => t.day)])
  if (prefer && prefer > today && !withPost.has(prefer)) return prefer
  for (
    let day = addDays(endOfWeek(today), 1), i = 0;
    i < HORIZON_DAYS;
    i++, day = addDays(day, 1)
  ) {
    if (!filled.has(day)) return day
  }
  return null
}

export function ideaRoutes(deps: Deps) {
  const { db } = deps
  return (
    new Hono<BrandEnv>()
      /** A repeat of the same id returns the idea it made, so a second click makes no twin. */
      .post('/', async (c) => {
        const brand = c.var.brand
        const input = await body(c, CreateIdea)
        const [existing] = await db.select().from(ideas).where(eq(ideas.id, input.id))
        if (existing) {
          assertSameBrand(existing, brand.id)
          return c.json(existing)
        }
        const day = input.day ? assertDay(brand, input.day, deps.now()) : null
        const [idea] = await db
          .insert(ideas)
          .values({ ...input, day, brandId: brand.id })
          // Two first creates at once: the second reads the first's row.
          .onConflictDoNothing()
          .returning()
        if (idea) return c.json(idea, 201)
        const [raced] = await db.select().from(ideas).where(eq(ideas.id, input.id))
        assertSameBrand(raced!, brand.id)
        return c.json(raced!)
      })

      /**
       * Edits an idea. A new hook carries to its post, unless the post is out: posted is final.
       * `ifVersion` refuses a write made from a copy older than the stored one.
       */
      .patch('/:id', async (c) => {
        const brand = c.var.brand
        const input = await body(c, EditIdea)
        const result = await db.transaction(async (tx) => {
          const idea = await loadIdea(tx, brand.id, c.req.param('id'))
          assertVersion(idea, input.ifVersion)
          if (input.format !== undefined && input.format !== idea.format && idea.postId) {
            throw conflict("this idea is a post; its format is the post's", 'IDEA_PLANNED')
          }
          const { ifVersion: _drop, ...fields } = input
          const [next] = await tx
            .update(ideas)
            .set({ ...fields, ...bump(ideas) })
            .where(eq(ideas.id, idea.id))
            .returning()
          if (input.hook !== undefined) await carryHook(tx, idea.postId, input.hook)
          return next!
        })
        return c.json(result)
      })

      /** A skipped suggestion, or an idea dropped. One with a post is refused: unplan it first. */
      .delete('/:id', async (c) => {
        const brand = c.var.brand
        await db.transaction(async (tx) => {
          const idea = await loadIdea(tx, brand.id, c.req.param('id'))
          if (idea.postId) throw conflict('this idea is a post; unplan it first', 'IDEA_PLANNED')
          await takeOutOfShoots(tx, brand.id, [idea.id])
          await pruneShoots(tx, brand.id)
          await tx.delete(ideas).where(eq(ideas.id, idea.id))
        })
        return c.json({ deleted: c.req.param('id') })
      })

      /**
       * Turns the idea into a post on a day at a stage (`planPost`). The tile leaves the
       * calendar; the post keeps what the tile said so unplanning gives it back.
       */
      .post('/:id/plan', async (c) => {
        const brand = c.var.brand
        const input = await body(c, Plan)
        const result = await db.transaction(async (tx) => {
          const idea = await loadIdea(tx, brand.id, c.req.param('id'))
          if (idea.postId === input.postId) {
            const [post] = await tx.select().from(posts).where(eq(posts.id, input.postId))
            return { idea, post: postView(post!, await jobsOf(tx, post!.id)) }
          }
          if (idea.postId) throw conflict('this idea is a post already', 'IDEA_PLANNED')
          const [taken] = await tx.select().from(posts).where(eq(posts.id, input.postId))
          if (taken) throw conflict('this id is taken', 'ID_TAKEN')
          const day = assertDay(brand, input.day, deps.now())
          const time = assertTime(input.time)
          if (idea.format === 'story') await assertStoryFree(tx, brand.id, day, input.postId)
          const channels = assertChannels(
            brand,
            idea.format,
            input.channels ?? defaultChannels(idea.format, brand.linked),
          )
          if (input.stage === 'scheduled' && channels.length === 0) {
            throw invalid('pick an account first', 'NO_CHANNELS')
          }
          const media =
            input.media ?? (idea.image ? [{ src: idea.image, kind: 'photo' as const }] : [])
          await assertMediaIds(tx, brand.id, media)
          const [post] = await tx
            .insert(posts)
            .values({
              id: input.postId,
              brandId: brand.id,
              format: idea.format,
              hook: idea.hook,
              day,
              time,
              channels,
              media,
              fromIdea: { why: idea.why, suggested: idea.status === 'suggested' },
              marked: input.stage === 'draft' ? null : input.stage,
            })
            .returning()
          const [next] = await tx
            .update(ideas)
            .set({ postId: post!.id, day: null, ...bump(ideas) })
            .where(eq(ideas.id, idea.id))
            .returning()
          return { idea: next!, post: postView(post!, []) }
        })
        return c.json(result)
      })

      /**
       * Moves the idea's tile to a day, or off the calendar with null (`placeIdea`). An idea is on
       * one day only, and other plans on the day stay. An idea that is a post moves with its post.
       */
      .post('/:id/place', async (c) => {
        const brand = c.var.brand
        const input = await body(c, Place)
        const idea = await loadIdea(db, brand.id, c.req.param('id'))
        if (idea.postId) throw conflict('this idea is a post; move the post', 'IDEA_PLANNED')
        const day = input.day === null ? null : assertDay(brand, input.day, deps.now())
        const [next] = await db
          .update(ideas)
          .set({ day, ...(input.why !== undefined && { why: input.why }), ...bump(ideas) })
          .where(eq(ideas.id, idea.id))
          .returning()
        return c.json(next!)
      })

      /**
       * Puts the idea on the calendar where it lands (`addIdeaToCalendar`): the day asked for if
       * it is ahead and holds no post, else the first empty day after this week. 409 when the
       * next four months are full.
       */
      .post('/:id/calendar', async (c) => {
        const brand = c.var.brand
        const input = await body(c, ToCalendar)
        const result = await db.transaction(async (tx) => {
          const idea = await loadIdea(tx, brand.id, c.req.param('id'))
          if (idea.postId) throw conflict('this idea is a post already', 'IDEA_PLANNED')
          const today = todayIn(brand.timezone, deps.now())
          const day = await landingDay(tx, brand.id, today, input.preferDay)
          if (!day) throw conflict('no day ahead is free', 'CALENDAR_FULL')
          const [next] = await tx
            .update(ideas)
            .set({ day, why: input.why, ...bump(ideas) })
            .where(eq(ideas.id, idea.id))
            .returning()
          return next!
        })
        return c.json(result)
      })
  )
}
