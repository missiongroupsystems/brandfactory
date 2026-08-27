import type { BrandResource } from '@brandfactory/shared'
import { describe, expect, it } from 'vitest'
import { createTestApp, type TestHarness } from '../test-helpers'

const USER = { id: 'u-1', token: 't-1' }

function auth(token = USER.token) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

async function seedBrand(opts: Parameters<typeof createTestApp>[0] = {}) {
  const harness = createTestApp({ users: [USER], ...opts })
  const { app } = harness
  const ws = (await (
    await app.request('/workspaces', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'W' }),
    })
  ).json()) as { id: string }
  const brand = (await (
    await app.request(`/workspaces/${ws.id}/brands`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'B' }),
    })
  ).json()) as { id: string }
  return { ...harness, workspaceId: ws.id, brandId: brand.id }
}

const FONT = { type: 'font', title: 'Klim Type Foundry', url: 'https://klim.co.nz', note: null }
const ICON = {
  type: 'icon',
  title: 'The Noun Project',
  url: 'https://thenounproject.com',
  note: null,
}

async function post(app: TestHarness['app'], brandId: string, body: unknown) {
  return app.request(`/brands/${brandId}/resources`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify(body),
  })
}

async function listResources(app: TestHarness['app'], brandId: string) {
  const res = await app.request(`/brands/${brandId}/resources`, { headers: auth() })
  return (await res.json()) as BrandResource[]
}

describe('GET /brands/:id/resources', () => {
  it("lists a brand's resources", async () => {
    const { app, brandId } = await seedBrand()
    await post(app, brandId, FONT)
    await post(app, brandId, ICON)
    const rows = await listResources(app, brandId)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.title).sort()).toEqual(['Klim Type Foundry', 'The Noun Project'])
  })

  it('returns an empty array for a brand with no resources', async () => {
    const { app, brandId } = await seedBrand()
    expect(await listResources(app, brandId)).toEqual([])
  })

  it('401s without a token', async () => {
    const { app, brandId } = await seedBrand()
    const res = await app.request(`/brands/${brandId}/resources`)
    expect(res.status).toBe(401)
  })

  // Shared-access model: `requireBrandAccess` resolves the brand's workspace
  // and never checks ownership, so any authenticated user reaches any brand
  // that actually exists.
  it('lets any authenticated user reach a brand in a workspace they do not own', async () => {
    const { app, state } = createTestApp({ users: [USER, { id: 'u-2', token: 't-2' }] })
    state.workspaces.set('w-theirs', {
      id: 'w-theirs' as never,
      name: 'theirs',
      ownerUserId: 'u-2' as never,
      createdAt: 't',
      updatedAt: 't',
    })
    state.brands.set('b-theirs', {
      id: 'b-theirs' as never,
      workspaceId: 'w-theirs' as never,
      name: 'Theirs',
      description: null,
      websiteUrl: null,
      createdAt: 't',
      updatedAt: 't',
    })
    const res = await app.request('/brands/b-theirs/resources', { headers: auth() })
    expect(res.status).not.toBe(403)
  })

  // `requireBrandAccess` throws `NotFoundError`, and `middleware/error.ts`
  // maps it to 404 — not 403, because a brand you cannot see does not exist
  // to you. There is no forbidden case left to distinguish it from.
  it('404s for a brand the caller cannot reach', async () => {
    const { app } = await seedBrand()
    const res = await app.request('/brands/b-nope/resources', { headers: auth() })
    expect(res.status).toBe(404)
  })

  it('does not leak another brand’s resources', async () => {
    const { app, workspaceId, brandId } = await seedBrand()
    const other = (await (
      await app.request(`/workspaces/${workspaceId}/brands`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'Other' }),
      })
    ).json()) as { id: string }
    await post(app, brandId, FONT)
    expect(await listResources(app, other.id)).toHaveLength(0)
  })
})

describe('POST /brands/:id/resources', () => {
  it('creates one and returns it', async () => {
    const { app, brandId } = await seedBrand()
    const res = await post(app, brandId, FONT)
    expect(res.status).toBe(201)
    const row = (await res.json()) as BrandResource
    expect(row).toMatchObject({
      brandId,
      type: 'font',
      title: 'Klim Type Foundry',
      url: 'https://klim.co.nz',
      note: null,
    })
    expect(row.id).toBeTruthy()
  })

  it('stores a note when one is given', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (
      await post(app, brandId, { ...FONT, note: 'Buy the variable axis, not the statics' })
    ).json()) as BrandResource
    expect(row.note).toBe('Buy the variable axis, not the statics')
  })

  // The schema is the enforcement point. This test is what proves it is
  // wired: `AssetLinkUrlSchema` restricts to http/https, and the value is
  // rendered into an `href` on the resources screen.
  it('400s on a javascript: url', async () => {
    const { app, brandId, state } = await seedBrand()
    const res = await post(app, brandId, { ...FONT, url: 'javascript:alert(1)' })
    expect(res.status).toBe(400)
    expect(state.resources.size).toBe(0)
  })

  it.each(['data:text/html,<script>', 'ftp://a.test/b', '/relative.png'])(
    '400s on a url of %s',
    async (url) => {
      const { app, brandId } = await seedBrand()
      const res = await post(app, brandId, { ...FONT, url })
      expect(res.status).toBe(400)
    },
  )

  it('400s on an empty title', async () => {
    const { app, brandId } = await seedBrand()
    const res = await post(app, brandId, { ...FONT, title: '' })
    expect(res.status).toBe(400)
  })

  it('400s on an unknown resource type', async () => {
    const { app, brandId } = await seedBrand()
    const res = await post(app, brandId, { ...FONT, type: 'moodboard' })
    expect(res.status).toBe(400)
  })

  it('404s for a brand that does not exist, before validating the body', async () => {
    const { app } = await seedBrand()
    const res = await post(app, 'b-nope', FONT)
    expect(res.status).toBe(404)
  })
})

describe('PATCH /brands/:id/resources/:resourceId', () => {
  it('patches title, url, type and note', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (await post(app, brandId, FONT)).json()) as BrandResource
    const res = await app.request(`/brands/${brandId}/resources/${row.id}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ title: 'Klim', type: 'reference', note: 'moved' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ title: 'Klim', type: 'reference', note: 'moved' })
  })

  it('leaves omitted columns alone and clears note on an explicit null', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (
      await post(app, brandId, { ...FONT, note: 'a note' })
    ).json()) as BrandResource

    const patched = (await (
      await app.request(`/brands/${brandId}/resources/${row.id}`, {
        method: 'PATCH',
        headers: auth(),
        body: JSON.stringify({ title: 'Klim Renamed' }),
      })
    ).json()) as BrandResource
    expect(patched.note).toBe('a note')
    expect(patched.title).toBe('Klim Renamed')

    const cleared = (await (
      await app.request(`/brands/${brandId}/resources/${row.id}`, {
        method: 'PATCH',
        headers: auth(),
        body: JSON.stringify({ note: null }),
      })
    ).json()) as BrandResource
    expect(cleared.note).toBeNull()
    expect(cleared.title).toBe('Klim Renamed')
  })

  it('400s on a javascript: url in a patch', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (await post(app, brandId, FONT)).json()) as BrandResource
    const res = await app.request(`/brands/${brandId}/resources/${row.id}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ url: 'javascript:alert(1)' }),
    })
    expect(res.status).toBe(400)
  })

  it('404s for an unknown resource id', async () => {
    const { app, brandId } = await seedBrand()
    const res = await app.request(`/brands/${brandId}/resources/re-nope`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ title: 'x' }),
    })
    expect(res.status).toBe(404)
  })

  it('404s on a patch aimed at another brand’s resource', async () => {
    const { app, workspaceId, brandId } = await seedBrand()
    const other = (await (
      await app.request(`/workspaces/${workspaceId}/brands`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'Other' }),
      })
    ).json()) as { id: string }
    const row = (await (await post(app, brandId, FONT)).json()) as BrandResource

    const res = await app.request(`/brands/${other.id}/resources/${row.id}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ title: 'Hijacked' }),
    })
    expect(res.status).toBe(404)
    const [still] = await listResources(app, brandId)
    expect(still?.title).toBe(FONT.title)
  })

  it('404s for a brand that does not exist', async () => {
    const { app } = await seedBrand()
    const res = await app.request('/brands/b-nope/resources/re-1', {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ title: 'x' }),
    })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /brands/:id/resources/:resourceId', () => {
  it('deletes and returns the row', async () => {
    const { app, brandId, state } = await seedBrand()
    const row = (await (await post(app, brandId, FONT)).json()) as BrandResource
    const res = await app.request(`/brands/${brandId}/resources/${row.id}`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: row.id, title: FONT.title })
    // Hard delete — the row is gone, not hidden. There is no `deletedAt` on
    // this table to check instead.
    expect(state.resources.has(row.id)).toBe(false)
  })

  it('404s on a second delete', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (await post(app, brandId, FONT)).json()) as BrandResource
    const del = () =>
      app.request(`/brands/${brandId}/resources/${row.id}`, { method: 'DELETE', headers: auth() })
    expect((await del()).status).toBe(200)
    expect((await del()).status).toBe(404)
  })

  it('404s for an unknown resource id', async () => {
    const { app, brandId } = await seedBrand()
    const res = await app.request(`/brands/${brandId}/resources/re-nope`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect(res.status).toBe(404)
  })

  it('404s for a resource id belonging to another of the caller’s own brands', async () => {
    const { app, workspaceId, brandId } = await seedBrand()
    const other = (await (
      await app.request(`/workspaces/${workspaceId}/brands`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'Other' }),
      })
    ).json()) as { id: string }
    const row = (await (await post(app, brandId, FONT)).json()) as BrandResource

    const res = await app.request(`/brands/${other.id}/resources/${row.id}`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect(res.status).toBe(404)
    expect(await listResources(app, brandId)).toHaveLength(1)
  })

  it('404s for a brand that does not exist', async () => {
    const { app } = await seedBrand()
    const res = await app.request('/brands/b-nope/resources/re-1', {
      method: 'DELETE',
      headers: auth(),
    })
    expect(res.status).toBe(404)
  })
})
