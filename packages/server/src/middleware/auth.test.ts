import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { AppEnv } from '../context'
import { onError } from './error'
import { createAuthMiddleware, createOptionalAuthMiddleware } from './auth'
import { createFakeAuth } from '../test-helpers'

function makeApp() {
  const auth = createFakeAuth({ 'valid-token': 'user-1' })
  const app = new Hono<AppEnv>()
  app.onError(onError)
  app.use('/protected/*', createAuthMiddleware(auth))
  app.use('/open/*', createOptionalAuthMiddleware(auth))
  app.get('/protected/me', (c) => c.json({ userId: c.var.userId }))
  app.get('/open/me', (c) => c.json({ userId: c.var.userId ?? null }))
  return app
}

describe('auth middleware', () => {
  it('accepts a valid bearer token', async () => {
    const res = await makeApp().request('/protected/me', {
      headers: { authorization: 'Bearer valid-token' },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ userId: 'user-1' })
  })

  it('rejects a missing header with 401 UNAUTHORIZED', async () => {
    const res = await makeApp().request('/protected/me')
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('rejects an invalid token with 401', async () => {
    const res = await makeApp().request('/protected/me', {
      headers: { authorization: 'Bearer nope' },
    })
    expect(res.status).toBe(401)
  })

  it('optionalAuth does not throw when no header is present', async () => {
    const res = await makeApp().request('/open/me')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ userId: null })
  })

  it('optionalAuth attaches userId when a valid token is present', async () => {
    const res = await makeApp().request('/open/me', {
      headers: { authorization: 'Bearer valid-token' },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ userId: 'user-1' })
  })
})

// ---------------------------------------------------------------------------
// The SECOND accepted issuer — Passport's project
// ---------------------------------------------------------------------------
//
// Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6c.
//
// This app accepts tokens from its own project (app-native) and from Passport's
// (hosted login). The adapter is tried first, and a Passport-issued token fails there
// with "no signing key matches this kid" — which is the NORMAL case for an SSO user
// rather than an outage, so it must fall through.

class Expired extends Error {}

function passportApp(
  over: Partial<Parameters<typeof createAuthMiddleware>[1]> = {},
  authFails: Error = new Error('no matching kid'),
) {
  const calls = { verify: 0, resolve: 0 }
  const auth = {
    verifyToken: async (token: string) => {
      if (token === 'app-native-token') return { userId: 'local-1' }
      throw authFails
    },
    getUserById: async () => null,
  }
  const app = new Hono<AppEnv>()
  app.onError(onError)
  app.use(
    '/protected/*',
    createAuthMiddleware(auth, {
      active: () => true,
      verify: async (token) => {
        calls.verify++
        return token === 'passport-token' ? { sub: 'passport-sub', email: 'bob@acme.test' } : null
      },
      isExpired: (err) => err instanceof Expired,
      resolveUser: async (email) => {
        calls.resolve++
        return email === 'bob@acme.test'
          ? { ok: true, userId: 'local-from-email' }
          : { ok: false, reason: 'not_a_member' }
      },
      ...over,
    }),
  )
  app.get('/protected/me', (c) => c.json({ userId: c.var.userId, issuer: c.var.tokenIssuer }))
  return { app, calls }
}

describe('auth middleware — the Passport issuer', () => {
  it('accepts an app-native token first, and records the issuer', async () => {
    const { app, calls } = passportApp()
    const res = await app.request('/protected/me', {
      headers: { authorization: 'Bearer app-native-token' },
    })

    expect(await res.json()).toEqual({ userId: 'local-1', issuer: 'app-native' })
    // The fallthrough must not run when the first issuer succeeded.
    expect(calls.verify).toBe(0)
  })

  it('falls through to Passport and resolves the local user BY EMAIL', async () => {
    const { app, calls } = passportApp()
    const res = await app.request('/protected/me', {
      headers: { authorization: 'Bearer passport-token' },
    })

    // NOT `passport-sub`: that subject belongs to a foreign project. Resolving by sub
    // is also broken here — `upsertUserById` conflicts on `id` only, so a Passport sub
    // for somebody who already has an app-native row with the same email violates the
    // `users.email` unique index, and the person gets a 404 from `/me` holding a
    // perfectly valid token.
    expect(await res.json()).toEqual({ userId: 'local-from-email', issuer: 'passport' })
    expect(calls.resolve).toBe(1)
  })

  // THE trap. An expired token is TERMINAL and must never be retried against the
  // second issuer: it would fail there too, and the retry only hides the real reason.
  // The mirror of this bug — a narrower check placed ABOVE the broader one — 401'd
  // every Passport-authenticated request for another consumer's entire SSO rollout.
  it('treats an EXPIRED token as terminal, without trying Passport', async () => {
    const { app, calls } = passportApp({}, new Expired('jwt expired'))
    const res = await app.request('/protected/me', {
      headers: { authorization: 'Bearer app-native-token-but-expired' },
    })

    expect(res.status).toBe(401)
    expect(calls.verify).toBe(0)
  })

  it('401s when the token belongs to neither issuer', async () => {
    const { app } = passportApp()
    const res = await app.request('/protected/me', {
      headers: { authorization: 'Bearer garbage' },
    })
    expect(res.status).toBe(401)
  })

  // Never provision for a non-member: a valid Passport token proves who somebody is,
  // not that they belong here.
  it('401s a valid Passport token whose email resolves to no member', async () => {
    const { app } = passportApp({
      verify: async () => ({ sub: 's', email: 'stranger@example.test' }),
    })
    const res = await app.request('/protected/me', {
      headers: { authorization: 'Bearer passport-token' },
    })
    expect(res.status).toBe(401)
  })

  // Reversible in both directions: turning SSO on cannot reject a session that works
  // today, and clearing the config cannot lock anyone out.
  it('behaves exactly as before when SSO is inactive', async () => {
    const { app, calls } = passportApp({ active: () => false })

    const native = await app.request('/protected/me', {
      headers: { authorization: 'Bearer app-native-token' },
    })
    expect(native.status).toBe(200)

    const passport = await app.request('/protected/me', {
      headers: { authorization: 'Bearer passport-token' },
    })
    expect(passport.status).toBe(401)
    expect(calls.verify).toBe(0)
  })

  it('behaves exactly as before when no fallback is supplied at all', async () => {
    const app = new Hono<AppEnv>()
    app.onError(onError)
    app.use(
      '/protected/*',
      createAuthMiddleware({
        verifyToken: async () => {
          throw new Error('nope')
        },
        getUserById: async () => null,
      }),
    )
    app.get('/protected/me', (c) => c.json({ userId: c.var.userId }))

    const res = await app.request('/protected/me', { headers: { authorization: 'Bearer x' } })
    expect(res.status).toBe(401)
  })
})
