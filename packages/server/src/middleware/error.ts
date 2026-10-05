import type { Context } from 'hono'
import { ZodError } from 'zod'
import type { AppEnv } from '../context'
import { HttpError } from '../errors'

/**
 * Whether the database refused because it has no connection to give, from any
 * of the three layers that can say so. Exported for its test.
 */
export function isCapacityError(err: Error): boolean {
  const message = err.message.toLowerCase()
  return (
    message.includes('emaxconnsession') ||
    message.includes('max clients reached') ||
    message.includes('too many connections') ||
    // Postgres' own 53300 says "sorry, too many clients already" — a different
    // noun from the line above, which is why both are here. Writing only one of
    // them is the mistake this list was first drafted with.
    message.includes('too many clients') ||
    message.includes('timeout exceeded when trying to connect')
  )
}

export function onError(err: Error, c: Context<AppEnv>): Response {
  if (err instanceof HttpError) {
    return c.json(
      {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
      // `status` is narrowed by Hono to content-status; `satisfies` would
      // trip its conditional types, so cast through number.
      //
      // **The union is a list of what this app actually emits**, not a
      // constraint — the cast means an unlisted status still ships. 503 joined
      // it with quick add's lookup, which refuses that way when the deployment
      // has no search-grounded provider: a configuration state rather than a
      // server fault, so it must not read as a 500.
      err.status as 400 | 401 | 403 | 404 | 409 | 500 | 503,
    )
  }
  if (err instanceof ZodError) {
    return c.json(
      {
        code: 'VALIDATION',
        message: 'validation failed',
        details: err.issues,
      },
      400,
    )
  }
  // **Connection-pool exhaustion is a capacity state, not a fault.** It is
  // transient, it is fixed by waiting rather than by a deploy, and the right
  // answer tells the caller so. It reached production as a 500 on
  // 5 October 2026 — see the note in `@brandfactory/db`'s `makePool` — where it
  // said `Internal Server Error` to the reader and `unhandled error` in the
  // log, neither of which names the one thing that was wrong.
  //
  // Matched on the message rather than a type, because the error arrives from
  // three layers that do not share one: PgBouncer's own `EMAXCONNSESSION`,
  // Postgres' `53300 too_many_connections`, and node-postgres' own timeout when
  // every client in the local pool is busy. `error.code` is absent or different
  // in each.
  //
  // ⚠️ **This must not become a general retry-everything branch.** It answers
  // one condition. A query that is slow for its own reasons is still a 500, and
  // turning any timeout into a 503 would hide a bad query behind a word that
  // tells the reader to come back later.
  if (isCapacityError(err)) {
    const log = c.get('log')
    log?.warn('database capacity reached', { name: err.name, message: err.message })
    c.header('Retry-After', '2')
    return c.json(
      {
        code: 'DATABASE_BUSY',
        message: 'The database is at capacity. This is temporary — try again in a moment.',
      },
      503,
    )
  }

  const log = c.get('log')
  const userId = c.get('userId')
  log?.error('unhandled error', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    ...(userId !== undefined ? { userId } : {}),
  })
  return c.json(
    {
      code: 'INTERNAL',
      message: 'Internal Server Error',
    },
    500,
  )
}
