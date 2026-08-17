import { index, text, uuid } from 'drizzle-orm/pg-core'
import { passportSchema } from './schema'

// The three IMMUTABLE aggregates. None carries `version`, because none is ever
// updated: they are created and hard-removed. So they are applied
// insert-if-absent / delete-if-present, and their `.removed` events are real
// deletes — unlike the tombstones in `./mutable.ts`.
//
// See `./schema.ts` for why there are no foreign keys. That reasoning extends to
// UNIQUE constraints here, and the temptation is real — see the note on
// `passportIdentityLink`.

/**
 * `unit_relation.created` / `.removed` — the structure edges.
 *
 * Exactly three are legal, and Passport enforces the type pairing
 * (`REQUIRED_PAIRING`) server-side, so cycles are impossible by construction and
 * there is nothing for this app to validate:
 *
 * | `relation`           | from   | to     |
 * | -------------------- | ------ | ------ |
 * | `belongs_to_brand`   | outlet | brand  |
 * | `operated_by_entity` | outlet | entity |
 * | `owned_by_entity`    | brand  | entity |
 *
 * The third is the only one not originating at an outlet, and it is optional — a
 * brand with no owning entity is a normal state. **Branching with an if/else on
 * two of the three silently misfiles the third**; match exhaustively.
 *
 * Two uses here, and neither is app inheritance (that concept was deleted
 * upstream — a unit grants only its own `unit_app_access`):
 *
 *   - showing which brand or entity a unit sits under;
 *   - carrying the **role cascade** when an app's `role_cascade` is true.
 *     BrandFactory's placement is all three unit types, and Passport permits a
 *     cascade only on exactly `{entity, outlet}` or `{brand, outlet}` — so ours
 *     is necessarily off and this table is descriptive for us today. It is
 *     projected regardless, because rule 2 requires all eight aggregates and
 *     because a later narrowing of placement is then a restart rather than a
 *     migration.
 */
export const passportUnitRelation = passportSchema.table(
  'unit_relation',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    fromUnitId: uuid('from_unit_id').notNull(),
    toUnitId: uuid('to_unit_id').notNull(),
    relation: text('relation').notNull(),
  },
  (t) => [
    index('passport_unit_relation_from_idx').on(t.fromUnitId),
    index('passport_unit_relation_to_idx').on(t.toUnitId),
    index('passport_unit_relation_org_idx').on(t.organizationId),
  ],
)

/**
 * `identity_link.created` / `.removed` — the bridge from a local auth subject to
 * a Passport platform user.
 *
 * **This is the one projection table BrandFactory writes itself**, on every
 * login, and it is the single sanctioned local write into `passport.*`. That is
 * not a workaround: `subject` must be the subject this app's own session
 * resolves to, and Passport's copy of the row carries a subject from Passport's
 * project, which would look linked and resolve to nobody.
 *
 * `platform_user_id` is resolved from `passport.membership` by **verified
 * email** — never from a token's `sub` claim, which is a Supabase auth-user id
 * from a different UUID space and is confirmed not to coincide. A wrong value
 * here is worse than a missing row: it looks linked, resolves to zero orgs
 * forever, and nothing errors.
 *
 * `linked_via` is `import | email_match | manual`.
 *
 * ---------------------------------------------------------------------------
 * Why there is NO unique index on (subject, app_id), even though we want one
 * ---------------------------------------------------------------------------
 *
 * Our own writer is idempotent per `(subject, app_id)` and replaces rather than
 * updates, so a unique index looks like free enforcement of an invariant we
 * already hold. It is not free. The wire does not guarantee it: if Passport ever
 * delivered two links sharing a subject, insert-if-absent would take both today,
 * and with a unique index the second delivery would raise, the receiver would
 * answer 500, and the delivery worker would retry it **forever**.
 *
 * That is the same reasoning that rules out foreign keys (`./schema.ts`), and it
 * applies to every constraint beyond the primary key: a constraint the wire does
 * not promise converts a data condition into a retry storm. Idempotency stays
 * procedural, in the writer.
 *
 * Reconciliation is **upsert-only** for this collection: a snapshot's
 * `identity_links` are a per-org SUBSET and never authoritative, so a pruning
 * reconciler would delete the very rows that make sessions resolve — and they
 * would not come back until each user logged in again.
 */
export const passportIdentityLink = passportSchema.table(
  'identity_link',
  {
    id: uuid('id').primaryKey(),
    platformUserId: uuid('platform_user_id').notNull(),
    appId: uuid('app_id').notNull(),
    subject: text('subject').notNull(),
    linkedVia: text('linked_via').notNull(),
  },
  (t) => [
    // The request-path lookup: resolve a session's subject to a platform user.
    index('passport_identity_link_subject_idx').on(t.subject, t.platformUserId),
    index('passport_identity_link_platform_user_idx').on(t.platformUserId),
  ],
)

/**
 * `unit_app_access.created` / `.removed` — the unit↔app switch, "this unit uses
 * BrandFactory".
 *
 * **A unit with no row here confers access to NOBODY**, not even an org `Owner`:
 * the ladder still requires a unit that carries the app. Creating a brand does
 * not switch BrandFactory on at it — that is a separate act, and forgetting it
 * makes every derivation return an empty map with no error anywhere.
 *
 * Delivered own-app scoped, like `unit_app_membership`, so do not filter by
 * `app_id` when projecting.
 *
 * Immutable: removal is a real delete, unlike the membership tombstones.
 */
export const passportUnitAppAccess = passportSchema.table(
  'unit_app_access',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    unitId: uuid('unit_id').notNull(),
    appId: uuid('app_id').notNull(),
  },
  (t) => [
    index('passport_unit_app_access_unit_idx').on(t.unitId),
    index('passport_unit_app_access_org_idx').on(t.organizationId),
  ],
)
