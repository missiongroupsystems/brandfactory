import { randomBytes, randomUUID } from 'node:crypto'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { type Deps } from '../app'
import { type Conn } from '../db/client'
import { comments, crew, ideas, shareLinks, shoots } from '../db/schema'
import { conflict, forbidden, HttpError, invalid, notFound } from '../errors'
import { body } from '../http'
import { carryHook } from '../domain/posts'
import { bump, nonEmpty, type BrandEnv } from './shared'

type Kind = 'idea' | 'shoot'
const KindParam = z.enum(['idea', 'shoot'])

async function assertTarget(db: Conn, brandId: string, kind: Kind, id: string) {
  const table = kind === 'idea' ? ideas : shoots
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.brandId, brandId)))
  if (!row) throw notFound(`${kind} not found`)
}

/** The link for an idea or a shoot, made the first time someone shares it. */
async function linkFor(db: Conn, brandId: string, kind: Kind, targetId: string) {
  const [existing] = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.kind, kind), eq(shareLinks.targetId, targetId)))
  if (existing) return existing
  const [made] = await db
    .insert(shareLinks)
    .values({ token: randomBytes(32).toString('base64url'), brandId, kind, targetId })
    .onConflictDoNothing()
    .returning()
  if (made) return made
  // Two first shares at once: the other one's link stands.
  const [raced] = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.kind, kind), eq(shareLinks.targetId, targetId)))
  return raced!
}

/** Comments in order, each with its replies under it. */
async function thread(db: Conn, kind: Kind, targetId: string) {
  const rows = await db
    .select()
    .from(comments)
    .where(and(eq(comments.kind, kind), eq(comments.targetId, targetId)))
    .orderBy(asc(comments.createdAt), asc(comments.id))
  return rows
    .filter((r) => !r.parentId)
    .map((r) => ({ ...r, replies: rows.filter((x) => x.parentId === r.id) }))
}

/** The team's side: the link, who it opens for and what a guest may do, and the comments. */
export function teamShareRoutes(deps: Deps) {
  const { db } = deps
  return new Hono<BrandEnv>()
    .get('/:kind/:targetId', async (c) => {
      const brand = c.var.brand
      const kind = KindParam.parse(c.req.param('kind'))
      await assertTarget(db, brand.id, kind, c.req.param('targetId'))
      const link = await linkFor(db, brand.id, kind, c.req.param('targetId'))
      return c.json({ link, comments: await thread(db, kind, link.targetId) })
    })
    .put('/:kind/:targetId', async (c) => {
      const brand = c.var.brand
      const kind = KindParam.parse(c.req.param('kind'))
      const input = await body(
        c,
        z.object({
          who: z.enum(['link', 'team']).optional(),
          can: z.enum(['view', 'comment', 'edit']).optional(),
        }),
      )
      await assertTarget(db, brand.id, kind, c.req.param('targetId'))
      const link = await linkFor(db, brand.id, kind, c.req.param('targetId'))
      const [next] = await db
        .update(shareLinks)
        .set(input)
        .where(eq(shareLinks.token, link.token))
        .returning()
      return c.json(next!)
    })
}

/** The team answers a guest, signed as the brand, and marks a comment done. */
export function teamCommentRoutes(deps: Deps) {
  const { db } = deps
  const loadComment = async (brandId: string, id: string) => {
    const [row] = await db
      .select()
      .from(comments)
      .where(and(eq(comments.id, id), eq(comments.brandId, brandId)))
    if (!row || row.parentId) throw notFound('comment not found')
    return row
  }
  return new Hono<BrandEnv>()
    .post('/:id/replies', async (c) => {
      const brand = c.var.brand
      const { text } = await body(c, z.object({ text: nonEmpty('a reply') }))
      const parent = await loadComment(brand.id, c.req.param('id'))
      const [reply] = await db
        .insert(comments)
        .values({
          id: randomUUID(),
          brandId: brand.id,
          kind: parent.kind,
          targetId: parent.targetId,
          parentId: parent.id,
          name: brand.name,
          fromTeam: true,
          text,
        })
        .returning()
      return c.json(reply!, 201)
    })
    .put('/:id/done', async (c) => {
      const brand = c.var.brand
      const { done } = await body(c, z.object({ done: z.boolean() }))
      const row = await loadComment(brand.id, c.req.param('id'))
      const [next] = await db
        .update(comments)
        .set({ done })
        .where(eq(comments.id, row.id))
        .returning()
      return c.json(next!)
    })
}

/**
 * Comments a guest may post per address per minute. In memory: the server runs as one instance
 * (as the archive's did), and a restart forgetting the counts is harmless.
 */
const GUEST_LIMIT = 10
const hits = new Map<string, number[]>()
function rateLimit(address: string) {
  const now = Date.now()
  const recent = (hits.get(address) ?? []).filter((t) => now - t < 60_000)
  if (recent.length >= GUEST_LIMIT) {
    throw new HttpError(429, 'TOO_MANY', 'too many comments; wait a minute')
  }
  recent.push(now)
  hits.set(address, recent)
  // Forget addresses that went quiet, so the map stays small without resetting active ones.
  if (hits.size > 10_000) {
    for (const [key, times] of hits) if (times.every((t) => now - t >= 60_000)) hits.delete(key)
  }
}

const BriefEdit = z.object({
  hook: z.string().trim().min(1).max(500).optional(),
  angle: z.string().max(5000).optional(),
  /** Storyboard titles by shot id; a guest renames shots, never adds or removes them. */
  shots: z
    .array(z.object({ id: z.string().max(80), title: z.string().max(500) }))
    .max(100)
    .optional(),
})

/**
 * The guest's side, with no sign-in: everything is found by the link's token, and the link's
 * settings are checked here, not in the browser.
 */
export function guestRoutes(deps: Deps) {
  const { db } = deps
  const open = async (token: string) => {
    const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, token))
    if (!link) throw notFound('this link has nothing to show')
    if (link.who === 'team') throw forbidden('this link is only for the team')
    return link
  }

  return (
    new Hono()
      .get('/:token', async (c) => {
        const link = await open(c.req.param('token'))
        // The brand is no secret: the guest page shows its name and logo.
        const access = { can: link.can, brandId: link.brandId }
        if (link.kind === 'idea') {
          const [idea] = await db.select().from(ideas).where(eq(ideas.id, link.targetId))
          if (!idea) throw notFound('this link has nothing to show')
          const [shoot] = (
            await db.select().from(shoots).where(eq(shoots.brandId, idea.brandId))
          ).filter((s) => s.ideaIds.includes(idea.id))
          return c.json({
            kind: 'idea',
            access,
            idea: {
              id: idea.id,
              format: idea.format,
              hook: idea.hook,
              angle: idea.angle,
              feature: idea.feature,
              inspiration: idea.inspiration,
              shots: idea.shots,
            },
            shoot: shoot
              ? { day: shoot.day, start: shoot.start, end: shoot.end, place: shoot.place }
              : null,
            comments: await thread(db, 'idea', idea.id),
          })
        }
        const [shoot] = await db.select().from(shoots).where(eq(shoots.id, link.targetId))
        if (!shoot) throw notFound('this link has nothing to show')
        const people = await db
          .select({ name: crew.name, role: crew.role })
          .from(crew)
          .where(eq(crew.shootId, shoot.id))
          .orderBy(asc(crew.position))
        const list =
          shoot.ideaIds.length === 0
            ? []
            : await db
                .select({
                  id: ideas.id,
                  format: ideas.format,
                  hook: ideas.hook,
                  inspiration: ideas.inspiration,
                  shots: ideas.shots,
                })
                .from(ideas)
                .where(inArray(ideas.id, shoot.ideaIds))
        return c.json({
          kind: 'shoot',
          access,
          shoot: {
            id: shoot.id,
            title: shoot.title,
            day: shoot.day,
            start: shoot.start,
            end: shoot.end,
            place: shoot.place,
            crew: people,
            ideas: shoot.ideaIds.map((id) => list.find((i) => i.id === id)).filter(Boolean),
          },
          comments: await thread(db, 'shoot', shoot.id),
        })
      })

      /** A guest's comment needs a name and words, both trimmed. */
      .post('/:token/comments', async (c) => {
        const link = await open(c.req.param('token'))
        if (link.can === 'view') throw forbidden('this link is view only')
        const input = await body(
          c,
          z.object({
            name: nonEmpty('a name').pipe(z.string().max(100)),
            text: nonEmpty('a comment'),
          }),
        )
        // Fly sets this header itself; a client cannot choose it. Off Fly every guest shares one
        // bucket: strict, but a forged header never slips past the limit.
        rateLimit(c.req.header('fly-client-ip') ?? 'direct')
        const [made] = await db
          .insert(comments)
          .values({
            id: randomUUID(),
            brandId: link.brandId,
            kind: link.kind,
            targetId: link.targetId,
            ...input,
          })
          .returning()
        return c.json(made!, 201)
      })

      /** "Can edit" (decision 6): the brief's hook, angle and storyboard titles, nothing else. */
      .patch('/:token/brief', async (c) => {
        const link = await open(c.req.param('token'))
        if (link.can !== 'edit') throw forbidden('this link cannot edit')
        if (link.kind !== 'idea') throw invalid('only an idea brief can be edited here')
        const input = await body(c, BriefEdit)
        const next = await db.transaction(async (tx) => {
          const [idea] = await tx
            .select()
            .from(ideas)
            .where(eq(ideas.id, link.targetId))
            .for('update')
          if (!idea) throw notFound('this link has nothing to show')
          const shots = idea.shots as { id: string; title: string }[]
          if (input.shots?.some((s) => !shots.some((x) => x.id === s.id))) {
            throw conflict('a shot is no longer on the storyboard', 'STALE')
          }
          const titled = input.shots
            ? shots.map((s) => ({
                ...s,
                title: input.shots!.find((x) => x.id === s.id)?.title ?? s.title,
              }))
            : undefined
          const [row] = await tx
            .update(ideas)
            .set({
              ...(input.hook !== undefined && { hook: input.hook }),
              ...(input.angle !== undefined && { angle: input.angle }),
              ...(titled && { shots: titled }),
              ...bump(ideas),
            })
            .where(eq(ideas.id, idea.id))
            .returning()
          if (input.hook !== undefined) await carryHook(tx, idea.postId, input.hook)
          return row!
        })
        return c.json({ hook: next.hook, angle: next.angle, shots: next.shots })
      })
  )
}
