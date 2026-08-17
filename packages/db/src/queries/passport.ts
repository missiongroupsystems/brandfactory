import { eq, getTableColumns, sql, type SQL } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core/query-builders/update'
import { db } from '../client'
import {
  passportEntitlement,
  passportIdentityLink,
  passportMembership,
  passportOrganization,
  passportUnit,
  passportUnitAppAccess,
  passportUnitAppMembership,
  passportUnitRelation,
} from '../schema/passport'

/**
 * The ONLY writes into the `passport.*` projection.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 3.
 * Doctrine: `../schema/passport/schema.ts`.
 *
 * Every function here is called from exactly one place — the 17 sync handlers in
 * `@brandfactory/server` — plus the identity-link writer on the login path. They
 * are deliberately **not** on the `Db` facade that route handlers receive
 * (`packages/server/src/db.ts`), so a route cannot reach them through its deps
 * and would have to import this module by name to write the projection.
 * `../passport-write-guard.test.ts` sweeps for exactly that.
 *
 * The `writePassport*` prefix is load-bearing for the same reason: it is what the
 * guard greps for, and it cannot be hit by accident.
 *
 * This module knows nothing about the Passport SDK. Mapping the wire payload's
 * snake_case onto these row shapes is the server handlers' job, which keeps the
 * vendor's names out of the data layer.
 */

// ---------------------------------------------------------------------------
// The version guard
// ---------------------------------------------------------------------------

/**
 * The two halves of the guard, as data, so they can be asserted without a
 * database — `buildVersionGuard.test.ts` renders both through `PgDialect`.
 *
 * That test is not ceremony. These few lines are the most dangerous code in the
 * integration: a `<` instead of `<=` silently drops every equal-version replay,
 * and a column missing from `set` silently stops updating while every other field
 * stays fresh. Neither raises, and neither is visible in a passing round-trip
 * test.
 *
 * - **`set` is built from `getTableColumns`, not hand-listed.** `passport.unit`
 *   has 13 updatable columns; a hand-written list that forgets one is exactly the
 *   silent failure above. Deriving it means a column added to the schema is
 *   covered on the same commit.
 * - **`setWhere` uses `<=`, never `<`.** An equal-version replay must re-apply
 *   idempotently, because Passport retries on any non-2xx and replays are
 *   ordinary traffic rather than an edge case.
 */
export function buildVersionGuard<T extends PgTable>(
  table: T,
  versionColumn: PgColumn,
): { set: Record<string, SQL>; setWhere: SQL } {
  const set: Record<string, SQL> = {}
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if (key === 'id') continue
    set[key] = sql`excluded.${sql.identifier(column.name)}`
  }
  return { set, setWhere: sql`${versionColumn} <= excluded.version` }
}

/**
 * `INSERT … ON CONFLICT (id) DO UPDATE SET <every column> WHERE stored.version <=
 * excluded.version`.
 *
 * **One atomic statement, not a read-then-write.** Two deliveries of the same
 * aggregate racing each other cannot interleave a SELECT and an UPDATE and apply
 * the older one last. A read-then-write would be correct only under a lock we
 * would have to take ourselves.
 */
async function applyVersioned<T extends PgTable>(
  table: T,
  idColumn: PgColumn,
  versionColumn: PgColumn,
  values: T['$inferInsert'],
): Promise<void> {
  const { set, setWhere } = buildVersionGuard(table, versionColumn)

  await db
    .insert(table)
    .values(values)
    // The dynamic `set` is the one place this file departs from full inference.
    // `PgUpdateSetSource<T>` is a mapped type over the table's own columns, so it
    // cannot be built generically from `getTableColumns` without this assertion —
    // and the alternative, five hand-written column lists, is what actually risks
    // a bug (see the note above).
    .onConflictDoUpdate({
      target: idColumn,
      set: set as PgUpdateSetSource<T>,
      setWhere,
    })
}

// ---------------------------------------------------------------------------
// Mutable aggregates — version-guarded upserts
// ---------------------------------------------------------------------------

/** `org.upserted` and `org.archived`. Archive is a status change, not a delete. */
export async function writePassportOrganization(
  row: typeof passportOrganization.$inferInsert,
): Promise<void> {
  await applyVersioned(
    passportOrganization,
    passportOrganization.id,
    passportOrganization.version,
    row,
  )
}

/** `unit.upserted` and `unit.archived`, for all three unit types. */
export async function writePassportUnit(row: typeof passportUnit.$inferInsert): Promise<void> {
  await applyVersioned(passportUnit, passportUnit.id, passportUnit.version, row)
}

/**
 * `membership.upserted` **and `membership.removed`** — the second is an upsert
 * keeping `status = 'removed'`, not a delete. Deleting the row loses the tombstone
 * and nightly reconciliation then resurrects the membership from the snapshot,
 * which reads as a revoked user silently regaining access.
 */
export async function writePassportMembership(
  row: typeof passportMembership.$inferInsert,
): Promise<void> {
  await applyVersioned(passportMembership, passportMembership.id, passportMembership.version, row)
}

/**
 * `entitlement.upserted` — **including revocation**, which arrives here with
 * `status != 'active'`. There is no entitlement-remove event and a revocation must
 * never be filtered out: it is the org-level kill switch.
 */
export async function writePassportEntitlement(
  row: typeof passportEntitlement.$inferInsert,
): Promise<void> {
  await applyVersioned(
    passportEntitlement,
    passportEntitlement.id,
    passportEntitlement.version,
    row,
  )
}

/**
 * `unit_app_membership.upserted` **and `.removed`** — the same tombstone rule as
 * `writePassportMembership`.
 */
export async function writePassportUnitAppMembership(
  row: typeof passportUnitAppMembership.$inferInsert,
): Promise<void> {
  await applyVersioned(
    passportUnitAppMembership,
    passportUnitAppMembership.id,
    passportUnitAppMembership.version,
    row,
  )
}

// ---------------------------------------------------------------------------
// Immutable aggregates — insert-if-absent / delete-if-present
// ---------------------------------------------------------------------------
//
// No version, so no guard: these rows are created and hard-removed, never
// updated. `onConflictDoNothing` is what makes a redelivery idempotent.

/** `unit_relation.created`. */
export async function writePassportUnitRelation(
  row: typeof passportUnitRelation.$inferInsert,
): Promise<void> {
  await db.insert(passportUnitRelation).values(row).onConflictDoNothing({
    target: passportUnitRelation.id,
  })
}

/** `unit_relation.removed` — a real delete. */
export async function deletePassportUnitRelation(id: string): Promise<void> {
  await db.delete(passportUnitRelation).where(eq(passportUnitRelation.id, id))
}

/**
 * `identity_link.created`, and the row we write ourselves on every login.
 *
 * Idempotency is **procedural, not a constraint**: there is deliberately no unique
 * index on `(subject, app_id)`, because the wire does not promise it and a
 * constraint the wire does not promise turns a data condition into a retry storm
 * (see `../schema/passport/immutable.ts`).
 */
export async function writePassportIdentityLink(
  row: typeof passportIdentityLink.$inferInsert,
): Promise<void> {
  await db.insert(passportIdentityLink).values(row).onConflictDoNothing({
    target: passportIdentityLink.id,
  })
}

/** `identity_link.removed` — a real delete. */
export async function deletePassportIdentityLink(id: string): Promise<void> {
  await db.delete(passportIdentityLink).where(eq(passportIdentityLink.id, id))
}

/**
 * Replace this app's identity link for one subject, in a single transaction.
 *
 * The login path calls this on **every** login, not just the first: it is
 * idempotent and it self-heals a row left stale by a re-provision, or one written
 * with a wrong `platform_user_id` before that was understood. Replace rather than
 * update, because `identity_link` rows are immutable per row in Passport's model.
 *
 * Phase 4 uses it; it lives here so every projection write stays in one file.
 */
export async function replacePassportIdentityLink(
  row: typeof passportIdentityLink.$inferInsert,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(passportIdentityLink)
      .where(
        sql`${passportIdentityLink.subject} = ${row.subject} and ${passportIdentityLink.appId} = ${row.appId}`,
      )
    await tx.insert(passportIdentityLink).values(row)
  })
}

/** `unit_app_access.created` — the unit↔app switch. */
export async function writePassportUnitAppAccess(
  row: typeof passportUnitAppAccess.$inferInsert,
): Promise<void> {
  await db.insert(passportUnitAppAccess).values(row).onConflictDoNothing({
    target: passportUnitAppAccess.id,
  })
}

/**
 * `unit_app_access.removed` — a real delete, unlike the membership tombstones.
 *
 * Every user's access at that unit ends as a consequence, with no role row
 * changing: a unit carrying no `unit_app_access` row confers access to nobody.
 */
export async function deletePassportUnitAppAccess(id: string): Promise<void> {
  await db.delete(passportUnitAppAccess).where(eq(passportUnitAppAccess.id, id))
}
