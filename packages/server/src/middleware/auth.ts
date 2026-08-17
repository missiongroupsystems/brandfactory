import type { AuthProvider } from '@brandfactory/adapter-auth'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../context'
import { UnauthorizedError } from '../errors'
import {
  createBearerVerifier,
  type BearerVerifier,
  type PassportBearerFallback,
} from '../passport/verify-bearer'

function extractBearer(header: string | undefined): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match ? match[1]!.trim() : null
}

/**
 * Required auth: missing or invalid → 401 via the error boundary.
 *
 * Two accepted issuers — BrandFactory's own project for app-native sessions, and
 * Passport's for hosted-login ones. The fallthrough, and the load-bearing order of
 * its failure checks, live in `passport/verify-bearer.ts` and are **shared with the
 * websocket upgrade**: a second copy is how a hosted-login user ends up with working
 * HTTP and dead realtime.
 *
 * `c.var.tokenIssuer` records which issuer signed the request. Two things need it and
 * neither can recover it later without re-verifying: the sign-out must run on the
 * client that holds the session, and the structure write-through (proposal §7) may
 * forward **only** a Passport-issued token.
 */
export function createAuthMiddleware(
  auth: AuthProvider,
  passport?: PassportBearerFallback | BearerVerifier,
) {
  // Accepts either the fallback config or an already-built verifier, so `app.ts` can
  // build ONE verifier and hand the same instance to the middleware and to
  // `mountRealtime` — which is the point of sharing it.
  const verify: BearerVerifier =
    typeof passport === 'function' ? passport : createBearerVerifier(auth, passport)

  return createMiddleware<AppEnv>(async (c, next) => {
    const token = extractBearer(c.req.header('authorization'))
    if (!token) {
      throw new UnauthorizedError('missing bearer token')
    }

    const result = await verify(token, c.get('log'))
    // Don't leak which issuer refused, or why — a generic 401 either way.
    if (!result) throw new UnauthorizedError('invalid token')

    c.set('userId', result.userId)
    c.set('tokenIssuer', result.issuer)

    await next()
  })
}

/**
 * Optional auth: sets `userId` when a valid token is present, never throws on
 * absence. Used on `/health` so an authenticated probe is attributable in logs
 * without failing unauthenticated smoke checks.
 *
 * Deliberately does NOT try the Passport issuer. This exists so a probe is
 * attributable, and a probe is never a hosted-login session — adding a second
 * verification plus a database round trip to the health check would cost more than
 * the attribution is worth.
 */
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
