import type {
  BrandGuidelineSection,
  BrandId,
  BrandSummary,
  ProjectId,
  SectionId,
  UserId,
  WorkspaceId,
} from '@brandfactory/shared'
import { describe, expect, it } from 'vitest'
import { createTestApp } from '../test-helpers'

async function seedBrand(tokenUser: { id: string; token: string }) {
  const { app, state } = createTestApp({ users: [tokenUser] })
  const wsRes = await app.request('/workspaces', {
    method: 'POST',
    headers: { authorization: `Bearer ${tokenUser.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'W' }),
  })
  const ws = (await wsRes.json()) as { id: string }
  const brRes = await app.request(`/workspaces/${ws.id}/brands`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tokenUser.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'B' }),
  })
  const br = (await brRes.json()) as { id: string }
  return { app, state, workspaceId: ws.id, brandId: br.id }
}

describe('brands routes', () => {
  it('POST /workspaces/:id/brands creates a brand in an owned workspace', async () => {
    const { brandId } = await seedBrand({ id: 'u-1', token: 't-1' })
    expect(brandId).toMatch(/^br-/)
  })

  it('POST /workspaces/:id/brands forbids a non-owner', async () => {
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
    const res = await app.request('/workspaces/w-theirs/brands', {
      method: 'POST',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    })
    expect(res.status).toBe(403)
  })

  it('GET /workspaces/:id/brands returns section and project counts', async () => {
    const { app, state, workspaceId, brandId } = await seedBrand({ id: 'u-1', token: 't-1' })

    // Brand with 2 sections + 1 project → counts 2 / 1.
    state.sections.set('sec-1' as SectionId, {
      id: 'sec-1' as SectionId,
      brandId: brandId as BrandId,
      label: 'Voice',
      body: { type: 'doc', content: [] },
      priority: 1,
      createdBy: 'user',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    state.sections.set('sec-2' as SectionId, {
      id: 'sec-2' as SectionId,
      brandId: brandId as BrandId,
      label: 'Audience',
      body: { type: 'doc', content: [] },
      priority: 2,
      createdBy: 'user',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    state.projects.set('pr-1' as ProjectId, {
      id: 'pr-1' as ProjectId,
      brandId: brandId as BrandId,
      kind: 'freeform',
      name: 'Naming',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    // Second brand with neither sections nor projects → 0 / 0.
    const emptyBrandId = 'br-empty' as BrandId
    state.brands.set(emptyBrandId, {
      id: emptyBrandId,
      workspaceId: workspaceId as WorkspaceId,
      name: 'Empty',
      description: null,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })

    const res = await app.request(`/workspaces/${workspaceId}/brands`, {
      headers: { authorization: 'Bearer t-1' },
    })
    expect(res.status).toBe(200)
    const list = (await res.json()) as BrandSummary[]
    const withStuff = list.find((b) => b.id === brandId)
    const empty = list.find((b) => b.id === emptyBrandId)
    expect(withStuff).toMatchObject({ sectionCount: 2, projectCount: 1 })
    expect(empty).toMatchObject({ sectionCount: 0, projectCount: 0 })
  })

  it('GET /workspaces/:id/brands forbids a non-owner', async () => {
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
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const res = await app.request('/workspaces/w-theirs/brands', {
      headers: { authorization: 'Bearer t-1' },
    })
    expect(res.status).toBe(403)
  })

  it('GET /brands/:id hydrates sections', async () => {
    const { app, brandId } = await seedBrand({ id: 'u-1', token: 't-1' })
    const res = await app.request(`/brands/${brandId}`, {
      headers: { authorization: 'Bearer t-1' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; sections: BrandGuidelineSection[] }
    expect(body.id).toBe(brandId)
    expect(Array.isArray(body.sections)).toBe(true)
  })

  it('PATCH /brands/:id/guidelines upserts + reorders sections', async () => {
    const { app, brandId } = await seedBrand({ id: 'u-1', token: 't-1' })
    const patch1 = await app.request(`/brands/${brandId}/guidelines`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({
        sections: [
          { label: 'Voice', body: { type: 'doc', content: [] }, priority: 1 },
          { label: 'Audience', body: { type: 'doc', content: [] }, priority: 2 },
        ],
      }),
    })
    expect(patch1.status).toBe(200)
    const first = (await patch1.json()) as BrandGuidelineSection[]
    expect(first.map((s) => s.label)).toEqual(['Voice', 'Audience'])

    // Reorder: reuse ids, swap priorities; update the first's label.
    const [voice, audience] = first
    const patch2 = await app.request(`/brands/${brandId}/guidelines`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({
        sections: [
          { id: audience!.id, label: 'Audience', body: { type: 'doc', content: [] }, priority: 1 },
          {
            id: voice!.id,
            label: 'Voice & tone',
            body: { type: 'doc', content: [] },
            priority: 2,
          },
        ],
      }),
    })
    expect(patch2.status).toBe(200)
    const second = (await patch2.json()) as BrandGuidelineSection[]
    expect(second.map((s) => s.label)).toEqual(['Audience', 'Voice & tone'])
  })

  it('PATCH /brands/:id renames and clears description', async () => {
    const { app, brandId } = await seedBrand({ id: 'u-1', token: 't-1' })
    const res = await app.request(`/brands/${brandId}`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed', description: null }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ name: 'Renamed', description: null })
  })

  it('DELETE /brands/:id cascades projects and forbids non-owners', async () => {
    const { app, state, brandId } = await seedBrand({ id: 'u-1', token: 't-1' })
    const project = (await (
      await app.request(`/brands/${brandId}/projects`, {
        method: 'POST',
        headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'freeform', name: 'Doomed' }),
      })
    ).json()) as { id: string }
    expect(state.projects.has(project.id)).toBe(true)

    const del = await app.request(`/brands/${brandId}`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer t-1' },
    })
    expect(del.status).toBe(200)
    expect(state.brands.has(brandId)).toBe(false)
    expect(state.projects.has(project.id)).toBe(false)

    // Unknown brand after delete → 404
    const gone = await app.request(`/brands/${brandId}`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer t-1' },
    })
    expect(gone.status).toBe(404)
  })

  it('PATCH /brands/:id forbids a non-owner', async () => {
    const { app, state } = createTestApp({
      users: [
        { id: 'u-1', token: 't-1' },
        { id: 'u-2', token: 't-2' },
      ],
    })
    const brandId = 'br-theirs' as BrandId
    const wsId = 'w-theirs' as WorkspaceId
    state.workspaces.set(wsId, {
      id: wsId,
      name: 'theirs',
      ownerUserId: 'u-2' as UserId,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    state.brands.set(brandId, {
      id: brandId,
      workspaceId: wsId,
      name: 'Theirs',
      description: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    const res = await app.request(`/brands/${brandId}`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Stolen' }),
    })
    expect(res.status).toBe(403)
  })
})
