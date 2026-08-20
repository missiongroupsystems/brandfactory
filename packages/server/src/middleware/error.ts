import type { Context } from 'hono'
import { ZodError } from 'zod'
import type { AppEnv } from '../context'
import { HttpError } from '../errors'

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
