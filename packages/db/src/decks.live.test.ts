import { DeckVersionSchema } from '@brandfactory/shared'
import type { BrandId, UserId, WorkspaceId } from '@brandfactory/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from './client'
import { createBrand, deleteBrand } from './queries/brands'
import {
  createDeck,
  createDeckVersion,
  deleteDeck,
  listDecksByBrand,
  listVersionsByDeck,
} from './queries/decks'
import { createWorkspace, deleteWorkspace } from './queries/workspaces'
import { seed } from './seed'

// Live-DB test — only runs when DATABASE_URL is set, matching the other
// `*.live.test.ts` files, and its own file for the same reason as theirs: it
// owns the `pg` pool for its worker and ends it in `afterAll`.
//
// What is only provable against real Postgres here: the `deck_versions_source_shape`
// CHECK (a constraint nobody has watched fire is a constraint that may not
// exist — decision 3 made the Canva snapshot required, and that is the arm
// most worth proving), and both cascades — a deck's versions going with the
// deck, and a brand's decks going with the brand.
const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)('decks (live DB)', () => {
  let workspaceId: WorkspaceId
  let brandId: BrandId

  beforeAll(async () => {
    const ids = await seed()
    const scratch = await createWorkspace({
      name: 'Decks round-trip scratch workspace',
      ownerUserId: ids.userId as UserId,
    })
    workspaceId = scratch.id
    const brand = await createBrand({ workspaceId, name: 'Decks Scratch Brand' })
    brandId = brand.id
  })

  afterAll(async () => {
    // Cascades every brand (and every deck and version on it) written below.
    await deleteWorkspace(workspaceId)
    await pool.end()
  })

  it('round-trips a deck with a pdf version and a canva version, each parsing as the shared schema', async () => {
    const deck = await createDeck(brandId, 'Round Trip Deck')
    await createDeckVersion(deck.id, {
      source: 'pdf',
      label: 'v1 — first draft',
      versionDate: '2026-01-01',
      author: 'In-house',
      pdfBlobKey: 'blobs/deck-v1.pdf',
    })
    await createDeckVersion(deck.id, {
      source: 'canva',
      label: 'v2 — client review',
      versionDate: '2026-02-01',
      author: 'Acme Agency',
      canvaUrl: 'https://canva.com/design/xyz',
      pdfBlobKey: 'blobs/deck-v2-snapshot.pdf',
    })

    const versions = await listVersionsByDeck(deck.id)
    expect(versions).toHaveLength(2)
    for (const version of versions) {
      // The mapper's output is the wire shape. Parsing it here is what proves
      // the ISO-timestamp normalisation and the branded ids survive the trip.
      expect(DeckVersionSchema.safeParse(version).success).toBe(true)
    }
    // Newest-typed first.
    expect(versions.map((v) => v.source)).toEqual(['canva', 'pdf'])
  })

  it('lists a brand in directory order', async () => {
    const scratchBrand = await createBrand({ workspaceId, name: 'Listing Scratch Brand' })
    await createDeck(scratchBrand.id, 'Zephyr Pitch')
    await createDeck(scratchBrand.id, 'Annual Report')
    await createDeck(scratchBrand.id, 'Media Kit')

    const rows = await listDecksByBrand(scratchBrand.id)
    expect(rows.map((r) => r.name)).toEqual(['Annual Report', 'Media Kit', 'Zephyr Pitch'])
  })

  // The constraint's whole job — decision 3 settled in `deck_versions.ts`'s
  // second arm, exercised against the real database rather than assumed.
  // Bypasses `createDeckVersion` entirely: a raw insert, like
  // `brand_assets_source_exactly_one`'s live test, so the CHECK is what is
  // under test and not the query layer's own validation.
  it.each([
    [
      'canva with no snapshot',
      { source: 'canva', canvaUrl: 'https://canva.com/design/abc', pdfBlobKey: null },
    ],
    ['canva with no url', { source: 'canva', canvaUrl: null, pdfBlobKey: 'blobs/deck.pdf' }],
    ['pdf with no key', { source: 'pdf', canvaUrl: null, pdfBlobKey: null }],
    [
      'pdf carrying a canva url',
      {
        source: 'pdf',
        canvaUrl: 'https://canva.com/design/abc',
        pdfBlobKey: 'blobs/deck.pdf',
      },
    ],
  ])('deck_versions_source_shape rejects %s', async (_name, columns) => {
    const deck = await createDeck(brandId, 'Violating Row Deck')
    await expect(
      pool.query(
        `insert into deck_versions (deck_id, source, label, version_date, author, pdf_blob_key, canva_url)
         values ($1, $2, 'violating row', '2026-01-01', 'Agency', $3, $4)`,
        [deck.id, columns.source, columns.pdfBlobKey, columns.canvaUrl],
      ),
    ).rejects.toThrow(/deck_versions_source_shape/)
  })

  it("takes a deck's versions with the deck", async () => {
    const deck = await createDeck(brandId, 'Doomed Deck')
    await createDeckVersion(deck.id, {
      source: 'pdf',
      label: 'v1',
      versionDate: '2026-01-01',
      author: 'Agency',
      pdfBlobKey: 'blobs/deck-v1.pdf',
    })
    expect(await listVersionsByDeck(deck.id)).toHaveLength(1)

    // The FK is the thing under test, not the query helper: without
    // `onDelete: 'cascade'` this delete raises a foreign key violation
    // instead of succeeding, because a version row still references the deck.
    await deleteDeck(brandId, deck.id)

    expect(await listVersionsByDeck(deck.id)).toHaveLength(0)
  })

  it("takes a brand's decks — and their versions — with the brand", async () => {
    const doomed = await createBrand({ workspaceId, name: 'Doomed Deck Brand' })
    const deck = await createDeck(doomed.id, 'Deck On A Doomed Brand')
    await createDeckVersion(deck.id, {
      source: 'canva',
      label: 'v1',
      versionDate: '2026-01-01',
      author: 'Agency',
      canvaUrl: 'https://canva.com/design/xyz',
      pdfBlobKey: 'blobs/deck-snapshot.pdf',
    })
    expect(await listDecksByBrand(doomed.id)).toHaveLength(1)

    // The FK is the thing under test: without `onDelete: 'cascade'` on
    // `decks.brand_id` this raises a foreign key violation instead of
    // succeeding, because a deck row still references the brand.
    await deleteBrand(doomed.id)

    expect(await listDecksByBrand(doomed.id)).toHaveLength(0)
    expect(await listVersionsByDeck(deck.id)).toHaveLength(0)
  })

  it('misses a delete aimed at another brand, rather than deleting across it', async () => {
    const foreignBrand = await createBrand({ workspaceId, name: 'Foreign Brand' })
    const deck = await createDeck(brandId, 'Not Yours')

    expect(await deleteDeck(foreignBrand.id, deck.id)).toBeNull()

    // Untouched by the cross-brand attempt.
    const stillThere = await listDecksByBrand(brandId)
    expect(stillThere.find((d) => d.id === deck.id)?.name).toBe('Not Yours')
  })
})
