import type { BrandAsset, SocialPost, UserId } from '@brandfactory/shared'
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

// Attachments come from the brand's own library, so the tests mint assets
// through the asset routes — the same path a real client takes.
async function seedAsset(app: TestHarness['app'], brandId: string, label = 'Mark') {
  const res = await app.request(`/brands/${brandId}/assets`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({
      kind: 'image',
      source: 'blob',
      label,
      blobKey: `brands/${label}.svg`,
    }),
  })
  return (await res.json()) as BrandAsset
}

async function listPosts(app: TestHarness['app'], brandId: string) {
  const res = await app.request(`/brands/${brandId}/social-posts`, { headers: auth() })
  return (await res.json()) as SocialPost[]
}

async function post(app: TestHarness['app'], brandId: string, body: unknown) {
  return app.request(`/brands/${brandId}/social-posts`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify(body),
  })
}

async function patch(app: TestHarness['app'], brandId: string, postId: string, body: unknown) {
  return app.request(`/brands/${brandId}/social-posts/${postId}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify(body),
  })
}

describe('social post routes — access', () => {
  it('401s without a token, on every method', async () => {
    const { app, brandId } = await seedBrand()
    for (const [method, path] of [
      ['GET', `/brands/${brandId}/social-posts`],
      ['POST', `/brands/${brandId}/social-posts`],
      ['PATCH', `/brands/${brandId}/social-posts/sp-1`],
      ['DELETE', `/brands/${brandId}/social-posts/sp-1`],
      ['POST', `/brands/${brandId}/social-posts/sp-1/restore`],
    ] as const) {
      const res = await app.request(path, { method })
      expect(res.status, `${method} ${path}`).toBe(401)
    }
  })

  // Every handler goes through `requireBrandAccess`. A brand in somebody
  // else's workspace is a 403, not a 404 — the same shape the asset routes
  // have.
  it('403s for a brand in a workspace the caller does not own, on every method', async () => {
    const { app, state } = createTestApp({
      users: [USER, { id: 'u-2', token: 't-2' }],
    })
    state.workspaces.set('w-theirs', {
      id: 'w-theirs' as never,
      name: 'theirs',
      ownerUserId: 'u-2' as UserId,
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
    for (const [method, path, body] of [
      ['GET', '/brands/b-theirs/social-posts', undefined],
      ['POST', '/brands/b-theirs/social-posts', { platform: 'instagram' }],
      ['PATCH', '/brands/b-theirs/social-posts/sp-1', { body: 'x' }],
      ['DELETE', '/brands/b-theirs/social-posts/sp-1', undefined],
      ['POST', '/brands/b-theirs/social-posts/sp-1/restore', undefined],
    ] as const) {
      const res = await app.request(path, {
        method,
        headers: auth(),
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      expect(res.status, `${method} ${path}`).toBe(403)
    }
  })

  it('404s for a brand that does not exist', async () => {
    const { app } = await seedBrand()
    const res = await app.request('/brands/b-nope/social-posts', { headers: auth() })
    expect(res.status).toBe(404)
  })
})

describe('POST /brands/:id/social-posts', () => {
  it('creates from platform alone, with the server defaults', async () => {
    const { app, brandId } = await seedBrand()
    const res = await post(app, brandId, { platform: 'instagram' })
    expect(res.status).toBe(201)
    const row = (await res.json()) as SocialPost
    expect(row).toMatchObject({
      brandId,
      platform: 'instagram',
      scheduledAt: null,
      body: '',
      status: 'draft',
      assetIds: [],
      deletedAt: null,
    })
  })

  it('creates the full shape, attachment order preserved', async () => {
    const { app, brandId } = await seedBrand()
    const [a, b] = [await seedAsset(app, brandId, 'a'), await seedAsset(app, brandId, 'b')]
    const res = await post(app, brandId, {
      platform: 'linkedin',
      scheduledAt: '2026-08-14T10:30:00.000Z',
      body: 'Launch day.',
      status: 'ready',
      assetIds: [b.id, a.id],
    })
    expect(res.status).toBe(201)
    const row = (await res.json()) as SocialPost
    expect(row.scheduledAt).toBe('2026-08-14T10:30:00.000Z')
    expect(row.status).toBe('ready')
    // Order is the array order — b before a, as sent.
    expect(row.assetIds).toEqual([b.id, a.id])
  })

  it.each([
    ['a missing platform', { body: 'no destination' }],
    ['a platform outside the enum', { platform: 'threads' }],
    ['a date-only scheduledAt', { platform: 'x', scheduledAt: '2026-08-14' }],
    ['a body over the max', { platform: 'x', body: 'x'.repeat(5001) }],
    ['duplicate assetIds', { platform: 'x', assetIds: [] as string[] }],
  ])('400s on %s', async (_name, body) => {
    const { app, brandId, state } = await seedBrand()
    // The duplicate case needs real ids to prove the refine, not the branded
    // id format, is what rejects.
    if (_name === 'duplicate assetIds') {
      const asset = await seedAsset(app, brandId)
      ;(body as { assetIds: string[] }).assetIds = [asset.id, asset.id]
    }
    expect((await post(app, brandId, body)).status).toBe(400)
    expect(state.socialPosts.size).toBe(0)
  })

  // `ASSET_NOT_IN_BRAND`, both ways it happens: the id belongs to another
  // brand, or to an asset no read path returns. One code for both — the two
  // are indistinguishable from inside the brand, by design.
  it('400s with ASSET_NOT_IN_BRAND on a cross-brand assetId', async () => {
    const { app, workspaceId, brandId } = await seedBrand()
    const other = (await (
      await app.request(`/workspaces/${workspaceId}/brands`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'Other' }),
      })
    ).json()) as { id: string }
    const foreign = await seedAsset(app, other.id, 'foreign')
    const res = await post(app, brandId, { platform: 'instagram', assetIds: [foreign.id] })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('ASSET_NOT_IN_BRAND')
  })

  it('400s with ASSET_NOT_IN_BRAND on a soft-deleted assetId', async () => {
    const { app, brandId } = await seedBrand()
    const hidden = await seedAsset(app, brandId, 'hidden')
    await app.request(`/brands/${brandId}/assets/${hidden.id}`, {
      method: 'DELETE',
      headers: auth(),
    })
    const res = await post(app, brandId, { platform: 'instagram', assetIds: [hidden.id] })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('ASSET_NOT_IN_BRAND')
  })
})

describe('GET /brands/:id/social-posts', () => {
  // The SQL ordering the client's `bySchedule` mirrors: the unscheduled tray
  // first, then scheduled posts chronologically.
  it('returns the tray first, then scheduled posts in slot order', async () => {
    const { app, brandId } = await seedBrand()
    await post(app, brandId, { platform: 'x', scheduledAt: '2026-08-20T10:00:00.000Z' })
    await post(app, brandId, { platform: 'other' })
    await post(app, brandId, { platform: 'linkedin', scheduledAt: '2026-08-05T08:00:00.000Z' })
    const rows = await listPosts(app, brandId)
    expect(rows.map((r) => [r.platform, r.scheduledAt])).toEqual([
      ['other', null],
      ['linkedin', '2026-08-05T08:00:00.000Z'],
      ['x', '2026-08-20T10:00:00.000Z'],
    ])
  })

  it('does not return soft-deleted rows', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (await post(app, brandId, { platform: 'tiktok' })).json()) as SocialPost
    await app.request(`/brands/${brandId}/social-posts/${row.id}`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect(await listPosts(app, brandId)).toHaveLength(0)
  })

  it('does not leak another brand’s posts', async () => {
    const { app, workspaceId, brandId } = await seedBrand()
    const other = (await (
      await app.request(`/workspaces/${workspaceId}/brands`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'Other' }),
      })
    ).json()) as { id: string }
    await post(app, brandId, { platform: 'instagram' })
    expect(await listPosts(app, other.id)).toHaveLength(0)
  })
})

describe('PATCH /brands/:id/social-posts/:postId', () => {
  it('patches single keys and leaves the rest alone', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (
      await post(app, brandId, {
        platform: 'instagram',
        scheduledAt: '2026-08-14T10:30:00.000Z',
        body: 'Cut one.',
      })
    ).json()) as SocialPost
    const res = await patch(app, brandId, row.id, { body: 'Cut two.', status: 'ready' })
    expect(res.status).toBe(200)
    const updated = (await res.json()) as SocialPost
    expect(updated).toMatchObject({
      body: 'Cut two.',
      status: 'ready',
      platform: 'instagram',
      scheduledAt: '2026-08-14T10:30:00.000Z',
    })
  })

  it('unschedules on an explicit null and leaves the slot alone when omitted', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (
      await post(app, brandId, { platform: 'x', scheduledAt: '2026-08-14T10:30:00.000Z' })
    ).json()) as SocialPost

    const kept = (await (await patch(app, brandId, row.id, { body: 'still slotted' })).json()) as {
      scheduledAt: string | null
    }
    expect(kept.scheduledAt).toBe('2026-08-14T10:30:00.000Z')

    const freed = (await (await patch(app, brandId, row.id, { scheduledAt: null })).json()) as {
      scheduledAt: string | null
    }
    expect(freed.scheduledAt).toBeNull()
  })

  it('omitted assetIds leaves attachments; [] clears; a list replaces in order', async () => {
    const { app, brandId } = await seedBrand()
    const [a, b] = [await seedAsset(app, brandId, 'a'), await seedAsset(app, brandId, 'b')]
    const row = (await (
      await post(app, brandId, { platform: 'pinterest', assetIds: [a.id] })
    ).json()) as SocialPost

    const kept = (await (await patch(app, brandId, row.id, { body: 'x' })).json()) as SocialPost
    expect(kept.assetIds).toEqual([a.id])

    const swapped = (await (
      await patch(app, brandId, row.id, { assetIds: [b.id, a.id] })
    ).json()) as SocialPost
    expect(swapped.assetIds).toEqual([b.id, a.id])

    const cleared = (await (
      await patch(app, brandId, row.id, { assetIds: [] })
    ).json()) as SocialPost
    expect(cleared.assetIds).toEqual([])
  })

  it('400s on an empty patch rather than writing a no-op', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (await post(app, brandId, { platform: 'x' })).json()) as SocialPost
    expect((await patch(app, brandId, row.id, {})).status).toBe(400)
  })

  // `deletedAt` is not a patch key: zod strips it, the patch empties, the
  // refine fires. Deletion stays its own verb.
  it('400s on a patch that only names deletedAt', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (await post(app, brandId, { platform: 'x' })).json()) as SocialPost
    expect((await patch(app, brandId, row.id, { deletedAt: null })).status).toBe(400)
  })

  it('400s on cross-brand and soft-deleted assetIds on patch too', async () => {
    const { app, workspaceId, brandId } = await seedBrand()
    const other = (await (
      await app.request(`/workspaces/${workspaceId}/brands`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'Other' }),
      })
    ).json()) as { id: string }
    const foreign = await seedAsset(app, other.id, 'foreign')
    const hidden = await seedAsset(app, brandId, 'hidden')
    await app.request(`/brands/${brandId}/assets/${hidden.id}`, {
      method: 'DELETE',
      headers: auth(),
    })
    const row = (await (await post(app, brandId, { platform: 'x' })).json()) as SocialPost

    for (const assetIds of [[foreign.id], [hidden.id]]) {
      const res = await patch(app, brandId, row.id, { assetIds })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { code: string }).code).toBe('ASSET_NOT_IN_BRAND')
    }
    // Neither rejected patch touched the row.
    const [still] = await listPosts(app, brandId)
    expect(still?.assetIds).toEqual([])
  })

  // `requireBrandAccess` passes — the caller owns both brands — so the only
  // thing standing between the two is `updateSocialPost`'s brand scoping.
  it('404s for a post id belonging to another of the caller’s own brands', async () => {
    const { app, workspaceId, brandId } = await seedBrand()
    const other = (await (
      await app.request(`/workspaces/${workspaceId}/brands`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'Other' }),
      })
    ).json()) as { id: string }
    const row = (await (
      await post(app, brandId, { platform: 'x', body: 'Mine.' })
    ).json()) as SocialPost

    const res = await patch(app, other.id, row.id, { body: 'Hijacked.' })
    expect(res.status).toBe(404)
    expect(((await res.json()) as { code: string }).code).toBe('SOCIAL_POST_NOT_FOUND')
    const [still] = await listPosts(app, brandId)
    expect(still?.body).toBe('Mine.')
  })
})

describe('DELETE /brands/:id/social-posts/:postId', () => {
  it('soft-deletes and returns the row, which stays in state', async () => {
    const { app, brandId, state } = await seedBrand()
    const row = (await (await post(app, brandId, { platform: 'facebook' })).json()) as SocialPost
    const res = await app.request(`/brands/${brandId}/social-posts/${row.id}`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as SocialPost).deletedAt).not.toBeNull()
    // Hidden, not gone — the Undo's whole premise.
    expect(state.socialPosts.has(row.id)).toBe(true)
  })

  it('404s on a second delete rather than re-hiding a hidden row', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (await post(app, brandId, { platform: 'x' })).json()) as SocialPost
    const del = () =>
      app.request(`/brands/${brandId}/social-posts/${row.id}`, {
        method: 'DELETE',
        headers: auth(),
      })
    expect((await del()).status).toBe(200)
    expect((await del()).status).toBe(404)
  })

  it('404s on a patch to a soft-deleted post', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (await post(app, brandId, { platform: 'x' })).json()) as SocialPost
    await app.request(`/brands/${brandId}/social-posts/${row.id}`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect((await patch(app, brandId, row.id, { body: 'Resurrected.' })).status).toBe(404)
  })

  it('404s for an unknown post id', async () => {
    const { app, brandId } = await seedBrand()
    const res = await app.request(`/brands/${brandId}/social-posts/sp-nope`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect(res.status).toBe(404)
  })
})

describe('POST /brands/:id/social-posts/:postId/restore', () => {
  it('brings a deleted post back, attachments intact', async () => {
    const { app, brandId } = await seedBrand()
    const asset = await seedAsset(app, brandId)
    const row = (await (
      await post(app, brandId, { platform: 'youtube', body: 'Misclicked.', assetIds: [asset.id] })
    ).json()) as SocialPost
    await app.request(`/brands/${brandId}/social-posts/${row.id}`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect(await listPosts(app, brandId)).toHaveLength(0)

    const res = await app.request(`/brands/${brandId}/social-posts/${row.id}/restore`, {
      method: 'POST',
      headers: auth(),
    })
    expect(res.status).toBe(200)
    const restored = (await res.json()) as SocialPost
    expect(restored.deletedAt).toBeNull()
    expect(restored.body).toBe('Misclicked.')
    // Join rows were never touched, so the attachments come back with it.
    expect(restored.assetIds).toEqual([asset.id])
    expect(await listPosts(app, brandId)).toHaveLength(1)
  })

  it('404s for a post that is not deleted, so a replayed Undo is inert', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (await post(app, brandId, { platform: 'x' })).json()) as SocialPost
    const res = await app.request(`/brands/${brandId}/social-posts/${row.id}/restore`, {
      method: 'POST',
      headers: auth(),
    })
    expect(res.status).toBe(404)
  })

  it('404s for a brand that does not exist, before it looks at the post', async () => {
    const { app } = await seedBrand()
    const res = await app.request('/brands/b-nope/social-posts/sp-1/restore', {
      method: 'POST',
      headers: auth(),
    })
    expect(res.status).toBe(404)
  })
})
