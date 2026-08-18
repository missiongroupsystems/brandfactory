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

/** One account, spread into whatever a case is actually about. */
function account(overrides: Record<string, unknown> = {}) {
  return {
    platform: 'instagram',
    handle: 'priyaskin',
    followers: 124_000,
    engagementRate: null,
    url: null,
    ...overrides,
  }
}

const MINIMAL = { name: 'Priya Nair', accounts: [account()] }

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
  it('creates from a name and one account, defaulting the rest', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, MINIMAL)

    // Parsed rather than spot-checked: the response *is* the published contract,
    // and a missing key here is a runtime `undefined` in the client.
    expect(InfluencerSchema.safeParse(creator).success).toBe(true)
    // A shortlist, not a booking.
    expect(creator.status).toBe('prospect')
    // From the name, not the handle — a person carries up to ten handles.
    expect(creator.slug).toBe('priya-nair')
    expect(creator.accounts).toHaveLength(1)
    expect(creator.accounts[0]?.engagementRate).toBeNull()
    expect(creator.accounts[0]?.url).toBeNull()
    expect(creator.vertical).toBeNull()
    // An array, never undefined: "not engaged yet" is a fact.
    expect(creator.brandIds).toEqual([])
  })

  it('creates a creator with three accounts and answers them in order', async () => {
    // The case the whole change exists for: one person, three platforms, one row.
    const { app, workspaceId } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, {
      name: 'Priya Raman',
      accounts: [
        account({ platform: 'instagram', followers: 840_000, engagementRate: 1.1 }),
        account({ platform: 'tiktok', followers: 312_000, engagementRate: 4.2 }),
        account({
          platform: 'xiaohongshu',
          handle: '普莉娅',
          followers: 88_000,
          url: 'https://www.xiaohongshu.com/user/profile/6123',
        }),
      ],
    })

    expect(InfluencerSchema.safeParse(creator).success).toBe(true)
    expect(creator.accounts.map((a) => a.platform)).toEqual(['instagram', 'tiktok', 'xiaohongshu'])
    // Position 0 is the account the creator is known by, so the order is a fact
    // the response has to preserve.
    expect(creator.accounts[0]?.handle).toBe('priyaskin')
    expect(creator.accounts[2]?.url).toBe('https://www.xiaohongshu.com/user/profile/6123')
  })

  it('rejects a body with no accounts, and one with an empty list', async () => {
    // A creator with no account has no reach, would fall out of every tier band,
    // and the band counts would stop summing to the rows.
    const { app, workspaceId } = await seedWorkspace()
    const { accounts: _accounts, ...rest } = MINIMAL
    expect((await create(app, workspaceId, rest)).status).toBe(400)
    expect((await create(app, workspaceId, { ...MINIMAL, accounts: [] })).status).toBe(400)
  })

  it('rejects a repeated platform-and-handle pair inside one body, and names it', async () => {
    // Zod refuses it before the write, because a 409 about *another creator* is
    // the wrong sentence for a body that repeats itself. The message names the
    // pair and the issue carries the repeated row's own path.
    const { app, workspaceId } = await seedWorkspace()
    const res = await create(app, workspaceId, {
      name: 'Doubled Up',
      accounts: [account(), account()],
    })
    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain('@priyaskin on instagram')
  })

  it('accepts two accounts on one platform with different handles', async () => {
    // Three Instagram accounts is a real creator, and the unique key permits it.
    const { app, workspaceId } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, {
      name: 'Two Grids',
      accounts: [account(), account({ handle: 'priyaskin.archive' })],
    })
    expect(creator.accounts).toHaveLength(2)
  })

  it('rejects an eleventh account', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const eleven = Array.from({ length: 11 }, (_, i) => account({ handle: `handle${i}` }))
    expect((await create(app, workspaceId, { ...MINIMAL, accounts: eleven })).status).toBe(400)
  })

  it('rejects a handle carrying its own @', async () => {
    // Every surface adds the sigil. Two spellings of one handle would both pass
    // the unique key on `(workspace_id, platform, handle)`.
    const { app, workspaceId } = await seedWorkspace()
    expect(
      (
        await create(app, workspaceId, {
          ...MINIMAL,
          accounts: [account({ handle: '@priyaskin' })],
        })
      ).status,
    ).toBe(400)
  })

  it('rejects an engagement rate above 100', async () => {
    const { app, workspaceId } = await seedWorkspace()
    expect(
      (await create(app, workspaceId, { ...MINIMAL, accounts: [account({ engagementRate: 140 })] }))
        .status,
    ).toBe(400)
  })

  it('rejects a duplicated brand id rather than letting the join table refuse it', async () => {
    // The 400 exists so the unique violation on `(influencer_id, brand_id)` is
    // never reached — that would surface as a 500 for a malformed body.
    const { app, workspaceId, brandA } = await seedWorkspace()
    expect(
      (await create(app, workspaceId, { ...MINIMAL, brandIds: [brandA, brandA] })).status,
    ).toBe(400)
  })

  it('409s on an account already on another creator’s record, and names them', async () => {
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
    // so it names the pair **and the creator who holds it** — "handle already
    // used" leaves them guessing which record to open.
    expect(body.message).toContain('@priyaskin')
    expect(body.message).toContain('instagram')
    expect(body.message).toContain('Priya Nair')
  })

  it('409s rather than writing a second row, so the roster is unchanged', async () => {
    const { app, workspaceId } = await seedWorkspace()
    await createOk(app, workspaceId, MINIMAL)
    await create(app, workspaceId, MINIMAL)
    expect((await list(app, workspaceId)).length).toBe(1)
  })

  it('suffixes the slug when two creators genuinely share a name', async () => {
    // The `-2` used to be the cost of slugging from the handle — one person on
    // two platforms. It is now the rarer case it should always have been.
    const { app, workspaceId } = await seedWorkspace()
    const first = await createOk(app, workspaceId, MINIMAL)
    const second = await createOk(app, workspaceId, {
      ...MINIMAL,
      accounts: [account({ handle: 'theotherone' })],
    })
    expect(first.slug).toBe('priya-nair')
    expect(second.slug).toBe('priya-nair-2')
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
  it('lists a workspace biggest total reach first, with the name breaking a tie', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const row = (name: string, handle: string, followers: number) => ({
      name,
      accounts: [account({ handle, followers })],
    })
    await createOk(app, workspaceId, row('Small', 'small', 900))
    await createOk(app, workspaceId, row('Huge', 'huge', 2_000_000))
    await createOk(app, workspaceId, row('Zoe', 'zoe', 10_000))
    await createOk(app, workspaceId, row('Adam', 'adam', 10_000))

    // Reach descending, the opposite of every other list here: the order a budget
    // conversation happens in.
    expect((await list(app, workspaceId)).map((i) => i.name)).toEqual([
      'Huge',
      'Adam',
      'Zoe',
      'Small',
    ])
  })

  it('orders a multi-account creator by their total, not their largest account', async () => {
    // The defect this change exists to fix: 60k + 50k + 30k is a bigger creator
    // than one account of 100k, and the sort is over the summed figure now.
    const { app, workspaceId } = await seedWorkspace()
    await createOk(app, workspaceId, {
      name: 'Single',
      accounts: [account({ handle: 'single', followers: 100_000 })],
    })
    await createOk(app, workspaceId, {
      name: 'Multi',
      accounts: [
        account({ platform: 'instagram', handle: 'multi', followers: 60_000 }),
        account({ platform: 'tiktok', handle: 'multi', followers: 50_000 }),
        account({ platform: 'xiaohongshu', handle: 'multi', followers: 30_000 }),
      ],
    })
    expect((await list(app, workspaceId)).map((i) => i.name)).toEqual(['Multi', 'Single'])
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
      accounts: [account({ engagementRate: 3.8 })],
      notes: 'Two-post minimum.',
    })

    const res = await patch(app, workspaceId, creator.id, { status: 'active' })
    expect(res.status).toBe(200)
    const updated = (await res.json()) as Influencer
    expect(updated.status).toBe('active')
    // An omitted `accounts` leaves the whole list alone, which is what makes a
    // patch of one unrelated key safe.
    expect(updated.accounts).toHaveLength(1)
    expect(updated.accounts[0]?.engagementRate).toBe(3.8)
    expect(updated.notes).toBe('Two-post minimum.')
  })

  it('clears a nullable field on an explicit null', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, { ...MINIMAL, vertical: 'beauty' })
    const updated = (await (
      await patch(app, workspaceId, creator.id, { vertical: null })
    ).json()) as Influencer
    expect(updated.vertical).toBeNull()
  })

  it('replaces the whole account list, dropping the rows left out', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, {
      name: 'Shrinking Roster',
      accounts: [
        account({ platform: 'instagram', handle: 'shrinking' }),
        account({ platform: 'tiktok', handle: 'shrinking' }),
      ],
    })

    const updated = (await (
      await patch(app, workspaceId, creator.id, {
        accounts: [account({ platform: 'tiktok', handle: 'shrinking', followers: 99_000 })],
      })
    ).json()) as Influencer
    expect(updated.accounts).toHaveLength(1)
    expect(updated.accounts[0]?.platform).toBe('tiktok')
  })

  it('refuses a patch that empties the account list', async () => {
    // The patch that removes every account is a delete of the creator.
    const { app, workspaceId } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, MINIMAL)
    expect((await patch(app, workspaceId, creator.id, { accounts: [] })).status).toBe(400)
  })

  it('rejects an empty patch rather than performing a no-op write', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, MINIMAL)
    expect((await patch(app, workspaceId, creator.id, {})).status).toBe(400)
  })

  it('will not move the slug, however the name changes', async () => {
    const { app, workspaceId } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, MINIMAL)
    const updated = (await (
      await patch(app, workspaceId, creator.id, { name: 'Priya Raman', slug: 'priya-raman' })
    ).json()) as Influencer
    // A link written before the correction still resolves — the only reason to
    // carry a slug rather than routing on the id.
    expect(updated.name).toBe('Priya Raman')
    expect(updated.slug).toBe('priya-nair')
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
      await patch(app, workspaceId, creator.id, { notes: 'Called them' })
    ).json()) as Influencer
    expect(updated.brandIds).toEqual([brandA])
  })

  it('409s when a corrected account lands on somebody already there', async () => {
    // Correcting a typo into another creator's handle is the same mistake as
    // entering them twice, and it is owed the same answer rather than a 500.
    const { app, workspaceId } = await seedWorkspace()
    await createOk(app, workspaceId, MINIMAL)
    const second = await createOk(app, workspaceId, {
      name: 'Someone Else',
      accounts: [account({ handle: 'someoneelse' })],
    })

    const res = await patch(app, workspaceId, second.id, { accounts: [account()] })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { code: string; message: string }
    expect(body.code).toBe('INFLUENCER_HANDLE_TAKEN')
    expect(body.message).toContain('Priya Nair')
  })

  it('409s when only the platform moves onto an occupied pair', async () => {
    // The key is the *pair*, so a submitted account can collide by differing in
    // either half from the one it replaces.
    const { app, workspaceId } = await seedWorkspace()
    await createOk(app, workspaceId, {
      name: 'Sitting Tenant',
      accounts: [account({ platform: 'tiktok' })],
    })
    const insta = await createOk(app, workspaceId, MINIMAL)

    const res = await patch(app, workspaceId, insta.id, {
      accounts: [account({ platform: 'tiktok' })],
    })
    expect(res.status).toBe(409)
    expect(((await res.json()) as { message: string }).message).toContain('tiktok')
  })

  it('lets a creator resubmit their own accounts unchanged', async () => {
    // The row excludes itself from the check, or every edit that re-sent the
    // form's own values would refuse itself.
    const { app, workspaceId } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, MINIMAL)
    const res = await patch(app, workspaceId, creator.id, {
      accounts: [account({ followers: 130_000 })],
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as Influencer).accounts[0]?.followers).toBe(130_000)
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
    expect((await patch(app, workspaceId, absent, { accounts: [account()] })).status).toBe(404)
  })
})

describe('influencer routes — delete', () => {
  it('deletes once and 404s on the second attempt', async () => {
    const { app, workspaceId, brandA } = await seedWorkspace()
    const creator = await createOk(app, workspaceId, { ...MINIMAL, brandIds: [brandA] })
    const path = `/workspaces/${workspaceId}/influencers/${creator.id}`

    const first = await app.request(path, { method: 'DELETE', headers: auth() })
    expect(first.status).toBe(200)
    // The deleted row comes back, brand links and accounts and all — the last
    // copy anything will see.
    const gone = (await first.json()) as Influencer
    expect(gone.id).toBe(creator.id)
    expect(gone.brandIds).toEqual([brandA])
    expect(gone.accounts).toHaveLength(1)

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
