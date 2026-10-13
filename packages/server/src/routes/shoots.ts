import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { type Deps } from '../app'
import { type Conn } from '../db/client'
import { connections, crew, ideas, shoots } from '../db/schema'
import { hoursAfter, lockShoots, pruneShoots, takeOutOfShoots } from '../domain/shoots'
import { conflict, invalid, notFound } from '../errors'
import { body, Id } from '../http'
import { TIME, addDays, todayIn } from '../time'
import { assertDay } from '../domain/posts'
import { assertSameBrand, assertVersion, bump, IfVersion, nonEmpty, type BrandEnv } from './shared'

const Time = z.string().regex(TIME, 'a time is HH:MM')
const Person = z.object({ id: Id, name: nonEmpty('a name'), role: nonEmpty('a role') })

const CreateShoot = z.object({
  id: Id,
  title: nonEmpty('a title'),
  origin: z.enum(['planned', 'manual']),
  day: z.string().optional(),
  start: Time.optional(),
  end: Time.optional(),
  place: z.string().max(500).optional(),
  ideaIds: z.array(Id).max(100).optional(),
  crew: z.array(Person).max(50).optional(),
})

const EditShoot = z.object({
  title: nonEmpty('a title').optional(),
  day: z.string().optional(),
  start: Time.optional(),
  end: Time.optional(),
  place: z.string().max(500).optional(),
  ifVersion: IfVersion,
})

const OnDay = z.object({
  ideaId: Id,
  day: z.string(),
  start: Time,
  /** The id a new shoot takes if none is on the day yet. */
  newShootId: Id,
  title: nonEmpty('a title').optional(),
  place: z.string().max(500).optional(),
  crew: z.array(Person).max(50).optional(),
})

/** How far ahead a new shoot looks for a day with no shoot. */
const HORIZON_DAYS = 60

async function loadShoot(db: Conn, brandId: string, id: string) {
  const [shoot] = await db
    .select()
    .from(shoots)
    .where(and(eq(shoots.id, id), eq(shoots.brandId, brandId)))
    .for('update')
  if (!shoot) throw notFound('shoot not found')
  return shoot
}

async function assertIdeas(db: Conn, brandId: string, ids: string[]) {
  if (ids.length === 0) return
  const found = await db
    .select({ id: ideas.id })
    .from(ideas)
    .where(and(eq(ideas.brandId, brandId), inArray(ideas.id, ids)))
  if (found.length !== new Set(ids).size) throw invalid('an idea is not in this brand', 'BAD_IDEA')
}

export async function shootView(db: Conn, shoot: typeof shoots.$inferSelect) {
  const people = await db
    .select()
    .from(crew)
    .where(eq(crew.shootId, shoot.id))
    .orderBy(asc(crew.position))
  return { ...shoot, crew: people }
}

/** The first day ahead with no shoot, else the last day looked at (`freeShootDay`). */
async function freeShootDay(db: Conn, brandId: string, today: string) {
  const taken = new Set(
    (await db.select({ day: shoots.day }).from(shoots).where(eq(shoots.brandId, brandId))).map(
      (s) => s.day,
    ),
  )
  let day = addDays(today, 1)
  for (let i = 1; i < HORIZON_DAYS && taken.has(day); i++) day = addDays(day, 1)
  return day
}

async function addPeople(db: Conn, shootId: string, people: z.infer<typeof Person>[], from = 0) {
  if (people.length === 0) return
  const ids = people.map((p) => p.id)
  if (new Set(ids).size !== ids.length) throw invalid('two crew members share an id')
  const taken = await db.select({ id: crew.id }).from(crew).where(inArray(crew.id, ids))
  if (taken.length > 0) throw conflict('this id is taken', 'ID_TAKEN')
  await db.insert(crew).values(people.map((p, i) => ({ ...p, shootId, position: from + i })))
}

export function shootRoutes(deps: Deps) {
  const { db } = deps
  return (
    new Hono<BrandEnv>()
      /**
       * A shoot planned from ideas (`planShoot`) or added by hand (`addShoot`). The ideas leave
       * the shoots they were in, and a planned shoot left empty goes. A repeat of the id returns
       * the shoot it made.
       */
      .post('/', async (c) => {
        const brand = c.var.brand
        const input = await body(c, CreateShoot)
        const result = await db.transaction(async (tx) => {
          await lockShoots(tx, brand.id)
          const [existing] = await tx.select().from(shoots).where(eq(shoots.id, input.id))
          if (existing) {
            assertSameBrand(existing, brand.id)
            return { shoot: await shootView(tx, existing), created: false }
          }
          const ideaIds = [...new Set(input.ideaIds ?? [])]
          await assertIdeas(tx, brand.id, ideaIds)
          const today = todayIn(brand.timezone, deps.now())
          const day = input.day
            ? assertDay(brand, input.day, deps.now())
            : await freeShootDay(tx, brand.id, today)
          const hours = hoursAfter({ start: '12:00', end: '17:00' }, input)
          await takeOutOfShoots(tx, brand.id, ideaIds)
          const [shoot] = await tx
            .insert(shoots)
            .values({
              id: input.id,
              brandId: brand.id,
              title: input.title,
              origin: input.origin,
              day,
              ...hours,
              place: input.place ?? '',
              ideaIds,
            })
            .returning()
          await addPeople(tx, shoot!.id, input.crew ?? [])
          await pruneShoots(tx, brand.id, shoot!.id)
          return { shoot: await shootView(tx, shoot!), created: true }
        })
        return c.json(result.shoot, result.created ? 201 : 200)
      })

      /**
       * The shoot day picked on an idea's page (`shootIdeaOn`): the idea joins the shoot already
       * on that day, or a new planned shoot starts there at the time picked.
       */
      .post('/on-day', async (c) => {
        const brand = c.var.brand
        const input = await body(c, OnDay)
        const result = await db.transaction(async (tx) => {
          await lockShoots(tx, brand.id)
          await assertIdeas(tx, brand.id, [input.ideaId])
          const day = assertDay(brand, input.day, deps.now())
          const [there] = await tx
            .select()
            .from(shoots)
            .where(and(eq(shoots.brandId, brand.id), eq(shoots.day, day)))
            .orderBy(asc(shoots.start))
          if (there) {
            if (!there.ideaIds.includes(input.ideaId)) {
              await takeOutOfShoots(tx, brand.id, [input.ideaId], there.id)
              await tx
                .update(shoots)
                .set({ ideaIds: [...there.ideaIds, input.ideaId], ...bump(shoots) })
                .where(eq(shoots.id, there.id))
              await pruneShoots(tx, brand.id, there.id)
            }
            return loadShoot(tx, brand.id, there.id)
          }
          const [taken] = await tx.select().from(shoots).where(eq(shoots.id, input.newShootId))
          if (taken) throw conflict('this id is taken', 'ID_TAKEN')
          await takeOutOfShoots(tx, brand.id, [input.ideaId])
          const hours = hoursAfter({ start: '12:00', end: '17:00' }, { start: input.start })
          const [shoot] = await tx
            .insert(shoots)
            .values({
              id: input.newShootId,
              brandId: brand.id,
              title: input.title ?? 'New shoot',
              origin: 'planned',
              day,
              ...hours,
              place: input.place ?? '',
              ideaIds: [input.ideaId],
            })
            .returning()
          await addPeople(tx, shoot!.id, input.crew ?? [])
          await pruneShoots(tx, brand.id, shoot!.id)
          return shoot!
        })
        return c.json(await shootView(db, result))
      })

      /** Title, day, hours or place. Hours follow the call sheet's rules (`hoursAfter`). */
      .patch('/:id', async (c) => {
        const brand = c.var.brand
        const input = await body(c, EditShoot)
        const result = await db.transaction(async (tx) => {
          const shoot = await loadShoot(tx, brand.id, c.req.param('id'))
          assertVersion(shoot, input.ifVersion)
          const day = input.day === undefined ? undefined : assertDay(brand, input.day, deps.now())
          const { start, end } = hoursAfter(shoot, input)
          const [next] = await tx
            .update(shoots)
            .set({
              ...(input.title !== undefined && { title: input.title }),
              ...(day !== undefined && { day }),
              ...(input.place !== undefined && { place: input.place }),
              start,
              end,
              ...bump(shoots),
            })
            .where(eq(shoots.id, shoot.id))
            .returning()
          return next!
        })
        return c.json(await shootView(db, result))
      })

      .delete('/:id', async (c) => {
        const brand = c.var.brand
        const shoot = await loadShoot(db, brand.id, c.req.param('id'))
        await db.delete(shoots).where(eq(shoots.id, shoot.id))
        return c.json({ deleted: shoot.id })
      })

      /**
       * An idea joins this shoot and leaves the one it was on (`addIdeaToShoot`). It lands first,
       * then pruning runs, so an empty planned target is not lost.
       */
      .post('/:id/ideas', async (c) => {
        const brand = c.var.brand
        const { ideaId } = await body(c, z.object({ ideaId: Id }))
        const result = await db.transaction(async (tx) => {
          const shoot = await loadShoot(tx, brand.id, c.req.param('id'))
          await assertIdeas(tx, brand.id, [ideaId])
          await takeOutOfShoots(tx, brand.id, [ideaId], shoot.id)
          const [next] = await tx
            .update(shoots)
            .set({
              ideaIds: [...shoot.ideaIds.filter((i) => i !== ideaId), ideaId],
              ...bump(shoots),
            })
            .where(eq(shoots.id, shoot.id))
            .returning()
          await pruneShoots(tx, brand.id, shoot.id)
          return next!
        })
        return c.json(await shootView(db, result))
      })

      /**
       * An idea taken off this shoot. On the shoot's own page the shoot stays even when empty
       * (`removeIdeaFromShoot`); from the idea page (`?leave=1`) an empty planned shoot goes
       * (`leaveShoot`).
       */
      .delete('/:id/ideas/:ideaId', async (c) => {
        const brand = c.var.brand
        const leave = c.req.query('leave') === '1'
        const result = await db.transaction(async (tx) => {
          const shoot = await loadShoot(tx, brand.id, c.req.param('id'))
          const ideaId = c.req.param('ideaId')
          const [next] = await tx
            .update(shoots)
            .set({ ideaIds: shoot.ideaIds.filter((i) => i !== ideaId), ...bump(shoots) })
            .where(eq(shoots.id, shoot.id))
            .returning()
          if (leave) await pruneShoots(tx, brand.id)
          return next!
        })
        const [still] = await db.select().from(shoots).where(eq(shoots.id, result.id))
        return c.json(still ? await shootView(db, still) : { deleted: result.id })
      })

      /**
       * The shooting order from a drag (`setIdeaOrder`): ids the shoot does not hold are ignored,
       * and ids the order leaves out keep their place at the end.
       */
      .put('/:id/order', async (c) => {
        const brand = c.var.brand
        const { ideaIds } = await body(c, z.object({ ideaIds: z.array(Id).max(100) }))
        const result = await db.transaction(async (tx) => {
          const shoot = await loadShoot(tx, brand.id, c.req.param('id'))
          const order = [
            ...new Set(ideaIds.filter((i) => shoot.ideaIds.includes(i))),
            ...shoot.ideaIds.filter((i) => !ideaIds.includes(i)),
          ]
          const [next] = await tx
            .update(shoots)
            .set({ ideaIds: order, ...bump(shoots) })
            .where(eq(shoots.id, shoot.id))
            .returning()
          return next!
        })
        return c.json(await shootView(db, result))
      })

      .post('/:id/crew', async (c) => {
        const brand = c.var.brand
        const person = await body(c, Person)
        const shoot = await loadShoot(db, brand.id, c.req.param('id'))
        const [existing] = await db.select().from(crew).where(eq(crew.id, person.id))
        if (existing && existing.shootId !== shoot.id)
          throw conflict('this id is taken', 'ID_TAKEN')
        if (!existing) {
          const people = await db.select().from(crew).where(eq(crew.shootId, shoot.id))
          const last = Math.max(-1, ...people.map((p) => p.position))
          await addPeople(db, shoot.id, [person], last + 1)
        }
        return c.json(await shootView(db, shoot))
      })

      /** Crew are removed by id, so two people with one name stay apart. */
      .delete('/:id/crew/:crewId', async (c) => {
        const brand = c.var.brand
        const shoot = await loadShoot(db, brand.id, c.req.param('id'))
        await db
          .delete(crew)
          .where(and(eq(crew.id, c.req.param('crewId')), eq(crew.shootId, shoot.id)))
        return c.json(await shootView(db, shoot))
      })

      /**
       * The Lark invite, to the crew not invited yet: someone added after the first invite gets
       * one, and nobody gets a second. Lark must be linked first.
       */
      .post('/:id/invites', async (c) => {
        const brand = c.var.brand
        const shoot = await loadShoot(db, brand.id, c.req.param('id'))
        const [lark] = await db
          .select()
          .from(connections)
          .where(and(eq(connections.brandId, brand.id), eq(connections.key, 'lark')))
        if (lark?.status !== 'connected') throw conflict('connect Lark first', 'NOT_CONNECTED')
        // Claimed before sending, so two presses at once never invite anyone twice. A send that
        // fails gives the claim back, and the next press tries those people again.
        const fresh = await db
          .update(crew)
          .set({ invitedAt: deps.now() })
          .where(and(eq(crew.shootId, shoot.id), isNull(crew.invitedAt)))
          .returning()
        if (fresh.length > 0) {
          try {
            await deps.invites.send(
              brand.id,
              shoot,
              fresh.sort((a, b) => a.position - b.position),
            )
          } catch (err) {
            await db
              .update(crew)
              .set({ invitedAt: null })
              .where(
                inArray(
                  crew.id,
                  fresh.map((p) => p.id),
                ),
              )
            throw err
          }
        }
        return c.json(await shootView(db, shoot))
      })

      /** A crew member's answer, as Lark reports it. */
      .put('/:id/crew/:crewId/reply', async (c) => {
        const brand = c.var.brand
        const { reply } = await body(c, z.object({ reply: z.enum(['going', 'cant']).nullable() }))
        const shoot = await loadShoot(db, brand.id, c.req.param('id'))
        const [person] = await db
          .update(crew)
          .set({ reply })
          .where(and(eq(crew.id, c.req.param('crewId')), eq(crew.shootId, shoot.id)))
          .returning()
        if (!person) throw notFound('crew member not found')
        return c.json(await shootView(db, shoot))
      })
  )
}
