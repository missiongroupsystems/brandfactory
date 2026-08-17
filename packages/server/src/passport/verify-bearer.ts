import type { AuthProvider } from '@brandfactory/adapter-auth'
import type { Env } from '../env'
import type { Logger } from '../logger'
import { createPassportAccess, type PassportAccessService } from './access'
import { createPassportProvisioner } from './provision'
import { isExpiredError, ssoActive, verifyPassportToken } from './token'

/**
 * Verify a bearer token against **either** accepted issuer, in one place.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6c/7.
 *
 * ---------------------------------------------------------------------------
 * Why this is shared rather than written twice
 * ---------------------------------------------------------------------------
 *
 * Phase 6A put the two-issuer fallthrough in `middleware/auth.ts` only, and left
 * `ws.ts` calling `auth.verifyToken` directly. That is a **silent, asymmetric
 * failure**: a hosted-login user's HTTP requests work perfectly while their
 * websocket cannot authenticate at all, so the app loads and then never receives a
 * canvas update. Nothing errors on the server — the upgrade is simply refused with
 * `4401`, which looks like an expired token.
 *
 * The contract is explicit that the resolver must be shared and that a divergence
 * between two copies is an auth bug. This is that one copy: `middleware/auth.ts` and
 * `ws.ts` both call it, so a future third entry point cannot get a different answer.
 *
 * ---------------------------------------------------------------------------
 * The order of the failure checks is load-bearing
 * ---------------------------------------------------------------------------
 *
 * A Passport-issued token presented to BrandFactory's own JWKS fails with "no
 * signing key matches this kid" — **the normal case for an SSO user, not an
 * outage** — so it must fall through.
 *
 * **An EXPIRED token is checked FIRST and is terminal.** Retrying it against
 * Passport's issuer would fail there too and only hide the real reason. The mirror
 * of this ordering — a narrower check placed above the broader one, to give it a
 * nicer message — 401'd every Passport-authenticated request for another consumer's
 * entire SSO rollout.
 */

export interface PassportBearerFallback {
  /** True when SSO is configured AND enabled. Checked before any work. */
  active: () => boolean
  /** Verify against Passport's project. Null when the token is not theirs. */
  verify: (token: string) => Promise<{ sub: string; email: string } | null>
  /** True when the token is genuinely expired — TERMINAL, never retried. */
  isExpired: (err: unknown) => boolean
  /** Resolve or provision the local user, BY VERIFIED EMAIL. */
  resolveUser: (
    email: string,
  ) => Promise<{ ok: true; userId: string } | { ok: false; reason: string }>
}

export interface VerifiedBearer {
  /** The LOCAL user id, whichever issuer signed the token. */
  userId: string
  issuer: 'app-native' | 'passport'
}

/**
 * Build the verifier.
 *
 * `passport` is optional so an environment without Passport behaves exactly as
 * before — which is what makes SSO reversible in both directions.
 */
export function createBearerVerifier(auth: AuthProvider, passport?: PassportBearerFallback) {
  /**
   * Returns null for any token neither issuer accepts. Callers turn that into their
   * own refusal — a 401 for HTTP, a `4401` close for a websocket upgrade — because
   * the two transports report failure differently and neither should leak which
   * issuer rejected what.
   */
  return async function verifyBearer(token: string, log?: Logger): Promise<VerifiedBearer | null> {
    try {
      const { userId } = await auth.verifyToken(token)
      return { userId, issuer: 'app-native' }
    } catch (err) {
      if (!passport?.active()) return null
      // TERMINAL, and checked before anything else. See the note above.
      if (passport.isExpired(err)) return null

      const claims = await passport.verify(token)
      if (!claims) return null

      // BY VERIFIED EMAIL, never by `claims.sub`: that subject belongs to a foreign
      // project, and `users.id` here holds whatever project authenticated.
      const resolved = await passport.resolveUser(claims.email)
      if (!resolved.ok) {
        log?.warn('passport auth: could not resolve the local user', { reason: resolved.reason })
        return null
      }

      return { userId: resolved.userId, issuer: 'passport' }
    }
  }
}

export type BearerVerifier = ReturnType<typeof createBearerVerifier>

/**
 * The real verifier, wired to Passport. **Build it once per process.**
 *
 * `main.ts` hands the same instance to `createApp` and to `mountRealtime`, which is
 * the whole point: HTTP and the websocket upgrade must resolve a token through one
 * code path, or a hosted-login user gets working requests and a dead socket.
 */
export function createPassportBearerVerifier(
  env: Env,
  auth: AuthProvider,
  access: PassportAccessService = createPassportAccess(),
): BearerVerifier {
  const provision = createPassportProvisioner({ access })

  return createBearerVerifier(auth, {
    // Gated on Passport's project being configured, not just on the flag, so an
    // environment that simply lacks it stays app-native with nothing to remember.
    active: () => ssoActive(env),
    verify: (token) => verifyPassportToken(env, token),
    isExpired: isExpiredError,
    resolveUser: async (email) => {
      const resolved = await provision(email)
      return resolved.ok
        ? { ok: true as const, userId: resolved.user.id }
        : { ok: false as const, reason: resolved.reason }
    },
  })
}
