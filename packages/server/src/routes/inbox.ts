import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { type Deps } from '../app'
import { type Conn } from '../db/client'
import { inboxMessages, inboxPeople } from '../db/schema'
import { conflict, invalid, notFound } from '../errors'
import { body, Id } from '../http'
import { nonEmpty, type BrandEnv } from './shared'

type Message = typeof inboxMessages.$inferSelect

/** No reply needed: noise, or no letter or digit at all, even as praise (`isNoise`). */
export function isNoise(m: Pick<Message, 'tone' | 'text'>) {
  return m.tone === 'noise' || !/[\p{L}\p{N}]/u.test(m.text)
}

/**
 * The inbox in the order to clear it (`queue`): open messages with complaints first, then
 * newest; then noise; then what is done, newest first. The client splits the groups by
 * `doneAt` and `isNoise`.
 */
export function inboxOrder(messages: Message[]): Message[] {
  const newest = (a: Message, b: Message) => b.receivedAt.getTime() - a.receivedAt.getTime()
  const open = messages.filter((m) => !m.doneAt && !isNoise(m))
  open.sort(
    (a, b) => Number(b.tone === 'complaint') - Number(a.tone === 'complaint') || newest(a, b),
  )
  const noise = messages.filter((m) => !m.doneAt && isNoise(m)).sort(newest)
  const done = messages.filter((m) => m.doneAt).sort(newest)
  return [...open, ...noise, ...done]
}

export async function inboxOf(db: Conn, brandId: string) {
  const [people, messages] = await Promise.all([
    db
      .select()
      .from(inboxPeople)
      .where(eq(inboxPeople.brandId, brandId))
      .orderBy(asc(inboxPeople.position)),
    db.select().from(inboxMessages).where(eq(inboxMessages.brandId, brandId)),
  ])
  return { people, messages: inboxOrder(messages) }
}

export function inboxRoutes(deps: Deps) {
  const { db } = deps
  const load = async (brandId: string, id: string) => {
    const [m] = await db
      .select()
      .from(inboxMessages)
      .where(and(eq(inboxMessages.id, id), eq(inboxMessages.brandId, brandId)))
    if (!m) throw notFound('message not found')
    return m
  }
  return (
    new Hono<BrandEnv>()
      .get('/', async (c) => c.json(await inboxOf(db, c.var.brand.id)))

      /**
       * The reply, kept with who sent it. It waits as `queued`: no platform sender exists yet (see
       * the plan), and the message leaves the queue as the demo's does.
       */
      .post('/:id/reply', async (c) => {
        const brand = c.var.brand
        const { text } = await body(
          c,
          z.object({ text: nonEmpty('a reply').pipe(z.string().max(8000)) }),
        )
        const m = await load(brand.id, c.req.param('id'))
        // Only a message still open takes a reply: two replies at once keep the first, and the
        // second hears so.
        const [next] = await db
          .update(inboxMessages)
          .set({
            replyText: text,
            replyStatus: 'queued',
            repliedBy: c.var.user.id,
            doneAt: deps.now(),
          })
          .where(and(eq(inboxMessages.id, m.id), isNull(inboxMessages.doneAt)))
          .returning()
        if (!next) throw conflict('this message was answered or cleared', 'ALREADY_DONE')
        return c.json(next)
      })

      /** A complaint goes to the people it is about, kept in the brand's order of people. */
      .post('/:id/send-to', async (c) => {
        const brand = c.var.brand
        const { people } = await body(c, z.object({ people: z.array(Id).min(1).max(20) }))
        const m = await load(brand.id, c.req.param('id'))
        if (m.tone !== 'complaint')
          throw invalid('only a complaint goes to someone', 'NOT_COMPLAINT')
        const known = await db
          .select()
          .from(inboxPeople)
          .where(and(eq(inboxPeople.brandId, brand.id), inArray(inboxPeople.id, people)))
          .orderBy(asc(inboxPeople.position))
        if (known.length !== new Set(people).size)
          throw invalid('a person is not in this brand', 'BAD_PERSON')
        const [next] = await db
          .update(inboxMessages)
          .set({ sentTo: known.map((p) => p.id) })
          .where(and(eq(inboxMessages.id, m.id), isNull(inboxMessages.doneAt)))
          .returning()
        if (!next) throw conflict('this message was answered or cleared', 'ALREADY_DONE')
        return c.json(next)
      })

      /** Clears all the noise at once. */
      .post('/clear-noise', async (c) => {
        const brand = c.var.brand
        const open = await db
          .select()
          .from(inboxMessages)
          .where(and(eq(inboxMessages.brandId, brand.id), isNull(inboxMessages.doneAt)))
        const noise = open.filter(isNoise).map((m) => m.id)
        if (noise.length > 0) {
          await db
            .update(inboxMessages)
            .set({ doneAt: deps.now() })
            .where(inArray(inboxMessages.id, noise))
        }
        return c.json({ cleared: noise })
      })
  )
}
