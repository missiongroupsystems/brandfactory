import { isAdmin } from '@brandfactory/shared'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../context'
import { ForbiddenError, UnauthorizedError } from '../errors'

/**
 * Admin only. Mounted on `/members`, which is the whole of it.
 *
 * **One exported gate, referenced rather than re-implemented.** Launchpad
 * spreads the equivalent across four inline `user.adminRole !== 'admin'` checks
 * in one route file, because it has two admin roles with different powers. We
 * have one, and a mounted middleware is both the whole rule and the whole
 * enumeration of what it covers.
 *
 * `isAdmin` comes from `@brandfactory/shared` — the same function the member
 * screen calls to decide whether to draw itself. Launchpad's house rule applies
 * and is the reason that is safe: *"it is a rendering gate, not a security
 * boundary — the service re-checks everything, so getting it wrong makes the UI
 * wrong, never the data."* This is the re-check.
 *
 * `isAdmin` already refuses a deactivated row, so an administrator whose access
 * was withdrawn cannot restore it. `createAuthMiddleware` has refused that
 * request before it reaches here; this is the second rail.
 */
export function createAdminMiddleware() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.var.user
    if (!user) throw new UnauthorizedError()
    if (!isAdmin(user)) throw new ForbiddenError('administrators only')
    await next()
  })
}
