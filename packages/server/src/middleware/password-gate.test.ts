import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { User } from '@brandfactory/adapter-auth'
import type { AppEnv } from '../context'
import { createPasswordGateMiddleware } from './password-gate'
import { onError } from './error'

const NOW = '2026-10-05T00:00:00.000Z'

function userRow(over: Partial<User> = {}): User {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'natalie@example.com',
    displayName: null,
    role: 'admin',
    mustSetPassword: false,
    deactivatedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as User
}

// Builds an app shaped like the real one: the gate on `/brands`, nothing on
// `/me`. `user` stands in for what `createAuthMiddleware` resolves.
function app(user: User | undefined) {
  const a = new Hono<AppEnv>()
  a.onError(onError)
  a.use('*', async (c, next) => {
    if (user) c.set('user', user)
    await next()
  })
  a.use('/brands/*', createPasswordGateMiddleware())
  a.get('/brands/x', (c) => c.json({ ok: true }))
  a.get('/me', (c) => c.json({ ok: true }))
  a.post('/me/password', (c) => c.body(null, 204))
  return a
}

describe('the password gate', () => {
  it('lets an unflagged user through', async () => {
    const res = await app(userRow()).request('/brands/x')
    expect(res.status).toBe(200)
  })

  it('refuses a flagged user with PASSWORD_NOT_SET, not a bare 403', async () => {
    // The code is the contract: the client sends this reader to one screen, and
    // it has to tell the case apart from "you may not touch this brand".
    const res = await app(userRow({ mustSetPassword: true })).request('/brands/x')
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'PASSWORD_NOT_SET' })
  })

  it('leaves the two `/me` routes reachable while flagged', async () => {
    // Not because the gate exempts them — because the gate is not mounted
    // there. If this ever fails, somebody mounted it on `*`, and a flagged
    // person now has no way to clear their own flag.
    const a = app(userRow({ mustSetPassword: true }))
    expect((await a.request('/me')).status).toBe(200)
    expect((await a.request('/me/password', { method: 'POST' })).status).toBe(204)
  })

  it("does not refuse when no row resolved — that is the auth layer's call", async () => {
    // One cause must not get two status codes depending on which prefix was
    // called. Phase C turns a missing row into a 401 in the auth middleware.
    const res = await app(undefined).request('/brands/x')
    expect(res.status).toBe(200)
  })
})
