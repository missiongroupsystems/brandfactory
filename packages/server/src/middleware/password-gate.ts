import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../context'
import { PasswordNotSetError } from '../errors'

/**
 * Refuses every request from somebody whose password was chosen by an admin.
 *
 * ⚠️ **This is the gate. The screen is not.** A frontend that redirects a
 * flagged reader to the set-password page has improved the experience and
 * closed nothing: the session is valid, so every route still answers a direct
 * call. Until this middleware is mounted, a password an admin read off their
 * own screen and pasted into a chat message is a working credential for the
 * whole API.
 *
 * **The allow-list is a mount point, not a list of path strings.** `app.ts`
 * mounts this on each gated prefix and deliberately not on `/me`, so the two
 * routes a flagged person needs — read yourself, set your own password — are
 * reachable because of where they live rather than because of a string
 * comparison that the next route addition could fall outside of. Signing out
 * needs nothing from us; it is a Supabase call in the browser.
 *
 * Launchpad keeps its equivalent self-service route under the same `/users`
 * prefix as its admin routes, which puts `POST /users/me/password` and
 * `POST /users/:id/password` in one file where Hono's declaration order
 * decides which one wins. It warns about that three times. Putting ours under
 * `/me` — where this app already keeps everything about the caller — means the
 * two paths cannot collide at all.
 *
 * Reads the user off the context rather than the database: `createAuthMiddleware`
 * has already resolved the row for this request.
 */
export function createPasswordGateMiddleware() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.var.user
    // No row resolved. Not this middleware's refusal to make — the auth
    // middleware owns that question, and answering it here would give one
    // cause two different status codes depending on which prefix was called.
    if (user?.mustSetPassword) throw new PasswordNotSetError()
    await next()
  })
}
