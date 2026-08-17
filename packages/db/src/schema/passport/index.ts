/**
 * The Passport projection — **all eight aggregates**, in one place on purpose.
 *
 * Rule 2 of the sync contract is "project all eight, not a subset you think you
 * need", and the four `unit_app_*` / relation tables are the ones most easily
 * skipped: omit `unit_app_access` or `unit_app_membership` and no roles or no
 * app switches land at all, so access derivation returns an empty map forever
 * with nothing erroring.
 *
 * So this file is the checklist, and `PASSPORT_PROJECTION_TABLES` below is the
 * machine-readable version of it. `schema/passport/projection.test.ts` asserts
 * the count, which is what stops a future edit quietly dropping one.
 *
 * | Aggregate              | Table                            | Applied |
 * | ---------------------- | -------------------------------- | ------- |
 * | organization           | `passport.organization`           | version-guarded upsert |
 * | unit                   | `passport.unit`                   | version-guarded upsert |
 * | membership             | `passport.membership`             | version-guarded upsert (tombstone) |
 * | entitlement            | `passport.entitlement`            | version-guarded upsert (kill switch) |
 * | unit_app_membership    | `passport.unit_app_membership`    | version-guarded upsert (tombstone) |
 * | unit_relation          | `passport.unit_relation`          | insert-if-absent / delete |
 * | identity_link          | `passport.identity_link`          | insert-if-absent / delete |
 * | unit_app_access        | `passport.unit_app_access`        | insert-if-absent / delete |
 *
 * There is deliberately **no `passport.user` table**. `user.upserted` carries
 * only fields `passport.membership` already embeds (`email`, `display_name`), and
 * the reconciliation snapshot has no `users` collection — so a mirror could drift
 * with nothing able to detect it. The handler for that event still exists and is
 * still correctly named, because an absent handler is indistinguishable from a
 * typo and both are silent.
 *
 * Doctrine, and why this is not a cache: `./schema.ts`.
 */
export { passportSchema } from './schema'

export {
  passportOrganization,
  passportUnit,
  passportMembership,
  passportEntitlement,
  passportUnitAppMembership,
} from './mutable'

export { passportUnitRelation, passportIdentityLink, passportUnitAppAccess } from './immutable'

import {
  passportOrganization,
  passportUnit,
  passportMembership,
  passportEntitlement,
  passportUnitAppMembership,
} from './mutable'
import { passportUnitRelation, passportIdentityLink, passportUnitAppAccess } from './immutable'

/**
 * The five aggregates carrying `version`, applied with a `>=` guard so an
 * equal-version replay re-applies idempotently.
 */
export const PASSPORT_MUTABLE_TABLES = [
  passportOrganization,
  passportUnit,
  passportMembership,
  passportEntitlement,
  passportUnitAppMembership,
] as const

/**
 * The three without a `version`, applied insert-if-absent / delete-if-present.
 * Their `.removed` events are real deletes, not tombstones.
 */
export const PASSPORT_IMMUTABLE_TABLES = [
  passportUnitRelation,
  passportIdentityLink,
  passportUnitAppAccess,
] as const

/** All eight. The count is asserted by `projection.test.ts`. */
export const PASSPORT_PROJECTION_TABLES = [
  ...PASSPORT_MUTABLE_TABLES,
  ...PASSPORT_IMMUTABLE_TABLES,
] as const
