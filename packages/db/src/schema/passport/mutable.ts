import { index, integer, text, uuid } from 'drizzle-orm/pg-core'
import { passportSchema } from './schema'

// The five MUTABLE aggregates. Each carries `version`, and each is applied with
// a version guard: `ON CONFLICT (id) DO UPDATE ... WHERE stored.version <=
// excluded.version`.
//
// The `<=` is load-bearing. Passport retries on any non-2xx, so an
// equal-version replay is normal traffic rather than an edge case, and it must
// re-apply idempotently. Strictly-greater drops it and breaks the property the
// whole receive contract rests on.
//
// See `./schema.ts` for why there are no foreign keys and no constraints beyond
// the primary key.

/**
 * `org.upserted` / `org.archived`.
 *
 * **Archive arrives as a status change on a bumped version, not as a delete** —
 * so both event types run through the same upsert. `status` is
 * `active | suspended | archived`.
 */
export const passportOrganization = passportSchema.table(
  'organization',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    status: text('status').notNull(),
    version: integer('version').notNull(),
  },
  (t) => [index('passport_organization_slug_idx').on(t.slug)],
)

/**
 * `unit.upserted` / `unit.archived` — the structure directory.
 *
 * `type` is `entity | brand | outlet`. **All three are projected regardless of
 * this app's placement** (rule 2): `unit_scopes` governs where ROLES may sit,
 * never which units are delivered. Which units arrive is decided by the org's
 * entitlement.
 *
 * `name` is the **LEGAL / registered** name, because this is a directory shared
 * with sibling Mission Systems apps and used for statutory output — `Casa Vostra
 * Pte. Ltd.` where staff read `Casa Vostra`. A short display label is a concept
 * Passport does not model, so it belongs in an app-owned refinement table keyed
 * by this `id`; phase 8 carries BrandFactory's brand names across before the
 * local table is dropped, or every picker and prompt silently switches to
 * "Pte. Ltd." names with nothing erroring.
 *
 * The seven profile columns are **sparse by type**, and Passport enforces it
 * (`PROFILE_FIELDS_BY_TYPE`): an entity carries `uen` / `gst_reg_no` /
 * `registered_address`, an outlet carries `address` / `postal` /
 * `contact_phone` / `kind`, and a **brand carries none** — a brand is a concept,
 * and concepts have neither an address nor a tax registration.
 *
 * `description` is deliberately absent and always will be. Passport has the
 * column and never ships it in `UnitPayload`, by push or by pull, so a copy here
 * could never be filled. BrandFactory's own brand description is therefore
 * app-owned, not a duplicate.
 */
export const passportUnit = passportSchema.table(
  'unit',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    type: text('type').notNull(),
    name: text('name').notNull(),
    externalRef: text('external_ref'),
    status: text('status').notNull(),
    version: integer('version').notNull(),
    // Directory profile. Nullable and sparse by type, per the note above.
    uen: text('uen'),
    gstRegNo: text('gst_reg_no'),
    registeredAddress: text('registered_address'),
    address: text('address'),
    postal: text('postal'),
    contactPhone: text('contact_phone'),
    kind: text('kind'),
  },
  (t) => [
    index('passport_unit_org_idx').on(t.organizationId),
    index('passport_unit_type_idx').on(t.type),
  ],
)

/**
 * `membership.upserted` / `membership.removed` — org membership.
 *
 * **`status = 'removed'` is KEPT as a tombstone**, and the handler for
 * `.removed` is an upsert. `status` is `active | suspended | removed`.
 *
 * `role` governs Passport rather than BrandFactory, with one critical exception:
 * the **LADDER**. An active org `Owner` or `Admin` holds `Manager` in every
 * entitled app at every unit carrying it, **with no `unit_app_membership` row at
 * all**. That is why this row is an input to access derivation, and why passing
 * `orgRole` is mandatory — omit it and every Owner and Admin is silently denied.
 *
 * **`suspended` is the reason the derivation reads `status` and not just
 * `role`.** Suspension deliberately does NOT cascade to role rows — that is what
 * makes it reversible and lossless — so a suspended member's rows are still
 * `active`. The access helper treats a null `orgRole` as a FULL gate, so the
 * caller must pass `null` for anything that is not `active`.
 *
 * `email` is the resolution key for identity linking, matched
 * case-insensitively against the verified email on the session. It is indexed
 * for that, and it is embedded here rather than in a `passport.user` table
 * because the payload carries it and the snapshot has no `users` collection to
 * reconcile a mirror against.
 */
export const passportMembership = passportSchema.table(
  'membership',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    platformUserId: uuid('platform_user_id').notNull(),
    role: text('role').notNull(),
    status: text('status').notNull(),
    version: integer('version').notNull(),
    email: text('email').notNull(),
    displayName: text('display_name'),
  },
  (t) => [
    index('passport_membership_platform_user_idx').on(t.platformUserId),
    index('passport_membership_org_idx').on(t.organizationId),
    index('passport_membership_email_idx').on(t.email),
  ],
)

/**
 * `entitlement.upserted` — the org-level kill switch.
 *
 * **Revocation arrives HERE as a status change.** There is no
 * entitlement-remove event, and a revocation must never be filtered out:
 * `status != 'active'` denies everyone in the org, Owners included.
 *
 * It does not cascade — no other row changes — so restoring the entitlement
 * restores the exact prior configuration by arithmetic. Never delete rows in
 * response to a revocation.
 *
 * `status` is `active | inactive | suspended`; `source` is `admin | stripe`.
 */
export const passportEntitlement = passportSchema.table(
  'entitlement',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    appId: uuid('app_id').notNull(),
    status: text('status').notNull(),
    tier: text('tier'),
    source: text('source').notNull(),
    version: integer('version').notNull(),
  },
  (t) => [index('passport_entitlement_org_idx').on(t.organizationId)],
)

/**
 * `unit_app_membership.upserted` / `.removed` — the per-(user, unit, app) role.
 *
 * `role` is `Manager | Staff`, which is **a different vocabulary** from
 * `membership.role` above. Never conflate the two.
 *
 * Delivered **own-app scoped**, so do NOT filter by `app_id` when projecting:
 * the delivery filter has already done it, and re-filtering makes our delivery
 * scope narrower than the snapshot scope, which reconciliation then reports as
 * permanent phantom drift it can never clear.
 *
 * `.removed` carries the final aggregate — a version-guarded upsert keeping
 * `status = 'removed'`, not a delete.
 *
 * **A row here is never authorisation on its own.** Access is derived from six
 * facts together; read it through the access helper, never as a lookup of this
 * table alone.
 */
export const passportUnitAppMembership = passportSchema.table(
  'unit_app_membership',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    platformUserId: uuid('platform_user_id').notNull(),
    unitId: uuid('unit_id').notNull(),
    appId: uuid('app_id').notNull(),
    role: text('role').notNull(),
    status: text('status').notNull(),
    version: integer('version').notNull(),
  },
  (t) => [
    index('passport_unit_app_membership_platform_user_idx').on(t.platformUserId),
    index('passport_unit_app_membership_unit_idx').on(t.unitId),
    index('passport_unit_app_membership_org_idx').on(t.organizationId),
  ],
)
