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
const FILE = { kind: 'file', source: 'blob', label: 'Brand deck', blobKey: 'brands/deck.pdf' }

// `TestHarness['app']` rather than `ReturnType<typeof seedBrand>['app']`: the
// composed Hono type carries every route's signature, and asking TypeScript to
// re-derive it through an inferred async return is a TS2589 ("excessively
// deep").
async function listAssets(app: TestHarness['app'], brandId: string) {
  const res = await app.request(`/brands/${brandId}/assets`, { headers: auth() })
  return (await res.json()) as BrandAsset[]
}

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
  // Shared-access model: a non-owner is no longer forbidden. Every
  // authenticated user reaches every brand's asset routes.
  it('lets any authenticated user reach a brand in a workspace they do not own', async () => {
    const { app, state } = createTestApp({
      users: [USER, { id: 'u-2', token: 't-2' }],
    })
    state.workspaces.set('w-theirs', {
      id: 'w-theirs' as never,
      name: 'theirs',
      ownerUserId: 'u-2' as UserId,
      linkedToPassport: false,
      createdAt: 't',
      updatedAt: 't',
    })
    state.brands.set('b-theirs', {
      id: 'b-theirs' as never,
      workspaceId: 'w-theirs' as never,
      name: 'Theirs',
      description: null,
      websiteUrl: null,
      linkedToPassport: false,
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
      expect(res.status, `${method} ${path}`).not.toBe(403)
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

  /**
   * `library` is optional at the wire and required on the row, and the route is
   * what closes the gap. These cases are what pin it to `defaultLibraryFor`
   * rather than to a copy of the rule that happens to agree today — the fake
   * takes `library` straight off its input and defaults nothing, so a route that
   * stopped resolving would fail here rather than quietly file everything as
   * identity.
   */
  it.each([
    ['a colour', COLOR, 'identity'],
    ['an image with no role', { ...LOGO, role: null }, 'photography'],
    ['an image marked as the logo', { ...LOGO, role: 'logo' }, 'identity'],
    ['an image marked as a mark', { ...LOGO, role: 'mark' }, 'identity'],
    ['a file with no role', FILE, 'collateral'],
    ['a logo lockup delivered as a file', { ...FILE, role: 'logo' }, 'identity'],
    ['a typeface', { ...FILE, role: 'typeface' }, 'identity'],
  ])('files %s with no library given', async (_name, body, library) => {
    const { app, brandId } = await seedBrand()
    const row = (await (await post(app, brandId, body)).json()) as BrandAsset
    expect(row.library).toBe(library)
  })

  // Filing is a human judgement (that is the whole reason it is a column), so a
  // client that states one wins over the rule that guesses.
  it('takes an explicit library over the default it disagrees with', async () => {
    const { app, brandId } = await seedBrand()
    const menu = (await (
      await post(app, brandId, { ...LOGO, label: 'Menu, A4', library: 'collateral' })
    ).json()) as BrandAsset
    expect(menu.library).toBe('collateral')
  })

  it('400s on a library that is not a shelf', async () => {
    const { app, brandId } = await seedBrand()
    expect((await post(app, brandId, { ...COLOR, library: 'moodboard' })).status).toBe(400)
  })

  // The append scope is `(library, kind)`, not `kind`. Both rows here are
  // images, so the `kind` half cannot separate them: without the `library`
  // clause the new photograph would take its number from the collateral shelf
  // and land at 600, an ordering nobody chose.
  it('appends within the shelf, not across the brand’s images', async () => {
    const { app, brandId } = await seedBrand()
    await post(app, brandId, { ...LOGO, label: 'Menu', library: 'collateral', position: 500 })
    const photo = (await (
      await post(app, brandId, { ...LOGO, label: 'Storefront', library: 'photography' })
    ).json()) as BrandAsset
    expect(photo.position).toBe(100)

    // And within one shelf it still runs on, which is the half that already worked.
    const next = (await (
      await post(app, brandId, { ...LOGO, label: 'Back room', library: 'photography' })
    ).json()) as BrandAsset
    expect(next.position).toBe(200)
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

  /**
   * **Move to…, end to end.** A patch carrying nothing but `library` — which is
   * the only call that feature ever makes, and which the schema rejected as an
   * empty body until `UpdateBrandAssetInputSchema` grew its sixth `.refine`
   * clause. The 400 case above is the other half of the same guard.
   */
  it('moves an asset to another shelf on a library-only patch', async () => {
    const { app, brandId } = await seedBrand()
    const menu = (await (await post(app, brandId, { ...LOGO, label: 'Menu, A4' })).json()) as
      | BrandAsset
      | undefined
    expect(menu?.library).toBe('photography')

    const res = await app.request(`/brands/${brandId}/assets/${menu!.id}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ library: 'collateral' }),
    })
    expect(res.status).toBe(200)
    const moved = (await res.json()) as BrandAsset
    expect(moved.library).toBe('collateral')
    // Nothing rode along with it — `undefined` leaves a column alone.
    expect(moved).toMatchObject({ label: 'Menu, A4', position: 100, role: null })

    const [reread] = await listAssets(app, brandId)
    expect(reread?.library).toBe('collateral')
  })

  // The existing brand scoping, re-asserted through the new key: a shelf is not
  // a way around the boundary every other column already respects.
  it('404s on a library patch aimed at another brand’s asset', async () => {
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
      body: JSON.stringify({ library: 'collateral' }),
    })
    expect(res.status).toBe(404)
    const [still] = await listAssets(app, brandId)
    expect(still?.library).toBe('identity')
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

  /**
   * The Stage 1–2 review's sweep finding.
   *
   * `POST /brands/:id/assets` takes `blobKey` from the client and checks
   * neither that the key exists nor that the caller minted it — the signed-URL
   * transport is built so the server stays out of the byte path, and the key it
   * hands back is the only token there is. Tolerable for a read. Stage 2 made a
   * stored key something the **brand cascade destroys**, so a row pointing at
   * bytes it does not own turned a delete of your own brand into a delete of
   * another brand's file.
   *
   * Not reachable in practice — keys embed a v4 UUID and workspaces are
   * single-owner — which is exactly why it needs a test rather than a live
   * repro. `listStillReferencedBlobKeys` makes it safe by construction: sweep
   * only what nothing else points at.
   */
  it('does not sweep a key another brand’s asset still points at', async () => {
    const { del, storage } = spyStorage()
    const { app, workspaceId } = await seedBrand({ storage })
    const victim = (await (
      await app.request(`/workspaces/${workspaceId}/brands`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'Victim' }),
      })
    ).json()) as { id: string }
    const attacker = (await (
      await app.request(`/workspaces/${workspaceId}/brands`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'Attacker' }),
      })
    ).json()) as { id: string }

    // The victim owns the bytes; the attacker's brand merely names the key.
    await post(app, victim.id, { ...LOGO, blobKey: 'uploads/victim/logo.svg' })
    await post(app, attacker.id, { ...LOGO, blobKey: 'uploads/victim/logo.svg' })
    await post(app, attacker.id, { ...LOGO, label: 'Mine', blobKey: 'uploads/attacker/own.svg' })

    await app.request(`/brands/${attacker.id}`, { method: 'DELETE', headers: auth() })

    // Its own key goes. The victim's does not.
    expect(del.mock.calls.map((call) => call[0])).toEqual(['uploads/attacker/own.svg'])
  })

  // The other direction, and the one that proves the subtraction is not simply
  // "never sweep a shared key": once the last reference goes, the bytes go.
  it('sweeps the key once the final reference is deleted', async () => {
    const { del, storage } = spyStorage()
    const { app, workspaceId } = await seedBrand({ storage })
    const brands: string[] = []
    for (const name of ['One', 'Two']) {
      const b = (await (
        await app.request(`/workspaces/${workspaceId}/brands`, {
          method: 'POST',
          headers: auth(),
          body: JSON.stringify({ name }),
        })
      ).json()) as { id: string }
      brands.push(b.id)
      await post(app, b.id, { ...LOGO, blobKey: 'uploads/shared/logo.svg' })
    }

    await app.request(`/brands/${brands[0]}`, { method: 'DELETE', headers: auth() })
    expect(del).not.toHaveBeenCalled()

    await app.request(`/brands/${brands[1]}`, { method: 'DELETE', headers: auth() })
    expect(del.mock.calls.map((call) => call[0])).toEqual(['uploads/shared/logo.svg'])
  })

  it('404s for an unknown asset id', async () => {
    const { app, brandId } = await seedBrand()
    const res = await app.request(`/brands/${brandId}/assets/as-nope`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect(res.status).toBe(404)
  })

  // Added by the Stage 1–2 review. Before it, a second DELETE moved `deletedAt`
  // forward on an already-hidden row and returned 200 — which would quietly
  // extend the window an Undo is measured against.
  it('404s on a second delete rather than re-hiding a hidden row', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (await post(app, brandId, LOGO)).json()) as BrandAsset
    const del = () =>
      app.request(`/brands/${brandId}/assets/${row.id}`, { method: 'DELETE', headers: auth() })
    expect((await del()).status).toBe(200)
    expect((await del()).status).toBe(404)
  })

  // A patch that lands on a soft-deleted row is editing something no read path
  // returns and the caller cannot see.
  it('404s on a patch to a soft-deleted asset', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (await post(app, brandId, LOGO)).json()) as BrandAsset
    await app.request(`/brands/${brandId}/assets/${row.id}`, { method: 'DELETE', headers: auth() })
    const res = await app.request(`/brands/${brandId}/assets/${row.id}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ label: 'Resurrected' }),
    })
    expect(res.status).toBe(404)
  })
})

/**
 * The Undo behind the delete. 1.10.0 shipped delete with no confirmation and no
 * way back and named the fix as an Undo rather than a dialog; the row was always
 * recoverable — nothing sweeps its bytes — and simply had no caller.
 */
describe('POST /brands/:id/assets/:assetId/restore', () => {
  it('brings a soft-deleted asset back into the list', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (await post(app, brandId, LOGO)).json()) as BrandAsset
    await app.request(`/brands/${brandId}/assets/${row.id}`, { method: 'DELETE', headers: auth() })
    expect(await listAssets(app, brandId)).toHaveLength(0)

    const res = await app.request(`/brands/${brandId}/assets/${row.id}/restore`, {
      method: 'POST',
      headers: auth(),
    })
    expect(res.status).toBe(200)
    const restored = (await res.json()) as BrandAsset
    expect(restored.deletedAt).toBeNull()
    // Back where it was — a restore is a state change, not a re-create.
    expect(restored.position).toBe(row.position)
    expect(await listAssets(app, brandId)).toHaveLength(1)
  })

  it('404s for an asset that is not deleted, so a replayed Undo is inert', async () => {
    const { app, brandId } = await seedBrand()
    const row = (await (await post(app, brandId, LOGO)).json()) as BrandAsset
    const res = await app.request(`/brands/${brandId}/assets/${row.id}/restore`, {
      method: 'POST',
      headers: auth(),
    })
    expect(res.status).toBe(404)
  })

  it('404s for a brand that does not exist, before it looks at the asset', async () => {
    const { app } = await seedBrand()
    const res = await app.request(`/brands/b-nope/assets/as-1/restore`, {
      method: 'POST',
      headers: auth(),
    })
    expect(res.status).toBe(404)
  })
})

/**
 * Batch re-position. `reorderAssets` had been live-tested in `@brandfactory/db`
 * and reachable from nothing since 2A; 2E's drag handler settled for N
 * independent `PATCH`es whose interleaving decided the final order.
 *
 * Spelled `PATCH /brands/:id/assets` rather than `POST …/reorder` — see the
 * route, where a literal segment beside a sibling's parameter turned out to
 * downgrade Hono's router for the entire app.
 */
describe('PATCH /brands/:id/assets — reorder', () => {
  async function seedThree(opts: Parameters<typeof createTestApp>[0] = {}) {
    const { app, brandId, ...rest } = await seedBrand(opts)
    const rows: BrandAsset[] = []
    for (const label of ['A', 'B', 'C']) {
      rows.push((await (await post(app, brandId, { ...COLOR, label })).json()) as BrandAsset)
    }
    return { app, brandId, rows, ...rest }
  }

  const reorder = (app: TestHarness['app'], brandId: string, updates: unknown) =>
    app.request(`/brands/${brandId}/assets`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ updates }),
    })

  it('applies every position and returns the brand’s full list', async () => {
    const { app, brandId, rows } = await seedThree()
    const [a, b, c] = rows as [BrandAsset, BrandAsset, BrandAsset]
    const res = await reorder(app, brandId, [
      { id: c.id, position: 100 },
      { id: a.id, position: 200 },
      { id: b.id, position: 300 },
    ])
    expect(res.status).toBe(200)
    const list = (await res.json()) as BrandAsset[]
    expect(list.map((r) => r.label)).toEqual(['C', 'A', 'B'])
  })

  // The property N patches could not have. A batch naming one row that is not
  // this brand's must leave the ordering exactly as it found it.
  it('rolls the whole batch back when one id does not belong to the brand', async () => {
    const { app, brandId, rows } = await seedThree()
    const [a, b] = rows as [BrandAsset, BrandAsset, BrandAsset]
    const res = await reorder(app, brandId, [
      { id: a.id, position: 900 },
      { id: b.id, position: 100 },
      { id: '00000000-0000-4000-8000-000000000000', position: 200 },
    ])
    expect(res.status).toBe(404)
    const list = await listAssets(app, brandId)
    expect(list.map((r) => r.label)).toEqual(['A', 'B', 'C'])
    expect(list.map((r) => r.position)).toEqual([100, 200, 300])
  })

  it('400s on an empty batch', async () => {
    const { app, brandId } = await seedThree()
    expect((await reorder(app, brandId, [])).status).toBe(400)
  })

  it('lets a non-owner reach the reorder handler (shared access); a missing asset 404s', async () => {
    // `u-2` is authenticated and not the owner; under shared access it reaches
    // the handler, where a reorder of a non-existent asset id is a 404.
    const { app, brandId } = await seedThree({ users: [USER, { id: 'u-2', token: 't-2' }] })
    const res = await app.request(`/brands/${brandId}/assets`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-2', 'content-type': 'application/json' },
      body: JSON.stringify({
        updates: [{ id: '00000000-0000-4000-8000-000000000000', position: 1 }],
      }),
    })
    expect(res.status).toBe(404)
  })
})
