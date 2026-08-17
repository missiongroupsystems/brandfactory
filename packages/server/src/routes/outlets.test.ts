import type { Outlet } from '@brandfactory/shared'
import { OutletSchema } from '@brandfactory/shared'
import { describe, expect, it } from 'vitest'
import { createTestApp, type TestHarness } from '../test-helpers'

const USER = { id: 'u-1', token: 't-1' }
const OTHER = { id: 'u-2', token: 't-2' }

function auth(token = USER.token) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

/** A workspace with one brand in it — the two things an outlet can point at. */
async function seedWorkspace(opts: Parameters<typeof createTestApp>[0] = {}) {
  const harness = createTestApp({ users: [USER, OTHER], ...opts })
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

async function create(app: TestHarness['app'], workspaceId: string, body: unknown) {
  return app.request(`/workspaces/${workspaceId}/outlets`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify(body),
  })
}

async function createOk(app: TestHarness['app'], workspaceId: string, body: unknown) {
  const res = await create(app, workspaceId, body)
  expect(res.status).toBe(201)
  return (await res.json()) as Outlet
}

async function list(app: TestHarness['app'], workspaceId: string) {
  const res = await app.request(`/workspaces/${workspaceId}/outlets`, { headers: auth() })
  return (await res.json()) as Outlet[]
}

async function patch(
  app: TestHarness['app'],
  workspaceId: string,
  outletId: string,
  body: unknown,
) {
  return app.request(`/workspaces/${workspaceId}/outlets/${outletId}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify(body),
  })
}

const MINIMAL = { name: 'Casa Vostra', outletType: 'restaurant' }

describe('outlet routes — access', () => {
  it('401s without a token, on every method', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const outlet = await createOk(app, workspaceId, MINIMAL)
    const base = `/workspaces/${workspaceId}/outlets`

    for (const [method, path] of [
      ['GET', base],
      ['POST', base],
      ['GET', `${base}/${outlet.id}`],
      ['PATCH', `${base}/${outlet.id}`],
      ['DELETE', `${base}/${outlet.id}`],
    ] as const) {
      const res = await app.request(path, { method, body: method === 'GET' ? undefined : '{}' })
      expect(res.status, `${method} ${path}`).toBe(401)
    }
  })

  it('404s on a workspace that does not exist', async () => {
    const { app } = await seedWorkspace()
    const res = await app.request('/workspaces/ws-nope/outlets', { headers: auth() })
    expect(res.status).toBe(404)
  })

  it('cannot reach an outlet through another workspace', async () => {
    // The whole access story, and the reason there is no `requireOutletAccess`:
    // the query layer is workspace-scoped, so an id from elsewhere misses.
    const { app, workspaceId } = await seedWorkspace()
    const outlet = await createOk(app, workspaceId, MINIMAL)
    const other = (await (
      await app.request('/workspaces', {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'Other' }),
      })
    ).json()) as { id: string }

    const base = `/workspaces/${other.id}/outlets`
    expect((await app.request(`${base}/${outlet.id}`, { headers: auth() })).status).toBe(404)
    expect((await patch(app, other.id, outlet.id, { status: 'open' })).status).toBe(404)
    expect(
      (await app.request(`${base}/${outlet.id}`, { method: 'DELETE', headers: auth() })).status,
    ).toBe(404)
    // And the row is untouched.
    expect((await list(app, workspaceId)).length).toBe(1)
  })
})

describe('outlet routes — create', () => {
  it('creates from a name and a type alone, defaulting the rest', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const outlet = await createOk(app, workspaceId, MINIMAL)

    // Parsed rather than spot-checked: the response *is* the published contract,
    // and a missing key here is a runtime `undefined` in the client.
    expect(OutletSchema.safeParse(outlet).success).toBe(true)
    expect(outlet.status).toBe('pipeline')
    expect(outlet.slug).toBe('casa-vostra')
    expect(outlet.brandId).toBeNull()
    expect(outlet.attributes).toEqual([])
  })

  it('derives a distinct slug for a repeated name', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const first = await createOk(app, workspaceId, MINIMAL)
    const second = await createOk(app, workspaceId, MINIMAL)
    expect(first.slug).toBe('casa-vostra')
    expect(second.slug).toBe('casa-vostra-2')
  })

  it('rejects a body with no name', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const res = await create(app, workspaceId, { outletType: 'restaurant' })
    expect(res.status).toBe(400)
  })

  it('rejects a timestamp where a business date belongs', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const res = await create(app, workspaceId, { ...MINIMAL, openingDate: '2024-03-01T00:00:00Z' })
    expect(res.status).toBe(400)
  })

  it('accepts a brand in the same workspace', async () => {
    const { app, workspaceId, brandId } = await seedWorkspace()
    const outlet = await createOk(app, workspaceId, { ...MINIMAL, brandId })
    expect(outlet.brandId).toBe(brandId)
  })

  it('400s on a brand from another workspace, and writes nothing', async () => {
    // A 400 rather than a 404: the *outlet* route is fine; the body named a
    // brand this workspace does not have.
    const { app, workspaceId } = await seedWorkspace()
    const other = (await (
      await app.request('/workspaces', {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'Other' }),
      })
    ).json()) as { id: string }
    const foreign = (await (
      await app.request(`/workspaces/${other.id}/brands`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'Foreign' }),
      })
    ).json()) as { id: string }

    const res = await create(app, workspaceId, { ...MINIMAL, brandId: foreign.id })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('BRAND_NOT_IN_WORKSPACE')
    expect(await list(app, workspaceId)).toEqual([])
  })
})

describe('outlet routes — read', () => {
  it('lists a workspace in name order', async () => {
    const { app, workspaceId } = await seedWorkspace()
    await createOk(app, workspaceId, { name: 'Zephyr', outletType: 'bar' })
    await createOk(app, workspaceId, { name: 'Alma', outletType: 'cafe' })
    // Alphabetical, not insertion order — the list is exhaustive and read as a
    // directory.
    expect((await list(app, workspaceId)).map((o) => o.name)).toEqual(['Alma', 'Zephyr'])
  })

  it('resolves by slug and by id', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const outlet = await createOk(app, workspaceId, MINIMAL)
    const base = `/workspaces/${workspaceId}/outlets`

    for (const ref of [outlet.slug, outlet.id]) {
      const res = await app.request(`${base}/${ref}`, { headers: auth() })
      expect(res.status, ref).toBe(200)
      expect(((await res.json()) as Outlet).id).toBe(outlet.id)
    }
  })

  it('404s on an unknown ref rather than raising', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const res = await app.request(`/workspaces/${workspaceId}/outlets/no-such-outlet`, {
      headers: auth(),
    })
    expect(res.status).toBe(404)
  })
})

describe('outlet routes — patch', () => {
  it('touches only the keys it is sent', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const outlet = await createOk(app, workspaceId, {
      ...MINIMAL,
      address: '31 Keong Saik Road',
      notes: 'Corner unit.',
    })

    const res = await patch(app, workspaceId, outlet.id, { status: 'open' })
    expect(res.status).toBe(200)
    const updated = (await res.json()) as Outlet
    expect(updated.status).toBe('open')
    expect(updated.address).toBe('31 Keong Saik Road')
    expect(updated.notes).toBe('Corner unit.')
  })

  it('clears a field on an explicit null', async () => {
    const { app, workspaceId, brandId } = await seedWorkspace()
    const outlet = await createOk(app, workspaceId, { ...MINIMAL, brandId })
    const updated = (await (
      await patch(app, workspaceId, outlet.id, { brandId: null })
    ).json()) as Outlet
    expect(updated.brandId).toBeNull()
  })

  it('rejects an empty patch rather than performing a no-op write', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const outlet = await createOk(app, workspaceId, MINIMAL)
    expect((await patch(app, workspaceId, outlet.id, {})).status).toBe(400)
  })

  it('will not move the slug, however the name changes', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const outlet = await createOk(app, workspaceId, MINIMAL)
    const updated = (await (
      await patch(app, workspaceId, outlet.id, { name: 'Somewhere Else', slug: 'somewhere-else' })
    ).json()) as Outlet
    // A link written before the rename still resolves — the only reason to
    // carry a slug rather than routing on the id.
    expect(updated.name).toBe('Somewhere Else')
    expect(updated.slug).toBe('casa-vostra')
  })

  it('replaces attributes wholesale', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const outlet = await createOk(app, workspaceId, {
      ...MINIMAL,
      attributes: ['serves_alcohol', 'live_music'],
    })
    const updated = (await (
      await patch(app, workspaceId, outlet.id, { attributes: ['takeaway'] })
    ).json()) as Outlet
    expect(updated.attributes).toEqual(['takeaway'])
  })

  it('accepts an attribute the catalogue has never heard of', async () => {
    // An import must not be refused over a tag a source system spells its own
    // way — see `OutletAttributesSchema`.
    const { app, workspaceId } = await seedWorkspace()
    const outlet = await createOk(app, workspaceId, { ...MINIMAL, attributes: ['halal_certified'] })
    expect(outlet.attributes).toEqual(['halal_certified'])
  })

  it('404s on an outlet that does not exist', async () => {
    const { app, workspaceId } = await seedWorkspace()
    expect((await patch(app, workspaceId, 'outlet-nope', { status: 'open' })).status).toBe(404)
  })
})

describe('outlet routes — delete', () => {
  it('deletes once and 404s on the second attempt', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const outlet = await createOk(app, workspaceId, MINIMAL)
    const path = `/workspaces/${workspaceId}/outlets/${outlet.id}`

    const first = await app.request(path, { method: 'DELETE', headers: auth() })
    expect(first.status).toBe(200)
    // The deleted row comes back — the last copy anything will see.
    expect(((await first.json()) as Outlet).id).toBe(outlet.id)
    const second = await app.request(path, { method: 'DELETE', headers: auth() })
    expect(second.status).toBe(404)
    expect(await list(app, workspaceId)).toEqual([])
  })
})

describe('outlets and brand lifetime', () => {
  it('survives its brand being deleted, with the link cleared', async () => {
    // `ON DELETE SET NULL`, not cascade — a lease outlives its branding, and the
    // premises is the record the next brand gets attached to.
    const { app, workspaceId, brandId } = await seedWorkspace()
    const outlet = await createOk(app, workspaceId, { ...MINIMAL, brandId })

    expect(
      (await app.request(`/brands/${brandId}`, { method: 'DELETE', headers: auth() })).status,
    ).toBe(200)

    const rows = await list(app, workspaceId)
    expect(rows.map((o) => o.id)).toEqual([outlet.id])
    expect(rows[0]!.brandId).toBeNull()
  })

  it('goes with its workspace', async () => {
    const { app, workspaceId } = await seedWorkspace()
    await createOk(app, workspaceId, MINIMAL)
    expect(
      (await app.request(`/workspaces/${workspaceId}`, { method: 'DELETE', headers: auth() }))
        .status,
    ).toBe(200)
    expect(
      (await app.request(`/workspaces/${workspaceId}/outlets`, { headers: auth() })).status,
    ).toBe(404)
  })
})
