import type { Env } from '../env'
import { ssoActive } from './token'
import type { PassportAccessService } from './access'

/**
 * The email-first login routing decision. ONE implementation, shared by every caller.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6a.
 *
 * Step 1 of the login screen collects an email and nothing else. This answers where
 * that person belongs: Passport's hosted login, or BrandFactory's own sign-in.
 *
 * ---------------------------------------------------------------------------
 * Why this is deliberately ONE function over ONE boolean
 * ---------------------------------------------------------------------------
 *
 * The endpoint in front of it is unauthenticated by necessity — it runs before
 * anybody has proven anything — and it **deliberately discloses membership**:
 * `passport` versus `app-native` tells the caller whether that address is an active
 * member. That leak is unavoidable, because the UI cannot choose between redirecting
 * and rendering a password field without it. The response *is* the routing decision.
 *
 * What it must never disclose is **account existence**. A non-member and a
 * nonexistent email must be indistinguishable: `app-native` means "type a password",
 * never "this account exists".
 *
 * So: one boolean in, two routes out, and **nowhere for a third branch to hide**.
 * Once this becomes a chain of `if`s returning three values, the fourth
 * (`suspended`, `sso_required`, `unknown`) arrives as an obviously reasonable small
 * follow-up and each one is individually defensible. **The two-valued shape is the
 * control, not the rate limiter** — rate limiting bounds throughput, never
 * capability, and the attacks that matter (confirm one named target before a phishing
 * mail; validate 200 scraped addresses over a week) fit under any limit loose enough
 * not to break real users.
 *
 * The test for any proposed change: **does the extra answer change what the UI
 * does?** If two responses render the same screen, the difference is pure disclosure
 * and buys nothing.
 */

export type LoginRoute = 'passport' | 'app-native'

/**
 * The whole decision. Two routes, one boolean.
 *
 * **Do not add a parameter.** Every additional input is a place for a third route to
 * grow.
 */
export function routeFor(isActiveMember: boolean, env: Env): LoginRoute {
  return isActiveMember && ssoActive(env) ? 'passport' : 'app-native'
}

/**
 * Resolve a route for an email.
 *
 * The membership lookup runs **unconditionally**, even when SSO is off. That is not
 * waste: a structurally two-valued endpoint is still an oracle if one branch hits the
 * database and the other returns early, because response timing partitions the input
 * space that the response body refuses to. Same work, both branches.
 */
export async function resolveLoginRoute(
  env: Env,
  access: Pick<PassportAccessService, 'membershipForEmail'>,
  email: string,
): Promise<LoginRoute> {
  const resolved = await access.membershipForEmail(email)
  // `ok` is true only for exactly one ACTIVE membership. An ambiguous pair of
  // case-variant memberships routes app-native, which is the safe direction: it
  // cannot hand a session to the wrong person, and the operator sees the ambiguity in
  // the projection rather than in a support ticket.
  return routeFor(resolved.ok, env)
}
