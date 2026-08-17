import { and, eq, lt, sql } from 'drizzle-orm'
import { db } from '../client'
import { passportWriteAttempts } from '../schema/passport_write_attempts'

/**
 * The failed-structure-write queue.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 9c.
 * Doctrine, and why this is not a rule-7 shadow: `../schema/passport_write_attempts.ts`.
 *
 * **This is an app-owned table in `public`, so these are ordinary queries.** They are
 * deliberately not in `./passport.ts`, which holds the projection's only writers and is
 * swept by `../passport-write-guard.test.ts`. Nothing here touches `passport.*`.
 *
 * The one rule that keeps the table honest lives at the call sites rather than here:
 * **nothing but the retry surface may read it.** A brand list that joins this table to show
 * "the name it will have" is the shadow arriving.
 */

/** How long a failed attempt stays offered. */
export const WRITE_ATTEMPT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type StructureOperation =
  | 'unit.create'
  | 'unit.update'
  | 'unit.archive'
  | 'unit_relation.attach'
  | 'unit_relation.detach'
  | 'unit_app_access.enable'
  | 'unit_app_access.disable'

export interface WriteAttemptRow {
  id: string
  organizationId: string
  operation: string
  payload: unknown
  unitId: string | null
  attemptedBy: string
  attempts: number
  lastError: string
  createdAt: string
  expiresAt: string
}

const columns = {
  id: passportWriteAttempts.id,
  organizationId: passportWriteAttempts.organizationId,
  operation: passportWriteAttempts.operation,
  payload: passportWriteAttempts.payload,
  unitId: passportWriteAttempts.unitId,
  attemptedBy: passportWriteAttempts.attemptedBy,
  attempts: passportWriteAttempts.attempts,
  lastError: passportWriteAttempts.lastError,
  createdAt: passportWriteAttempts.createdAt,
  expiresAt: passportWriteAttempts.expiresAt,
}

/**
 * Record a failure.
 *
 * **Only a retryable failure belongs here** — the caller decides, via `isRetryable` in
 * `passport/structure-write.ts`. Queueing a `403` or a `422` produces a retry button that
 * can never succeed, which is worse than no button: it reads as "the system will get there
 * eventually" when nothing will change until the input or the person's role does.
 *
 * Every insert sweeps the expired rows first, the same self-bounding shape as
 * `passport_login_attempts`. There is no scheduled cleaner, because a table only written on
 * failure has no steady traffic to hang one off.
 */
export async function recordWriteAttempt(input: {
  organizationId: string
  operation: StructureOperation
  payload: unknown
  unitId?: string | null
  attemptedBy: string
  lastError: string
  ttlMs?: number
}): Promise<WriteAttemptRow> {
  await pruneExpiredWriteAttempts()

  const expiresAt = new Date(Date.now() + (input.ttlMs ?? WRITE_ATTEMPT_TTL_MS)).toISOString()
  const [row] = await db
    .insert(passportWriteAttempts)
    .values({
      organizationId: input.organizationId,
      operation: input.operation,
      payload: input.payload,
      unitId: input.unitId ?? null,
      attemptedBy: input.attemptedBy,
      lastError: input.lastError,
      expiresAt,
    })
    .returning(columns)
  return row!
}

/**
 * One org's outstanding attempts, newest first.
 *
 * Scoped by org and never global (rule 9): an Admin of one organisation must not see
 * another's failed structure changes, which would disclose unit names across a tenant
 * boundary.
 *
 * Expired rows are filtered in the query as well as pruned on write, because a deployment
 * that stops failing stops pruning — and the last few rows before an outage ended would
 * otherwise sit on the screen for ever.
 */
export async function listWriteAttempts(organizationId: string): Promise<WriteAttemptRow[]> {
  return db
    .select(columns)
    .from(passportWriteAttempts)
    .where(
      and(
        eq(passportWriteAttempts.organizationId, organizationId),
        sql`${passportWriteAttempts.expiresAt} > now()`,
      ),
    )
    .orderBy(sql`${passportWriteAttempts.createdAt} desc`)
}

/**
 * One attempt, for a retry.
 *
 * **Takes the org id and matches on it**, rather than fetching by id and letting the caller
 * compare. An id-only lookup is how a cross-org retry gets shipped: the id comes from the
 * client, the handler has an org from the session, and the comparison is one `if` somebody
 * forgets. Here it cannot be forgotten.
 */
export async function getWriteAttempt(
  id: string,
  organizationId: string,
): Promise<WriteAttemptRow | undefined> {
  const [row] = await db
    .select(columns)
    .from(passportWriteAttempts)
    .where(
      and(
        eq(passportWriteAttempts.id, id),
        eq(passportWriteAttempts.organizationId, organizationId),
      ),
    )
    .limit(1)
  return row
}

/** A retry failed again: count it and replace the message. */
export async function bumpWriteAttempt(
  id: string,
  organizationId: string,
  lastError: string,
): Promise<void> {
  await db
    .update(passportWriteAttempts)
    .set({ attempts: sql`${passportWriteAttempts.attempts} + 1`, lastError })
    .where(
      and(
        eq(passportWriteAttempts.id, id),
        eq(passportWriteAttempts.organizationId, organizationId),
      ),
    )
}

/**
 * Remove an attempt — on a successful retry, or when an Admin discards it.
 *
 * One function for both, because the row means the same thing in each case: this operation
 * is no longer outstanding. A `status` column distinguishing "done" from "discarded" would
 * turn a queue into a history, and a history is something screens read.
 */
export async function deleteWriteAttempt(id: string, organizationId: string): Promise<void> {
  await db
    .delete(passportWriteAttempts)
    .where(
      and(
        eq(passportWriteAttempts.id, id),
        eq(passportWriteAttempts.organizationId, organizationId),
      ),
    )
}

export async function pruneExpiredWriteAttempts(): Promise<void> {
  await db
    .delete(passportWriteAttempts)
    .where(lt(passportWriteAttempts.expiresAt, new Date().toISOString()))
}
