import type { PassportAccessService } from './access'

/**
 * The access gate for a hosted-login callback.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6b.
 *
 * **The callback is the only place a Passport-backed session is established, so it is
 * the only place this gate can live.** Dropping it hands a working session to every
 * removed member who still owns a legacy local `users` row.
 *
 * Three outcomes, and the middle one is the one people forget:
 *
 *   not a member          -> DENY. Not "skip the access check": the local-user
 *                            resolver returns an existing row on a bare email match,
 *                            so a REMOVED member with a legacy row would otherwise
 *                            walk straight in.
 *   member, but no access -> DENY, with a reason. **Membership is NOT access**: a
 *                            member holding no role at any unit carrying this app,
 *                            and not an Owner/Admin via the ladder, gets a clear
 *                            refusal rather than an empty app.
 *   member with access    -> allow.
 *
 * `platform_user_id` is resolved from the **email → membership**, never from the
 * identity link: an SSO user may have no link yet on their very first login, which is
 * exactly when this runs.
 */

export type GateOutcome =
  | { allowed: true; platformUserId: string; organizationId: string }
  | { allowed: false; reason: 'not_a_member' | 'ambiguous_email' | 'no_access' }

export interface GateDeps {
  access: Pick<PassportAccessService, 'membershipForEmail' | 'forPlatformUser'>
  /** Whether ANY entitlement has synced — the fail-open probe below. */
  hasAnyEntitlement: () => Promise<boolean>
}

export function createHostedLoginGate(deps: GateDeps) {
  return async function gate(email: string): Promise<GateOutcome> {
    const resolved = await deps.access.membershipForEmail(email)
    if (!resolved.ok) {
      return {
        allowed: false,
        reason: resolved.reason === 'ambiguous' ? 'ambiguous_email' : 'not_a_member',
      }
    }

    const { platformUserId, organizationId } = resolved.membership

    // **Fails OPEN on access while nothing has synced yet, deliberately.** Before the
    // projection lands, every derivation is empty — so denying on that would lock out
    // the entire company on the day SSO is switched on. Membership itself never fails
    // open, which is what keeps this from being a hole: a non-member is still refused.
    if (!(await deps.hasAnyEntitlement())) {
      return { allowed: true, platformUserId, organizationId }
    }

    const access = await deps.access.forPlatformUser(platformUserId, organizationId)
    if (!access.hasAccess) return { allowed: false, reason: 'no_access' }

    return { allowed: true, platformUserId, organizationId }
  }
}
