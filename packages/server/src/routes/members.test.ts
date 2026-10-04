import type { BrandId, UserId } from '@brandfactory/shared'
import { describe, expect, it } from 'vitest'
import { createTestApp } from '../test-helpers'

const PW = 'correct-horse-battery'
const ADMIN = { id: 'u-admin', token: 't-admin', role: 'admin' as const }
const MEMBER = { id: 'u-member', token: 't-member', role: null }

function post(
  app: ReturnType<typeof createTestApp>['app'],
  path: string,
  token: string,
  body?: unknown,
) {
  return app.request(path, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

describe('the /members gate', () => {
  it('refuses a member with 403 FORBIDDEN on every route', async () => {
    const { app } = createTestApp({ users: [ADMIN, MEMBER] })
    const res = await app.request('/members', { headers: { authorization: 'Bearer t-member' } })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'FORBIDDEN' })
  })

  it('refuses an admin who has not set their own password', async () => {
    // The password gate is mounted on this prefix too. An administrator holding
    // a password somebody else chose is not an exception to it.
    const { app } = createTestApp({
      users: [{ ...ADMIN, mustSetPassword: true }],
    })
    const res = await app.request('/members', { headers: { authorization: 'Bearer t-admin' } })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'PASSWORD_NOT_SET' })
  })

  it('lets an admin list members', async () => {
    const { app } = createTestApp({ users: [ADMIN, MEMBER] })
    const res = await app.request('/members', { headers: { authorization: 'Bearer t-admin' } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { members: Array<{ id: string }> }
    expect(body.members.map((m) => m.id).sort()).toEqual(['u-admin', 'u-member'])
  })
})

describe('POST /members', () => {
  it('creates the provider account first and keys our row to its id', async () => {
    // `users.id` *is* the provider id. A row keyed to anything else collides on
    // `email` the first time its owner signs in, and the adapter swallows that
    // error — leaving a row nothing can reach.
    const { app, state } = createTestApp({
      users: [ADMIN],
      onCreateUser: async () => ({ userId: 'provider-assigned-id' }),
    })
    const res = await post(app, '/members', 't-admin', {
      email: 'Natalie@Example.com',
      password: PW,
      brands: [],
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; email: string; mustSetPassword: boolean }
    expect(body.id).toBe('provider-assigned-id')
    // Lower-cased on the way in, so the `lower(email)` index cannot be the
    // first thing to notice two spellings of one address.
    expect(body.email).toBe('natalie@example.com')
    expect(body.mustSetPassword).toBe(true)
    expect(state.users.get('provider-assigned-id')?.email).toBe('natalie@example.com')
  })

  it('writes `set-on-create` to the audit, and never the password', async () => {
    const { app, state } = createTestApp({ users: [ADMIN] })
    await post(app, '/members', 't-admin', { email: 'a@b.test', password: PW, brands: [] })
    const row = state.credentialAudit.find((e) => e.action === 'set-on-create')
    expect(row).toMatchObject({ actorId: 'u-admin', subjectEmail: 'a@b.test' })
    expect(JSON.stringify(state.credentialAudit)).not.toContain(PW)
  })

  it('refuses an address that already exists, naming it', async () => {
    const { app } = createTestApp({ users: [ADMIN] })
    await post(app, '/members', 't-admin', { email: 'a@b.test', password: PW, brands: [] })
    const again = await post(app, '/members', 't-admin', {
      email: 'A@B.test',
      password: PW,
      brands: [],
    })
    expect(again.status).toBe(409)
    expect(await again.json()).toMatchObject({ code: 'EMAIL_TAKEN' })
  })

  it('deletes the provider account when our transaction fails', async () => {
    // Without the compensation the provider holds an account we have no row
    // for, and every retry answers a conflict there with nothing here to show.
    const deleted: string[] = []
    const { app, state } = createTestApp({
      users: [ADMIN],
      onCreateUser: async () => ({ userId: 'u-admin' }), // collides with the existing row
      onDeleteUser: (id) => void deleted.push(id),
    })
    const res = await post(app, '/members', 't-admin', {
      email: 'fresh@example.com',
      password: PW,
      brands: [],
    })
    expect(res.status).toBe(500)
    expect(deleted).toEqual(['u-admin'])
    // And nothing half-written: the existing row keeps its own address.
    expect(state.users.get('u-admin')?.email).toBe('u-admin@example.com')
  })

  it('requires a first password where the provider holds passwords', async () => {
    const { app } = createTestApp({ users: [ADMIN] })
    const res = await post(app, '/members', 't-admin', { email: 'a@b.test', brands: [] })
    expect(res.status).toBe(400)
  })

  it('needs no password, and flags nothing, where the provider holds none', async () => {
    // The local dev provider: the bearer token is the user id and no credential
    // exists, so *an administrator chose this password* is a vacuous claim.
    // Flagging would park the account on a screen `setPassword` then refuses.
    const { app } = createTestApp({ users: [ADMIN], holdsPasswords: false })
    const res = await post(app, '/members', 't-admin', { email: 'a@b.test', brands: [] })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ mustSetPassword: false })
  })

  it('refuses a `viewer` grant while write rules are unenforced', async () => {
    // `canWriteBrand` is written and no route calls it, so a `viewer` row would
    // record a restriction nothing applies — somebody would set it, believe
    // writes were blocked, and be wrong.
    const { app, state } = createTestApp({ users: [ADMIN] })
    const brandId = [...state.brands.keys()][0] ?? ('b-1' as BrandId)
    const res = await post(app, '/members', 't-admin', {
      email: 'a@b.test',
      password: PW,
      brands: [{ brandId, role: 'viewer' }],
    })
    expect(res.status).toBe(400)
  })
})

describe('the guards', () => {
  it('refuses an admin demoting themselves', async () => {
    // A different refusal from the last-admin one, and it catches a case that
    // does not: dropping your own role on the screen whose job is granting it.
    const { app } = createTestApp({ users: [ADMIN, { id: 'u-2', token: 't-2', role: 'admin' }] })
    const res = await app.request('/members/u-admin', {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-admin', 'content-type': 'application/json' },
      body: JSON.stringify({ role: null }),
    })
    expect(res.status).toBe(403)
  })

  it('refuses demoting the last admin', async () => {
    const { app } = createTestApp({ users: [ADMIN, { id: 'u-2', token: 't-2', role: 'admin' }] })
    // Demote the other admin first, leaving one.
    const first = await app.request('/members/u-2', {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-admin', 'content-type': 'application/json' },
      body: JSON.stringify({ role: null }),
    })
    expect(first.status).toBe(200)
    // Now u-admin is the last one, and only SQL could undo losing it.
    const res = await post(app, '/members/u-admin/deactivate', 't-admin')
    // Self-deactivation is refused before the count is even consulted.
    expect(res.status).toBe(403)
  })

  it('refuses deactivating the last admin from another admin’s session', async () => {
    const { app } = createTestApp({
      users: [ADMIN, { id: 'u-2', token: 't-2', role: 'admin' }],
    })
    // u-2 deactivates itself? No — u-2 deactivates u-admin, leaving u-2. Fine.
    expect((await post(app, '/members/u-admin/deactivate', 't-2')).status).toBe(200)
    // u-2 is now the only active admin, and it cannot remove itself.
    expect((await post(app, '/members/u-2/deactivate', 't-2')).status).toBe(403)
  })

  it('refuses resetting your own password here', async () => {
    // Launchpad's reason, which is the sharpest of the three: an admin who did
    // this "would flag themselves into the change screen with no admin left to
    // free them."
    const { app } = createTestApp({ users: [ADMIN] })
    const res = await post(app, '/members/u-admin/password', 't-admin', { password: PW })
    expect(res.status).toBe(403)
  })
})

describe('reset, deactivate and reactivate', () => {
  it('sets the password, flags the account, and audits the act', async () => {
    const set: Array<[string, string]> = []
    const { app, state } = createTestApp({
      users: [ADMIN, MEMBER],
      onSetPassword: (id, pw) => void set.push([id, pw]),
    })
    const res = await post(app, '/members/u-member/password', 't-admin', { password: PW })
    expect(res.status).toBe(204)
    expect(set).toEqual([['u-member', PW]])
    expect(state.users.get('u-member')?.mustSetPassword).toBe(true)
    expect(state.credentialAudit.at(-1)).toMatchObject({ action: 'reset', subjectId: 'u-member' })
  })

  it('does not flag the account when the provider refuses the password', async () => {
    // The mirror of `/me/password`: flagging first and failing second would
    // lock somebody out over a password that was never changed.
    const { app, state } = createTestApp({
      users: [ADMIN, MEMBER],
      onSetPassword: () => {
        throw new Error('nope')
      },
    })
    await post(app, '/members/u-member/password', 't-admin', { password: PW })
    expect(state.users.get('u-member')?.mustSetPassword).toBe(false)
  })

  it('deactivates, suspends at the provider, and comes back', async () => {
    const suspensions: Array<[string, boolean]> = []
    const { app, state } = createTestApp({
      users: [ADMIN, MEMBER],
      onSetSuspended: (id, s) => void suspensions.push([id, s]),
    })
    const off = await post(app, '/members/u-member/deactivate', 't-admin')
    expect(off.status).toBe(200)
    expect(state.users.get('u-member')?.deactivatedAt).not.toBeNull()

    const on = await post(app, '/members/u-member/reactivate', 't-admin')
    expect(on.status).toBe(200)
    expect(state.users.get('u-member')?.deactivatedAt).toBeNull()
    expect(suspensions).toEqual([
      ['u-member', true],
      ['u-member', false],
    ])
  })

  it('still deactivates when the provider suspension fails', async () => {
    // Our column is the boundary — the gate refuses this account whatever the
    // provider thinks — so this is a live credential nobody can use, not a
    // failed deactivation. Reporting a failure invites a retry that looks like
    // the first attempt never worked.
    const { app, state } = createTestApp({
      users: [ADMIN, MEMBER],
      onSetSuspended: () => {
        throw new Error('provider down')
      },
    })
    const res = await post(app, '/members/u-member/deactivate', 't-admin')
    expect(res.status).toBe(200)
    expect(state.users.get('u-member')?.deactivatedAt).not.toBeNull()
  })

  it('fails a reactivation loudly when the provider will not lift the ban', async () => {
    // The opposite order, on purpose: a 200 here has to mean both halves are
    // true, or an administrator records access the person cannot use.
    const { app, state } = createTestApp({
      users: [ADMIN, { ...MEMBER, deactivatedAt: '2026-10-01T00:00:00.000Z' }],
      onSetSuspended: () => {
        throw new Error('provider down')
      },
    })
    const res = await post(app, '/members/u-member/reactivate', 't-admin')
    expect(res.status).toBe(500)
    expect(state.users.get('u-member')?.deactivatedAt).not.toBeNull()
  })
})

describe('PATCH /members/:id — brand grants', () => {
  /** Two brands to move a grant between. The harness seeds none. */
  async function withBrands() {
    const harness = createTestApp({ users: [ADMIN, MEMBER] })
    const ws = await harness.db.createWorkspace({ name: 'w', ownerUserId: 'u-admin' as UserId })
    const b1 = await harness.db.createBrand({ workspaceId: ws.id, name: 'Petra' })
    const b2 = await harness.db.createBrand({ workspaceId: ws.id, name: 'Temper' })
    const patch = (brands: unknown) =>
      harness.app.request('/members/u-member', {
        method: 'PATCH',
        headers: { authorization: 'Bearer t-admin', 'content-type': 'application/json' },
        body: JSON.stringify({ brands }),
      })
    return { ...harness, b1, b2, patch }
  }

  it('diffs rather than replacing, and audits each act', async () => {
    const { state, b1, b2, patch } = await withBrands()
    await patch([{ brandId: b1.id, role: 'editor' }])
    state.credentialAudit.length = 0

    // Swap one brand for another: one revoke, one grant.
    const res = await patch([{ brandId: b2.id, role: 'manager' }])
    expect(res.status).toBe(200)
    expect(state.credentialAudit.map((e) => e.action).sort()).toEqual(['granted', 'revoked'])

    const body = (await res.json()) as { brands: Array<{ brandId: string; role: string }> }
    expect(body.brands).toEqual([{ brandId: b2.id, brandName: 'Temper', role: 'manager' }])
  })

  it('records a role change as a change, not as a revoke and a grant', async () => {
    // The diff is what makes this possible, and its reason is stronger than
    // tidiness: delete-all-then-insert opens a window in which a concurrent
    // request from this person is refused a brand they are keeping.
    const { state, b1, patch } = await withBrands()
    await patch([{ brandId: b1.id, role: 'editor' }])
    state.credentialAudit.length = 0

    await patch([{ brandId: b1.id, role: 'manager' }])
    expect(state.credentialAudit.map((e) => e.action)).toEqual(['role_changed'])
    expect(state.credentialAudit[0]).toMatchObject({
      brandId: b1.id,
      fromRole: 'editor',
      toRole: 'manager',
    })
  })

  it('revokes every grant when sent an empty list', async () => {
    const { state, b1, b2, patch } = await withBrands()
    await patch([
      { brandId: b1.id, role: 'editor' },
      { brandId: b2.id, role: 'manager' },
    ])
    state.credentialAudit.length = 0

    const res = await patch([])
    expect(res.status).toBe(200)
    expect((await res.json()) as { brands: unknown[] }).toMatchObject({ brands: [] })
    expect(state.credentialAudit.map((e) => e.action)).toEqual(['revoked', 'revoked'])
  })

  it('leaves grants untouched when `brands` is absent from the patch', async () => {
    // An omitted field means *leave as is*, not *revoke everything*. A screen
    // that saves a display name must not silently empty somebody's access.
    const { app, b1, patch } = await withBrands()
    await patch([{ brandId: b1.id, role: 'editor' }])

    const res = await app.request('/members/u-member', {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-admin', 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Natalie' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      displayName: string
      brands: Array<{ brandId: string }>
    }
    expect(body.displayName).toBe('Natalie')
    expect(body.brands.map((b) => b.brandId)).toEqual([b1.id])
  })
})
