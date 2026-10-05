import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { AppEnv } from '../context'
import { HttpError, NotFoundError } from '../errors'
import { silentLogger } from '../test-helpers'
import { isCapacityError, onError } from './error'

function makeApp() {
  const app = new Hono<AppEnv>()
  // `onError` reads `c.var.log` — attach a silent logger so the unhandled
  // branch doesn't spam test output.
  app.use('*', async (c, next) => {
    c.set('log', silentLogger())
    await next()
  })
  app.onError(onError)
  app.get('/http', () => {
    throw new NotFoundError('nope', 'X_NOT_FOUND')
  })
  app.get('/http-details', () => {
    throw new HttpError(418, 'TEAPOT', 'short and stout', { hint: 'brew' })
  })
  app.get('/zod', () => {
    z.object({ a: z.string() }).parse({})
    return new Response('unreachable')
  })
  app.get('/unknown', () => {
    throw new Error('boom')
  })
  app.get('/capacity', () => {
    throw new Error(
      '(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15',
    )
  })
  return app
}

describe('onError', () => {
  it('maps HttpError to its status + code', async () => {
    const res = await makeApp().request('/http')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ code: 'X_NOT_FOUND', message: 'nope' })
  })

  it('includes details when present', async () => {
    const res = await makeApp().request('/http-details')
    expect(res.status).toBe(418)
    expect(await res.json()).toEqual({
      code: 'TEAPOT',
      message: 'short and stout',
      details: { hint: 'brew' },
    })
  })

  it('maps ZodError to 400 VALIDATION with issues', async () => {
    const res = await makeApp().request('/zod')
    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string; details: unknown[] }
    expect(body.code).toBe('VALIDATION')
    expect(Array.isArray(body.details)).toBe(true)
  })

  it('returns 500 INTERNAL for unknown errors and logs the stack', async () => {
    const writes: string[] = []
    const app = new Hono<AppEnv>()
    app.use('*', async (c, next) => {
      c.set('log', {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: (msg, fields) => writes.push(JSON.stringify({ msg, fields })),
        child: () => c.var.log,
      })
      await next()
    })
    app.onError(onError)
    app.get('/boom', () => {
      throw new Error('boom')
    })
    const res = await app.request('/boom')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ code: 'INTERNAL', message: 'Internal Server Error' })
    expect(writes.some((w) => w.includes('unhandled error'))).toBe(true)
  })
})

/**
 * The 500 this branch exists for, from production on 5 October 2026:
 *
 *   (EMAXCONNSESSION) max clients reached in session mode
 *   - max clients are limited to pool_size: 15
 *
 * It arrived through `getUserById` in the auth middleware, so every
 * authenticated path answered `Internal Server Error` at once — which told the
 * reader the app was broken rather than busy.
 */
describe('a database at capacity', () => {
  it('answers 503 DATABASE_BUSY with Retry-After, not 500', async () => {
    const res = await makeApp().request('/capacity')
    expect(res.status).toBe(503)
    expect(res.headers.get('Retry-After')).toBe('2')
    expect(await res.json()).toMatchObject({ code: 'DATABASE_BUSY' })
  })

  it('matches all three layers that can refuse a connection', () => {
    for (const message of [
      // PgBouncer, as production sent it.
      '(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15',
      // Postgres 53300, which words it differently — "clients", not "connections".
      'sorry, too many clients already',
      'FATAL: too many connections for role "app"',
      // node-postgres, when every client in this process's own pool is busy.
      'timeout exceeded when trying to connect to the database',
      // None of the three agree on casing.
      'Max Clients Reached In Session Mode',
    ]) {
      expect(isCapacityError(new Error(message)), message).toBe(true)
    }
  })

  it('leaves an ordinary failure as a 500', () => {
    // ⚠️ The guard against this becoming retry-everything. A slow query, a
    // missing table or a null dereference is a fault: answering 503 would tell
    // the reader to come back later for something that will never fix itself.
    for (const message of [
      'relation "brands" does not exist',
      'Cannot read properties of undefined (reading "id")',
      'canceling statement due to statement timeout',
      'duplicate key value violates unique constraint "users_email_unique"',
    ]) {
      expect(isCapacityError(new Error(message)), message).toBe(false)
    }
  })
})
