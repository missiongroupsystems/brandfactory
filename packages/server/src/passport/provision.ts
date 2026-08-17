import { createUser, findUsersByEmail, type User } from '@brandfactory/db'
import type { PassportAccessService } from './access'

/**
 * Resolve — or provision — the local `users` row behind a Passport-issued token.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6c.
 *
 * ONE implementation, shared by the request path and the hosted-login callback. A
 * divergence between them is an auth bug: it would mean "what the callback admitted"
 * and "who the request path thinks you are" can disagree.
 *
 * ---------------------------------------------------------------------------
 * Three rules, each of which has bitten a real consumer
 * ---------------------------------------------------------------------------
 *
 * 1. **Resolve by VERIFIED EMAIL, never by the Passport `sub`.** Passport's `sub`
 *    belongs to Passport's Supabase project; `users.id` in this app holds a subject
 *    from whichever project authenticated. `platform_user_id` is never synced into
 *    either. Email is the only key both sides hold.
 *
 *    This is not merely tidier — resolving by `sub` is **broken here**.
 *    `upsertUserById` conflicts on `users.id` only, so inserting a Passport `sub` for
 *    somebody who already has an app-native row with the same email violates the
 *    `users.email` unique index. The adapter swallows that failure, the subsequent
 *    lookup misses, and the person gets a 404 from `/me` with a perfectly valid
 *    token. Every member with a legacy local account would be unable to sign in.
 *
 * 2. **Fail CLOSED on ambiguity.** `users.email` is unique but not
 *    case-insensitively so, which means `Bob@x.com` and `bob@x.com` can both exist.
 *    On a path that hands out a session, refusing to guess is the only safe answer —
 *    picking "the first one" silently authenticates somebody as the wrong person. The
 *    durable fix is a case-insensitive unique index on `users.email`, which would make
 *    the ambiguity impossible rather than merely detectable.
 *
 * 3. **Never provision for a non-member.** A valid Passport token proves who somebody
 *    is, not that they belong here. Minting a local row for a non-member creates an
 *    account nobody authorised.
 */

export type ProvisionResult =
  | { ok: true; user: User; provisioned: boolean }
  | { ok: false; reason: 'ambiguous_email' | 'not_a_member' }

export interface ProvisionDeps {
  access: Pick<PassportAccessService, 'membershipForEmail'>
  findUsers?: typeof findUsersByEmail
  create?: typeof createUser
}

export function createPassportProvisioner(deps: ProvisionDeps) {
  const findUsers = deps.findUsers ?? findUsersByEmail
  const create = deps.create ?? createUser

  return async function resolveOrProvision(verifiedEmail: string): Promise<ProvisionResult> {
    // Every match, not the first — the count is the point (rule 2).
    const matches = await findUsers(verifiedEmail)

    if (matches.length > 1) return { ok: false, reason: 'ambiguous_email' }
    if (matches.length === 1) return { ok: true, user: matches[0]!, provisioned: false }

    // No local row. Mint one only for an ACTIVE member (rule 3).
    const membership = await deps.access.membershipForEmail(verifiedEmail)
    if (!membership.ok) {
      return {
        ok: false,
        reason: membership.reason === 'ambiguous' ? 'ambiguous_email' : 'not_a_member',
      }
    }

    // `createUser` lets the database mint the id, deliberately: a local `users.id`
    // has no reason to equal a foreign project's subject, and the identity link is
    // what ties the session's subject to the platform user.
    const user = await create({
      email: verifiedEmail,
      displayName: membership.membership.displayName,
    })
    return { ok: true, user, provisioned: true }
  }
}

export type PassportProvisioner = ReturnType<typeof createPassportProvisioner>
