import { pgSchema } from 'drizzle-orm/pg-core'

/**
 * The `passport` namespace — Mission Passport's read model, projected here.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 2.
 * Decision record: `docs/executing/passport-sync-consumer-proposal.md`.
 *
 * ---------------------------------------------------------------------------
 * These tables are not a cache beside BrandFactory's org model. They ARE it.
 * ---------------------------------------------------------------------------
 *
 * Passport is the source of truth for organisations, structure units, platform
 * users, memberships, roles and entitlements. From phase 8 the local
 * `workspaces` and `brands` tables are gone and the permission code reads these
 * rows directly. Do not add a local table carrying any fact below, and do not
 * write a job that copies these rows into one — that job *is* the bug, because
 * the projection was already the answer.
 *
 * A dedicated Postgres **schema** rather than a `passport_` table prefix, for
 * two reasons that survive the absence of a second database role:
 *
 *   1. **Foreign data is obvious in every query.** `passport.unit` reads as "not
 *      my table, not mine to write".
 *   2. **It is what a future `REVOKE` attaches to.** One
 *      `REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA passport` makes
 *      read-only a database guarantee the day it is worth having.
 *
 * ---------------------------------------------------------------------------
 * Read-only by test, not by privilege — and why that is the choice here
 * ---------------------------------------------------------------------------
 *
 * The reference consumers for this integration are Supabase apps where the
 * BROWSER holds a database connection through PostgREST. There an untrusted
 * `authenticated` role has real table privileges, and the `REVOKE` above is
 * load-bearing: without it a client writes the projection directly.
 *
 * BrandFactory has no such principal. Every read and write goes through the Hono
 * server, which is the only thing that connects to Postgres, as one role. So the
 * only writer a `REVOKE` could exclude is our own request path — a developer
 * mistake, not a privilege escalation. That is caught earlier and far more
 * legibly by `src/passport-write-guard.test.ts`, which names the file and line.
 *
 * The trade is honest rather than free: a runtime denial would also catch
 * dynamically-built SQL that a source sweep cannot see. Reopen the decision if
 * the browser ever talks to Postgres directly, or if the projection ever needs
 * to be readable by a principal that is not this server.
 *
 * ---------------------------------------------------------------------------
 * Four properties that are load-bearing, not stylistic
 * ---------------------------------------------------------------------------
 *
 * 1. **Passport UUIDs are the primary keys, verbatim.** Never re-keyed to a
 *    serial, and never a `passport_unit_id` side column beside a local id —
 *    that is a shadow table with extra steps.
 *
 * 2. **There are deliberately NO foreign keys between these tables, and no
 *    constraint beyond the primary key.** Sync events are replay- and
 *    out-of-order-safe by contract: a `unit.upserted` can legitimately arrive
 *    before the `org.upserted` that would satisfy an FK. A constraint here would
 *    reject the event, the receiver would answer 500, and Passport's delivery
 *    worker would retry it forever. Referential integrity is Passport's job on
 *    the write side; ours is to accept whatever arrives.
 *
 * 3. **Mutable and immutable are different aggregates, applied differently.**
 *    `mutable.ts` holds the five tables carrying `version`, applied with a `>=`
 *    guard so an equal-version replay re-applies idempotently. `immutable.ts`
 *    holds the three without one, applied insert-if-absent / delete-if-present.
 *
 * 4. **`status = 'removed'` is a TOMBSTONE, never a delete.** Both
 *    `membership.removed` and `unit_app_membership.removed` carry the final
 *    aggregate and are version-guarded UPSERTS. Delete the row instead and
 *    nightly reconciliation resurrects it from the snapshot — which reads as a
 *    revoked user silently regaining access.
 *
 * Role vocabularies are stored VERBATIM and there are TWO of them:
 * `membership.role` is `Owner | Admin | Member` and governs Passport;
 * `unit_app_membership.role` is `Manager | Staff` and governs this app. Never
 * conflate them, and never map either onto a local enum.
 */
export const passportSchema = pgSchema('passport')
