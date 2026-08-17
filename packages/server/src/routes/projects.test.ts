import type { BlobStore } from '@brandfactory/adapter-storage'
import type {
  BrandId,
  Canvas,
  CanvasBlockId,
  ProjectId,
  ProjectSummary,
  UserId,
  WorkspaceId,
} from '@brandfactory/shared'
import { describe, expect, it } from 'vitest'
import { createTestApp } from '../test-helpers'

async function seedBrand(token: string, userId: string, opts: { storage?: BlobStore } = {}) {
  const { app, state } = createTestApp({ users: [{ id: userId, token }], ...opts })
  const ws = (await (
    await app.request('/workspaces', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'W' }),
    })
  ).json()) as { id: string }
  const br = (await (
    await app.request(`/workspaces/${ws.id}/brands`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'B' }),
    })
  ).json()) as { id: string }
  return { app, state, workspaceId: ws.id, brandId: br.id }
}

describe('projects routes', () => {
  it('POST /brands/:brandId/projects creates a freeform project + canvas', async () => {
    const { app, state, brandId } = await seedBrand('t-1', 'u-1')
    const res = await app.request(`/brands/${brandId}/projects`, {
      method: 'POST',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'freeform', name: 'Naming' }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; kind: string }
    expect(body.kind).toBe('freeform')
    expect([...state.canvases.values()].some((c) => c.projectId === body.id)).toBe(true)
  })

  it('POST /brands/:brandId/projects creates a standardized project with templateId', async () => {
    const { app, brandId } = await seedBrand('t-1', 'u-1')
    const res = await app.request(`/brands/${brandId}/projects`, {
      method: 'POST',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'standardized',
        name: 'Calendar',
        templateId: 'social-calendar',
      }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { kind: string; templateId: string }
    expect(body).toMatchObject({ kind: 'standardized', templateId: 'social-calendar' })
  })

  it('GET /projects/:id returns the project with canvas nested', async () => {
    const { app, brandId } = await seedBrand('t-1', 'u-1')
    const created = (await (
      await app.request(`/brands/${brandId}/projects`, {
        method: 'POST',
        headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'freeform', name: 'Naming' }),
      })
    ).json()) as { id: string }
    const res = await app.request(`/projects/${created.id}`, {
      headers: { authorization: 'Bearer t-1' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; canvas: Canvas | null }
    expect(body.id).toBe(created.id)
    expect(body.canvas?.projectId).toBe(created.id)
  })

  describe('GET /workspaces/:workspaceId/projects', () => {
    it('returns projects across multiple brands in the workspace', async () => {
      const { app, state, workspaceId, brandId } = await seedBrand('t-1', 'u-1')
      const brand2Id = 'br-2' as BrandId
      state.brands.set(brand2Id, {
        id: brand2Id,
        workspaceId: workspaceId as WorkspaceId,
        name: 'Brand Two',
        description: null,
        websiteUrl: null,
        linkedToPassport: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })

      const p1 = (await (
        await app.request(`/brands/${brandId}/projects`, {
          method: 'POST',
          headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'freeform', name: 'On brand 1' }),
        })
      ).json()) as { id: string }
      const p2 = (await (
        await app.request(`/brands/${brand2Id}/projects`, {
          method: 'POST',
          headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'freeform', name: 'On brand 2' }),
        })
      ).json()) as { id: string }

      const res = await app.request(`/workspaces/${workspaceId}/projects`, {
        headers: { authorization: 'Bearer t-1' },
      })
      expect(res.status).toBe(200)
      const list = (await res.json()) as ProjectSummary[]
      expect(list.map((p) => p.id).sort()).toEqual([p1.id, p2.id].sort())
      expect(list.find((p) => p.id === p2.id)?.brandName).toBe('Brand Two')
    })

    it('orders by lastActivityAt descending (agent activity beats newer idle)', async () => {
      const { app, state, workspaceId, brandId } = await seedBrand('t-1', 'u-1')

      // Idle project with a newer project.updatedAt.
      const idleId = 'pr-idle' as ProjectId
      state.projects.set(idleId, {
        id: idleId,
        brandId: brandId as BrandId,
        kind: 'freeform',
        name: 'Idle but new',
        createdAt: '2026-04-20T12:00:00.000Z',
        updatedAt: '2026-04-20T12:00:00.000Z',
      })

      // Older project row, but an agent message at a later timestamp.
      const activeId = 'pr-active' as ProjectId
      state.projects.set(activeId, {
        id: activeId,
        brandId: brandId as BrandId,
        kind: 'freeform',
        name: 'Active via chat',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      })
      state.agentMessages.push({
        message: {
          kind: 'message',
          id: 'am-1',
          role: 'user',
          content: 'hello',
        },
        projectId: activeId,
        userId: 'u-1',
        createdAt: '2026-04-20T18:00:00.000Z',
      })

      const res = await app.request(`/workspaces/${workspaceId}/projects`, {
        headers: { authorization: 'Bearer t-1' },
      })
      expect(res.status).toBe(200)
      const list = (await res.json()) as ProjectSummary[]
      expect(list[0]?.id).toBe(activeId)
      expect(list[0]?.lastActivityAt).toBe('2026-04-20T18:00:00.000Z')
      expect(list[1]?.id).toBe(idleId)
    })

    it('respects limit and rejects invalid limit with 400', async () => {
      const { app, state, workspaceId, brandId } = await seedBrand('t-1', 'u-1')
      for (let i = 0; i < 3; i++) {
        state.projects.set(`pr-lim-${i}` as ProjectId, {
          id: `pr-lim-${i}` as ProjectId,
          brandId: brandId as BrandId,
          kind: 'freeform',
          name: `P${i}`,
          createdAt: `2026-04-0${i + 1}T00:00:00.000Z`,
          updatedAt: `2026-04-0${i + 1}T00:00:00.000Z`,
        })
      }

      const capped = await app.request(`/workspaces/${workspaceId}/projects?limit=2`, {
        headers: { authorization: 'Bearer t-1' },
      })
      expect(capped.status).toBe(200)
      expect(((await capped.json()) as ProjectSummary[]).length).toBe(2)

      const bad = await app.request(`/workspaces/${workspaceId}/projects?limit=0`, {
        headers: { authorization: 'Bearer t-1' },
      })
      expect(bad.status).toBe(400)

      const tooBig = await app.request(`/workspaces/${workspaceId}/projects?limit=51`, {
        headers: { authorization: 'Bearer t-1' },
      })
      expect(tooBig.status).toBe(400)
    })

    it('is visible to any authenticated user and 404s an unknown workspace', async () => {
      const { app, state } = createTestApp({
        users: [
          { id: 'u-1', token: 't-1' },
          { id: 'u-2', token: 't-2' },
        ],
      })
      state.workspaces.set('w-theirs' as WorkspaceId, {
        id: 'w-theirs' as WorkspaceId,
        name: 'theirs',
        ownerUserId: 'u-2' as UserId,
        linkedToPassport: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })

      const allowed = await app.request('/workspaces/w-theirs/projects', {
        headers: { authorization: 'Bearer t-1' },
      })
      expect(allowed.status).toBe(200)

      const missing = await app.request('/workspaces/w-ghost/projects', {
        headers: { authorization: 'Bearer t-1' },
      })
      expect(missing.status).toBe(404)
    })

    it('returns [] for an empty workspace, not 404', async () => {
      const { app, workspaceId } = await seedBrand('t-1', 'u-1')
      // seedBrand creates a brand but no projects.
      const res = await app.request(`/workspaces/${workspaceId}/projects`, {
        headers: { authorization: 'Bearer t-1' },
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })
  })

  describe('PATCH/DELETE /projects/:id', () => {
    it('renames a project', async () => {
      const { app, brandId } = await seedBrand('t-1', 'u-1')
      const created = (await (
        await app.request(`/brands/${brandId}/projects`, {
          method: 'POST',
          headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'freeform', name: 'Old' }),
        })
      ).json()) as { id: string }

      const res = await app.request(`/projects/${created.id}`, {
        method: 'PATCH',
        headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'New' }),
      })
      expect(res.status).toBe(200)
      expect(((await res.json()) as { name: string }).name).toBe('New')
    })

    it('deletes a project and 404s unknown / any authenticated user may delete (shared access)', async () => {
      const { app, state, brandId } = await seedBrand('t-1', 'u-1')
      const created = (await (
        await app.request(`/brands/${brandId}/projects`, {
          method: 'POST',
          headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'freeform', name: 'Temp' }),
        })
      ).json()) as { id: string }

      const del = await app.request(`/projects/${created.id}`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer t-1' },
      })
      expect(del.status).toBe(200)
      expect(state.projects.has(created.id)).toBe(false)

      const missing = await app.request(`/projects/${created.id}`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer t-1' },
      })
      expect(missing.status).toBe(404)

      // Non-owner: seed another user's project via state
      const { app: app2, state: state2 } = createTestApp({
        users: [
          { id: 'u-1', token: 't-1' },
          { id: 'u-2', token: 't-2' },
        ],
      })
      const wsId = 'w-2' as WorkspaceId
      const brId = 'br-2' as BrandId
      const prId = 'pr-2' as ProjectId
      state2.workspaces.set(wsId, {
        id: wsId,
        name: 'W2',
        ownerUserId: 'u-2' as UserId,
        linkedToPassport: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      state2.brands.set(brId, {
        id: brId,
        workspaceId: wsId,
        name: 'B2',
        description: null,
        websiteUrl: null,
        linkedToPassport: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      state2.projects.set(prId, {
        id: prId,
        brandId: brId,
        kind: 'freeform',
        name: 'Theirs',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })

      const allowed = await app2.request(`/projects/${prId}`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer t-1' },
      })
      expect(allowed.status).toBe(200)
    })

    it('sweeps the blobs held by the deleted project canvas', async () => {
      const deleted: string[] = []
      const { app, state, brandId } = await seedBrand('t-1', 'u-1', {
        storage: {
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
        },
      })

      const created = (await (
        await app.request(`/brands/${brandId}/projects`, {
          method: 'POST',
          headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'freeform', name: 'With uploads' }),
        })
      ).json()) as { id: string }

      const canvas = [...state.canvases.values()].find((c) => c.projectId === created.id)!
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

      const res = await app.request(`/projects/${created.id}`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer t-1' },
      })
      expect(res.status).toBe(200)
      // Blobs live outside the FK graph — without an explicit sweep the bytes
      // would be orphaned in object storage forever.
      expect(deleted).toEqual(['uploads/pic.png'])
    })

    it('still deletes the project when the blob sweep fails', async () => {
      const { app, state, brandId } = await seedBrand('t-1', 'u-1', {
        storage: {
          async put() {},
          async get() {
            return new Uint8Array()
          },
          async delete() {
            throw new Error('storage unavailable')
          },
          async getSignedReadUrl() {
            return 'http://signed'
          },
          async getSignedWriteUrl() {
            return { url: 'http://signed' }
          },
        },
      })

      const created = (await (
        await app.request(`/brands/${brandId}/projects`, {
          method: 'POST',
          headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'freeform', name: 'Doomed' }),
        })
      ).json()) as { id: string }

      const canvas = [...state.canvases.values()].find((c) => c.projectId === created.id)!
      state.canvasBlocks.set('cb-bad', {
        id: 'cb-bad' as CanvasBlockId,
        canvasId: canvas.id,
        kind: 'file',
        blobKey: 'uploads/doc.pdf',
        filename: 'doc.pdf',
        mime: 'application/pdf',
        position: 1000,
        isPinned: false,
        pinnedAt: null,
        createdBy: 'user',
        deletedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })

      // The rows are already gone by the time the sweep runs, so a storage
      // outage must not surface as a 500 implying nothing happened.
      const res = await app.request(`/projects/${created.id}`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer t-1' },
      })
      expect(res.status).toBe(200)
      expect(state.projects.has(created.id)).toBe(false)
    })
  })
})
