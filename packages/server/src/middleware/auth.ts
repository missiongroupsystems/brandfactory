import type { AuthProvider } from '@brandfactory/adapter-auth'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../context'
import { UnauthorizedError } from '../errors'

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
    // Resolved here so the password gate and the authorization helpers share
    // one read. A miss is left undefined rather than refused: the shared-access
    // model still answers from `userId` alone, and turning a missing row into a
    // 401 is Phase C's change, where it is the whole point rather than a side
    // effect of adding a lookup.
    const user = await auth.getUserById(userId)
    if (user) c.set('user', user)
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
