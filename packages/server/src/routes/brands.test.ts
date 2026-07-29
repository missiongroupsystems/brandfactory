import type {
  BrandGuidelineSection,
  BrandId,
  BrandSummary,
  ProjectId,
  SectionId,
  UserId,
  WorkspaceId,
} from '@brandfactory/shared'
import { describe, expect, it } from 'vitest'
import { createTestApp } from '../test-helpers'

async function seedBrand(tokenUser: { id: string; token: string }) {
  const { app, state } = createTestApp({ users: [tokenUser] })
  const wsRes = await app.request('/workspaces', {
    method: 'POST',
    headers: { authorization: `Bearer ${tokenUser.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'W' }),
  })
  const ws = (await wsRes.json()) as { id: string }
  const brRes = await app.request(`/workspaces/${ws.id}/brands`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tokenUser.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'B' }),
  })
  const br = (await brRes.json()) as { id: string }
  return { app, state, workspaceId: ws.id, brandId: br.id }
}

describe('brands routes', () => {
  it('POST /workspaces/:id/brands creates a brand in an owned workspace', async () => {
    const { brandId } = await seedBrand({ id: 'u-1', token: 't-1' })
    expect(brandId).toMatch(/^br-/)
  })

  it('POST /workspaces/:id/brands forbids a non-owner', async () => {
    const { app, state } = createTestApp({
      users: [
        { id: 'u-1', token: 't-1' },
        { id: 'u-2', token: 't-2' },
      ],
    })
    state.workspaces.set('w-theirs', {
      id: 'w-theirs' as never,
      name: 'theirs',
      ownerUserId: 'u-2' as UserId,
      createdAt: 't',
      updatedAt: 't',
    })
    const res = await app.request('/workspaces/w-theirs/brands', {
      method: 'POST',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    })
    expect(res.status).toBe(403)
  })

  it('GET /workspaces/:id/brands returns section and project counts', async () => {
    const { app, state, workspaceId, brandId } = await seedBrand({ id: 'u-1', token: 't-1' })

    // Brand with 2 sections + 1 project → counts 2 / 1.
    state.sections.set('sec-1' as SectionId, {
      id: 'sec-1' as SectionId,
      brandId: brandId as BrandId,
      label: 'Voice',
      body: { type: 'doc', content: [] },
      priority: 1,
      createdBy: 'user',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    state.sections.set('sec-2' as SectionId, {
      id: 'sec-2' as SectionId,
      brandId: brandId as BrandId,
      label: 'Audience',
      body: { type: 'doc', content: [] },
      priority: 2,
      createdBy: 'user',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    state.projects.set('pr-1' as ProjectId, {
      id: 'pr-1' as ProjectId,
      brandId: brandId as BrandId,
      kind: 'freeform',
      name: 'Naming',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    // Second brand with neither sections nor projects → 0 / 0.
    const emptyBrandId = 'br-empty' as BrandId
    state.brands.set(emptyBrandId, {
      id: emptyBrandId,
      workspaceId: workspaceId as WorkspaceId,
      name: 'Empty',
      description: null,
      websiteUrl: null,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })

    const res = await app.request(`/workspaces/${workspaceId}/brands`, {
      headers: { authorization: 'Bearer t-1' },
    })
    expect(res.status).toBe(200)
    const list = (await res.json()) as BrandSummary[]
    const withStuff = list.find((b) => b.id === brandId)
    const empty = list.find((b) => b.id === emptyBrandId)
    expect(withStuff).toMatchObject({ sectionCount: 2, projectCount: 1 })
    expect(empty).toMatchObject({ sectionCount: 0, projectCount: 0 })
  })

  it('GET /workspaces/:id/brands forbids a non-owner', async () => {
    const { app, state } = createTestApp({
      users: [
        { id: 'u-1', token: 't-1' },
        { id: 'u-2', token: 't-2' },
      ],
    })
    state.workspaces.set('w-theirs' as WorkspaceId, {
      id: 'w-theirs' as WorkspaceId,
      name: 'theirs',
      ownerUserId: 'u-2' as UserId,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const res = await app.request('/workspaces/w-theirs/brands', {
      headers: { authorization: 'Bearer t-1' },
    })
    expect(res.status).toBe(403)
  })

  it('GET /brands/:id hydrates sections', async () => {
    const { app, brandId } = await seedBrand({ id: 'u-1', token: 't-1' })
    const res = await app.request(`/brands/${brandId}`, {
      headers: { authorization: 'Bearer t-1' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; sections: BrandGuidelineSection[] }
    expect(body.id).toBe(brandId)
    expect(Array.isArray(body.sections)).toBe(true)
  })

  it('PATCH /brands/:id/guidelines upserts + reorders sections', async () => {
    const { app, brandId } = await seedBrand({ id: 'u-1', token: 't-1' })
    const patch1 = await app.request(`/brands/${brandId}/guidelines`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({
        sections: [
          { label: 'Voice', body: { type: 'doc', content: [] }, priority: 1 },
          { label: 'Audience', body: { type: 'doc', content: [] }, priority: 2 },
        ],
      }),
    })
    expect(patch1.status).toBe(200)
    const first = (await patch1.json()) as BrandGuidelineSection[]
    expect(first.map((s) => s.label)).toEqual(['Voice', 'Audience'])

    // Reorder: reuse ids, swap priorities; update the first's label.
    const [voice, audience] = first
    const patch2 = await app.request(`/brands/${brandId}/guidelines`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({
        sections: [
          { id: audience!.id, label: 'Audience', body: { type: 'doc', content: [] }, priority: 1 },
          {
            id: voice!.id,
            label: 'Voice & tone',
            body: { type: 'doc', content: [] },
            priority: 2,
          },
        ],
      }),
    })
    expect(patch2.status).toBe(200)
    const second = (await patch2.json()) as BrandGuidelineSection[]
    expect(second.map((s) => s.label)).toEqual(['Audience', 'Voice & tone'])
  })

  it('PATCH /brands/:id renames and clears description', async () => {
    const { app, brandId } = await seedBrand({ id: 'u-1', token: 't-1' })
    const res = await app.request(`/brands/${brandId}`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed', description: null }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ name: 'Renamed', description: null })
  })

  it('DELETE /brands/:id cascades projects and forbids non-owners', async () => {
    const { app, state, brandId } = await seedBrand({ id: 'u-1', token: 't-1' })
    const project = (await (
      await app.request(`/brands/${brandId}/projects`, {
        method: 'POST',
        headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'freeform', name: 'Doomed' }),
      })
    ).json()) as { id: string }
    expect(state.projects.has(project.id)).toBe(true)

    const del = await app.request(`/brands/${brandId}`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer t-1' },
    })
    expect(del.status).toBe(200)
    expect(state.brands.has(brandId)).toBe(false)
    expect(state.projects.has(project.id)).toBe(false)

    // Unknown brand after delete → 404
    const gone = await app.request(`/brands/${brandId}`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer t-1' },
    })
    expect(gone.status).toBe(404)
  })

  // -------------------------------------------------------------------------
  // createdBy (Stage 1B). The route used to synthesise `'user'` for every row,
  // and because the payload is the brand's COMPLETE section list, that made
  // every save rewrite the author of every section — not just the edited one.
  // -------------------------------------------------------------------------

  // **The test the fix exists for.** Without it the field goes back to lying and
  // nothing else in the suite fails.
  it('PATCH /brands/:id/guidelines leaves an agent section agent-written when a user section is edited', async () => {
    const { app, brandId } = await seedBrand({ id: 'u-1', token: 't-1' })

    const seeded = (await (
      await app.request(`/brands/${brandId}/guidelines`, {
        method: 'PATCH',
        headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
        body: JSON.stringify({
          sections: [
            {
              label: 'Voice',
              body: { type: 'doc', content: [] },
              priority: 1000,
              createdBy: 'user',
            },
            {
              label: 'Audience',
              body: { type: 'doc', content: [] },
              priority: 2000,
              createdBy: 'agent',
            },
          ],
        }),
      })
    ).json()) as BrandGuidelineSection[]
    expect(seeded.map((s) => s.createdBy)).toEqual(['user', 'agent'])

    // Now edit only the user-written one — sending both back, as the editor
    // does, each with the author it was handed.
    const [voice, audience] = seeded
    const after = (await (
      await app.request(`/brands/${brandId}/guidelines`, {
        method: 'PATCH',
        headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
        body: JSON.stringify({
          sections: [
            {
              id: voice!.id,
              label: 'Voice & tone',
              body: { type: 'doc', content: [] },
              priority: 1000,
              createdBy: voice!.createdBy,
            },
            {
              id: audience!.id,
              label: audience!.label,
              body: audience!.body,
              priority: 2000,
              createdBy: audience!.createdBy,
            },
          ],
        }),
      })
    ).json()) as BrandGuidelineSection[]

    expect(after.map((s) => [s.label, s.createdBy])).toEqual([
      ['Voice & tone', 'user'],
      ['Audience', 'agent'],
    ])
  })

  // The `.default('user')` is what keeps a client that predates the field both
  // compiling and correct: omitting it means "a person wrote this", which is
  // what every pre-1B payload meant.
  it('PATCH /brands/:id/guidelines defaults a section with no createdBy to user', async () => {
    const { app, brandId } = await seedBrand({ id: 'u-1', token: 't-1' })
    const res = await app.request(`/brands/${brandId}/guidelines`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({
        sections: [{ label: 'Voice', body: { type: 'doc', content: [] }, priority: 1000 }],
      }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()) as BrandGuidelineSection[]).toMatchObject([{ createdBy: 'user' }])
  })

  it('PATCH /brands/:id/guidelines rejects an unknown createdBy value', async () => {
    const { app, brandId } = await seedBrand({ id: 'u-1', token: 't-1' })
    const res = await app.request(`/brands/${brandId}/guidelines`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({
        sections: [
          {
            label: 'Voice',
            body: { type: 'doc', content: [] },
            priority: 1000,
            createdBy: 'system',
          },
        ],
      }),
    })
    expect(res.status).toBe(400)
  })

  // -------------------------------------------------------------------------
  // websiteUrl (Stage 1A). The column is nullable and additive; what is *not*
  // optional is the scheme filter — this value is rendered into an `href`.
  // -------------------------------------------------------------------------

  it('POST /workspaces/:id/brands stores a website and defaults it to null', async () => {
    const { app, state } = createTestApp({ users: [{ id: 'u-1', token: 't-1' }] })
    const ws = (await (
      await app.request('/workspaces', {
        method: 'POST',
        headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'W' }),
      })
    ).json()) as { id: string }

    const withSite = await app.request(`/workspaces/${ws.id}/brands`, {
      method: 'POST',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Casa Vostra', websiteUrl: 'https://casavostra.com' }),
    })
    expect(withSite.status).toBe(201)
    expect(await withSite.json()).toMatchObject({ websiteUrl: 'https://casavostra.com' })

    const without = await app.request(`/workspaces/${ws.id}/brands`, {
      method: 'POST',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'No site' }),
    })
    expect(await without.json()).toMatchObject({ websiteUrl: null })
    expect(state.brands.size).toBe(2)
  })

  // The one that matters. `z.url()` alone accepts `javascript:alert(1)` — it is
  // a syntactically valid URL — and this value goes straight into an `href` on
  // the hub and (from Stage 3) into a research prompt. `BrandWebsiteUrlSchema`
  // restricts the scheme, and this is the test that says the restriction is
  // wired to both write paths rather than merely written down.
  it.each([
    ['javascript:alert(1)'],
    ['JavaScript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['ftp://casavostra.com'],
    ['casavostra.com'],
  ])('rejects %s at the wire boundary on create and patch', async (url) => {
    const { app, brandId, workspaceId } = await seedBrand({ id: 'u-1', token: 't-1' })

    const created = await app.request(`/workspaces/${workspaceId}/brands`, {
      method: 'POST',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Hostile', websiteUrl: url }),
    })
    expect(created.status).toBe(400)

    const patched = await app.request(`/brands/${brandId}`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ websiteUrl: url }),
    })
    expect(patched.status).toBe(400)
  })

  it('PATCH /brands/:id accepts a website-only patch and clears on null', async () => {
    const { app, brandId } = await seedBrand({ id: 'u-1', token: 't-1' })

    // A website-only body is the case `UpdateBrandInputSchema`'s `.refine` had
    // to widen for: before Stage 1A it was rejected as "no keys".
    const set = await app.request(`/brands/${brandId}`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ websiteUrl: 'https://casavostra.com' }),
    })
    expect(set.status).toBe(200)
    expect(await set.json()).toMatchObject({ name: 'B', websiteUrl: 'https://casavostra.com' })

    const cleared = await app.request(`/brands/${brandId}`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ websiteUrl: null }),
    })
    expect(await cleared.json()).toMatchObject({ websiteUrl: null })
  })

  // `undefined` means "leave alone" and `null` means "clear". If that collapses
  // anywhere between the wire and the `set()`, every rename silently deletes the
  // brand's website and no other test notices.
  it('PATCH /brands/:id leaves the website alone when the patch omits it', async () => {
    const { app, brandId } = await seedBrand({ id: 'u-1', token: 't-1' })
    await app.request(`/brands/${brandId}`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ websiteUrl: 'https://casavostra.com' }),
    })

    const renamed = await app.request(`/brands/${brandId}`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed' }),
    })
    expect(await renamed.json()).toMatchObject({
      name: 'Renamed',
      websiteUrl: 'https://casavostra.com',
    })
  })

  it('GET /brands/:id and the workspace list both carry the website', async () => {
    const { app, brandId, workspaceId } = await seedBrand({ id: 'u-1', token: 't-1' })
    await app.request(`/brands/${brandId}`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ websiteUrl: 'https://casavostra.com' }),
    })

    const detail = await app.request(`/brands/${brandId}`, {
      headers: { authorization: 'Bearer t-1' },
    })
    expect(await detail.json()).toMatchObject({ websiteUrl: 'https://casavostra.com' })

    // BrandSummary extends BrandSchema, so the grid gets it without a second
    // fetch — but only if the summary projection actually selects the column.
    const list = (await (
      await app.request(`/workspaces/${workspaceId}/brands`, {
        headers: { authorization: 'Bearer t-1' },
      })
    ).json()) as BrandSummary[]
    expect(list.find((b) => b.id === brandId)?.websiteUrl).toBe('https://casavostra.com')
  })

  it('PATCH /brands/:id still rejects an empty body', async () => {
    const { app, brandId } = await seedBrand({ id: 'u-1', token: 't-1' })
    const res = await app.request(`/brands/${brandId}`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it('PATCH /brands/:id forbids a non-owner', async () => {
    const { app, state } = createTestApp({
      users: [
        { id: 'u-1', token: 't-1' },
        { id: 'u-2', token: 't-2' },
      ],
    })
    const brandId = 'br-theirs' as BrandId
    const wsId = 'w-theirs' as WorkspaceId
    state.workspaces.set(wsId, {
      id: wsId,
      name: 'theirs',
      ownerUserId: 'u-2' as UserId,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    state.brands.set(brandId, {
      id: brandId,
      workspaceId: wsId,
      name: 'Theirs',
      description: null,
      websiteUrl: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    const res = await app.request(`/brands/${brandId}`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Stolen' }),
    })
    expect(res.status).toBe(403)
  })
})
