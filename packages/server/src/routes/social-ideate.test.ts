import type { IdeateCopyResult, IdeateThemesResult, PostIdea } from '@brandfactory/shared'
import { describe, expect, it, vi } from 'vitest'
import { createTestApp, type TestHarness } from '../test-helpers'

const USER = { id: 'u-1', token: 't-1' }
const OTHER = { id: 'u-2', token: 't-2' }

function auth(token = USER.token) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

const IDEA: PostIdea = {
  title: 'The pass at 6pm',
  angle: 'Hands, steam, no faces.',
  pillar: 'Behind the pass',
  date: '2026-08-12',
  platforms: ['instagram'],
  keyDateName: null,
  reason: 'The room is loudest before service.',
}

const THEMES_BODY = {
  window: { start: '2026-08-01', end: '2026-08-31' },
  platforms: ['instagram'],
  cadencePerWeek: 3,
  count: 6,
}

const THEMES_RESULT: IdeateThemesResult = {
  ideas: [IDEA],
  pillars: [{ name: 'Behind the pass', proposed: false }],
  outcome: 'ok',
}

const COPY_RESULT: IdeateCopyResult = {
  copies: [{ index: 0, body: 'Forty minutes before the room fills.', mediaDirection: 'Hands.' }],
  outcome: 'ok',
}

async function seedBrand(opts: Parameters<typeof createTestApp>[0] = {}) {
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
  return { ...harness, brandId: brand.id }
}

function themes(app: TestHarness['app'], brandId: string, body: unknown, token = USER.token) {
  return app.request(`/brands/${brandId}/ideate/themes`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify(body),
  })
}

function copy(app: TestHarness['app'], brandId: string, body: unknown, token = USER.token) {
  return app.request(`/brands/${brandId}/ideate/copy`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify(body),
  })
}

describe('POST /brands/:id/ideate/themes', () => {
  it('returns the injected planner’s ideas', async () => {
    const ideateThemes = vi.fn().mockResolvedValue(THEMES_RESULT)
    const { app, brandId } = await seedBrand({ ideateThemes })

    const res = await themes(app, brandId, THEMES_BODY)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(THEMES_RESULT)
    // The brand id arrives on the call, not in the body the client sent.
    expect(ideateThemes).toHaveBeenCalledWith(expect.objectContaining({ brandId, count: 6 }))
  })

  it('401s without a token', async () => {
    const { app, brandId } = await seedBrand({ ideateThemes: vi.fn() })
    const res = await app.request(`/brands/${brandId}/ideate/themes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(THEMES_BODY),
    })
    expect(res.status).toBe(401)
  })

  it('404s on a brand that does not exist', async () => {
    const ideateThemes = vi.fn()
    const { app } = await seedBrand({ ideateThemes })
    const res = await themes(app, '00000000-0000-4000-8000-000000000000', THEMES_BODY)
    expect(res.status).toBe(404)
    // The access gate runs before the planner, so nothing was spent.
    expect(ideateThemes).not.toHaveBeenCalled()
  })

  it('403s for a user who does not own the workspace', async () => {
    // The aggregate chain: the brand row exists, so `requireWorkspaceAccess`
    // is what refuses, and it refuses with `ForbiddenError`. A brand id that
    // matches nothing at all is the 404 above.
    const ideateThemes = vi.fn()
    const { app, brandId } = await seedBrand({ ideateThemes })
    const res = await themes(app, brandId, THEMES_BODY, OTHER.token)
    expect(res.status).toBe(403)
    expect(ideateThemes).not.toHaveBeenCalled()
  })

  it('400s on a malformed body, without calling the planner', async () => {
    const ideateThemes = vi.fn()
    const { app, brandId } = await seedBrand({ ideateThemes })

    // A cadence of zero, a window that is not day keys, and no platform.
    for (const body of [
      { ...THEMES_BODY, cadencePerWeek: 0 },
      { ...THEMES_BODY, window: { start: 'August', end: 'September' } },
      { ...THEMES_BODY, platforms: [] },
      {},
    ]) {
      expect((await themes(app, brandId, body)).status).toBe(400)
    }
    expect(ideateThemes).not.toHaveBeenCalled()
  })

  it('reports an honest empty answer as 200, not as an error', async () => {
    // A fully booked window is a real answer. The client has one line for it,
    // and a 4xx would send it down the error path instead.
    const empty: IdeateThemesResult = { ideas: [], pillars: [], outcome: 'no-ideas' }
    const { app, brandId } = await seedBrand({ ideateThemes: vi.fn().mockResolvedValue(empty) })
    const res = await themes(app, brandId, THEMES_BODY)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(empty)
  })
})

describe('POST /brands/:id/ideate/copy', () => {
  const body = { items: [{ idea: IDEA, platform: 'instagram' }] }

  it('returns the injected writer’s copy', async () => {
    const ideateCopy = vi.fn().mockResolvedValue(COPY_RESULT)
    const { app, brandId } = await seedBrand({ ideateCopy })
    const res = await copy(app, brandId, body)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(COPY_RESULT)
    expect(ideateCopy).toHaveBeenCalledWith(expect.objectContaining({ brandId }))
  })

  it('401s without a token', async () => {
    const { app, brandId } = await seedBrand({ ideateCopy: vi.fn() })
    const res = await app.request(`/brands/${brandId}/ideate/copy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(res.status).toBe(401)
  })

  it('403s for a user who does not own the workspace', async () => {
    const ideateCopy = vi.fn()
    const { app, brandId } = await seedBrand({ ideateCopy })
    expect((await copy(app, brandId, body, OTHER.token)).status).toBe(403)
    expect(ideateCopy).not.toHaveBeenCalled()
  })

  it('400s on an empty batch and on a batch over the ceiling', async () => {
    const ideateCopy = vi.fn()
    const { app, brandId } = await seedBrand({ ideateCopy })
    expect((await copy(app, brandId, { items: [] })).status).toBe(400)
    expect(
      (
        await copy(app, brandId, {
          items: Array.from({ length: 25 }, () => ({ idea: IDEA, platform: 'instagram' })),
        })
      ).status,
    ).toBe(400)
    expect(ideateCopy).not.toHaveBeenCalled()
  })
})

describe('the planner writes nothing', () => {
  // The single most important property of this router, asserted directly
  // rather than inferred from the absence of a write in the handler: every
  // path above leaves the post table exactly as it found it. A run that
  // changed the database would need a lifecycle, and this has none.
  it('leaves the social post table untouched, whatever the outcome', async () => {
    const { app, state, brandId } = await seedBrand({
      ideateThemes: vi.fn().mockResolvedValue(THEMES_RESULT),
      ideateCopy: vi.fn().mockResolvedValue(COPY_RESULT),
    })

    await themes(app, brandId, THEMES_BODY)
    await themes(app, brandId, { ...THEMES_BODY, cadencePerWeek: 0 })
    await copy(app, brandId, { items: [{ idea: IDEA, platform: 'instagram' }] })
    await copy(app, brandId, { items: [] })
    await themes(app, brandId, THEMES_BODY, OTHER.token)

    expect(state.socialPosts.size).toBe(0)
  })
})
