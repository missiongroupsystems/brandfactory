import type { BlobStore } from '@brandfactory/adapter-storage'
import type { BrandAsset, UserId } from '@brandfactory/shared'
import { describe, expect, it, vi } from 'vitest'
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

/**
 * A `BlobStore` whose `delete` is observable. `del` is typed with its key
 * parameter so `del.mock.calls[0][0]` is a `string` rather than an element of
 * an empty tuple — the sweep assertions are about *which* key, not just that
 * something was swept.
 */
function spyStorage() {
  const del = vi.fn(async (_key: string) => {})
  const storage: BlobStore = {
    put: async () => {},
    get: async () => new Uint8Array(),
    delete: del,
    getSignedReadUrl: async () => 'http://signed',
    getSignedWriteUrl: async () => ({ url: 'http://signed' }),
  }
  return { del, storage }
}

const COLOR = { kind: 'color', source: 'inline', label: 'Terracotta', value: '#b5573c' }
const LOGO = { kind: 'image', source: 'blob', label: 'Mark', blobKey: 'brands/mark.svg' }

// `TestHarness['app']` rather than `ReturnType<typeof seedBrand>['app']`: the
// composed Hono type carries every route's signature, and asking TypeScript to
// re-derive it through an inferred async return is a TS2589 ("excessively
// deep").
async function post(app: TestHarness['app'], brandId: string, body: unknown) {
  return app.request(`/brands/${brandId}/assets`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify(body),
  })
}

describe('asset routes — access', () => {
  it('401s without a token', async () => {
    const { app, brandId } = await seedBrand()
    const res = await app.request(`/brands/${brandId}/assets`)
    expect(res.status).toBe(401)
  })

  // Every handler goes through `requireBrandAccess`, which resolves the brand's
  // workspace and checks ownership. A brand in somebody else's workspace is a
  // 403, not a 404 — the same shape the sibling brand routes have.
  it('403s for a brand in a workspace the caller does not own', async () => {
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
    for (const [method, path] of [
      ['GET', '/brands/b-theirs/assets'],
      ['POST', '/brands/b-theirs/assets'],
      ['PATCH', '/brands/b-theirs/assets/a-1'],
      ['DELETE', '/brands/b-theirs/assets/a-1'],
    ] as const) {
      const res = await app.request(path, {
        method,
        headers: auth(),
        ...(method === 'POST' ? { body: JSON.stringify(COLOR) } : {}),
        ...(method === 'PATCH' ? { body: JSON.stringify({ label: 'x' }) } : {}),
      })
      expect(res.status, `${method} ${path}`).toBe(403)
    }
  })

  it('404s for a brand that does not exist', async () => {
    const { app } = await seedBrand()
    const res = await app.request('/brands/b-nope/assets', { headers: auth() })
    expect(res.status).toBe(404)
  })
})

describe('POST /brands/:id/assets', () => {
  it('creates each source and returns 201 with the stored row', async () => {
    const { app, brandId } = await seedBrand()
    for (const body of [
      COLOR,
      LOGO,
      { kind: 'image', source: 'link', label: 'CDN', url: 'https://cdn.example.com/a.svg' },
    ]) {
      const res = await post(app, brandId, body)
      expect(res.status).toBe(201)
      const row = (await res.json()) as BrandAsset
      expect(row.brandId).toBe(brandId)
      expect(row.source).toBe(body.source)
    }
  })

  // The whole reason the create body is a `discriminatedUnion` rather than a
  // flat object with a `.refine`: a source that carries no value of its own is
  // a 400 with a field path, and `brand_assets_source_exactly_one` never sees
  // it.
  it.each([
    ['inline with no value', { kind: 'color', source: 'inline', label: 'x' }],
    ['blob with no key', { kind: 'image', source: 'blob', label: 'x' }],
    [
      'blob carrying only a url',
      { kind: 'image', source: 'blob', label: 'x', url: 'https://a.t/b' },
    ],
    ['link with no url', { kind: 'image', source: 'link', label: 'x' }],
    ['an unknown source', { kind: 'image', source: 'ipfs', label: 'x', url: 'https://a.test/b' }],
  ])('400s on %s', async (_name, body) => {
    const { app, brandId, state } = await seedBrand()
    expect((await post(app, brandId, body)).status).toBe(400)
    expect(state.assets.size).toBe(0)
  })

  /**
   * The *other* half of the exactly-one-of rule at the wire, and it is not a
   * rejection — it is a strip. Zod objects drop unknown keys rather than
   * failing on them, so a body naming `inline` and *also* carrying a `blobKey`
   * is accepted and the stray column never reaches the insert.
   *
   * That is the right outcome and it is deliberately not `.strict()`. A strict
   * wire schema turns "a newer client sent a field this server has not shipped
   * yet" into a 400, and the same stripping is what makes `PATCH` safe against
   * an attempt to rewrite `source` — being strict here and lenient there would
   * be two answers to one question. The invariant that matters survives either
   * way: the row that lands can only carry the column its own `source` names.
   */
  it('strips a source column that does not belong to the named source', async () => {
    const { app, brandId } = await seedBrand()
    const res = await post(app, brandId, { ...COLOR, blobKey: 'k', url: 'https://a.test/b' })
    expect(res.status).toBe(201)
    const row = (await res.json()) as BrandAsset
    expect(row.source).toBe('inline')
    expect(row).not.toHaveProperty('blobKey')
    expect(row).not.toHaveProperty('url')
  })

  // Same rule and same reason as `websiteUrl` in 1A: `javascript:` and `data:`
  // are syntactically valid URLs, and this one is rendered into a `src`.
  it.each(['javascript:alert(1)', 'data:text/html,<script>', 'ftp://a.test/b', '/relative.png'])(
    '400s on a link url of %s',
    async (url) => {
      const { app, brandId } = await seedBrand()
      const res = await post(app, brandId, { kind: 'image', source: 'link', label: 'x', url })
      expect(res.status).toBe(400)
    },
  )

  it('defaults status to active and role to null', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (await post(app, brandId, COLOR)).json()) as BrandAsset
    expect(row.status).toBe('active')
    expect(row.role).toBeNull()
  })

  it('takes a proposed asset with a role', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (
      await post(app, brandId, { ...COLOR, status: 'proposed', role: 'primary' })
    ).json()) as BrandAsset
    expect(row).toMatchObject({ status: 'proposed', role: 'primary' })
  })

  // Appending server-side is what stops every client reading the whole list
  // before it can add one row.
  it('appends by position within the asset’s own kind', async () => {
    const { app, brandId } = await seedBrand()
    const first = (await (await post(app, brandId, COLOR)).json()) as BrandAsset
    const second = (await (await post(app, brandId, COLOR)).json()) as BrandAsset
    expect(first.position).toBe(100)
    expect(second.position).toBe(200)

    // A different kind starts its own run. Sharing one counter would put a new
    // colour behind the twelfth photo, at the front of a list it meant to join.
    const image = (await (await post(app, brandId, LOGO)).json()) as BrandAsset
    expect(image.position).toBe(100)
  })

  it('honours an explicit position', async () => {
    const { app, brandId } = await seedBrand()
    await post(app, brandId, COLOR)
    const row = (await (await post(app, brandId, { ...COLOR, position: 50 })).json()) as BrandAsset
    expect(row.position).toBe(50)
  })
})

describe('GET /brands/:id/assets', () => {
  // The rail's job is to show a brand mid-decision, so filtering by status here
  // would make that surface impossible to write without a second query.
  it('returns proposed rows alongside active ones', async () => {
    const { app, brandId } = await seedBrand()
    await post(app, brandId, COLOR)
    await post(app, brandId, { ...COLOR, label: 'Floated', status: 'proposed' })
    const rows = (await (
      await app.request(`/brands/${brandId}/assets`, { headers: auth() })
    ).json()) as BrandAsset[]
    expect(rows.map((r) => r.status).sort()).toEqual(['active', 'proposed'])
  })

  it('does not return soft-deleted rows', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (await post(app, brandId, COLOR)).json()) as BrandAsset
    await app.request(`/brands/${brandId}/assets/${row.id}`, { method: 'DELETE', headers: auth() })
    const rows = (await (
      await app.request(`/brands/${brandId}/assets`, { headers: auth() })
    ).json()) as BrandAsset[]
    expect(rows).toHaveLength(0)
  })

  it('does not leak another brand’s assets', async () => {
    const { app, workspaceId, brandId } = await seedBrand()
    const other = (await (
      await app.request(`/workspaces/${workspaceId}/brands`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'Other' }),
      })
    ).json()) as { id: string }
    await post(app, brandId, COLOR)
    const rows = (await (
      await app.request(`/brands/${other.id}/assets`, { headers: auth() })
    ).json()) as BrandAsset[]
    expect(rows).toHaveLength(0)
  })
})

describe('PATCH /brands/:id/assets/:assetId', () => {
  it('patches label, status, role, alt and position', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (await post(app, brandId, COLOR)).json()) as BrandAsset
    const res = await app.request(`/brands/${brandId}/assets/${row.id}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ label: 'Terracotta 500', status: 'proposed', role: 'primary' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      label: 'Terracotta 500',
      status: 'proposed',
      role: 'primary',
    })
  })

  it('leaves omitted columns alone and clears on an explicit null', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (
      await post(app, brandId, { ...COLOR, role: 'primary', alt: 'the awning' })
    ).json()) as BrandAsset

    const patched = (await (
      await app.request(`/brands/${brandId}/assets/${row.id}`, {
        method: 'PATCH',
        headers: auth(),
        body: JSON.stringify({ status: 'proposed' }),
      })
    ).json()) as BrandAsset
    expect(patched.role).toBe('primary')
    expect(patched.alt).toBe('the awning')

    const cleared = (await (
      await app.request(`/brands/${brandId}/assets/${row.id}`, {
        method: 'PATCH',
        headers: auth(),
        body: JSON.stringify({ role: null, alt: null }),
      })
    ).json()) as BrandAsset
    expect(cleared.role).toBeNull()
    expect(cleared.alt).toBeNull()
    expect(cleared.label).toBe('Terracotta')
  })

  // `source`, `kind` and the three source columns are absent from the patch
  // schema on purpose — a patch that could set them one at a time is the one
  // shape that walks a row past the CHECK a column at a time.
  it('ignores an attempt to change source, kind or the source column', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (await post(app, brandId, COLOR)).json()) as BrandAsset
    const patched = (await (
      await app.request(`/brands/${brandId}/assets/${row.id}`, {
        method: 'PATCH',
        headers: auth(),
        body: JSON.stringify({ label: 'x', source: 'link', kind: 'file', url: 'https://a.test/b' }),
      })
    ).json()) as BrandAsset
    expect(patched.source).toBe('inline')
    expect(patched.kind).toBe('color')
    expect(patched).not.toHaveProperty('url')
  })

  it('400s on an empty patch rather than writing a no-op', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (await post(app, brandId, COLOR)).json()) as BrandAsset
    const res = await app.request(`/brands/${brandId}/assets/${row.id}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  // `requireBrandAccess` passes — the caller owns both brands — so the only
  // thing standing between the two is `updateAsset`'s brand scoping.
  it('404s for an asset id belonging to another of the caller’s own brands', async () => {
    const { app, workspaceId, brandId } = await seedBrand()
    const other = (await (
      await app.request(`/workspaces/${workspaceId}/brands`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'Other' }),
      })
    ).json()) as { id: string }
    const row = (await (await post(app, brandId, COLOR)).json()) as BrandAsset

    const res = await app.request(`/brands/${other.id}/assets/${row.id}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ label: 'Hijacked' }),
    })
    expect(res.status).toBe(404)
    const [still] = (await (
      await app.request(`/brands/${brandId}/assets`, { headers: auth() })
    ).json()) as BrandAsset[]
    expect(still?.label).toBe('Terracotta')
  })
})

describe('DELETE /brands/:id/assets/:assetId', () => {
  it('soft-deletes and returns the row', async () => {
    const { app, brandId, state } = await seedBrand()
    const row = (await (await post(app, brandId, LOGO)).json()) as BrandAsset
    const res = await app.request(`/brands/${brandId}/assets/${row.id}`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as BrandAsset).deletedAt).not.toBeNull()
    // The row is hidden, not gone — it can come back (`docs/vision.md:51`).
    expect(state.assets.has(row.id)).toBe(true)
  })

  // The acceptance criterion of this phase's one deviation from its siblings.
  // `DELETE /brands/:id` and `DELETE /projects/:id` both sweep; this must not,
  // or "hidden" silently means "destroyed".
  it('does not sweep the blob', async () => {
    const { del, storage } = spyStorage()
    const { app, brandId } = await seedBrand({ storage })
    const row = (await (await post(app, brandId, LOGO)).json()) as BrandAsset
    await app.request(`/brands/${brandId}/assets/${row.id}`, { method: 'DELETE', headers: auth() })
    expect(del).not.toHaveBeenCalled()
  })

  // The other half of the same rule: the bytes are the brand's, and the brand
  // going away is the one event that destroys them — soft-deleted or not.
  // Without 2A's widened `listBlobKeysByBrand` this sweeps nothing.
  it('brand delete sweeps a soft-deleted asset’s blob, and not a link', async () => {
    const { del, storage } = spyStorage()
    const { app, brandId } = await seedBrand({ storage })
    const row = (await (await post(app, brandId, LOGO)).json()) as BrandAsset
    await post(app, brandId, {
      kind: 'image',
      source: 'link',
      label: 'Not ours',
      url: 'https://cdn.example.com/not-ours.svg',
    })
    await app.request(`/brands/${brandId}/assets/${row.id}`, { method: 'DELETE', headers: auth() })

    await app.request(`/brands/${brandId}`, { method: 'DELETE', headers: auth() })
    expect(del.mock.calls.map((call) => call[0])).toEqual(['brands/mark.svg'])
  })

  it('404s for an unknown asset id', async () => {
    const { app, brandId } = await seedBrand()
    const res = await app.request(`/brands/${brandId}/assets/as-nope`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect(res.status).toBe(404)
  })
})
