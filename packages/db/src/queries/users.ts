import type { UserId, WorkspacePerson } from '@brandfactory/shared'
import { and, eq, isNull, sql } from 'drizzle-orm'
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

// Clears `must_set_password`, and only ever clears it.
//
// **Called from one place**: the handler that has just set the person's own
// password through the auth provider. Nothing else may clear this column — a
// flag cleared without a password behind it is the one lie it must not tell,
// and the handler and the write have to stay in the same transaction of
// thought even though they are not one transaction.
//
// Returns false when no row changed, which means the id does not exist. The
// caller treats that as a 404 rather than reporting success.
export async function clearMustSetPassword(id: UserId): Promise<boolean> {
  const rows = await db
    .update(users)
    .set({ mustSetPassword: false, updatedAt: new Date().toISOString() })
    .where(eq(users.id, id))
    .returning({ id: users.id })
  return rows.length > 0
}

// A member as the admin screen reads one: the row, plus the brands granted.
export interface MemberRow {
  id: UserId
  email: string
  displayName: string | null
  role: 'admin' | null
  mustSetPassword: boolean
  deactivatedAt: string | null
  createdAt: string
}

export async function listMembers(): Promise<MemberRow[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      mustSetPassword: users.mustSetPassword,
      deactivatedAt: users.deactivatedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.email)
  return rows as MemberRow[]
}

/**
 * Everybody a workspace's work can be handed to: active accounts, ordered the
 * way their labels render. Read by `GET /workspaces/:workspaceId/people`.
 *
 * ⚠️ **No workspace filter, and the omission is the honest shape.** There is no
 * `user_workspaces` table: `requireWorkspaceAccess` admits any active account,
 * and `authz.ts` says why — *"Per-brand is the dimension that narrows, not
 * per-workspace. There is one workspace."* So the workspace in the route's path
 * is the **access boundary**, not a predicate, and a `where` clause naming it
 * would be a filter that filters nothing while claiming to.
 *
 * The day a second workspace exists, this function and that route change
 * together, and the compiler will not tell you — so it is written down here.
 *
 * **Deactivated accounts are excluded.** Offering somebody work they cannot
 * sign in to do is the defect the picker exists to avoid, and `assertAssignable`
 * in `marketing-requests.ts` refuses the same set on the write.
 *
 * Ordered by `coalesce(display_name, email)` because that is exactly what
 * `personLabel` renders. Ordering by `email` alone — as `listMembers` does, for
 * a table that shows both columns — would read as unsorted in a list that shows
 * one.
 *
 * No pagination. `listMembers` has none either, and past a couple of hundred the
 * honest fix is a search rather than a bigger page.
 */
export async function listActivePeople(): Promise<WorkspacePerson[]> {
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
    })
    .from(users)
    .where(isNull(users.deactivatedAt))
    .orderBy(sql`coalesce(${users.displayName}, ${users.email})`)
  return rows as WorkspacePerson[]
}

/**
 * How many active admins exist.
 *
 * **The last-admin guard reads this.** A workspace with no admin cannot add
 * anybody or restore anybody, and the only way back is SQL. Launchpad guards
 * this on delete and *not* on its role edit, so a full admin there can demote
 * itself and lose the screen; we guard both paths and this is the count both
 * read.
 */
export async function countActiveAdmins(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, 'admin'), isNull(users.deactivatedAt)))
  return row?.n ?? 0
}

/**
 * Writes the `users` row for an account the identity provider has just made.
 *
 * ⚠️ **`id` is the provider's id, never a fresh one.** See `upsertUserById` and
 * `AuthProvider.createUser` — a row keyed to anything else is unreachable.
 *
 * Plain `insert`, not an upsert: a conflict here means the administrator typed
 * an address that already exists, and the caller turns that into a 409 naming
 * it rather than quietly adopting the existing row.
 */
export async function insertMember(input: {
  id: string
  email: string
  displayName: string | null
  role: 'admin' | null
  mustSetPassword: boolean
}): Promise<User> {
  const [row] = await db
    .insert(users)
    .values({
      id: input.id as UserId,
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      mustSetPassword: input.mustSetPassword,
    })
    .returning()
  if (!row) throw new Error('insertMember returned no row')
  return row
}

export async function updateMember(
  id: UserId,
  patch: { displayName?: string | null; role?: 'admin' | null },
): Promise<User | null> {
  const [row] = await db
    .update(users)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(users.id, id))
    .returning()
  return row ?? null
}

/** Sets or clears `deactivated_at`. Reversible, which is the whole design. */
export async function setMemberDeactivated(id: UserId, deactivated: boolean): Promise<User | null> {
  const [row] = await db
    .update(users)
    .set({
      deactivatedAt: deactivated ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, id))
    .returning()
  return row ?? null
}

/** Flags the account again, after an admin has chosen a password for somebody. */
export async function setMustSetPassword(id: UserId): Promise<boolean> {
  const rows = await db
    .update(users)
    .set({ mustSetPassword: true, updatedAt: new Date().toISOString() })
    .where(eq(users.id, id))
    .returning({ id: users.id })
  return rows.length > 0
}
