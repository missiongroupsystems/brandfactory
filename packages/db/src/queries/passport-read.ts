import { and, eq, sql } from 'drizzle-orm'
import { db } from '../client'
import {
  passportEntitlement,
  passportIdentityLink,
  passportMembership,
  passportUnit,
  passportUnitAppAccess,
  passportUnitAppMembership,
  passportUnitRelation,
} from '../schema/passport'

/**
 * Reads over the Passport projection.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 4.
 * Doctrine: `../schema/passport/schema.ts`.
 *
 * **Reads are PROJECTION-FIRST, and that is a decision, not a shortcut.** This
 * replica *is* the cache, and a better one than a TTL: a revocation lands in
 * roughly event latency rather than at the end of a cache window, because the
 * event removes the row rather than an expiry guessing that it might be stale.
 *
 * Two shapes are therefore rejected outright:
 *
 * - **No TTL cache in front of these queries.** It would be a worse cache (lazy
 *   expiry) in front of a better one (event invalidation), reintroducing exactly
 *   the revocation lag the projection removes.
 * - **No API-first path with the projection as a fallback.** That pays for the
 *   projection pipeline *and* adds a network hop plus a hard dependency on
 *   Passport's uptime to the hottest reads — and it gives the same authorization
 *   check strong consistency when Passport is up and eventual consistency when it
 *   is down, which is a nasty property for an authz system.
 *
 * Passport's API stays the authority for exactly two things the projection cannot
 * answer: the registry read (placement) and nightly reconciliation.
 *
 * Unlike the writes in `./passport.ts`, these are unrestricted — reading the
 * projection from anywhere is the entire point of having it.
 */

export interface PassportMembershipRow {
  role: string
  status: string
  organizationId: string
  platformUserId: string
  email: string
  displayName: string | null
}

/**
 * One person's membership of one org.
 *
 * Returns the row whatever its status, including a `removed` tombstone, because
 * the caller must be able to tell "not a member" from "no longer a member" — and
 * because collapsing that here would hide a suspension, which is the one status
 * that does NOT cascade to role rows and therefore cannot be inferred from them.
 */
export async function getPassportMembership(
  platformUserId: string,
  organizationId: string,
): Promise<PassportMembershipRow | undefined> {
  const [row] = await db
    .select({
      role: passportMembership.role,
      status: passportMembership.status,
      organizationId: passportMembership.organizationId,
      platformUserId: passportMembership.platformUserId,
      email: passportMembership.email,
      displayName: passportMembership.displayName,
    })
    .from(passportMembership)
    .where(
      and(
        eq(passportMembership.platformUserId, platformUserId),
        eq(passportMembership.organizationId, organizationId),
      ),
    )
    .limit(1)
  return row
}

/**
 * Every org this person is a member of, active memberships only.
 *
 * **This is how `organizationId` reaches the access derivation (rule 9).** It is a
 * request-path value resolved from the acting user, never a configured setting: a
 * module-level org id read on the request path *is* the single-org bug, and it
 * makes an Owner of org A a Manager across org B.
 */
export async function listActivePassportMemberships(
  platformUserId: string,
): Promise<PassportMembershipRow[]> {
  return db
    .select({
      role: passportMembership.role,
      status: passportMembership.status,
      organizationId: passportMembership.organizationId,
      platformUserId: passportMembership.platformUserId,
      email: passportMembership.email,
      displayName: passportMembership.displayName,
    })
    .from(passportMembership)
    .where(
      and(
        eq(passportMembership.platformUserId, platformUserId),
        eq(passportMembership.status, 'active'),
      ),
    )
}

/**
 * Resolve a verified email to an ACTIVE membership.
 *
 * **Matched case-insensitively**, because the projection stores the email exactly
 * as Passport sent it — which is not the case the person types, and not
 * necessarily the case their identity provider reports.
 *
 * This is the only key that bridges a session to a platform user: Passport's `sub`
 * belongs to Passport's project, and `platform_user_id` is never synced into an
 * auth provider. Never resolve from a token's `sub` claim.
 *
 * Returns EVERY match rather than the first. The count is the point: on a path
 * that hands out a session, two case-variant memberships mean the app cannot know
 * which person it is looking at, and picking one silently authorises somebody as
 * the wrong user.
 */
export async function findPassportMembershipsByEmail(
  email: string,
): Promise<PassportMembershipRow[]> {
  return db
    .select({
      role: passportMembership.role,
      status: passportMembership.status,
      organizationId: passportMembership.organizationId,
      platformUserId: passportMembership.platformUserId,
      email: passportMembership.email,
      displayName: passportMembership.displayName,
    })
    .from(passportMembership)
    .where(
      and(
        sql`lower(${passportMembership.email}) = lower(${email})`,
        eq(passportMembership.status, 'active'),
      ),
    )
}

/**
 * This app's entitlement for one org — the org-level kill switch.
 *
 * A missing row is NOT "active": the caller defaults to inactive, because
 * defaulting the other way grants everything in an org this app was never
 * entitled to.
 */
export async function getPassportEntitlement(
  organizationId: string,
  appId: string,
): Promise<{ status: string; tier: string | null } | undefined> {
  const [row] = await db
    .select({ status: passportEntitlement.status, tier: passportEntitlement.tier })
    .from(passportEntitlement)
    .where(
      and(
        eq(passportEntitlement.organizationId, organizationId),
        eq(passportEntitlement.appId, appId),
      ),
    )
    .limit(1)
  return row
}

/** Whether ANY entitlement has synced yet — the "has the projection landed" probe. */
export async function hasAnyPassportEntitlement(): Promise<boolean> {
  const [row] = await db.select({ id: passportEntitlement.id }).from(passportEntitlement).limit(1)
  return row !== undefined
}

/** Every unit of one org, all three types. Type filtering is never our job. */
export async function listPassportUnits(
  organizationId: string,
): Promise<Array<typeof passportUnit.$inferSelect>> {
  return db.select().from(passportUnit).where(eq(passportUnit.organizationId, organizationId))
}

/**
 * The unit↔app switches for one org.
 *
 * Not filtered by `app_id`: these rows arrive **own-app scoped** by the delivery
 * filter, so re-filtering would make our delivery scope narrower than the snapshot
 * scope, and reconciliation would then report permanent phantom drift.
 */
export async function listPassportUnitAppAccess(
  organizationId: string,
): Promise<Array<typeof passportUnitAppAccess.$inferSelect>> {
  return db
    .select()
    .from(passportUnitAppAccess)
    .where(eq(passportUnitAppAccess.organizationId, organizationId))
}

/**
 * One person's role rows in one org. All statuses, including `removed`
 * tombstones — the access helper is what decides a tombstone confers nothing, and
 * filtering here would hide it from the one place that reasons about it.
 */
export async function listPassportUnitAppMemberships(
  platformUserId: string,
  organizationId: string,
): Promise<Array<typeof passportUnitAppMembership.$inferSelect>> {
  return db
    .select()
    .from(passportUnitAppMembership)
    .where(
      and(
        eq(passportUnitAppMembership.platformUserId, platformUserId),
        eq(passportUnitAppMembership.organizationId, organizationId),
      ),
    )
}

/**
 * The structure edges of one org.
 *
 * Read even though this app does not cascade today (`role_cascade` is false, and
 * Passport forbids `true` on a three-type placement). Threading them through the
 * access call regardless means a later narrowing of placement is a restart rather
 * than a hunt for the omitted argument that makes inherited roles vanish silently.
 */
export async function listPassportUnitRelations(
  organizationId: string,
): Promise<Array<typeof passportUnitRelation.$inferSelect>> {
  return db
    .select()
    .from(passportUnitRelation)
    .where(eq(passportUnitRelation.organizationId, organizationId))
}

/** A session subject → the platform user it is linked to, for this app. */
export async function getPassportIdentityLink(
  subject: string,
  appId: string,
): Promise<{ platformUserId: string } | undefined> {
  const [row] = await db
    .select({ platformUserId: passportIdentityLink.platformUserId })
    .from(passportIdentityLink)
    .where(and(eq(passportIdentityLink.subject, subject), eq(passportIdentityLink.appId, appId)))
    .limit(1)
  return row
}
