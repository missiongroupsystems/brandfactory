import type { Influencer } from '@brandfactory/shared'
import { InfluencerSchema } from '@brandfactory/shared'
import { describe, expect, it } from 'vitest'
import { createTestApp, type TestHarness } from '../test-helpers'

const USER = { id: 'u-1', token: 't-1' }
const OTHER = { id: 'u-2', token: 't-2' }

function auth(token = USER.token) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

/** A workspace with two brands in it — a creator's brand relation is a set. */
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
  return app.request(`/workspaces/${workspaceId}/influencers`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify(body),
  })
}

async function createOk(app: TestHarness['app'], workspaceId: string, body: unknown) {
  const res = await create(app, workspaceId, body)
  expect(res.status).toBe(201)
  return (await res.json()) as Influencer
}

async function list(app: TestHarness['app'], workspaceId: string) {
  const res = await app.request(`/workspaces/${workspaceId}/influencers`, { headers: auth() })
  return (await res.json()) as Influencer[]
}

async function patch(
  app: TestHarness['app'],
  workspaceId: string,
  influencerId: string,
  body: unknown,
) {
  return app.request(`/workspaces/${workspaceId}/influencers/${influencerId}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify(body),
  })
}

const MINIMAL = {
  name: 'Priya Nair',
  handle: 'priyaskin',
  platform: 'instagram',
  followers: 124_000,
}

describe('influencer routes — access', () => {
  it('401s without a token, on every method', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, MINIMAL)
    const base = `/workspaces/${workspaceId}/influencers`

    for (const [method, path] of [
      ['GET', base],
      ['POST', base],
      ['GET', `${base}/${creator.id}`],
      ['PATCH', `${base}/${creator.id}`],
      ['DELETE', `${base}/${creator.id}`],
    ] as const) {
      const res = await app.request(path, { method, body: method === 'GET' ? undefined : '{}' })
      expect(res.status, `${method} ${path}`).toBe(401)
    }
  })

  it('404s on a workspace that does not exist', async () => {
    const { app } = await seedWorkspace()
    const res = await app.request('/workspaces/ws-nope/influencers', { headers: auth() })
    expect(res.status).toBe(404)
  })

  it('cannot reach a creator through another workspace', async () => {
    // The whole access story, and the reason there is no `requireInfluencerAccess`:
    // the query layer is workspace-scoped, so an id from elsewhere misses.
    const { app, workspaceId } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, MINIMAL)
    const other = await createWorkspace(app, 'Other')

    const base = `/workspaces/${other.id}/influencers`
    expect((await app.request(`${base}/${creator.id}`, { headers: auth() })).status).toBe(404)
    expect((await patch(app, other.id, creator.id, { status: 'active' })).status).toBe(404)
    expect(
      (await app.request(`${base}/${creator.id}`, { method: 'DELETE', headers: auth() })).status,
    ).toBe(404)
    // And the row is untouched.
    expect((await list(app, workspaceId)).length).toBe(1)
  })
})

describe('influencer routes — create', () => {
  it('creates from the four required keys, defaulting the rest', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, MINIMAL)

    // Parsed rather than spot-checked: the response *is* the published contract,
    // and a missing key here is a runtime `undefined` in the client.
    expect(InfluencerSchema.safeParse(creator).success).toBe(true)
    // A shortlist, not a booking.
    expect(creator.status).toBe('prospect')
    // From the handle, not the name — `priya-nair` would be the other choice.
    expect(creator.slug).toBe('priyaskin')
    expect(creator.engagementRate).toBeNull()
    expect(creator.vertical).toBeNull()
    // An array, never undefined: "not engaged yet" is a fact.
    expect(creator.brandIds).toEqual([])
  })

  it('rejects a body with no follower count', async () => {
    // A row with no reach would fall out of the tier grouping, which is the one
    // thing a total grouping may not do.
    const { app, workspaceId } = await seedWorkspace()
    const { followers: _followers, ...rest } = MINIMAL
    expect((await create(app, workspaceId, rest)).status).toBe(400)
  })

  it('rejects a handle carrying its own @', async () => {
    // Every surface adds the sigil. Two spellings of one handle would both pass
    // the unique key on `(workspace_id, platform, handle)`.
    const { app, workspaceId } = await seedWorkspace()
    expect((await create(app, workspaceId, { ...MINIMAL, handle: '@priyaskin' })).status).toBe(400)
  })

  it('rejects an engagement rate above 100', async () => {
    const { app, workspaceId } = await seedWorkspace()
    expect((await create(app, workspaceId, { ...MINIMAL, engagementRate: 140 })).status).toBe(400)
  })

  it('rejects a duplicated brand id rather than letting the join table refuse it', async () => {
    // The 400 exists so the unique violation on `(influencer_id, brand_id)` is
    // never reached — that would surface as a 500 for a malformed body.
    const { app, workspaceId, brandA } = await seedWorkspace()
    expect(
      (await create(app, workspaceId, { ...MINIMAL, brandIds: [brandA, brandA] })).status,
    ).toBe(400)
  })

  it('409s on a creator already on the roster for that platform', async () => {
    // The unique index is the only thing that can answer this, so before it was
    // mapped it reached the client as `500 Internal Server Error` — and
    // `useSubmit` puts that sentence straight on the form. This is the most
    // ordinary mistake the create form can make: entering somebody twice.
    const { app, workspaceId } = await seedWorkspace()
    await createOk(app, workspaceId, MINIMAL)

    const res = await create(app, workspaceId, { ...MINIMAL, name: 'Priya N.' })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { code: string; message: string }
    expect(body.code).toBe('INFLUENCER_HANDLE_TAKEN')
    // The message is read by a person looking at the box they just typed into,
    // so it names the pair rather than the constraint.
    expect(body.message).toContain('@priyaskin')
    expect(body.message).toContain('instagram')
  })

  it('409s rather than writing a second row, so the roster is unchanged', async () => {
    const { app, workspaceId } = await seedWorkspace()
    await createOk(app, workspaceId, MINIMAL)
    await create(app, workspaceId, MINIMAL)
    expect((await list(app, workspaceId)).length).toBe(1)
  })

  it('derives a distinct slug for the same handle on a second platform', async () => {
    // The known cost of slugging from the handle, and the reason the detail page
    // names the platform in its first line.
    const { app, workspaceId } = await seedWorkspace()
    const first = await createOk(app, workspaceId, MINIMAL)
    const second = await createOk(app, workspaceId, { ...MINIMAL, platform: 'tiktok' })
    expect(first.slug).toBe('priyaskin')
    expect(second.slug).toBe('priyaskin-2')
  })

  it('accepts brands in the same workspace, and sorts them', async () => {
    const { app, workspaceId, brandA, brandB } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, { ...MINIMAL, brandIds: [brandB, brandA] })
    // Sorted, not echoed — two reads of one row have to be byte-identical.
    expect(creator.brandIds).toEqual([brandA, brandB].sort((x, y) => x.localeCompare(y)))
  })

  it('400s on a brand from another workspace, and writes nothing', async () => {
    // A 400 rather than a 404: the *influencer* route is fine; the body named a
    // brand this workspace does not have.
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

describe('influencer routes — read', () => {
  it('lists a workspace biggest reach first, with the name breaking a tie', async () => {
    const { app, workspaceId } = await seedWorkspace()
    await createOk(app, workspaceId, { ...MINIMAL, handle: 'small', followers: 900 })
    await createOk(app, workspaceId, { ...MINIMAL, handle: 'huge', followers: 2_000_000 })
    await createOk(app, workspaceId, { ...MINIMAL, handle: 'zoe', name: 'Zoe', followers: 10_000 })
    await createOk(app, workspaceId, {
      ...MINIMAL,
      handle: 'adam',
      name: 'Adam',
      followers: 10_000,
    })

    // Reach descending, the opposite of every other list here: the order a budget
    // conversation happens in.
    expect((await list(app, workspaceId)).map((i) => i.handle)).toEqual([
      'huge',
      'adam',
      'zoe',
      'small',
    ])
  })

  it('resolves by slug and by id', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, MINIMAL)
    const base = `/workspaces/${workspaceId}/influencers`

    for (const ref of [creator.slug, creator.id]) {
      const res = await app.request(`${base}/${ref}`, { headers: auth() })
      expect(res.status, ref).toBe(200)
      expect(((await res.json()) as Influencer).id).toBe(creator.id)
    }
  })

  it('404s on an unknown ref rather than raising', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const res = await app.request(`/workspaces/${workspaceId}/influencers/no-such-creator`, {
      headers: auth(),
    })
    expect(res.status).toBe(404)
  })
})

describe('influencer routes — patch', () => {
  it('touches only the keys it is sent', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, {
      ...MINIMAL,
      engagementRate: 3.8,
      notes: 'Two-post minimum.',
    })

    const res = await patch(app, workspaceId, creator.id, { status: 'active' })
    expect(res.status).toBe(200)
    const updated = (await res.json()) as Influencer
    expect(updated.status).toBe('active')
    expect(updated.engagementRate).toBe(3.8)
    expect(updated.notes).toBe('Two-post minimum.')
  })

  it('clears a measured field on an explicit null', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, { ...MINIMAL, engagementRate: 3.8 })
    const updated = (await (
      await patch(app, workspaceId, creator.id, { engagementRate: null })
    ).json()) as Influencer
    expect(updated.engagementRate).toBeNull()
  })

  it('rejects an empty patch rather than performing a no-op write', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, MINIMAL)
    expect((await patch(app, workspaceId, creator.id, {})).status).toBe(400)
  })

  it('will not move the slug, however the handle changes', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, MINIMAL)
    const updated = (await (
      await patch(app, workspaceId, creator.id, {
        handle: 'priyaskincare',
        slug: 'priyaskincare',
      })
    ).json()) as Influencer
    // A link written before the correction still resolves — the only reason to
    // carry a slug rather than routing on the id.
    expect(updated.handle).toBe('priyaskincare')
    expect(updated.slug).toBe('priyaskin')
  })

  it('replaces brandIds wholesale, and an empty array is a write', async () => {
    const { app, workspaceId, brandA, brandB } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, { ...MINIMAL, brandIds: [brandA] })

    const swapped = (await (
      await patch(app, workspaceId, creator.id, { brandIds: [brandB] })
    ).json()) as Influencer
    expect(swapped.brandIds).toEqual([brandB])

    // "No longer engaged for anything" is a statement, not an omission.
    const cleared = (await (
      await patch(app, workspaceId, creator.id, { brandIds: [] })
    ).json()) as Influencer
    expect(cleared.brandIds).toEqual([])
  })

  it('leaves the brand links alone on a patch that does not name them', async () => {
    const { app, workspaceId, brandA } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, { ...MINIMAL, brandIds: [brandA] })
    const updated = (await (
      await patch(app, workspaceId, creator.id, { followers: 130_000 })
    ).json()) as Influencer
    expect(updated.brandIds).toEqual([brandA])
  })

  it('409s when a corrected handle lands on somebody already there', async () => {
    // Correcting a typo into another creator's handle is the same mistake as
    // entering them twice, and it is owed the same answer rather than a 500.
    const { app, workspaceId } = await seedWorkspace()
    await createOk(app, workspaceId, MINIMAL)
    const second = await createOk(app, workspaceId, { ...MINIMAL, handle: 'someoneelse' })

    const res = await patch(app, workspaceId, second.id, { handle: 'priyaskin' })
    expect(res.status).toBe(409)
    expect(((await res.json()) as { code: string }).code).toBe('INFLUENCER_HANDLE_TAKEN')
  })

  it('409s when only the platform moves onto an occupied pair', async () => {
    // The key is the *pair*, so a patch can collide by moving either half. The
    // error names the resulting pair, which means reading the half the patch
    // left alone.
    const { app, workspaceId } = await seedWorkspace()
    await createOk(app, workspaceId, { ...MINIMAL, platform: 'tiktok' })
    const insta = await createOk(app, workspaceId, MINIMAL)

    const res = await patch(app, workspaceId, insta.id, { platform: 'tiktok' })
    expect(res.status).toBe(409)
    expect(((await res.json()) as { message: string }).message).toContain('tiktok')
  })

  it('lets a creator keep their own handle through an unrelated patch', async () => {
    // The row excludes itself from the check, or every edit that re-sent the
    // form's own values would refuse itself.
    const { app, workspaceId } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, MINIMAL)
    const res = await patch(app, workspaceId, creator.id, {
      handle: 'priyaskin',
      platform: 'instagram',
      followers: 130_000,
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as Influencer).followers).toBe(130_000)
  })

  it('404s on a creator that does not exist', async () => {
    const { app, workspaceId } = await seedWorkspace()
    expect((await patch(app, workspaceId, 'creator-nope', { status: 'active' })).status).toBe(404)
  })

  it('404s rather than 409s when the patch names a taken handle on a missing row', async () => {
    // The order matters: a patch aimed at nothing is a fact about the *path*, and
    // reporting a handle clash would send the reader to fix the wrong thing.
    //
    // A **uuid-shaped** absent id on purpose, unlike the case above. The real
    // query compares the ref against a `uuid` column, so a non-uuid id raises in
    // Postgres and never reaches this branch — an assertion written against
    // `'creator-nope'` would hold for the fake alone.
    const { app, workspaceId } = await seedWorkspace()
    await createOk(app, workspaceId, MINIMAL)
    const absent = '00000000-0000-4000-8000-0000000000ff'
    expect((await patch(app, workspaceId, absent, { handle: 'priyaskin' })).status).toBe(404)
  })
})

describe('influencer routes — delete', () => {
  it('deletes once and 404s on the second attempt', async () => {
    const { app, workspaceId, brandA } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, { ...MINIMAL, brandIds: [brandA] })
    const path = `/workspaces/${workspaceId}/influencers/${creator.id}`

    const first = await app.request(path, { method: 'DELETE', headers: auth() })
    expect(first.status).toBe(200)
    // The deleted row comes back, brand links and all — the last copy anything
    // will see.
    const gone = (await first.json()) as Influencer
    expect(gone.id).toBe(creator.id)
    expect(gone.brandIds).toEqual([brandA])

    const second = await app.request(path, { method: 'DELETE', headers: auth() })
    expect(second.status).toBe(404)
    expect(await list(app, workspaceId)).toEqual([])
  })
})

describe('influencers and brand lifetime', () => {
  it('survives its brand being deleted, with only the link removed', async () => {
    // `ON DELETE CASCADE` on the **link**, both sides — the many-to-many
    // equivalent of the SET NULL outlets chose. A creator does not stop existing
    // when a brand does.
    const { app, workspaceId, brandA, brandB } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, { ...MINIMAL, brandIds: [brandA, brandB] })

    expect(
      (await app.request(`/brands/${brandA}`, { method: 'DELETE', headers: auth() })).status,
    ).toBe(200)

    const rows = await list(app, workspaceId)
    expect(rows.map((i) => i.id)).toEqual([creator.id])
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
      (await app.request(`/workspaces/${workspaceId}/influencers`, { headers: auth() })).status,
    ).toBe(404)
  })
})
