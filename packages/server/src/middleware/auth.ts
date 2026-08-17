import type { AuthProvider } from '@brandfactory/adapter-auth'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../context'
import { UnauthorizedError } from '../errors'

function extractBearer(header: string | undefined): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match ? match[1]!.trim() : null
}

/**
 * The second accepted issuer — Passport's project — as a dependency.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6c.
 *
 * Passed in rather than imported so the middleware stays testable and so the
 * `AuthProvider` port stays generic: the adapter's job is "verify a token from the
 * app's own IdP", and Passport is a second IdP this app happens to trust, not a
 * property of the port.
 *
 * Absent, the middleware behaves exactly as it did before — which is what makes SSO
 * reversible in both directions.
 */
export interface PassportAuthFallback {
  /** True when SSO is configured AND enabled. Checked before any work. */
  active: () => boolean
  /** Verify against Passport's project. Null when the token is not theirs. */
  verify: (token: string) => Promise<{ sub: string; email: string } | null>
  /** True when the failure means "not signed by the project I asked about". */
  isForeignIssuer: (err: unknown) => boolean
  /** True when the token is genuinely expired — TERMINAL, never retried. */
  isExpired: (err: unknown) => boolean
  /** Resolve or provision the local user, BY VERIFIED EMAIL. */
  resolveUser: (
    email: string,
  ) => Promise<{ ok: true; userId: string } | { ok: false; reason: string }>
}

/**
 * Required auth: missing or invalid → 401 via the error boundary.
 *
 * ---------------------------------------------------------------------------
 * Two issuers, and the ORDER of the failure checks is load-bearing
 * ---------------------------------------------------------------------------
 *
 * This app accepts tokens from its own project (app-native sessions) and from
 * Passport's (hosted-login sessions). The adapter is tried first; a Passport-issued
 * token fails there with "no signing key matches this kid", and **that is the normal
 * case for an SSO user rather than an outage** — so it must fall through.
 *
 * **An EXPIRED token is checked FIRST and is terminal.** Retrying it against
 * Passport's issuer would fail there too and only hide the real reason. That ordering
 * is the whole trap: another consumer put a narrower check above the broader one to
 * give it a nicer message, and every Passport-authenticated request then 401'd
 * deterministically, for the entire duration of its SSO rollout, no matter how valid
 * the token was.
 *
 * A Passport token is resolved to a local user **by verified email**, never by its
 * `sub`: that subject belongs to a foreign project, and `users.id` here holds whatever
 * project authenticated. Resolving by `sub` is not merely untidy — `upsertUserById`
 * conflicts on `id` only, so a Passport `sub` for somebody who already has an
 * app-native row with the same email violates the `users.email` unique index, and the
 * person gets a 404 from `/me` holding a perfectly valid token.
 */
export function createAuthMiddleware(auth: AuthProvider, passport?: PassportAuthFallback) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const token = extractBearer(c.req.header('authorization'))
    if (!token) {
      throw new UnauthorizedError('missing bearer token')
    }

    try {
      const { userId } = await auth.verifyToken(token)
      c.set('userId', userId)
      c.set('tokenIssuer', 'app-native')
    } catch (err) {
      if (!passport?.active()) {
        // Don't leak the adapter's error message — surface a generic 401.
        throw new UnauthorizedError('invalid token')
      }
      // TERMINAL, and checked before anything else. See the note above.
      if (passport.isExpired(err)) {
        throw new UnauthorizedError('invalid token')
      }

      const claims = await passport.verify(token)
      if (!claims) throw new UnauthorizedError('invalid token')

      const resolved = await passport.resolveUser(claims.email)
      if (!resolved.ok) {
        c.get('log')?.warn('passport auth: could not resolve the local user', {
          reason: resolved.reason,
        })
        throw new UnauthorizedError('invalid token')
      }

      c.set('userId', resolved.userId)
      c.set('tokenIssuer', 'passport')
    }

    await next()
  })
}

// Optional auth: sets `userId` when a valid token is present, never throws on
// absence. Used on `/health` so an authenticated probe is attributable in
// logs without failing unauthenticated smoke checks.
//
// Deliberately does NOT try the Passport issuer. This exists so a probe is
// attributable, and a probe is never a hosted-login session — adding a second
// verification and a database round trip to the health check would cost more than the
// attribution is worth.
export function createOptionalAuthMiddleware(auth: AuthProvider) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const token = extractBearer(c.req.header('authorization'))
    if (token) {
      try {
        const { userId } = await auth.verifyToken(token)
        c.set('userId', userId)
        c.set('tokenIssuer', 'app-native')
      } catch {
        // Silently ignore invalid tokens on optional paths.
      }
    }
    await next()
  })
}
