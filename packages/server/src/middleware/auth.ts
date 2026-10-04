import type { AuthProvider } from '@brandfactory/adapter-auth'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../context'
import { AccountDeactivatedError, NoAccountError, UnauthorizedError } from '../errors'

function extractBearer(header: string | undefined): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match ? match[1]!.trim() : null
}

// Required auth: missing/invalid → 401 via the error boundary.
export function createAuthMiddleware(auth: AuthProvider) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const token = extractBearer(c.req.header('authorization'))
    if (!token) {
      throw new UnauthorizedError('missing bearer token')
    }
    let userId: string
    try {
      const verified = await auth.verifyToken(token)
      userId = verified.userId
      c.set('userId', userId)
    } catch {
      // Don't leak the adapter's error message — surface a generic 401.
      throw new UnauthorizedError('invalid token')
    }
    // ⚠️ **This is the door, and it is here rather than only in `authz.ts`.**
    // `GET /me` does not go through the authorization helpers, and both
    // frontends probe it at boot — so a stranger refused there with a 404
    // would be signed out and returned to the sign-in page with nothing said,
    // over and over. Refusing in the middleware gives every authenticated path
    // one answer, including the probe.
    //
    // A valid token proves who somebody is, not that they belong here. Until
    // Phase C, `verifyToken` created a `users` row for any email it had never
    // seen and the shared-access model admitted it everywhere; the
    // auto-provisioner was the way in, not the open signup endpoint.
    //
    // `authz.ts` checks the same two facts again. That is not redundancy to
    // tidy away: `ws.ts` never enters this chain, and a second rail on the one
    // boundary in the app is worth a nine-row select.
    const user = await auth.getUserById(userId)
    if (!user) throw new NoAccountError()
    if (user.deactivatedAt !== null) throw new AccountDeactivatedError()
    c.set('user', user)
    await next()
  })
}

// Optional auth: sets `userId` when a valid token is present, never throws on
// absence. Used on `/health` so an authenticated probe is attributable in
// logs without failing unauthenticated smoke checks.
export function createOptionalAuthMiddleware(auth: AuthProvider) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const token = extractBearer(c.req.header('authorization'))
    if (token) {
      try {
        const { userId } = await auth.verifyToken(token)
        c.set('userId', userId)
      } catch {
        // Silently ignore invalid tokens on optional paths.
      }
    }
    await next()
  })
}
