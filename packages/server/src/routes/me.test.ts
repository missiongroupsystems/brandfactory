import { describe, expect, it } from 'vitest'
import type { AuthProvider } from '@brandfactory/adapter-auth'
import { PasswordNotSupportedError, PasswordRejectedError } from '@brandfactory/adapter-auth'
import { createApp } from '../app'
import { createFakeAdapters, createTestApp, silentLogger, testEnv } from '../test-helpers'

describe('GET /me', () => {
  it('returns the user row on happy path', async () => {
    const { app } = createTestApp({ users: [{ id: 'u-1', token: 't-1' }] })
    const res = await app.request('/me', { headers: { authorization: 'Bearer t-1' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: 'u-1', email: 'u-1@example.com' })
  })

  it('403s NO_ACCOUNT when the token verifies and no `users` row exists', async () => {
    // **Was a 404, and the change is the point of Phase C.** Both frontends
    // probe `/me` at boot and sign the reader out on any non-ok answer, so a
    // 404 here returned a stranger to the sign-in page with nothing said —
    // over and over. A 403 with a code the boundary recognises lets it say so.
    //
    // 403 rather than 401 because the token *is* valid. What is missing is an
    // account here, and that is authorization.
    const auth: AuthProvider = {
      holdsPasswords: true,
      async verifyToken() {
        return { userId: 'ghost' }
      },
      async getUserById() {
        return null
      },
      async setPassword() {},
      async createUser() {
        return { userId: 'never' }
      },
      async deleteUser() {},
      async setSuspended() {},
    }
    const adapters = createFakeAdapters({ auth })
    const app = createApp({ ...adapters, env: testEnv(), log: silentLogger() })
    const res = await app.request('/me', { headers: { authorization: 'Bearer x' } })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'NO_ACCOUNT' })
  })

  it('403s ACCOUNT_DEACTIVATED for a row with a deactivation stamp', async () => {
    const { app } = createTestApp({
      users: [{ id: 'u-1', token: 't-1', deactivatedAt: '2026-10-01T00:00:00.000Z' }],
    })
    const res = await app.request('/me', { headers: { authorization: 'Bearer t-1' } })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'ACCOUNT_DEACTIVATED' })
  })

  it('401s when no bearer token is present', async () => {
    const { app } = createTestApp({ users: [{ id: 'u-1', token: 't-1' }] })
    const res = await app.request('/me')
    expect(res.status).toBe(401)
  })
})

describe('POST /me/password', () => {
  const FLAGGED = { id: 'u-1', token: 't-1', mustSetPassword: true }
  const GOOD = 'correct-horse-battery'

  it('sets the password, clears the flag, and answers 204', async () => {
    const set: Array<[string, string]> = []
    const { app } = createTestApp({
      users: [FLAGGED],
      onSetPassword: (id, pw) => void set.push([id, pw]),
    })
    const res = await app.request('/me/password', {
      method: 'POST',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ password: GOOD }),
    })
    expect(res.status).toBe(204)
    expect(set).toEqual([['u-1', GOOD]])

    // The flag is gone, so the rest of the app opens.
    const after = await app.request('/me', { headers: { authorization: 'Bearer t-1' } })
    expect(await after.json()).toMatchObject({ mustSetPassword: false })
  })

  it('does not clear the flag when the provider refuses the password', async () => {
    // The order is the whole point. Clear first and a rejected password leaves
    // somebody past the gate holding a credential their admin still knows.
    const { app } = createTestApp({
      users: [FLAGGED],
      onSetPassword: () => {
        throw new Error('nope')
      },
    })
    const res = await app.request('/me/password', {
      method: 'POST',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ password: GOOD }),
    })
    expect(res.status).toBe(500)

    const after = await app.request('/me', { headers: { authorization: 'Bearer t-1' } })
    expect(await after.json()).toMatchObject({ mustSetPassword: true })
  })

  it('refuses a password shorter than the shared rule, and never calls the provider', async () => {
    const set: string[] = []
    const { app } = createTestApp({
      users: [FLAGGED],
      onSetPassword: (_id, pw) => void set.push(pw),
    })
    const res = await app.request('/me/password', {
      method: 'POST',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'short' }),
    })
    expect(res.status).toBe(400)
    expect(set).toEqual([])
  })

  it('refuses a password containing the email local part', async () => {
    const { app } = createTestApp({ users: [FLAGGED] })
    const res = await app.request('/me/password', {
      method: 'POST',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      // The fake's email is `u-1@example.com`, so the local part is `u-1`.
      body: JSON.stringify({ password: 'xxxxxU-1xxxxxxxxx' }),
    })
    expect(res.status).toBe(400)
  })

  it('is reachable while flagged — it is the one write that must be', async () => {
    // Companion to the gate test: this asserts it through the real `createApp`,
    // mount list and all, rather than a hand-built Hono app.
    const { app } = createTestApp({ users: [FLAGGED] })
    const blocked = await app.request('/workspaces', {
      headers: { authorization: 'Bearer t-1' },
    })
    expect(blocked.status).toBe(403)
    expect(await blocked.json()).toMatchObject({ code: 'PASSWORD_NOT_SET' })

    const allowed = await app.request('/me', { headers: { authorization: 'Bearer t-1' } })
    expect(allowed.status).toBe(200)
  })

  it('401s without a token', async () => {
    const { app } = createTestApp({ users: [FLAGGED] })
    const res = await app.request('/me/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: GOOD }),
    })
    expect(res.status).toBe(401)
  })
})

describe('POST /me/password — what the provider refuses, and what it faults on', () => {
  const FLAGGED = { id: 'u-1', token: 't-1', mustSetPassword: true }

  async function post(app: ReturnType<typeof createTestApp>['app'], password: string) {
    return app.request('/me/password', {
      method: 'POST',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    })
  }

  it("answers 400 with the provider's reason when it rejects the password", async () => {
    // Supabase may hold a stricter floor than ours, or check a breach list.
    // A 500 here puts an opaque Internal Server Error on the one screen
    // somebody locked out of the app has to complete.
    const { app } = createTestApp({
      users: [FLAGGED],
      onSetPassword: () => {
        throw new PasswordRejectedError('Password is known to be weak')
      },
    })
    const res = await post(app, 'hunter2hunter2hunter2')
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ message: 'Password is known to be weak' })
  })

  it('answers 400 and names the missing configuration when the provider holds no passwords', async () => {
    const { app } = createTestApp({
      users: [FLAGGED],
      onSetPassword: () => {
        throw new PasswordNotSupportedError()
      },
    })
    const res = await post(app, 'correct-horse-battery')
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ message: /administrator/ })
  })

  it('leaves the flag set on either refusal', async () => {
    const { app } = createTestApp({
      users: [FLAGGED],
      onSetPassword: () => {
        throw new PasswordRejectedError('nope')
      },
    })
    await post(app, 'correct-horse-battery')
    const after = await app.request('/me', { headers: { authorization: 'Bearer t-1' } })
    expect(await after.json()).toMatchObject({ mustSetPassword: true })
  })
})
