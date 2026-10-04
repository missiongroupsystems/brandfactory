import type { AuthProvider } from '@brandfactory/adapter-auth'
import { PasswordNotSupportedError, PasswordRejectedError } from '@brandfactory/adapter-auth'
import { passwordProblem } from '@brandfactory/shared'
import type { UserId } from '@brandfactory/shared'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../context'
import type { Db } from '../db'
import { NotFoundError, UnauthorizedError, ValidationError } from '../errors'

export interface MeDeps {
  auth: AuthProvider
  db: Db
}

const SetPasswordBody = z.object({ password: z.string() })

/**
 * Everything about the caller.
 *
 * ⚠️ **This router is deliberately outside the password gate**, and it is the
 * only one that is. The two routes here are what a person holding an
 * admin-chosen password is allowed to do: find out who they are, and replace
 * that password. `app.ts` mounts the gate on every other prefix.
 *
 * ⚠️ **Do not add a route here that reads or writes anything but the caller's
 * own record.** A route that reaches a brand from this prefix is a route a
 * flagged account can call, and nothing in its own file would say so.
 */
export function createMeRouter(deps: MeDeps) {
  return (
    new Hono<AppEnv>()
      .get('/', async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const user = await deps.auth.getUserById(userId)
        if (!user) throw new NotFoundError('user not found', 'USER_NOT_FOUND')
        return c.json(user)
      })

      /**
       * The person chooses their own password, which is the only way
       * `must_set_password` is ever cleared.
       *
       * **It sets, it does not change: there is no current-password field.**
       * Somebody who signed in with Google has no password to supply, and they
       * are one of the two readers this screen exists for. The session is the
       * proof of identity here, exactly as it is for every other route.
       *
       * **The server sets the password, not the browser.** Supabase would let
       * the client call `updateUser({ password })` with its own session and
       * then ask us to clear the flag — and a client that skipped the first
       * call would get the flag cleared anyway. Routing both through here means
       * the flag can only be cleared by a path that actually set a password.
       */
      .post('/password', async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const user = await deps.auth.getUserById(userId)
        if (!user) throw new NotFoundError('user not found', 'USER_NOT_FOUND')

        const { password } = SetPasswordBody.parse(await c.req.json())
        // Re-checked here even though both forms check it first. The rules live
        // in `@brandfactory/shared`, so this is the same function the browser
        // ran, not a second opinion that could disagree with it.
        const problem = passwordProblem(password, user.email)
        if (problem) throw new ValidationError(problem)

        try {
          await deps.auth.setPassword(userId, password)
        } catch (err) {
          if (err instanceof PasswordRejectedError) {
            // The identity provider's own rule, which may be stricter than
            // ours — a higher minimum, or a breach list. A 400 with its words,
            // so the reader can act on it.
            throw new ValidationError(err.message)
          }
          if (err instanceof PasswordNotSupportedError) {
            // Surfaced rather than swallowed. Reporting success here would
            // clear the flag on an account with no password behind it.
            throw new ValidationError('this deployment cannot set passwords; ask an administrator')
          }
          throw err
        }

        // Only after the provider accepted it. The order is load-bearing: clear
        // first and a rejected password leaves somebody past the gate with a
        // credential their admin still knows.
        const cleared = await deps.db.clearMustSetPassword(userId as UserId)
        if (!cleared) throw new NotFoundError('user not found', 'USER_NOT_FOUND')

        // No audit row. `credential_audit` records admin acts on other
        // people's credentials; a person choosing their own password is not
        // one, and logging it would make the table answer a different question
        // than its name.
        return c.body(null, 204)
      })
  )
}
