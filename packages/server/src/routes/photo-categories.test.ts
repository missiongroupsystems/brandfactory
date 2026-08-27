import type { BrandAsset, PhotoCategory } from '@brandfactory/shared'
import { describe, expect, it } from 'vitest'
import { createTestApp, type TestHarness } from '../test-helpers'

const USER = { id: 'u-1', token: 't-1' }

function auth(token = USER.token) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

async function seedBrand() {
  const harness = createTestApp({ users: [USER] })
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
  return { ...harness, brandId: brand.id }
}

async function addCategory(harness: TestHarness, brandId: string, name: string) {
  return (await (
    await harness.app.request(`/brands/${brandId}/photo-categories`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name }),
    })
  ).json()) as PhotoCategory
}

async function addPhoto(harness: TestHarness, brandId: string) {
  return (await (
    await harness.app.request(`/brands/${brandId}/assets`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        kind: 'image',
        source: 'link',
        url: 'https://cdn.example.com/a.jpg',
        label: 'A photo',
        library: 'photography',
      }),
    })
  ).json()) as BrandAsset
}

describe('photo categories', () => {
  it('starts empty — a brand invents its own subjects', async () => {
    const harness = await seedBrand()
    const { app, brandId } = harness
    const res = await app.request(`/brands/${brandId}/photo-categories`, { headers: auth() })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('appends in creation order, on sparse positions', async () => {
    const harness = await seedBrand()
    const { app, brandId } = harness
    await addCategory(harness, brandId, 'Interior')
    await addCategory(harness, brandId, 'Food')
    const rows = (await (
      await app.request(`/brands/${brandId}/photo-categories`, { headers: auth() })
    ).json()) as PhotoCategory[]
    expect(rows.map((c) => c.name)).toEqual(['Interior', 'Food'])
    // Sparse, so a future insert between two rows needs no renumbering.
    expect(rows[1]!.position).toBeGreaterThan(rows[0]!.position)
  })

  it('renames one', async () => {
    const harness = await seedBrand()
    const { app, brandId } = harness
    const category = await addCategory(harness, brandId, 'Interor')
    const patched = (await (
      await app.request(`/brands/${brandId}/photo-categories/${category.id}`, {
        method: 'PATCH',
        headers: auth(),
        body: JSON.stringify({ name: 'Interior' }),
      })
    ).json()) as PhotoCategory
    expect(patched.name).toBe('Interior')
  })

  it('files a photo under a category, and back out to Uncategorised', async () => {
    // Absent and `null` are different writes: absent leaves the filing alone,
    // `null` is a bucket somebody chose.
    const harness = await seedBrand()
    const { app, brandId } = harness
    const category = await addCategory(harness, brandId, 'Food')
    const photo = await addPhoto(harness, brandId)
    expect(photo.categoryId).toBeNull()

    const filed = (await (
      await app.request(`/brands/${brandId}/assets/${photo.id}`, {
        method: 'PATCH',
        headers: auth(),
        body: JSON.stringify({ categoryId: category.id }),
      })
    ).json()) as BrandAsset
    expect(filed.categoryId).toBe(category.id)

    const renamed = (await (
      await app.request(`/brands/${brandId}/assets/${photo.id}`, {
        method: 'PATCH',
        headers: auth(),
        body: JSON.stringify({ label: 'Renamed' }),
      })
    ).json()) as BrandAsset
    expect(renamed.categoryId).toBe(category.id)

    const cleared = (await (
      await app.request(`/brands/${brandId}/assets/${photo.id}`, {
        method: 'PATCH',
        headers: auth(),
        body: JSON.stringify({ categoryId: null }),
      })
    ).json()) as BrandAsset
    expect(cleared.categoryId).toBeNull()
  })

  it('uncategorises the photos when a category is deleted, and keeps them', async () => {
    // **The behaviour worth a test of its own.** A subject bucket is a filing
    // decision, and undoing one must not destroy what was filed.
    const harness = await seedBrand()
    const { app, brandId } = harness
    const category = await addCategory(harness, brandId, 'Food')
    const photo = await addPhoto(harness, brandId)
    await app.request(`/brands/${brandId}/assets/${photo.id}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ categoryId: category.id }),
    })

    await app.request(`/brands/${brandId}/photo-categories/${category.id}`, {
      method: 'DELETE',
      headers: auth(),
    })

    const assets = (await (
      await app.request(`/brands/${brandId}/assets`, { headers: auth() })
    ).json()) as BrandAsset[]
    const survivor = assets.find((a) => a.id === photo.id)
    expect(survivor).toBeDefined()
    expect(survivor!.categoryId).toBeNull()
  })

  it('400s on an empty name', async () => {
    const harness = await seedBrand()
    const { app, brandId } = harness
    const res = await app.request(`/brands/${brandId}/photo-categories`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: '   ' }),
    })
    expect(res.status).toBe(400)
  })

  it('404s on a category this brand does not hold', async () => {
    const harness = await seedBrand()
    const { app, brandId } = harness
    const res = await app.request(
      `/brands/${brandId}/photo-categories/00000000-0000-0000-0000-000000000000`,
      { method: 'PATCH', headers: auth(), body: JSON.stringify({ name: 'x' }) },
    )
    expect(res.status).toBe(404)
  })
})

describe('a category id is not a capability', () => {
  it("refuses to file a photo under another brand's subject", async () => {
    // The grid resolves subjects against this brand's own list, so a foreign id
    // would make the photo vanish from every bucket rather than move between
    // them — a write that looked like it worked and silently hid a photograph.
    const a = await seedBrand()
    const b = await seedBrand()
    const foreign = await addCategory(b, b.brandId, 'Their subject')
    const photo = await addPhoto(a, a.brandId)

    const res = await a.app.request(`/brands/${a.brandId}/assets/${photo.id}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ categoryId: foreign.id }),
    })
    expect(res.status).toBe(404)
  })

  it('still allows clearing to Uncategorised', async () => {
    // `null` must not be caught by the same gate: it is a bucket somebody chose,
    // not an id to resolve.
    const harness = await seedBrand()
    const { app, brandId } = harness
    const category = await addCategory(harness, brandId, 'Food')
    const photo = await addPhoto(harness, brandId)
    await app.request(`/brands/${brandId}/assets/${photo.id}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ categoryId: category.id }),
    })
    const res = await app.request(`/brands/${brandId}/assets/${photo.id}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ categoryId: null }),
    })
    expect(res.status).toBe(200)
  })
})
