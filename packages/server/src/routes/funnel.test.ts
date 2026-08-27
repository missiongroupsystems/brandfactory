import type {
  FunnelActivity,
  FunnelStage,
  FunnelStageWithDetail,
  Platform,
} from '@brandfactory/shared'
import { DEFAULT_FUNNEL_STAGES } from '@brandfactory/shared'
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

async function funnelOf(harness: TestHarness, brandId: string) {
  return (await (
    await harness.app.request(`/brands/${brandId}/funnel`, { headers: auth() })
  ).json()) as FunnelStageWithDetail[]
}

describe('the six defaults', () => {
  it('arrive with the brand, in journey order', async () => {
    // Written in the same transaction as the brand: a brand that committed
    // without its stages would show an empty funnel indistinguishable from
    // "nobody has set this up yet".
    const harness = await seedBrand()
    const stages = await funnelOf(harness, harness.brandId)
    expect(stages.map((s) => s.name)).toEqual([...DEFAULT_FUNNEL_STAGES])
  })

  it('are ordered by position, sparsely', async () => {
    const harness = await seedBrand()
    const stages = await funnelOf(harness, harness.brandId)
    const positions = stages.map((s) => s.position)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(positions[1]! - positions[0]!).toBeGreaterThan(1)
  })

  it('are rows the brand owns — renameable and deletable', async () => {
    // The request calls the set editable, which is why these are rows rather
    // than a constant the screen renders.
    const harness = await seedBrand()
    const { app, brandId } = harness
    const [first] = await funnelOf(harness, brandId)

    const renamed = (await (
      await app.request(`/brands/${brandId}/funnel/stages/${first!.id}`, {
        method: 'PATCH',
        headers: auth(),
        body: JSON.stringify({ name: 'Discovery' }),
      })
    ).json()) as FunnelStage
    expect(renamed.name).toBe('Discovery')

    await app.request(`/brands/${brandId}/funnel/stages/${first!.id}`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect((await funnelOf(harness, brandId)).map((s) => s.name)).not.toContain('Discovery')
  })
})

describe('platforms', () => {
  async function addPlatform(harness: TestHarness, brandId: string, name: string) {
    return (await (
      await harness.app.request(`/brands/${brandId}/funnel/platforms`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name, url: 'https://instagram.com/brand' }),
      })
    ).json()) as Platform
  }

  it('lets one platform serve two stages', async () => {
    // **The phase's entire justification.** Instagram serves Awareness and
    // Loyalty; as a row per stage it would be typed twice and corrected once.
    const harness = await seedBrand()
    const { app, brandId } = harness
    const platform = await addPlatform(harness, brandId, 'Instagram')
    const stages = await funnelOf(harness, brandId)

    for (const stage of [stages[0]!, stages[4]!]) {
      await app.request(`/brands/${brandId}/funnel/stages/${stage.id}/platforms/${platform.id}`, {
        method: 'POST',
        headers: auth(),
      })
    }

    const after = await funnelOf(harness, brandId)
    expect(after[0]!.platforms.map((p) => p.id)).toEqual([platform.id])
    expect(after[4]!.platforms.map((p) => p.id)).toEqual([platform.id])
    // One row, two links — not two rows.
    const all = (await (
      await app.request(`/brands/${brandId}/funnel/platforms`, { headers: auth() })
    ).json()) as Platform[]
    expect(all).toHaveLength(1)
  })

  it('is idempotent — attaching twice is a no-op, not a duplicate', async () => {
    const harness = await seedBrand()
    const { app, brandId } = harness
    const platform = await addPlatform(harness, brandId, 'Instagram')
    const [stage] = await funnelOf(harness, brandId)
    const attach = () =>
      app.request(`/brands/${brandId}/funnel/stages/${stage!.id}/platforms/${platform.id}`, {
        method: 'POST',
        headers: auth(),
      })
    await attach()
    expect((await attach()).status).toBe(200)
    expect((await funnelOf(harness, brandId))[0]!.platforms).toHaveLength(1)
  })

  it('drops the link and keeps the platform when a stage is deleted', async () => {
    const harness = await seedBrand()
    const { app, brandId } = harness
    const platform = await addPlatform(harness, brandId, 'Instagram')
    const [stage] = await funnelOf(harness, brandId)
    await app.request(`/brands/${brandId}/funnel/stages/${stage!.id}/platforms/${platform.id}`, {
      method: 'POST',
      headers: auth(),
    })
    await app.request(`/brands/${brandId}/funnel/stages/${stage!.id}`, {
      method: 'DELETE',
      headers: auth(),
    })
    const remaining = (await (
      await app.request(`/brands/${brandId}/funnel/platforms`, { headers: auth() })
    ).json()) as Platform[]
    // The relationship outlives the stage — the platform is the record the next
    // stage gets attached to.
    expect(remaining).toHaveLength(1)
  })

  it('refuses to delete a platform an activity still names', async () => {
    // `ON DELETE RESTRICT`: an activity whose platform vanished is an activity
    // that ran nowhere, and platforms are cheap to keep.
    const harness = await seedBrand()
    const { app, brandId } = harness
    const platform = await addPlatform(harness, brandId, 'Instagram')
    const [stage] = await funnelOf(harness, brandId)
    await app.request(`/brands/${brandId}/funnel/stages/${stage!.id}/activities`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ title: 'Launch teasers', status: 'running', platformId: platform.id }),
    })
    const res = await app.request(`/brands/${brandId}/funnel/platforms/${platform.id}`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect(res.status).toBe(409)
  })
})

describe('activities', () => {
  it('records a platform, a status and two dates', async () => {
    const harness = await seedBrand()
    const { app, brandId } = harness
    const [stage] = await funnelOf(harness, brandId)
    const activity = (await (
      await app.request(`/brands/${brandId}/funnel/stages/${stage!.id}/activities`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({
          title: 'Spring campaign',
          status: 'running',
          startsOn: '2026-03-01',
          endsOn: null,
        }),
      })
    ).json()) as FunnelActivity
    // A Running activity with a start and no end — the state most activities are
    // in when anybody looks, and the one a single date could not express.
    expect(activity.status).toBe('running')
    expect(activity.startsOn).toBe('2026-03-01')
    expect(activity.endsOn).toBeNull()
  })

  it('takes plain text where a typed link is not built yet', async () => {
    // v1 has no link to a held record — of the three the request names, one is
    // unreachable from this app, one has no referent, and one is a fixture. The
    // request permits this: "otherwise it is plain text."
    const harness = await seedBrand()
    const { app, brandId } = harness
    const [stage] = await funnelOf(harness, brandId)
    const activity = (await (
      await app.request(`/brands/${brandId}/funnel/stages/${stage!.id}/activities`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({
          title: 'Creator programme',
          status: 'planned',
          note: 'See the influencer roster — Jamie, Lena, Wei',
        }),
      })
    ).json()) as FunnelActivity
    expect(activity.note).toContain('influencer roster')
  })

  it('400s on a status outside the four', async () => {
    const harness = await seedBrand()
    const { app, brandId } = harness
    const [stage] = await funnelOf(harness, brandId)
    const res = await app.request(`/brands/${brandId}/funnel/stages/${stage!.id}/activities`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ title: 'x', status: 'crushing-it' }),
    })
    expect(res.status).toBe(400)
  })

  it('404s on a stage from another brand', async () => {
    // A stage id is not a capability: activities are keyed on `stageId` alone in
    // the query layer, so the route resolves the brand's own stage list first.
    const a = await seedBrand()
    const b = await seedBrand()
    const [foreignStage] = await funnelOf(b, b.brandId)
    const res = await a.app.request(
      `/brands/${a.brandId}/funnel/stages/${foreignStage!.id}/activities`,
      { method: 'POST', headers: auth(), body: JSON.stringify({ title: 'x', status: 'planned' }) },
    )
    expect(res.status).toBe(404)
  })

  it('goes with its stage', async () => {
    const harness = await seedBrand()
    const { app, brandId } = harness
    const [stage] = await funnelOf(harness, brandId)
    await app.request(`/brands/${brandId}/funnel/stages/${stage!.id}/activities`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ title: 'Doomed', status: 'planned' }),
    })
    await app.request(`/brands/${brandId}/funnel/stages/${stage!.id}`, {
      method: 'DELETE',
      headers: auth(),
    })
    const stages = await funnelOf(harness, brandId)
    expect(stages.flatMap((s) => s.activities)).toHaveLength(0)
  })
})

describe('the typed link to a social post', () => {
  async function seedPost(harness: TestHarness, brandId: string) {
    return (await (
      await harness.app.request(`/brands/${brandId}/social-posts`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ platform: 'instagram', body: 'Spring teaser' }),
      })
    ).json()) as { id: string }
  }

  it('links an activity to a post and reads it back', async () => {
    // **The one target of the three that exists.** There is no `program` record in
    // this schema and contracts are a fixture, so this is a single nullable column
    // rather than a polymorphic pair — see `funnel.ts` for why a discriminator
    // listing two unreachable values would be worse.
    const harness = await seedBrand()
    const { app, brandId } = harness
    const post = await seedPost(harness, brandId)
    const [stage] = await funnelOf(harness, brandId)

    const activity = (await (
      await app.request(`/brands/${brandId}/funnel/stages/${stage!.id}/activities`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({
          title: 'Spring campaign',
          status: 'running',
          socialPostId: post.id,
        }),
      })
    ).json()) as FunnelActivity
    expect(activity.socialPostId).toBe(post.id)
  })

  it('unlinks on an explicit null, and leaves it alone when absent', async () => {
    const harness = await seedBrand()
    const { app, brandId } = harness
    const post = await seedPost(harness, brandId)
    const [stage] = await funnelOf(harness, brandId)
    const activity = (await (
      await app.request(`/brands/${brandId}/funnel/stages/${stage!.id}/activities`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ title: 'Spring', status: 'planned', socialPostId: post.id }),
      })
    ).json()) as FunnelActivity

    async function patch(body: unknown) {
      const res = await app.request(
        `/brands/${brandId}/funnel/stages/${stage!.id}/activities/${activity.id}`,
        { method: 'PATCH', headers: auth(), body: JSON.stringify(body) },
      )
      return (await res.json()) as FunnelActivity
    }

    // Absent leaves the link alone.
    expect((await patch({ title: 'Spring campaign' })).socialPostId).toBe(post.id)
    // Explicit null clears it.
    expect((await patch({ socialPostId: null })).socialPostId).toBeNull()
  })

  it('keeps the activity, and its link, when the post is soft-deleted', async () => {
    // **`ON DELETE SET NULL` does not fire here, and that is worth knowing.**
    // Social posts soft-delete (`docs/vision.md:51` — a discarded idea hides), so
    // the row survives and the FK is never triggered. The activity therefore keeps
    // a `socialPostId` pointing at a post no read path returns.
    //
    // The cascade still matters for the hard-delete paths — a brand or workspace
    // sweep — and the *screen* is what handles this case: `funnel-view.tsx` names
    // the state rather than rendering "No linked post" over a link that exists.
    const harness = await seedBrand()
    const { app, brandId } = harness
    const post = await seedPost(harness, brandId)
    const [stage] = await funnelOf(harness, brandId)
    await app.request(`/brands/${brandId}/funnel/stages/${stage!.id}/activities`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ title: 'Spring', status: 'planned', socialPostId: post.id }),
    })

    await app.request(`/brands/${brandId}/social-posts/${post.id}`, {
      method: 'DELETE',
      headers: auth(),
    })

    const stages = await funnelOf(harness, brandId)
    const activities = stages.flatMap((s) => s.activities)
    expect(activities).toHaveLength(1)
    // The link survives a soft delete, by design rather than by accident.
    expect(activities[0]!.socialPostId).toBe(post.id)
  })
})
