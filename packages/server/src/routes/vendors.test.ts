import type { Vendor } from '@brandfactory/shared'
import { VendorSchema } from '@brandfactory/shared'
import { describe, expect, it } from 'vitest'
import { createTestApp, type TestHarness } from '../test-helpers'

const USER = { id: 'u-1', token: 't-1' }
const OTHER = { id: 'u-2', token: 't-2' }

function auth(token = USER.token) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

/** A workspace with two brands in it — a vendor's brand relation is a set. */
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
  const brandIds: string[] = []
  for (const name of ['B one', 'B two']) {
    const brand = (await (
      await app.request(`/workspaces/${ws.id}/brands`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name }),
      })
    ).json()) as { id: string }
    brandIds.push(brand.id)
  }
  return { ...harness, workspaceId: ws.id, brandA: brandIds[0]!, brandB: brandIds[1]! }
}

async function createWorkspace(app: TestHarness['app'], name: string) {
  return (await (
    await app.request('/workspaces', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name }),
    })
  ).json()) as { id: string }
}

async function create(app: TestHarness['app'], workspaceId: string, body: unknown) {
  return app.request(`/workspaces/${workspaceId}/vendors`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify(body),
  })
}

async function createOk(app: TestHarness['app'], workspaceId: string, body: unknown) {
  const res = await create(app, workspaceId, body)
  expect(res.status).toBe(201)
  return (await res.json()) as Vendor
}

async function list(app: TestHarness['app'], workspaceId: string) {
  const res = await app.request(`/workspaces/${workspaceId}/vendors`, { headers: auth() })
  return (await res.json()) as Vendor[]
}

async function patch(app: TestHarness['app'], workspaceId: string, id: string, body: unknown) {
  return app.request(`/workspaces/${workspaceId}/vendors/${id}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify(body),
  })
}

const MINIMAL = { name: 'Northlight Talent' }

function contact(overrides: Record<string, unknown> = {}) {
  return { name: 'Mei Tan', role: null, email: null, phone: null, isPrimary: false, ...overrides }
}

describe('vendor routes — access', () => {
  it('401s without a token, on every method', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const vendor = await createOk(app, workspaceId, MINIMAL)
    const base = `/workspaces/${workspaceId}/vendors`

    for (const [method, path] of [
      ['GET', base],
      ['POST', base],
      ['GET', `${base}/${vendor.id}`],
      ['PATCH', `${base}/${vendor.id}`],
      ['DELETE', `${base}/${vendor.id}`],
    ] as const) {
      const res = await app.request(path, { method, body: method === 'GET' ? undefined : '{}' })
      expect(res.status, `${method} ${path}`).toBe(401)
    }
  })

  it('404s on a workspace that does not exist', async () => {
    const { app } = await seedWorkspace()
    const res = await app.request('/workspaces/ws-nope/vendors', { headers: auth() })
    expect(res.status).toBe(404)
  })

  it('cannot reach a vendor through another workspace', async () => {
    // The whole access story, and the reason there is no `requireVendorAccess`:
    // the query layer is workspace-scoped, so an id from elsewhere misses.
    const { app, workspaceId } = await seedWorkspace()
    const vendor = await createOk(app, workspaceId, MINIMAL)
    const other = await createWorkspace(app, 'Other')

    const base = `/workspaces/${other.id}/vendors`
    expect((await app.request(`${base}/${vendor.id}`, { headers: auth() })).status).toBe(404)
    expect((await patch(app, other.id, vendor.id, { status: 'inactive' })).status).toBe(404)
    expect(
      (await app.request(`${base}/${vendor.id}`, { method: 'DELETE', headers: auth() })).status,
    ).toBe(404)
    // And the row is untouched.
    expect((await list(app, workspaceId)).length).toBe(1)
  })
})

describe('vendor routes — create', () => {
  it('creates from a name alone, defaulting the rest', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const vendor = await createOk(app, workspaceId, MINIMAL)

    // Parsed rather than spot-checked: the response *is* the published contract,
    // and a missing key here is a runtime `undefined` in the client.
    expect(VendorSchema.safeParse(vendor).success).toBe(true)
    // A company somebody enters is one the business is already buying from — the
    // opposite of a creator, who is a prospect until booked.
    expect(vendor.status).toBe('active')
    expect(vendor.slug).toBe('northlight-talent')
    expect(vendor.category).toBeNull()
    expect(vendor.uen).toBeNull()
    expect(vendor.website).toBeNull()
    // Arrays, never undefined: "not assigned yet" and "nobody named yet" are facts.
    expect(vendor.brandIds).toEqual([])
    expect(vendor.contacts).toEqual([])
  })

  it('rejects a blank name, which is the only required key', async () => {
    const { app, workspaceId } = await seedWorkspace()
    expect((await create(app, workspaceId, { name: '   ' })).status).toBe(400)
    expect((await create(app, workspaceId, {})).status).toBe(400)
  })

  it('rejects a website that is not http or https', async () => {
    // `WebsiteUrlSchema`'s protocol filter, which zod's bare `z.url()` does not
    // apply — the value ends up in an `href`.
    const { app, workspaceId } = await seedWorkspace()
    expect(
      (await create(app, workspaceId, { ...MINIMAL, website: 'javascript:alert(1)' })).status,
    ).toBe(400)
  })

  it('rejects two primary contacts rather than letting the list decide', async () => {
    // The rule is a zod refinement and not a partial unique index, so it has to be
    // refused here or nothing refuses it at all.
    const { app, workspaceId } = await seedWorkspace()
    const res = await create(app, workspaceId, {
      ...MINIMAL,
      contacts: [contact({ isPrimary: true }), contact({ name: 'Raj', isPrimary: true })],
    })
    expect(res.status).toBe(400)
  })

  it('rejects a duplicated brand id rather than letting the join table refuse it', async () => {
    // The 400 exists so the unique violation on `(vendor_id, brand_id)` is never
    // reached — that would surface as a 500 for a malformed body.
    const { app, workspaceId, brandA } = await seedWorkspace()
    expect(
      (await create(app, workspaceId, { ...MINIMAL, brandIds: [brandA, brandA] })).status,
    ).toBe(400)
  })

  it('409s on a UEN already in the workspace', async () => {
    // The unique index is the only thing that can answer this, so before it was
    // mapped it would reach the client as `500 Internal Server Error` — and
    // `useSubmit` puts that sentence straight on the form. This is the most
    // ordinary mistake the create form can make: entering a company twice.
    const { app, workspaceId } = await seedWorkspace()
    await createOk(app, workspaceId, { ...MINIMAL, uen: '201812345K' })

    const res = await create(app, workspaceId, { name: 'Northlight Ltd', uen: '201812345K' })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { code: string; message: string }
    expect(body.code).toBe('VENDOR_UEN_TAKEN')
    // The message is read by a person looking at the box they just typed into,
    // so it names the value rather than the constraint.
    expect(body.message).toContain('201812345K')
  })

  it('409s rather than writing a second row, so the book is unchanged', async () => {
    const { app, workspaceId } = await seedWorkspace()
    await createOk(app, workspaceId, { ...MINIMAL, uen: '201812345K' })
    await create(app, workspaceId, { name: 'Another', uen: '201812345K' })
    expect((await list(app, workspaceId)).length).toBe(1)
  })

  it('accepts the same name twice, because a name is not an identifier', async () => {
    // The decision that separates this aggregate from influencers: a company name
    // carries legal suffixes and trading names, so the second row lands and takes
    // a `-2`.
    const { app, workspaceId } = await seedWorkspace()
    const first = await createOk(app, workspaceId, MINIMAL)
    const second = await createOk(app, workspaceId, MINIMAL)
    expect(first.slug).toBe('northlight-talent')
    expect(second.slug).toBe('northlight-talent-2')
  })

  it('lets many rows carry no UEN at all', async () => {
    // NULLs are distinct in the unique index, which is why no partial predicate is
    // needed — and most rows genuinely have no UEN.
    const { app, workspaceId } = await seedWorkspace()
    await createOk(app, workspaceId, { name: 'No paperwork one' })
    await createOk(app, workspaceId, { name: 'No paperwork two' })
    await createOk(app, workspaceId, { name: 'No paperwork three', uen: null })
    expect((await list(app, workspaceId)).map((v) => v.uen)).toEqual([null, null, null])
  })

  it('keeps the contacts in the order they were sent, and does not sort them', async () => {
    // The brands are a set of ticked boxes; the contacts are a list somebody
    // arranged. Sorting them would silently reorder that arrangement.
    const { app, workspaceId } = await seedWorkspace()
    const vendor = await createOk(app, workspaceId, {
      ...MINIMAL,
      contacts: [
        contact({ name: 'Zoe', isPrimary: true }),
        contact({ name: 'Adam' }),
        contact({ name: 'Mei' }),
      ],
    })
    expect(vendor.contacts.map((c) => c.name)).toEqual(['Zoe', 'Adam', 'Mei'])
    expect(vendor.contacts[0]!.isPrimary).toBe(true)
  })

  it('accepts brands in the same workspace, and sorts them', async () => {
    const { app, workspaceId, brandA, brandB } = await seedWorkspace()
    const vendor = await createOk(app, workspaceId, { ...MINIMAL, brandIds: [brandB, brandA] })
    // Sorted, not echoed — two reads of one row have to be byte-identical.
    expect(vendor.brandIds).toEqual([brandA, brandB].sort((x, y) => x.localeCompare(y)))
  })

  it('400s on a brand from another workspace, and writes nothing', async () => {
    // A 400 rather than a 404: the *vendor* route is fine; the body named a brand
    // this workspace does not have.
    const { app, workspaceId } = await seedWorkspace()
    const other = await createWorkspace(app, 'Other')
    const foreign = (await (
      await app.request(`/workspaces/${other.id}/brands`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'Foreign' }),
      })
    ).json()) as { id: string }

    const res = await create(app, workspaceId, { ...MINIMAL, brandIds: [foreign.id] })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('BRAND_NOT_IN_WORKSPACE')
    expect(await list(app, workspaceId)).toEqual([])
  })
})

describe('vendor routes — read', () => {
  it('lists a workspace alphabetically — this screen is a directory', async () => {
    // The opposite of influencers, which leads with the largest reach because that
    // list is read as a budget conversation.
    const { app, workspaceId } = await seedWorkspace()
    await createOk(app, workspaceId, { name: 'Zephyr Studio' })
    await createOk(app, workspaceId, { name: 'Anvil Films' })
    await createOk(app, workspaceId, { name: 'Meridian Media' })

    expect((await list(app, workspaceId)).map((v) => v.name)).toEqual([
      'Anvil Films',
      'Meridian Media',
      'Zephyr Studio',
    ])
  })

  it('resolves by slug and by id', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const vendor = await createOk(app, workspaceId, MINIMAL)
    const base = `/workspaces/${workspaceId}/vendors`

    for (const ref of [vendor.slug, vendor.id]) {
      const res = await app.request(`${base}/${ref}`, { headers: auth() })
      expect(res.status, ref).toBe(200)
      expect(((await res.json()) as Vendor).id).toBe(vendor.id)
    }
  })

  it('404s on an unknown ref rather than raising', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const res = await app.request(`/workspaces/${workspaceId}/vendors/no-such-vendor`, {
      headers: auth(),
    })
    expect(res.status).toBe(404)
  })
})

describe('vendor routes — patch', () => {
  it('touches only the keys it is sent', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const vendor = await createOk(app, workspaceId, {
      ...MINIMAL,
      category: 'talent_agency',
      notes: 'Two-week booking lead time.',
    })

    const res = await patch(app, workspaceId, vendor.id, { status: 'inactive' })
    expect(res.status).toBe(200)
    const updated = (await res.json()) as Vendor
    expect(updated.status).toBe('inactive')
    expect(updated.category).toBe('talent_agency')
    expect(updated.notes).toBe('Two-week booking lead time.')
  })

  it('clears a recorded field on an explicit null', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const vendor = await createOk(app, workspaceId, { ...MINIMAL, uen: '201812345K' })
    const updated = (await (
      await patch(app, workspaceId, vendor.id, { uen: null })
    ).json()) as Vendor
    expect(updated.uen).toBeNull()
  })

  it('rejects an empty patch rather than performing a no-op write', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const vendor = await createOk(app, workspaceId, MINIMAL)
    expect((await patch(app, workspaceId, vendor.id, {})).status).toBe(400)
  })

  it('will not move the slug, however the name changes', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const vendor = await createOk(app, workspaceId, MINIMAL)
    const updated = (await (
      await patch(app, workspaceId, vendor.id, {
        name: 'Northlight Talent Pte Ltd',
        slug: 'northlight-talent-pte-ltd',
      })
    ).json()) as Vendor
    // A link written before the correction still resolves — the only reason to
    // carry a slug rather than routing on the id.
    expect(updated.name).toBe('Northlight Talent Pte Ltd')
    expect(updated.slug).toBe('northlight-talent')
  })

  it('replaces contacts wholesale, and swaps the primary in one request', async () => {
    // The reason `isPrimary` is a zod refinement rather than a partial unique
    // index: a full-replacement write can move the flag without a moment where two
    // rows hold it.
    const { app, workspaceId } = await seedWorkspace()
    const vendor = await createOk(app, workspaceId, {
      ...MINIMAL,
      contacts: [
        contact({ name: 'Was primary', isPrimary: true }),
        contact({ name: 'Was second' }),
      ],
    })

    const swapped = (await (
      await patch(app, workspaceId, vendor.id, {
        contacts: [
          contact({ name: 'Was second', isPrimary: true }),
          contact({ name: 'Was primary' }),
        ],
      })
    ).json()) as Vendor
    expect(swapped.contacts.map((c) => [c.name, c.isPrimary])).toEqual([
      ['Was second', true],
      ['Was primary', false],
    ])

    // "Nobody named any more" is a statement, not an omission.
    const cleared = (await (
      await patch(app, workspaceId, vendor.id, { contacts: [] })
    ).json()) as Vendor
    expect(cleared.contacts).toEqual([])
  })

  it('replaces brandIds wholesale, and an empty array is a write', async () => {
    const { app, workspaceId, brandA, brandB } = await seedWorkspace()
    const vendor = await createOk(app, workspaceId, { ...MINIMAL, brandIds: [brandA] })

    const swapped = (await (
      await patch(app, workspaceId, vendor.id, { brandIds: [brandB] })
    ).json()) as Vendor
    expect(swapped.brandIds).toEqual([brandB])

    const cleared = (await (
      await patch(app, workspaceId, vendor.id, { brandIds: [] })
    ).json()) as Vendor
    expect(cleared.brandIds).toEqual([])
  })

  it('leaves both relations alone on a patch that names neither', async () => {
    const { app, workspaceId, brandA } = await seedWorkspace()
    const vendor = await createOk(app, workspaceId, {
      ...MINIMAL,
      brandIds: [brandA],
      contacts: [contact({ name: 'Still here' })],
    })
    const updated = (await (
      await patch(app, workspaceId, vendor.id, { status: 'inactive' })
    ).json()) as Vendor
    expect(updated.brandIds).toEqual([brandA])
    expect(updated.contacts.map((c) => c.name)).toEqual(['Still here'])
  })

  it('409s when a corrected UEN lands on a company already there', async () => {
    // Correcting a number into another company's is the same mistake as entering
    // it twice, and it is owed the same answer rather than a 500.
    const { app, workspaceId } = await seedWorkspace()
    await createOk(app, workspaceId, { ...MINIMAL, uen: '201812345K' })
    const second = await createOk(app, workspaceId, { name: 'Second Co' })

    const res = await patch(app, workspaceId, second.id, { uen: '201812345K' })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { code: string; message: string }
    expect(body.code).toBe('VENDOR_UEN_TAKEN')
    expect(body.message).toContain('201812345K')
  })

  it('lets a vendor keep its own UEN through an unrelated patch', async () => {
    // The row excludes itself from the check, or every edit that re-sent the
    // form's own values would refuse itself.
    const { app, workspaceId } = await seedWorkspace()
    const vendor = await createOk(app, workspaceId, { ...MINIMAL, uen: '201812345K' })
    const res = await patch(app, workspaceId, vendor.id, {
      uen: '201812345K',
      status: 'inactive',
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as Vendor).status).toBe('inactive')
  })

  it('404s on a vendor that does not exist', async () => {
    const { app, workspaceId } = await seedWorkspace()
    expect((await patch(app, workspaceId, 'vendor-nope', { status: 'inactive' })).status).toBe(404)
  })

  it('404s rather than 409s when the patch names a taken UEN on a missing row', async () => {
    // The order matters: a patch aimed at nothing is a fact about the *path*, and
    // reporting a UEN clash would send the reader to fix the wrong thing.
    //
    // A **uuid-shaped** absent id on purpose, unlike the case above. The real query
    // compares the ref against a `uuid` column, so a non-uuid id raises in Postgres
    // and never reaches this branch — an assertion written against `'vendor-nope'`
    // would hold for the fake alone.
    const { app, workspaceId } = await seedWorkspace()
    await createOk(app, workspaceId, { ...MINIMAL, uen: '201812345K' })
    const absent = '00000000-0000-4000-8000-0000000000ff'
    expect((await patch(app, workspaceId, absent, { uen: '201812345K' })).status).toBe(404)
  })
})

describe('vendor routes — delete', () => {
  it('deletes once and 404s on the second attempt', async () => {
    const { app, workspaceId, brandA } = await seedWorkspace()
    const vendor = await createOk(app, workspaceId, {
      ...MINIMAL,
      brandIds: [brandA],
      contacts: [contact({ name: 'Goes too' })],
    })
    const path = `/workspaces/${workspaceId}/vendors/${vendor.id}`

    const first = await app.request(path, { method: 'DELETE', headers: auth() })
    expect(first.status).toBe(200)
    // The deleted row comes back, both relations and all — the last copy anything
    // will see.
    const gone = (await first.json()) as Vendor
    expect(gone.id).toBe(vendor.id)
    expect(gone.brandIds).toEqual([brandA])
    expect(gone.contacts.map((c) => c.name)).toEqual(['Goes too'])

    const second = await app.request(path, { method: 'DELETE', headers: auth() })
    expect(second.status).toBe(404)
    expect(await list(app, workspaceId)).toEqual([])
  })

  it('frees the UEN it was holding', async () => {
    // The 409 is about a live row. Deleting the company that held the number has
    // to make it enterable again, or a mistyped vendor would lock a registration
    // out of the workspace permanently.
    const { app, workspaceId } = await seedWorkspace()
    const vendor = await createOk(app, workspaceId, { ...MINIMAL, uen: '201812345K' })
    await app.request(`/workspaces/${workspaceId}/vendors/${vendor.id}`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect((await create(app, workspaceId, { name: 'Reissued', uen: '201812345K' })).status).toBe(
      201,
    )
  })
})

describe('vendors and brand lifetime', () => {
  it('survives its brand being deleted, with only the link removed', async () => {
    // `ON DELETE CASCADE` on the **link**, both sides. A company does not stop
    // existing when a brand does — the relationship outlives the branding.
    const { app, workspaceId, brandA, brandB } = await seedWorkspace()
    const vendor = await createOk(app, workspaceId, { ...MINIMAL, brandIds: [brandA, brandB] })

    expect(
      (await app.request(`/brands/${brandA}`, { method: 'DELETE', headers: auth() })).status,
    ).toBe(200)

    const rows = await list(app, workspaceId)
    expect(rows.map((v) => v.id)).toEqual([vendor.id])
    // The other link is untouched, which is what makes this a link removal rather
    // than a reset.
    expect(rows[0]!.brandIds).toEqual([brandB])
  })

  it('goes with its workspace', async () => {
    const { app, workspaceId } = await seedWorkspace()
    await createOk(app, workspaceId, MINIMAL)
    expect(
      (await app.request(`/workspaces/${workspaceId}`, { method: 'DELETE', headers: auth() }))
        .status,
    ).toBe(200)
    expect(
      (await app.request(`/workspaces/${workspaceId}/vendors`, { headers: auth() })).status,
    ).toBe(404)
  })
})
