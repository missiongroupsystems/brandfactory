import type { UserId } from '@brandfactory/shared'
import type { IncomingMessage, Server as HttpServer } from 'node:http'
import { EventEmitter } from 'node:events'
import type { Duplex } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { authorizeChannel, mountRealtime } from './ws'
import { createFakeAuth, createFakeDb, silentLogger } from './test-helpers'

async function seed() {
  const { db } = createFakeDb()
  const owner = 'user-owner' as UserId
  const ws = await db.createWorkspace({ name: 'w', ownerUserId: owner })
  const br = await db.createBrand({ workspaceId: ws.id, name: 'b' })
  const { project: pr } = await db.createProjectWithCanvas({
    kind: 'freeform',
    brandId: br.id,
    name: 'p',
  })
  return { db, owner, ws, br, pr }
}

describe('authorizeChannel', () => {
  it('allows workspace: for the owner', async () => {
    const { db, owner, ws } = await seed()
    expect(await authorizeChannel(owner, `workspace:${ws.id}`, db)).toBe(true)
  })

  it('allows brand: for the owner', async () => {
    const { db, owner, br } = await seed()
    expect(await authorizeChannel(owner, `brand:${br.id}`, db)).toBe(true)
  })

  it('allows project: for the owner', async () => {
    const { db, owner, pr } = await seed()
    expect(await authorizeChannel(owner, `project:${pr.id}`, db)).toBe(true)
  })

  it('allows any authenticated user on an existing channel (shared access)', async () => {
    const { db, pr } = await seed()
    expect(await authorizeChannel('stranger', `project:${pr.id}`, db)).toBe(true)
  })

  it('denies a missing aggregate', async () => {
    const { db, owner } = await seed()
    expect(await authorizeChannel(owner, 'project:ghost', db)).toBe(false)
  })

  it('denies unknown prefixes', async () => {
    const { db, owner } = await seed()
    expect(await authorizeChannel(owner, 'other:x', db)).toBe(false)
  })

  it('denies malformed channels', async () => {
    const { db, owner } = await seed()
    expect(await authorizeChannel(owner, 'no-colon', db)).toBe(false)
    expect(await authorizeChannel(owner, 'project:', db)).toBe(false)
  })
})

describe('mountRealtime: upgrade origin guard', () => {
  it('destroys the socket with 403 when Origin is not in the allowlist', async () => {
    const httpServer = new EventEmitter() as unknown as HttpServer
    const { db } = createFakeDb()
    const realtime = {
      bindToNodeWebSocketServer: vi.fn(),
      publish: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    }
    const handle = mountRealtime({
      httpServer,
      // The fake satisfies only the surface `mountRealtime` uses.
      realtime: realtime as unknown as Parameters<typeof mountRealtime>[0]['realtime'],
      auth: createFakeAuth({}),
      db,
      log: silentLogger(),
      allowedOrigins: ['https://app.example.com'],
    })

    const destroy = vi.fn()
    const write = vi.fn()
    const socket = { destroy, write } as unknown as Duplex
    const req = {
      url: '/rt',
      headers: { origin: 'https://evil.example.com' },
    } as unknown as IncomingMessage

    httpServer.emit('upgrade', req, socket, Buffer.alloc(0))

    expect(write).toHaveBeenCalledWith(expect.stringMatching(/^HTTP\/1\.1 403 /))
    expect(destroy).toHaveBeenCalled()
    await handle.close()
  })
})

describe('mountRealtime: the password gate, repeated here on purpose', () => {
  // `/rt` ends at the upgrade and never enters the Hono middleware chain, so
  // `createPasswordGateMiddleware` does not cover it and `app.test.ts`'s
  // mount-list test cannot see it. Without the check in `ws.ts`, an account
  // holding a password its admin chose is refused every HTTP route and can
  // still subscribe to a project channel and read the canvas traffic on it.
  function mountWithUser(row: { id: string; mustSetPassword: boolean }) {
    const httpServer = new EventEmitter() as unknown as HttpServer
    const { db, state } = createFakeDb()
    state.users.set(row.id, {
      id: row.id,
      email: `${row.id}@example.com`,
      displayName: null,
      role: 'admin',
      mustSetPassword: row.mustSetPassword,
      deactivatedAt: null,
      createdAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
    })
    let authenticate!: (req: IncomingMessage) => Promise<string | null>
    const realtime = {
      bindToNodeWebSocketServer: vi.fn(
        (_wss: unknown, hooks: { authenticate: typeof authenticate }) => {
          authenticate = hooks.authenticate
        },
      ),
      publish: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    }
    const handle = mountRealtime({
      httpServer,
      realtime: realtime as unknown as Parameters<typeof mountRealtime>[0]['realtime'],
      auth: createFakeAuth({ 'tok-1': row.id }, { users: state.users }),
      db,
      log: silentLogger(),
    })
    const req = { url: '/rt?token=tok-1', headers: {} } as unknown as IncomingMessage
    return { authenticate: () => authenticate(req), handle }
  }

  it('refuses the connection outright when the password is not set', async () => {
    const { authenticate, handle } = mountWithUser({ id: 'u-1', mustSetPassword: true })
    expect(await authenticate()).toBeNull()
    await handle.close()
  })

  it('admits the same token once the password is set', async () => {
    const { authenticate, handle } = mountWithUser({ id: 'u-1', mustSetPassword: false })
    expect(await authenticate()).toBe('u-1')
    await handle.close()
  })
})
