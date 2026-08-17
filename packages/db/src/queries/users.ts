import type { UserId } from '@brandfactory/shared'
import { eq, sql } from 'drizzle-orm'
import { db } from '../client'
import { users } from '../schema'

// Users aren't exposed via shared yet (Phase 3 adapters own the auth shape).
// V1 returns the row verbatim for internal callers.
export type User = typeof users.$inferSelect

export async function getUserById(id: UserId): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id))
  return row ?? null
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email))
  return row ?? null
}

export async function createUser(input: {
  email: string
  displayName?: string | null
}): Promise<User> {
  const [row] = await db
    .insert(users)
    .values({
      email: input.email,
      displayName: input.displayName ?? null,
    })
    .returning()
  if (!row) throw new Error('createUser returned no row')
  return row
}

// Auto-provision helper for the Supabase auth flow: insert a `users` row
// keyed by the JWT `sub`, or no-op if a row with that id already exists.
// `onConflictDoNothing` on the primary key keeps this idempotent and safe to
// run on every verified request. Does NOT update email on conflict — we
// treat the first seen email as canonical; operator-driven changes go
// through a separate flow.
export async function upsertUserById(input: {
  id: string
  email: string
  displayName?: string | null
}): Promise<void> {
  await db
    .insert(users)
    .values({
      id: input.id as UserId,
      email: input.email,
      displayName: input.displayName ?? null,
    })
    .onConflictDoNothing({ target: users.id })
}

/**
 * Every local user whose email matches, compared case-INSENSITIVELY.
 *
 * Used by the Passport login path, and the plural return is the point.
 *
 * `users.email` is `unique` but not case-insensitively so, which means
 * `Bob@x.com` and `bob@x.com` can both exist. On a path that hands out a session,
 * refusing to guess is the only safe answer — picking "the first one" silently
 * authenticates somebody as the wrong person. So the caller counts the matches and
 * fails closed on more than one.
 *
 * **The durable fix is a case-insensitive unique index on `users.email`**, which
 * would make the ambiguity impossible rather than merely detectable. Until then
 * this is how the ambiguity is seen at all: `getUserByEmail` above compares
 * exactly, so it cannot find a case-variant row and cannot report a conflict.
 */
export async function findUsersByEmail(email: string): Promise<User[]> {
  return db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
}
