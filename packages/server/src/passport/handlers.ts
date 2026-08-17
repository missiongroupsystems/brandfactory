import type {
  EntitlementPayload,
  IdentityLinkPayload,
  MembershipPayload,
  OrgPayload,
  RelationPayload,
  ResyncPayload,
  SyncHandlers,
  UnitAppAccessPayload,
  UnitAppMembershipPayload,
  UnitPayload,
  UserPayload,
} from '@missiongroupsystems/passport-client'
import {
  deletePassportIdentityLink,
  deletePassportUnitAppAccess,
  deletePassportUnitRelation,
  writePassportEntitlement,
  writePassportIdentityLink,
  writePassportMembership,
  writePassportOrganization,
  writePassportUnit,
  writePassportUnitAppAccess,
  writePassportUnitAppMembership,
  writePassportUnitRelation,
} from '@brandfactory/db'

/**
 * The 17 sync handlers — Passport events → the `passport.*` projection.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 3.
 *
 * ---------------------------------------------------------------------------
 * Three handlers do NOT do what their names suggest
 * ---------------------------------------------------------------------------
 *
 * 1. **`removeMembership` is an UPSERT, not a delete.** `membership.removed`
 *    carries the FINAL aggregate — `status='removed'`, version bumped. Keep the
 *    row: deleting it loses the tombstone, and nightly reconciliation then
 *    resurrects the membership from the snapshot, which reads as a revoked user
 *    silently regaining access.
 * 2. **`upsertEntitlement` also carries REVOCATION.** There is no
 *    entitlement-remove event; a revocation arrives as `entitlement.upserted`
 *    with `status != 'active'`. It is the org-level kill switch and must never be
 *    filtered out.
 * 3. **`removeUnitAppMembership` is the same trap as (1).**
 *
 * Only `removeRelation`, `removeIdentityLink` and `removeUnitAppAccess` delete
 * anything — the three immutable aggregates, which carry no version.
 *
 * ---------------------------------------------------------------------------
 * Why an object of closures rather than a class
 * ---------------------------------------------------------------------------
 *
 * `applyEvent` resolves a handler by property lookup and calls it **detached**:
 *
 *     const handler = handlers[entry.method]
 *     await handler(payload)              // `this` is undefined in here
 *
 * A class whose handlers delegate through `this.` therefore throws on the first
 * real delivery — five of the seventeen would, since the archive and remove
 * handlers reuse their upsert. It is invisible to `tsc`, because the call is
 * well-typed, and a test asserting the methods *exist* passes happily. The
 * reference consumer found it by driving a real signed `membership.removed` at a
 * running receiver, which answered 500 and left a revoked member's row `active`.
 *
 * Closures have no `this` to lose, so the trap cannot occur here rather than
 * being patched with a constructor that rebinds every method. `handlers.test.ts`
 * still exercises the detached call, because the property that matters is
 * "survives being called detached", not "is implemented as a closure".
 *
 * ---------------------------------------------------------------------------
 * Two things NOT to add
 * ---------------------------------------------------------------------------
 *
 * - **No `app_id` filter.** `unit_app_*` and `identity_link` events are delivered
 *   own-app scoped. Re-filtering locally makes our delivery scope narrower than
 *   the snapshot scope, and reconciliation then reports permanent phantom drift it
 *   can never clear.
 * - **No org filter.** Rule 9: every org Passport delivers is projected. A
 *   configured-org comparison here silently discards another org's events —
 *   permanently, with the handler returning cleanly and the route answering 200.
 *
 * Errors PROPAGATE. The route turns them into a 500 so Passport's worker retries.
 * Never swallow one: a swallowed error acks an event that was never applied, and
 * the projection loses it forever.
 */

/**
 * The projection's write surface, as a dependency.
 *
 * Injected rather than imported inside the handlers so `handlers.test.ts` can
 * assert the wire→row mapping with no database. The default binds the real
 * helpers from `@brandfactory/db`, which are deliberately absent from the `Db`
 * facade that route handlers receive — a route cannot reach them through its deps.
 */
export interface PassportProjectionWriter {
  writeOrganization: typeof writePassportOrganization
  writeUnit: typeof writePassportUnit
  writeMembership: typeof writePassportMembership
  writeEntitlement: typeof writePassportEntitlement
  writeUnitAppMembership: typeof writePassportUnitAppMembership
  writeUnitRelation: typeof writePassportUnitRelation
  deleteUnitRelation: typeof deletePassportUnitRelation
  writeIdentityLink: typeof writePassportIdentityLink
  deleteIdentityLink: typeof deletePassportIdentityLink
  writeUnitAppAccess: typeof writePassportUnitAppAccess
  deleteUnitAppAccess: typeof deletePassportUnitAppAccess
}

export const realPassportWriter: PassportProjectionWriter = {
  writeOrganization: writePassportOrganization,
  writeUnit: writePassportUnit,
  writeMembership: writePassportMembership,
  writeEntitlement: writePassportEntitlement,
  writeUnitAppMembership: writePassportUnitAppMembership,
  writeUnitRelation: writePassportUnitRelation,
  deleteUnitRelation: deletePassportUnitRelation,
  writeIdentityLink: writePassportIdentityLink,
  deleteIdentityLink: deletePassportIdentityLink,
  writeUnitAppAccess: writePassportUnitAppAccess,
  deleteUnitAppAccess: deletePassportUnitAppAccess,
}

export function createPassportSyncHandlers(
  writer: PassportProjectionWriter = realPassportWriter,
): SyncHandlers {
  // Declared before the object so `resyncOrg` can fan out to them without `this`.
  const upsertOrg = (p: OrgPayload) =>
    writer.writeOrganization({
      id: p.id,
      name: p.name,
      slug: p.slug,
      status: p.status,
      version: p.version,
    })

  const upsertUnit = (p: UnitPayload) =>
    writer.writeUnit({
      id: p.id,
      organizationId: p.organization_id,
      type: p.type,
      name: p.name,
      externalRef: p.external_ref,
      status: p.status,
      version: p.version,
      uen: p.uen,
      gstRegNo: p.gst_reg_no,
      registeredAddress: p.registered_address,
      address: p.address,
      postal: p.postal,
      contactPhone: p.contact_phone,
      kind: p.kind,
    })

  const upsertMembership = (p: MembershipPayload) =>
    writer.writeMembership({
      id: p.id,
      organizationId: p.organization_id,
      platformUserId: p.platform_user_id,
      role: p.role,
      status: p.status,
      version: p.version,
      email: p.email,
      displayName: p.display_name,
    })

  const upsertEntitlement = (p: EntitlementPayload) =>
    writer.writeEntitlement({
      id: p.id,
      organizationId: p.organization_id,
      appId: p.app_id,
      status: p.status,
      tier: p.tier,
      source: p.source,
      version: p.version,
    })

  const upsertUnitAppMembership = (p: UnitAppMembershipPayload) =>
    writer.writeUnitAppMembership({
      id: p.id,
      organizationId: p.organization_id,
      platformUserId: p.platform_user_id,
      unitId: p.unit_id,
      appId: p.app_id,
      role: p.role,
      status: p.status,
      version: p.version,
    })

  const createRelation = (p: RelationPayload) =>
    writer.writeUnitRelation({
      id: p.id,
      organizationId: p.organization_id,
      fromUnitId: p.from_unit_id,
      toUnitId: p.to_unit_id,
      relation: p.relation,
    })

  const createIdentityLink = (p: IdentityLinkPayload) =>
    writer.writeIdentityLink({
      id: p.id,
      platformUserId: p.platform_user_id,
      appId: p.app_id,
      subject: p.subject,
      linkedVia: p.linked_via,
    })

  const createUnitAppAccess = (p: UnitAppAccessPayload) =>
    writer.writeUnitAppAccess({
      id: p.id,
      organizationId: p.organization_id,
      unitId: p.unit_id,
      appId: p.app_id,
    })

  return {
    // --- organizations ----------------------------------------------------
    upsertOrg,
    /** Archive is a status change on a bumped version, not a delete. */
    archiveOrg: upsertOrg,

    // --- units ------------------------------------------------------------
    upsertUnit,
    archiveUnit: upsertUnit,

    // --- memberships ------------------------------------------------------
    upsertMembership,
    /**
     * TRAP 1 — an UPSERT keeping `status='removed'`, never a delete.
     *
     * Rule 6 also asks for the user's live sessions to be revoked here, so a
     * removal takes effect immediately rather than at token expiry. Not wired
     * yet: BrandFactory's sessions are still issued by its own project and there
     * is no session to revoke on Passport's behalf until phase 6. Phase 7 builds
     * the subject denylist. Recorded rather than silently skipped.
     */
    removeMembership: upsertMembership,

    // --- entitlements -----------------------------------------------------
    /** TRAP 2 — revocation arrives HERE with `status != 'active'`. */
    upsertEntitlement,

    // --- unit-app memberships (the role rows) -----------------------------
    upsertUnitAppMembership,
    /** Same trap as `removeMembership` — an upsert to `status='removed'`. */
    removeUnitAppMembership: upsertUnitAppMembership,

    // --- users ------------------------------------------------------------
    /**
     * Deliberately a no-op.
     *
     * `passport.membership` already embeds `email` and `display_name`, and the
     * reconciliation snapshot has no `users` collection to reconcile a local
     * mirror against — so a `passport.user` table could drift with nothing able
     * to detect it.
     *
     * **The handler exists anyway, and the name matters.** `applyEvent` resolves
     * handlers by property lookup and skips an absent one, which is what makes
     * unknown event types forward-compatible — and also what makes a missing or
     * misspelled handler indistinguishable from a deliberate one. Declaring it
     * says "considered, and nothing to do".
     */
    upsertUser: async (_p: UserPayload): Promise<void> => {},

    // --- immutable aggregates ---------------------------------------------
    createRelation,
    removeRelation: (p: RelationPayload) => writer.deleteUnitRelation(p.id),

    createIdentityLink,
    removeIdentityLink: (p: IdentityLinkPayload) => writer.deleteIdentityLink(p.id),

    createUnitAppAccess,
    /** A real delete — `unit_app_access` is immutable and carries no tombstone. */
    removeUnitAppAccess: (p: UnitAppAccessPayload) => writer.deleteUnitAppAccess(p.id),

    // --- org.resync -------------------------------------------------------
    /**
     * Fan the manual re-sync bundle out through the per-aggregate handlers, in
     * FK-safe order.
     *
     * **UPSERT-ONLY — it must never delete a local row absent from the bundle.**
     * The bundle's `identity_links` are a per-org SUBSET and are never
     * authoritative, so this must never feed a pruning path. Convergence here is
     * additive; pruning is a separate concern that needs a per-collection
     * authority answer.
     *
     * FK-safe order is about leaving the projection coherent at every
     * intermediate point, not about constraints — there are none between these
     * tables, deliberately.
     */
    resyncOrg: async (p: ResyncPayload): Promise<void> => {
      for (const o of p.organizations) await upsertOrg(o)
      for (const u of p.units) await upsertUnit(u)
      for (const r of p.unit_relations) await createRelation(r)
      for (const m of p.memberships) await upsertMembership(m)
      for (const l of p.identity_links) await createIdentityLink(l)
      for (const e of p.entitlements) await upsertEntitlement(e)
      for (const a of p.unit_app_accesses) await createUnitAppAccess(a)
      for (const r of p.unit_app_memberships) await upsertUnitAppMembership(r)
    },
  }
}

/** The handlers the mounted route uses. Tests build their own with fakes. */
export const passportSyncHandlers: SyncHandlers = createPassportSyncHandlers()
