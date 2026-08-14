import type { BlobStore } from '@brandfactory/adapter-storage'
import type { CanvasBlockId, UserId } from '@brandfactory/shared'
import { describe, expect, it } from 'vitest'
import { createTestApp } from '../test-helpers'

function recordingStorage(deleted: string[]): BlobStore {
  return {
    async put() {},
    async get() {
      return new Uint8Array()
    },
    async delete(key: string) {
      deleted.push(key)
    },
    async getSignedReadUrl() {
      return 'http://signed'
    },
    async getSignedWriteUrl() {
      return { url: 'http://signed' }
    },
  }
}

// Seed a workspace → brand → project chain through the API, so the row graph
// the delete must cascade is built the same way the product builds it.
async function seedChain(token: string, storage?: BlobStore) {
  const app = createTestApp({
    users: [
      { id: 'u-1', token: 't-1' },
      { id: 'u-2', token: 't-2' },
    ],
    ...(storage ? { storage } : {}),
  })
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  const ws = (await (
    await app.app.request('/workspaces', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Acme' }),
    })
  ).json()) as { id: string }
  const brand = (await (
    await app.app.request(`/workspaces/${ws.id}/brands`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Brand A' }),
    })
  ).json()) as { id: string }
  const project = (await (
    await app.app.request(`/brands/${brand.id}/projects`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'freeform', name: 'P' }),
    })
  ).json()) as { id: string }
  return { ...app, headers, workspaceId: ws.id, brandId: brand.id, projectId: project.id }
}

describe('workspaces routes', () => {
  it('POST /workspaces creates a workspace owned by the authed user', async () => {
    const { app } = createTestApp({ users: [{ id: 'u-1', token: 't-1' }] })
    const res = await app.request('/workspaces', {
      method: 'POST',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Acme' }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; ownerUserId: string; name: string }
    expect(body.name).toBe('Acme')
    expect(body.ownerUserId).toBe('u-1')
  })

  it('GET /workspaces returns all workspaces (shared access)', async () => {
    const { app, state } = createTestApp({ users: [{ id: 'u-1', token: 't-1' }] })
    state.workspaces.set('w-mine', {
      id: 'w-mine' as never,
      name: 'mine',
      ownerUserId: 'u-1' as UserId,
      createdAt: 't',
      updatedAt: 't',
    })
    state.workspaces.set('w-theirs', {
      id: 'w-theirs' as never,
      name: 'theirs',
      ownerUserId: 'u-2' as UserId,
      createdAt: 't',
      updatedAt: 't',
    })
    const res = await app.request('/workspaces', {
      headers: { authorization: 'Bearer t-1' },
    })
    expect(res.status).toBe(200)
    const list = (await res.json()) as Array<{ id: string }>
    expect(list.map((w) => w.id).sort()).toEqual(['w-mine', 'w-theirs'])
  })

  it('GET /workspaces/:id is visible to any authenticated user (shared access)', async () => {
    const { app, state } = createTestApp({
      users: [
        { id: 'u-1', token: 't-1' },
        { id: 'u-2', token: 't-2' },
      ],
    })
    state.workspaces.set('w-theirs', {
      id: 'w-theirs' as never,
      name: 'theirs',
      ownerUserId: 'u-2' as UserId,
      createdAt: 't',
      updatedAt: 't',
    })
    const res = await app.request('/workspaces/w-theirs', {
      headers: { authorization: 'Bearer t-1' },
    })
    expect(res.status).toBe(200)
  })

  it('POST /workspaces rejects an empty name with 400 VALIDATION', async () => {
    const { app } = createTestApp({ users: [{ id: 'u-1', token: 't-1' }] })
    const res = await app.request('/workspaces', {
      method: 'POST',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    })
    expect(res.status).toBe(400)
  })

  it('PATCH /workspaces/:id renames an owned workspace', async () => {
    const { app } = createTestApp({ users: [{ id: 'u-1', token: 't-1' }] })
    const created = (await (
      await app.request('/workspaces', {
        method: 'POST',
        headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Acme' }),
      })
    ).json()) as { id: string }

    const res = await app.request(`/workspaces/${created.id}`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Acme Renamed' }),
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { name: string }).name).toBe('Acme Renamed')
  })

  it('PATCH /workspaces/:id updates for any authenticated user and 404s unknown', async () => {
    const { app, state } = createTestApp({
      users: [
        { id: 'u-1', token: 't-1' },
        { id: 'u-2', token: 't-2' },
      ],
    })
    state.workspaces.set('w-theirs', {
      id: 'w-theirs' as never,
      name: 'theirs',
      ownerUserId: 'u-2' as UserId,
      createdAt: 't',
      updatedAt: 't',
    })

    const allowed = await app.request('/workspaces/w-theirs', {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed by another user' }),
    })
    expect(allowed.status).toBe(200)

    const missing = await app.request('/workspaces/w-ghost', {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Nope' }),
    })
    expect(missing.status).toBe(404)
  })

  describe('DELETE /workspaces/:id', () => {
    it('401s without a token', async () => {
      const { app, workspaceId } = await seedChain('t-1')
      const res = await app.request(`/workspaces/${workspaceId}`, { method: 'DELETE' })
      expect(res.status).toBe(401)
    })

    it('404s on an unknown workspace, without touching the store', async () => {
      const deleted: string[] = []
      const { app } = await seedChain('t-1', recordingStorage(deleted))
      const res = await app.request('/workspaces/w-ghost', {
        method: 'DELETE',
        headers: { authorization: 'Bearer t-1' },
      })
      expect(res.status).toBe(404)
      expect(deleted).toEqual([])
    })

    it('cascades to the brands under it (shared access — any authed user)', async () => {
      // u-2 does not own the workspace u-1 created; shared access still admits it.
      const { app, state, workspaceId, brandId } = await seedChain('t-1')
      const res = await app.request(`/workspaces/${workspaceId}`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer t-2' },
      })
      expect(res.status).toBe(200)
      expect(state.workspaces.has(workspaceId)).toBe(false)
      expect(state.brands.has(brandId)).toBe(false)
    })

    it('sweeps the blobs held by every brand under the workspace', async () => {
      const deleted: string[] = []
      const { app, state, headers, workspaceId, brandId, projectId } = await seedChain(
        't-1',
        recordingStorage(deleted),
      )

      // Arm 1: a canvas block that names a blob.
      const canvas = [...state.canvases.values()].find((c) => c.projectId === projectId)!
      state.canvasBlocks.set('cb-img', {
        id: 'cb-img' as CanvasBlockId,
        canvasId: canvas.id,
        kind: 'image',
        blobKey: 'uploads/pic.png',
        position: 1000,
        isPinned: false,
        pinnedAt: null,
        createdBy: 'user',
        deletedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      // Arm 2: a brand asset uploaded as a blob.
      await app.request(`/brands/${brandId}/assets`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          kind: 'image',
          source: 'blob',
          label: 'Mark',
          blobKey: 'brands/mark.svg',
        }),
      })

      const res = await app.request(`/workspaces/${workspaceId}`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer t-1' },
      })
      expect(res.status).toBe(200)
      // Both arms of the workspace-wide sweep fire — bytes live outside the FK
      // graph, so the cascade alone would orphan them forever.
      expect(deleted.sort()).toEqual(['brands/mark.svg', 'uploads/pic.png'])
    })
  })
})
