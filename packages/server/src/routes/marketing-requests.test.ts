import type { MarketingRequest } from '@brandfactory/shared'
import { MarketingRequestSchema } from '@brandfactory/shared'
import { describe, expect, it } from 'vitest'
import { createTestApp, type TestHarness } from '../test-helpers'

const USER = { id: 'u-1', token: 't-1' }
const OTHER = { id: 'u-2', token: 't-2' }

function auth(token = USER.token) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

async function post(app: TestHarness['app'], path: string, body: unknown, token?: string) {
  return app.request(path, { method: 'POST', headers: auth(token), body: JSON.stringify(body) })
}

/** A workspace with two brands, each with one outlet. */
async function seed() {
  const harness = createTestApp({ users: [USER, OTHER] })
  const { app } = harness
  const ws = (await (await post(app, '/workspaces', { name: 'W' })).json()) as { id: string }
  const brand = async (name: string) =>
    ((await (await post(app, `/workspaces/${ws.id}/brands`, { name })).json()) as { id: string }).id
  const brandId = await brand('Casa Vostra')
  const otherBrandId = await brand('Willow')
  const outlet = async (name: string, forBrand: string) =>
    (
      (await (
        await post(app, `/workspaces/${ws.id}/outlets`, {
          name,
          outletType: 'restaurant',
          brandId: forBrand,
        })
      ).json()) as { id: string }
    ).id
  const outletId = await outlet('Casa Vostra Tanjong Pagar', brandId)
  const otherOutletId = await outlet('Willow Dempsey', otherBrandId)
  const base = `/workspaces/${ws.id}/marketing-requests`
  return { ...harness, workspaceId: ws.id, brandId, otherBrandId, outletId, otherOutletId, base }
}

const BODY = { type: 'social_post', summary: 'Teasers for the set menu' }

async function createOk(app: TestHarness['app'], base: string, body: unknown, token?: string) {
  const res = await post(app, base, body, token)
  expect(res.status).toBe(201)
  return (await res.json()) as MarketingRequest
}

async function patch(app: TestHarness['app'], path: string, body: unknown) {
  return app.request(path, { method: 'PATCH', headers: auth(), body: JSON.stringify(body) })
}

describe('marketing request routes — access', () => {
  it('401s without a token, on every method', async () => {
    const { app, base, brandId } = await seed()
    const row = await createOk(app, base, { ...BODY, brandId })
    for (const [method, path] of [
      ['GET', base],
      ['POST', base],
      ['GET', `${base}/${row.id}`],
      ['PATCH', `${base}/${row.id}`],
      ['DELETE', `${base}/${row.id}`],
    ] as const) {
      const res = await app.request(path, { method })
      expect(res.status, `${method} ${path}`).toBe(401)
    }
  })

  it('404s a workspace that does not exist', async () => {
    const { app } = await seed()
    const res = await app.request('/workspaces/nope/marketing-requests', { headers: auth() })
    expect(res.status).toBe(404)
  })
})

describe('marketing request routes — create', () => {
  it('files a new request as the session’s user, numbered from 1001', async () => {
    const { app, base, brandId, outletId } = await seed()
    const row = await createOk(app, base, { ...BODY, brandId, outletId })
    expect(MarketingRequestSchema.parse(row)).toEqual(row)
    expect(row).toMatchObject({
      number: 1001,
      reference: 'MR-1001',
      status: 'new',
      priority: 'medium',
      outletId,
      assignee: null,
      resolvedAt: null,
    })
    expect(row.requestedBy?.id).toBe(USER.id)
  })

  it('takes the requester from the session, not the body', async () => {
    const { app, base, brandId } = await seed()
    const row = await createOk(
      app,
      base,
      { ...BODY, brandId, requestedByUserId: USER.id, status: 'resolved' },
      OTHER.token,
    )
    expect(row.requestedBy?.id).toBe(OTHER.id)
    expect(row.status).toBe('new')
  })

  it('numbers consecutively and lists newest first', async () => {
    const { app, base, brandId } = await seed()
    await createOk(app, base, { ...BODY, brandId })
    await createOk(app, base, { ...BODY, brandId })
    const list = (await (await app.request(base, { headers: auth() })).json()) as MarketingRequest[]
    expect(list.map((r) => r.reference)).toEqual(['MR-1002', 'MR-1001'])
  })

  it('400s another brand’s outlet', async () => {
    const { app, base, brandId, otherOutletId } = await seed()
    const res = await post(app, base, { ...BODY, brandId, outletId: otherOutletId })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('OUTLET_NOT_IN_BRAND')
  })

  it('400s a brand from another workspace', async () => {
    const { app, base } = await seed()
    const ws2 = (await (await post(app, '/workspaces', { name: 'W2' })).json()) as { id: string }
    const foreign = (await (
      await post(app, `/workspaces/${ws2.id}/brands`, { name: 'Elsewhere' })
    ).json()) as { id: string }
    const res = await post(app, base, { ...BODY, brandId: foreign.id })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('BRAND_NOT_IN_WORKSPACE')
  })

  it('400s a body without a summary', async () => {
    const { app, base, brandId } = await seed()
    const res = await post(app, base, { type: 'social_post', brandId })
    expect(res.status).toBe(400)
  })
})

describe('marketing request routes — patch', () => {
  it('moves through the ladder and stamps resolvedAt only while closed', async () => {
    const { app, base, brandId } = await seed()
    const row = await createOk(app, base, { ...BODY, brandId })
    const path = `${base}/${row.id}`
    const closed = (await (
      await patch(app, path, { status: 'declined' })
    ).json()) as MarketingRequest
    expect(closed.status).toBe('declined')
    expect(closed.resolvedAt).not.toBeNull()
    const reopened = (await (
      await patch(app, path, { status: 'in_review' })
    ).json()) as MarketingRequest
    expect(reopened.resolvedAt).toBeNull()
  })

  it('assigns a user, and 400s one with no account', async () => {
    const { app, base, brandId } = await seed()
    const row = await createOk(app, base, { ...BODY, brandId })
    const path = `${base}/${row.id}`
    const assigned = (await (
      await patch(app, path, { assigneeUserId: OTHER.id })
    ).json()) as MarketingRequest
    expect(assigned.assignee?.id).toBe(OTHER.id)
    const res = await patch(app, path, { assigneeUserId: 'u-nobody' })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('ASSIGNEE_NOT_FOUND')
  })

  it('refuses a deactivated assignee, which it used to accept', async () => {
    // ⚠️ This was a live defect until 5 October 2026. `assertUserExists`
    // checked only that the row was there, so a request could be assigned to a
    // deactivated account: 200 from the route, their name in the Assigned
    // column, and the work sitting with somebody who cannot sign in. Nothing
    // had reached it because the only id the screen could send was the
    // caller's own — the assignee picker makes every other id reachable, so
    // `assertAssignable` and the picker land together.
    const { app, base, brandId, state } = await seed()
    const row = await createOk(app, base, { ...BODY, brandId })
    const other = state.users.get(OTHER.id)
    if (other) other.deactivatedAt = '2026-10-01'
    const res = await patch(app, `${base}/${row.id}`, { assigneeUserId: OTHER.id })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('ASSIGNEE_NOT_FOUND')
  })

  it('keeps an assignee who is deactivated afterwards', async () => {
    // Deactivation must NOT unassign. The history is true and the inbox should
    // show who is holding the work. A sweep on the deactivate route would be
    // one line and would silently empty the Assigned column.
    const { app, base, brandId, state } = await seed()
    const row = await createOk(app, base, { ...BODY, brandId })
    const path = `${base}/${row.id}`
    const assigned = (await (
      await patch(app, path, { assigneeUserId: OTHER.id })
    ).json()) as MarketingRequest
    expect(assigned.assignee?.id).toBe(OTHER.id)
    const other = state.users.get(OTHER.id)
    if (other) other.deactivatedAt = '2026-10-02'
    const after = (await (await app.request(path, { headers: auth() })).json()) as MarketingRequest
    expect(after.assignee?.id).toBe(OTHER.id)
  })

  it('checks the kept outlet against a new brand', async () => {
    const { app, base, brandId, otherBrandId, outletId } = await seed()
    const row = await createOk(app, base, { ...BODY, brandId, outletId })
    const path = `${base}/${row.id}`
    const refused = await patch(app, path, { brandId: otherBrandId })
    expect(refused.status).toBe(400)
    const moved = (await (
      await patch(app, path, { brandId: otherBrandId, outletId: null })
    ).json()) as MarketingRequest
    expect(moved).toMatchObject({ brandId: otherBrandId, outletId: null })
  })

  it('404s an id from another workspace', async () => {
    const { app, base, brandId } = await seed()
    const row = await createOk(app, base, { ...BODY, brandId })
    const ws2 = (await (await post(app, '/workspaces', { name: 'W2' })).json()) as { id: string }
    const res = await patch(app, `/workspaces/${ws2.id}/marketing-requests/${row.id}`, {
      status: 'resolved',
    })
    expect(res.status).toBe(404)
  })
})

describe('marketing request routes — delete', () => {
  it('soft-deletes once, hides the row, and does not reissue its number', async () => {
    const { app, base, brandId } = await seed()
    const row = await createOk(app, base, { ...BODY, brandId })
    const path = `${base}/${row.id}`
    expect((await app.request(path, { method: 'DELETE', headers: auth() })).status).toBe(200)
    expect((await app.request(path, { method: 'DELETE', headers: auth() })).status).toBe(404)
    expect((await app.request(path, { headers: auth() })).status).toBe(404)
    const next = await createOk(app, base, { ...BODY, brandId })
    expect(next.number).toBe(row.number + 1)
  })
})
