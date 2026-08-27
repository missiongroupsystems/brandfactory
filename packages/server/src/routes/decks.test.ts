import type { DeckVersion } from '@brandfactory/shared'
import { describe, expect, it } from 'vitest'
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

interface DeckWithVersions {
  id: string
  brandId: string
  name: string
  versions: DeckVersion[]
  current: DeckVersion | null
}

const PDF_V1 = {
  source: 'pdf' as const,
  label: 'v1 — first draft',
  versionDate: '2026-01-01',
  author: 'In-house',
  pdfBlobKey: 'blobs/deck-v1.pdf',
  canvaUrl: null,
}

const CANVA_V2 = {
  source: 'canva' as const,
  label: 'v2 — client review',
  versionDate: '2026-02-01',
  author: 'Acme Agency',
  canvaUrl: 'https://canva.com/design/xyz',
  pdfBlobKey: 'blobs/deck-v2-snapshot.pdf',
}

async function createDeck(app: TestHarness['app'], brandId: string, name = 'Media Kit') {
  const res = await app.request(`/brands/${brandId}/decks`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ name }),
  })
  return { res, deck: (await res.json()) as DeckWithVersions }
}

async function postVersion(
  app: TestHarness['app'],
  brandId: string,
  deckId: string,
  body: unknown,
) {
  return app.request(`/brands/${brandId}/decks/${deckId}/versions`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify(body),
  })
}

async function listDecks(app: TestHarness['app'], brandId: string) {
  const res = await app.request(`/brands/${brandId}/decks`, { headers: auth() })
  return (await res.json()) as DeckWithVersions[]
}

describe('GET /brands/:id/decks', () => {
  it('returns an empty array for a brand with no decks', async () => {
    const { app, brandId } = await seedBrand()
    expect(await listDecks(app, brandId)).toEqual([])
  })

  // The empty stack itself — a deck the brand has but no version has been
  // recorded for yet. Not an error, and `current` says so without the caller
  // having to infer it from an empty array.
  it('lists a deck with no versions as versions: [] and current: null', async () => {
    const { app, brandId } = await seedBrand()
    await createDeck(app, brandId, 'Media Kit')
    const [deck] = await listDecks(app, brandId)
    expect(deck).toMatchObject({ name: 'Media Kit', versions: [], current: null })
  })

  it('embeds the current version per deck, resolved server-side', async () => {
    const { app, brandId } = await seedBrand()
    const { deck } = await createDeck(app, brandId, 'Pitch Deck')
    await postVersion(app, brandId, deck.id, PDF_V1)
    await postVersion(app, brandId, deck.id, CANVA_V2)

    const [row] = await listDecks(app, brandId)
    expect(row?.versions).toHaveLength(2)
    // Newest-typed first — `byVersionRecency`'s order.
    expect(row?.versions.map((v) => v.source)).toEqual(['canva', 'pdf'])
    expect(row?.current?.source).toBe('canva')
    expect(row?.current?.label).toBe(CANVA_V2.label)
  })

  it('401s without a token', async () => {
    const { app, brandId } = await seedBrand()
    const res = await app.request(`/brands/${brandId}/decks`)
    expect(res.status).toBe(401)
  })

  it('404s for a brand the caller cannot reach', async () => {
    const { app } = await seedBrand()
    const res = await app.request('/brands/b-nope/decks', { headers: auth() })
    expect(res.status).toBe(404)
  })

  it('does not leak another brand’s decks', async () => {
    const { app, workspaceId, brandId } = await seedBrand()
    const other = (await (
      await app.request(`/workspaces/${workspaceId}/brands`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'Other' }),
      })
    ).json()) as { id: string }
    await createDeck(app, brandId, 'Media Kit')
    expect(await listDecks(app, other.id)).toHaveLength(0)
  })
})

describe('POST /brands/:id/decks', () => {
  it('creates one and returns it with an empty stack', async () => {
    const { app, brandId } = await seedBrand()
    const { res, deck } = await createDeck(app, brandId, 'Media Kit')
    expect(res.status).toBe(201)
    expect(deck).toMatchObject({ brandId, name: 'Media Kit', versions: [], current: null })
    expect(deck.id).toBeTruthy()
  })

  it('400s on an empty name', async () => {
    const { app, brandId } = await seedBrand()
    const { res } = await createDeck(app, brandId, '')
    expect(res.status).toBe(400)
  })

  it('404s for a brand that does not exist, before validating the body', async () => {
    const { app } = await seedBrand()
    const { res } = await createDeck(app, 'b-nope', 'Media Kit')
    expect(res.status).toBe(404)
  })
})

describe('POST /brands/:id/decks/:deckId/versions', () => {
  it('adds a version and returns the deck’s full stack, current included', async () => {
    const { app, brandId } = await seedBrand()
    const { deck } = await createDeck(app, brandId)
    const res = await postVersion(app, brandId, deck.id, PDF_V1)
    expect(res.status).toBe(201)
    const row = (await res.json()) as DeckWithVersions
    expect(row.versions).toHaveLength(1)
    expect(row.current).toMatchObject({ source: 'pdf', label: PDF_V1.label })
  })

  // The case named twice in the plan: a new version supersedes the last
  // without deleting it.
  it('supersedes the last version without deleting it', async () => {
    const { app, brandId } = await seedBrand()
    const { deck } = await createDeck(app, brandId)
    await postVersion(app, brandId, deck.id, PDF_V1)
    const res = await postVersion(app, brandId, deck.id, CANVA_V2)
    const row = (await res.json()) as DeckWithVersions

    expect(row.versions).toHaveLength(2)
    expect(row.versions.map((v) => v.label).sort()).toEqual([CANVA_V2.label, PDF_V1.label].sort())
    // The new version is current because it is the more recent `versionDate`
    // — not because it was the one just added.
    expect(row.current?.label).toBe(CANVA_V2.label)
  })

  // A backdated version does not become current just by being the one just
  // added — `currentVersion` orders by `versionDate`, not by insertion.
  it('does not make a backdated version current', async () => {
    const { app, brandId } = await seedBrand()
    const { deck } = await createDeck(app, brandId)
    await postVersion(app, brandId, deck.id, CANVA_V2)
    const res = await postVersion(app, brandId, deck.id, PDF_V1)
    const row = (await res.json()) as DeckWithVersions

    expect(row.versions).toHaveLength(2)
    expect(row.current?.label).toBe(CANVA_V2.label)
  })

  it('400s on a canva body with no pdf snapshot', async () => {
    const { app, brandId } = await seedBrand()
    const { deck } = await createDeck(app, brandId)
    const res = await postVersion(app, brandId, deck.id, { ...CANVA_V2, pdfBlobKey: null })
    expect(res.status).toBe(400)
  })

  it('400s on a pdf body with no key', async () => {
    const { app, brandId } = await seedBrand()
    const { deck } = await createDeck(app, brandId)
    const res = await postVersion(app, brandId, deck.id, { ...PDF_V1, pdfBlobKey: null })
    expect(res.status).toBe(400)
  })

  it('404s for a deck id that does not exist', async () => {
    const { app, brandId } = await seedBrand()
    const res = await postVersion(app, brandId, 'deck-nope', PDF_V1)
    expect(res.status).toBe(404)
  })

  // The case named explicitly in the plan: a deck id that is real, but
  // belongs to another brand, 404s rather than accepting a version onto it.
  it('404s on a deck belonging to another brand', async () => {
    const { app, workspaceId, brandId } = await seedBrand()
    const other = (await (
      await app.request(`/workspaces/${workspaceId}/brands`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'Other' }),
      })
    ).json()) as { id: string }
    const { deck } = await createDeck(app, brandId)

    const res = await postVersion(app, other.id, deck.id, PDF_V1)
    expect(res.status).toBe(404)
    // Untouched — no version landed on the deck through the foreign brand.
    const [row] = await listDecks(app, brandId)
    expect(row?.versions).toHaveLength(0)
  })
})

describe('DELETE /brands/:id/decks/:deckId', () => {
  it('deletes and returns the row', async () => {
    const { app, brandId, state } = await seedBrand()
    const { deck } = await createDeck(app, brandId)
    const res = await app.request(`/brands/${brandId}/decks/${deck.id}`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: deck.id, name: deck.name })
    expect(state.decks.has(deck.id)).toBe(false)
  })

  it('takes its versions with it', async () => {
    const { app, brandId, state } = await seedBrand()
    const { deck } = await createDeck(app, brandId)
    await postVersion(app, brandId, deck.id, PDF_V1)
    expect([...state.deckVersions.values()].some((v) => v.deckId === deck.id)).toBe(true)

    await app.request(`/brands/${brandId}/decks/${deck.id}`, { method: 'DELETE', headers: auth() })

    expect([...state.deckVersions.values()].some((v) => v.deckId === deck.id)).toBe(false)
  })

  it('404s on a second delete', async () => {
    const { app, brandId } = await seedBrand()
    const { deck } = await createDeck(app, brandId)
    const del = () =>
      app.request(`/brands/${brandId}/decks/${deck.id}`, { method: 'DELETE', headers: auth() })
    expect((await del()).status).toBe(200)
    expect((await del()).status).toBe(404)
  })

  it('404s on a delete aimed at another brand’s deck', async () => {
    const { app, workspaceId, brandId } = await seedBrand()
    const other = (await (
      await app.request(`/workspaces/${workspaceId}/brands`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'Other' }),
      })
    ).json()) as { id: string }
    const { deck } = await createDeck(app, brandId)

    const res = await app.request(`/brands/${other.id}/decks/${deck.id}`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect(res.status).toBe(404)
    expect(await listDecks(app, brandId)).toHaveLength(1)
  })

  it('404s for a brand that does not exist', async () => {
    const { app } = await seedBrand()
    const res = await app.request('/brands/b-nope/decks/deck-1', {
      method: 'DELETE',
      headers: auth(),
    })
    expect(res.status).toBe(404)
  })
})
