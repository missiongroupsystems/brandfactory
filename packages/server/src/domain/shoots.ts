import { and, eq, sql } from 'drizzle-orm'
import { type Conn } from '../db/client'
import { shoots } from '../db/schema'

/**
 * Queues the brand's shoot changes that create a shoot: two first creates of one id, or two
 * ideas starting a shoot on one day, run one after the other. Held to the end of the transaction.
 */
export async function lockShoots(db: Conn, brandId: string) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`shoots:${brandId}`}))`)
}

/** Takes ideas out of every shoot of the brand that holds them: an idea is shot once. */
export async function takeOutOfShoots(db: Conn, brandId: string, ideaIds: string[], keep?: string) {
  // Locks the brand's shoots, so two moves of one idea at once cannot leave it in two shoots.
  const all = await db.select().from(shoots).where(eq(shoots.brandId, brandId)).for('update')
  for (const s of all) {
    if (s.id === keep || !s.ideaIds.some((i) => ideaIds.includes(i))) continue
    await db
      .update(shoots)
      .set({
        ideaIds: s.ideaIds.filter((i) => !ideaIds.includes(i)),
        version: sql`${shoots.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(shoots.id, s.id))
  }
}

/**
 * Drops the brand's planned shoots that have no idea left (`without` in `shoots-store.ts`). A
 * shoot from Lark or one added by hand stays, and so does `keep`.
 */
export async function pruneShoots(db: Conn, brandId: string, keep?: string) {
  const empty = await db
    .select({ id: shoots.id })
    .from(shoots)
    .where(
      and(
        eq(shoots.brandId, brandId),
        eq(shoots.origin, 'planned'),
        sql`cardinality(${shoots.ideaIds}) = 0`,
      ),
    )
  for (const { id } of empty) {
    if (id !== keep) await db.delete(shoots).where(eq(shoots.id, id))
  }
}

const minutes = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h! * 60 + m!
}

const clock = (min: number) => {
  const m = Math.min(Math.max(min, 0), 23 * 60 + 30)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** A new start keeps the shoot's length, clamped to the day (`moveStart`). */
export function moveStart(s: { start: string; end: string }, start: string) {
  return { start, end: clock(minutes(start) + minutes(s.end) - minutes(s.start)) }
}

/** An end at or before the start becomes an hour after it (`setEnd`). */
export function setEnd(start: string, end: string) {
  return minutes(end) > minutes(start) ? end : clock(minutes(start) + 60)
}

/**
 * The hours after an edit, as the call sheet's pickers make them: a new start alone keeps the
 * length, and an end at or before the start moves to an hour after it.
 */
export function hoursAfter(
  s: { start: string; end: string },
  edit: { start?: string; end?: string },
) {
  const moved = edit.start === undefined ? s : moveStart(s, edit.start)
  return { start: moved.start, end: setEnd(moved.start, edit.end ?? moved.end) }
}
