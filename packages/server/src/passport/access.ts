import { randomUUID } from 'node:crypto'
import {
  hasAppAccess,
  rolesAtUnits,
  type RelationPayload,
  type UnitAppAccessPayload,
  type UnitAppMembershipPayload,
  type UnitPayload,
} from '@missiongroupsystems/passport-client'
import {
  findPassportMembershipsByEmail,
  getPassportEntitlement,
  getPassportIdentityLink,
  getPassportMembership,
  listActivePassportMemberships,
  listPassportUnitAppAccess,
  listPassportUnitAppMemberships,
  listPassportUnitRelations,
  listPassportUnits,
  replacePassportIdentityLink,
  type PassportMembershipRow,
} from '@brandfactory/db'
import { passportPlacement, type PassportPlacement } from './registry'

/**
 * Deriving access from the projection, and writing this app's identity link.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 4b–4c.
 *
 * ---------------------------------------------------------------------------
 * There is no per-user, per-app grant row. Access is DERIVED from six facts.
 * ---------------------------------------------------------------------------
 *
 * ```
 * access(user, app, org) ⟺ entitlement(org, app).status = active
 *                        ∧ the user holds an ACTIVE org membership   -- a FULL gate
 *                        ∧ ∃ unit U in org, U.status = active, with unit_app_access(U, app)
 *                        ∧ ( ∃ active unit_app_membership(user, U, app)  -- Manager | Staff
 *                          ∨ the cascade, when role_cascade is true      -- inherited
 *                          ∨ user's org role ∈ {Owner, Admin} )          -- the LADDER
 * ```
 *
 * **Never hand-roll that join.** A hand-written version drifts: it forgets
 * `unit.status`, or the ladder, or that a unit carrying no `unit_app_access` row
 * confers nothing even to an Owner, or the org filter, or the cascade. The SDK's
 * `rolesAtUnits` is the one implementation, and `hasAppAccess` is *defined* as the
 * emptiness of its result, so the two cannot disagree.
 *
 * **There is no unit-TYPE test in the rule, and there must not be one here.**
 * Placement is enforced by Passport's database triggers, so a `unit_app_access` row
 * that exists is already well-typed. `unitScopes` says where rows *can* be created
 * — a question for seeding and for the UI, not for an access check. The reverse
 * does not hold: a row can outlive the placement that permitted it.
 *
 * ---------------------------------------------------------------------------
 * The result is a MAP. Do not collapse it.
 * ---------------------------------------------------------------------------
 *
 * A person may be `Manager` at one unit and `Staff` at another, and Passport is
 * explicit that there is no "effective role". `Object.values(roles).includes(...)`
 * anywhere on a request path is the tell that a global flag has been reinstated
 * under a new name — which is the over-grant this whole model removes.
 */

export interface PassportAccess {
  platformUserId: string
  organizationId: string
  /** `Owner | Admin | Member`, or null when there is no ACTIVE org membership. */
  orgRole: string | null
  /** `unitId -> 'Manager' | 'Staff'`. A MAP; there is no effective role. */
  rolesByUnit: Record<string, string>
  hasAccess: boolean
}

/**
 * The projection reads this service needs, as a dependency.
 *
 * Injected so the derivation can be tested against fixtures with no database —
 * which matters more here than anywhere else in the integration, because the
 * ladder, the suspension gate and cross-org denial are each a silent
 * over-permission or a silent lockout, and none of them is visible in a
 * happy-path test.
 */
export interface PassportReader {
  getMembership: typeof getPassportMembership
  listActiveMemberships: typeof listActivePassportMemberships
  findMembershipsByEmail: typeof findPassportMembershipsByEmail
  getEntitlement: typeof getPassportEntitlement
  listUnits: typeof listPassportUnits
  listUnitAppAccess: typeof listPassportUnitAppAccess
  listUnitAppMemberships: typeof listPassportUnitAppMemberships
  listUnitRelations: typeof listPassportUnitRelations
  getIdentityLink: typeof getPassportIdentityLink
  replaceIdentityLink: typeof replacePassportIdentityLink
}

export const realPassportReader: PassportReader = {
  getMembership: getPassportMembership,
  listActiveMemberships: listActivePassportMemberships,
  findMembershipsByEmail: findPassportMembershipsByEmail,
  getEntitlement: getPassportEntitlement,
  listUnits: listPassportUnits,
  listUnitAppAccess: listPassportUnitAppAccess,
  listUnitAppMemberships: listPassportUnitAppMemberships,
  listUnitRelations: listPassportUnitRelations,
  getIdentityLink: getPassportIdentityLink,
  replaceIdentityLink: replacePassportIdentityLink,
}

export interface PassportAccessDeps {
  reader?: PassportReader
  /** Defaults to the placement read at startup. */
  placement?: () => PassportPlacement
  /** Injected only so tests need no crypto stubbing. */
  newId?: () => string
}

export function createPassportAccess(deps: PassportAccessDeps = {}) {
  const reader = deps.reader ?? realPassportReader
  const getPlacement = deps.placement ?? passportPlacement
  const newId = deps.newId ?? randomUUID

  /**
   * Derive one person's access in one org, keyed on the platform user.
   *
   * Split from the subject-keyed version below because the hosted-login access
   * gate runs **before any session exists** — there is no subject to look up a
   * link by, and the link may not exist at all on a first login. Sharing one
   * implementation is the point: a second copy would drift from the ladder or the
   * entitlement check, and a divergence between "what the gate allowed" and "what
   * the request path derives" presents as an empty app.
   */
  async function forPlatformUser(
    platformUserId: string,
    organizationId: string,
  ): Promise<PassportAccess> {
    const placement = getPlacement()

    const [membership, entitlement, units, accesses, roleRows, relations] = await Promise.all([
      reader.getMembership(platformUserId, organizationId),
      reader.getEntitlement(organizationId, placement.appId),
      reader.listUnits(organizationId),
      reader.listUnitAppAccess(organizationId),
      reader.listUnitAppMemberships(platformUserId, organizationId),
      reader.listUnitRelations(organizationId),
    ])

    // `orgRole` is null for ANY membership that is not active, and that is a FULL
    // gate rather than merely a ladder gate. Suspension deliberately does not
    // cascade to role rows — which is what makes it reversible and lossless — so a
    // suspended member's rows are still `active`, and `role ?? null` would let a
    // disabled person keep working.
    const orgRole = membership?.status === 'active' ? membership.role : null

    const input = {
      orgId: organizationId,
      // No entitlement row is NOT "active". Defaulting the other way would grant
      // everything in an org this app was never entitled to.
      entitlementStatus: entitlement?.status ?? 'inactive',
      orgRole,
      memberships: roleRows.map(toUnitAppMembership),
      unitsById: new Map(units.map((u) => [u.id, toUnit(u)])),
      appAccesses: accesses.map(toUnitAppAccess),
      // Both required by the TypeScript SDK, precisely because omitting a cascade
      // input is otherwise silent. `relations` is passed unconditionally even
      // though it changes no answer while `roleCascade` is false, so a later
      // narrowing of placement is a restart rather than a hunt for a missing
      // argument that makes inherited roles vanish.
      unitScopes: placement.unitScopes,
      roleCascade: placement.roleCascade,
      relations: relations.map(toRelation),
    }

    return {
      platformUserId,
      organizationId,
      orgRole,
      rolesByUnit: rolesAtUnits(input),
      hasAccess: hasAppAccess(input),
    }
  }

  /**
   * Derive access for a session subject.
   *
   * Returns null when the subject has no identity link — an unlinked session is
   * simply not a Passport user yet, which is a normal state on a first login rather
   * than an error.
   */
  async function forSubject(
    subject: string,
    organizationId: string,
  ): Promise<PassportAccess | null> {
    const link = await reader.getIdentityLink(subject, getPlacement().appId)
    if (!link) return null
    return forPlatformUser(link.platformUserId, organizationId)
  }

  /**
   * Resolve a verified email to its ACTIVE membership, refusing to guess.
   *
   * **Fails closed on ambiguity.** Two case-variant memberships mean the app cannot
   * know which person it is looking at, and on a path that hands out a session,
   * picking the first silently authenticates somebody as the wrong user.
   */
  async function membershipForEmail(
    email: string,
  ): Promise<
    { ok: true; membership: PassportMembershipRow } | { ok: false; reason: 'none' | 'ambiguous' }
  > {
    const matches = await reader.findMembershipsByEmail(email)
    if (matches.length > 1) return { ok: false, reason: 'ambiguous' }
    const first = matches[0]
    if (!first) return { ok: false, reason: 'none' }
    return { ok: true, membership: first }
  }

  /**
   * Write THIS app's identity-link row. Called on **every** login, not just the
   * first.
   *
   * This is the one sanctioned local write into `passport.*`, and it is sanctioned
   * because the row we need is not the row Passport holds: Passport's copy carries a
   * subject from *its* project, which would look linked and resolve to nobody.
   *
   * - **`subject`** is whatever this app's session resolves to. Under the login
   *   model that lands in phase 6, that is Passport's `sub` for a hosted-login
   *   session and BrandFactory's own for an app-native one. Both are correct: the
   *   rule is *the value the session resolves to*, never the label on it.
   * - **`platformUserId`** comes from the membership projection **by verified
   *   email** — never from a token's `sub` claim, which is an auth-user id from a
   *   different UUID space and is confirmed not to coincide. A wrong value here is
   *   worse than a missing row: it looks linked, resolves to zero orgs forever, and
   *   nothing errors.
   * - **Replace, don't update**, because `identity_link` rows are immutable per row
   *   in Passport's model — and replacing is what self-heals a row written with a
   *   wrong `platform_user_id` before that was understood.
   *
   * Do NOT call the SDK's `reportIdentityLink`: it is closed by policy and answers
   * `410`, and on the hosted-login branch it was always a silent no-op anyway,
   * because it verifies the token against *our* registered issuer while a
   * hosted-login token is issued by *Passport's*.
   *
   * Returns the platform user id, or null when the email matches no active
   * membership — the normal state for somebody who can sign in here but is not in
   * Passport.
   */
  async function linkIdentity(subject: string, verifiedEmail: string): Promise<string | null> {
    const resolved = await membershipForEmail(verifiedEmail)
    if (!resolved.ok) return null

    await reader.replaceIdentityLink({
      id: newId(),
      platformUserId: resolved.membership.platformUserId,
      appId: getPlacement().appId,
      subject,
      linkedVia: 'email_match',
    })

    return resolved.membership.platformUserId
  }

  /**
   * The orgs a platform user may act in.
   *
   * **This is how `organizationId` reaches every derivation (rule 9)** — from the
   * acting user's membership, never from configuration. A configured org read on
   * the request path is the single-org bug, and it makes an Owner of org A a Manager
   * across org B.
   */
  async function organizationsFor(platformUserId: string): Promise<PassportMembershipRow[]> {
    return reader.listActiveMemberships(platformUserId)
  }

  return { forPlatformUser, forSubject, membershipForEmail, linkIdentity, organizationsFor }
}

export type PassportAccessService = ReturnType<typeof createPassportAccess>

// ---------------------------------------------------------------------------
// Projection row -> wire payload shape, which is what the access helper consumes
// ---------------------------------------------------------------------------
//
// The helper takes the payload shapes rather than our camelCase rows, so these
// three mappers are the boundary. They are the inverse of the handlers' mapping and
// deliberately total: a field dropped here is a field the derivation cannot see.

type UnitRow = Awaited<ReturnType<typeof listPassportUnits>>[number]
type UamRow = Awaited<ReturnType<typeof listPassportUnitAppMemberships>>[number]
type UaaRow = Awaited<ReturnType<typeof listPassportUnitAppAccess>>[number]
type RelRow = Awaited<ReturnType<typeof listPassportUnitRelations>>[number]

const toUnit = (r: UnitRow): UnitPayload => ({
  id: r.id,
  organization_id: r.organizationId,
  type: r.type,
  name: r.name,
  external_ref: r.externalRef,
  status: r.status,
  version: r.version,
  uen: r.uen,
  gst_reg_no: r.gstRegNo,
  registered_address: r.registeredAddress,
  address: r.address,
  postal: r.postal,
  contact_phone: r.contactPhone,
  kind: r.kind,
})

const toUnitAppMembership = (r: UamRow): UnitAppMembershipPayload => ({
  id: r.id,
  organization_id: r.organizationId,
  platform_user_id: r.platformUserId,
  unit_id: r.unitId,
  app_id: r.appId,
  role: r.role,
  status: r.status,
  version: r.version,
})

const toUnitAppAccess = (r: UaaRow): UnitAppAccessPayload => ({
  id: r.id,
  organization_id: r.organizationId,
  unit_id: r.unitId,
  app_id: r.appId,
})

const toRelation = (r: RelRow): RelationPayload => ({
  id: r.id,
  organization_id: r.organizationId,
  from_unit_id: r.fromUnitId,
  to_unit_id: r.toUnitId,
  relation: r.relation,
})
