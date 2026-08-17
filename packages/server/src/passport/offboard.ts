import type { MembershipPayload } from '@missiongroupsystems/passport-client'
import { findUsersByEmail } from '@brandfactory/db'
import type { RealtimeBus } from '@brandfactory/adapter-realtime'
import type { Logger } from '../logger'
import type { PassportSyncHooks } from './handlers'

/**
 * Offboarding — what happens beyond the tombstone when Passport removes a member.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 7.
 *
 * ---------------------------------------------------------------------------
 * Half of rule 6 is already satisfied by arithmetic, and half is not
 * ---------------------------------------------------------------------------
 *
 * Rule 6 asks for the person's local unit-scoped grants **and** their live sessions to
 * be revoked when `membership.removed` arrives.
 *
 * **The grants need no code.** BrandFactory holds none: the projection *is* the grant
 * model, so the moment the tombstone commits, the next derivation for that org returns
 * an empty map. There is nothing local to revoke — which is the point of not keeping a
 * shadow.
 *
 * **The sessions do need code, and not the code the generic advice describes.** The
 * usual worry is a still-valid access JWT outliving a revocation on the HTTP path. That
 * is not the gap here, because every request re-derives from the projection and gets
 * `{}`. The real gap is the **websocket**: `authorize` runs once per channel at
 * subscribe time and never again, so a revoked member with an open subscription keeps
 * receiving canvas events for a brand they have lost, however correctly their HTTP
 * reads are now denied.
 *
 * ---------------------------------------------------------------------------
 * A disconnect is a RE-AUTHORIZATION, not a logout
 * ---------------------------------------------------------------------------
 *
 * This closes sockets. It does not touch the person's token, and it must not.
 *
 * That distinction is what makes it safe under "yours only": removal from **one**
 * organisation must never end a session in an app serving a different one, and it must
 * not sign the person out of BrandFactory either, because they may still belong to
 * other orgs here. Closing the socket makes their client reconnect and re-subscribe,
 * and every channel is re-authorized on the way back in — so they end up with exactly
 * what they are still entitled to, without a single credential of Passport's being
 * involved. We hold no service-role key for Passport's project and must never be given
 * one.
 *
 * ---------------------------------------------------------------------------
 * Why the email, and not the identity link
 * ---------------------------------------------------------------------------
 *
 * Sockets are keyed by the **local** user id — whatever the bearer verifier resolved.
 * For a hosted-login session that is NOT `identity_link.subject`, which holds
 * Passport's subject, so walking the link table would find the wrong key or none.
 *
 * `MembershipPayload` embeds `email`, and email is the one identifier both sides hold.
 * So the chain is the same one every other resolution in this integration uses:
 * **verified email → local users → their sockets.** Matched case-insensitively, because
 * the projection stores the case Passport sent.
 */

export interface OffboardDeps {
  realtime: Pick<RealtimeBus, 'disconnectUser'>
  log?: Logger
  findUsers?: typeof findUsersByEmail
}

export function createPassportOffboarding(deps: OffboardDeps): Required<PassportSyncHooks> {
  const findUsers = deps.findUsers ?? findUsersByEmail

  return {
    async onMembershipRemoved(payload: MembershipPayload): Promise<void> {
      // Every local row for that address, not the first: two case-variant rows are a
      // real state here, and leaving one connected would be the whole bug.
      const users = await findUsers(payload.email)

      let closed = 0
      for (const user of users) closed += deps.realtime.disconnectUser(user.id)

      // Counts only, never the email — this line goes to the same log as everything
      // else, and the membership payload is staff PII.
      if (closed > 0) {
        deps.log?.info('passport offboarding: closed live sockets for re-authorization', {
          organizationId: payload.organization_id,
          sockets: closed,
        })
      }

      // Zero is the common case and not a problem: most people are not connected when
      // they are removed. Deliberately not logged as a warning — a nightly reconcile
      // re-applying an old tombstone would otherwise produce noise forever.
    },
  }
}
