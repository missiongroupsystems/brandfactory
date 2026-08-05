import { describe, expect, it } from 'vitest'
import { AssetLibrarySchema, type ProjectSummary } from '@brandfactory/shared'
import {
  BRAND_CONTEXT_TEMPLATE_ID,
  LIBRARY_APPS,
  MINI_APPS,
  TILE_APPS,
  isOrphanThread,
  miniAppById,
  shelfName,
} from './miniApps'

function base(id: string) {
  return {
    id: id as ProjectSummary['id'],
    brandId: 'b-1' as ProjectSummary['brandId'],
    name: id,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    brandName: 'Acme',
    lastActivityAt: '2026-07-24T00:00:00.000Z',
  }
}

function freeform(id: string): ProjectSummary {
  return { ...base(id), kind: 'freeform' }
}

function standardized(id: string, templateId: string): ProjectSummary {
  return { ...base(id), kind: 'standardized', templateId }
}

// A brand's threads as the hub sees them: two copywriting, one visual, one
// brand-context conversation, two freeform, and one standardized thread under a
// template no mini-app claims. The brand-context row is in the fixture (not
// merely asserted in isolation) so every partition / orphan invariant below
// covers a hidden-surface thread too.
const MIXED: ProjectSummary[] = [
  standardized('p-copy-1', 'copywriting'),
  standardized('p-copy-2', 'copywriting'),
  standardized('p-visual-1', 'visual'),
  standardized('p-context-1', BRAND_CONTEXT_TEMPLATE_ID),
  standardized('p-orphan', 'not-a-registered-template'),
  freeform('p-free-1'),
  freeform('p-free-2'),
]

function app(id: string) {
  const found = miniAppById(id)
  if (!found) throw new Error(`no mini-app ${id}`)
  return found
}

describe('miniAppById', () => {
  it('resolves every registered id', () => {
    for (const entry of MINI_APPS) {
      expect(miniAppById(entry.id)).toBe(entry)
    }
  })

  it('returns undefined for an unknown id', () => {
    expect(miniAppById('nope')).toBeUndefined()
  })
})

describe('match predicates', () => {
  it('copywriting claims only standardized/copywriting threads', () => {
    expect(MIXED.filter(app('copywriting').match).map((p) => p.id)).toEqual([
      'p-copy-1',
      'p-copy-2',
    ])
  })

  it('freeform claims only freeform threads', () => {
    expect(MIXED.filter(app('freeform').match).map((p) => p.id)).toEqual(['p-free-1', 'p-free-2'])
  })

  it('visual claims only its own template, not every standardized thread', () => {
    expect(MIXED.filter(app('visual').match).map((p) => p.id)).toEqual(['p-visual-1'])
  })

  it('social claims nothing when no thread carries its template', () => {
    expect(MIXED.filter(app('social').match)).toEqual([])
  })

  it('context claims only standardized/brand-context threads', () => {
    expect(MIXED.filter(app('context').match).map((p) => p.id)).toEqual(['p-context-1'])
  })

  it('a freeform thread never matches a standardized mini-app', () => {
    const solo = [freeform('p-1')]
    for (const entry of MINI_APPS) {
      if (entry.create.kind === 'standardized') {
        expect(solo.filter(entry.match)).toEqual([])
      }
    }
  })

  it('leaves a thread under an unregistered template unclaimed', () => {
    const claimed = MINI_APPS.flatMap((entry) => MIXED.filter(entry.match).map((p) => p.id))
    expect(claimed).not.toContain('p-orphan')
  })

  it('partitions every claimed thread into exactly one mini-app', () => {
    for (const project of MIXED) {
      const owners = MINI_APPS.filter((entry) => entry.match(project))
      expect(owners.length).toBeLessThanOrEqual(1)
    }
  })
})

describe('isOrphanThread', () => {
  it('flags a thread whose template no mini-app claims', () => {
    expect(MIXED.filter(isOrphanThread).map((p) => p.id)).toEqual(['p-orphan'])
  })

  it('never flags a thread a mini-app already owns', () => {
    for (const project of MIXED) {
      const owned = MINI_APPS.some((entry) => entry.match(project))
      expect(isOrphanThread(project)).toBe(!owned)
    }
  })
})

// The two halves of the classification/display split, kept in one place because
// they are the pair most likely to drift: a non-tile row must still classify its
// threads (so they are never "Other threads") while never reaching the hub grid
// or an /apps/ page.
describe('surface split', () => {
  // **Four, and the 2×2 the hub grid's own comment describes.** `visual` left
  // when the shelves landed: the grid is headed *Start something* and every card
  // in it produces something new, which a library does not.
  it('keeps the non-tile rows out of TILE_APPS', () => {
    expect(TILE_APPS.map((entry) => entry.id)).toEqual([
      'copywriting',
      'studio',
      'social',
      'freeform',
    ])
    for (const id of ['context', 'visual', 'photography', 'collateral']) {
      expect(MINI_APPS.map((entry) => entry.id)).toContain(id)
    }
  })

  it('does not orphan a brand-context thread despite it having no tile', () => {
    const conversation = standardized('p-context-2', BRAND_CONTEXT_TEMPLATE_ID)
    expect(isOrphanThread(conversation)).toBe(false)
    expect(TILE_APPS.some((entry) => entry.match(conversation))).toBe(false)
  })

  // 1.4.0 shipped four `Soon` tiles; the calendar was the last of them. A row
  // may only flip when there is a surface behind it, so this asserts the pair
  // that makes the flip true rather than the flag alone: `enabled` opens the
  // tile, and `unit: 'post'` is what routes it to the calendar and counts it
  // in posts instead of in threads it does not have.
  it('has the social calendar live, counted as posts', () => {
    const social = app('social')
    expect(social.enabled).toBe(true)
    expect(social.unit).toBe('post')
  })

  it('carries no not-yet-live tile app at all', () => {
    expect(TILE_APPS.filter((entry) => !entry.enabled)).toEqual([])
  })

  it('declares a surface on every row', () => {
    for (const entry of MINI_APPS) {
      expect(['tile', 'library', 'brand']).toContain(entry.surface)
    }
  })

  it('derives TILE_APPS from MINI_APPS rather than duplicating rows', () => {
    for (const entry of TILE_APPS) {
      expect(MINI_APPS).toContain(entry)
    }
  })

  // Same derived-view discipline, and the same reason: a shelf that appeared in
  // the nav without being in the registry would be presented without being
  // classified.
  it('derives LIBRARY_APPS from MINI_APPS, in registry order', () => {
    expect(LIBRARY_APPS.map((entry) => entry.id)).toEqual(['visual', 'photography', 'collateral'])
    for (const entry of LIBRARY_APPS) {
      expect(MINI_APPS).toContain(entry)
    }
  })

  /**
   * **The row id and the shelf are different strings, and one of them matters.**
   * `visual` is the `identity` shelf: renaming the row would make
   * `miniAppById('visual')` miss, and that lookup is what turns
   * `/brands/:id/apps/visual` — live since 1.10.0 — into a redirect rather than
   * the *Unknown mini-app* page. Two of three happen to match; nothing derives
   * one from the other.
   */
  it('names each shelf explicitly, and visual is identity', () => {
    expect(LIBRARY_APPS.map((entry) => entry.library)).toEqual([
      'identity',
      'photography',
      'collateral',
    ])
    expect(miniAppById('visual')?.library).toBe('identity')
  })

  // Every non-tile row has somewhere to be. This is what `/apps/$appId`'s
  // `beforeLoad` redirects to, and the type requires it — the test is here so
  // the *paths* are asserted, not merely their presence.
  it('gives every non-tile row a typed destination', () => {
    const destinations = MINI_APPS.filter((entry) => entry.surface !== 'tile').map((entry) =>
      entry.to?.('b-1'),
    )
    expect(destinations).toEqual([
      { to: '/brands/$brandId/identity', params: { brandId: 'b-1' } },
      { to: '/brands/$brandId/photography', params: { brandId: 'b-1' } },
      { to: '/brands/$brandId/collateral', params: { brandId: 'b-1' } },
      { to: '/brands/$brandId/context', params: { brandId: 'b-1' } },
    ])
    // And no tile row has one: a tile lives at `/apps/$id` and nowhere else.
    for (const entry of TILE_APPS) expect(entry.to).toBeUndefined()
  })

  // The two new rows classify nothing, unlike `visual`, which keeps a real
  // `templateId` because a 1.4.0-era thread may exist under it. These ids have
  // never existed, so a `match` that could fire would be claiming otherwise.
  it('claims no threads for the two shelves that never had any', () => {
    for (const id of ['photography', 'collateral']) {
      expect(MIXED.filter(app(id).match)).toEqual([])
    }
  })
})

describe('thread-count derivation', () => {
  it('counts each mini-app tile from one mixed thread list', () => {
    const counts = Object.fromEntries(
      MINI_APPS.map((entry) => [entry.id, MIXED.filter(entry.match).length]),
    )
    expect(counts).toEqual({
      copywriting: 2,
      visual: 1,
      studio: 0,
      social: 0,
      freeform: 2,
      photography: 0,
      collateral: 0,
      context: 1,
    })
  })

  it('counts zero for every mini-app on a brand with no threads', () => {
    for (const entry of MINI_APPS) {
      expect([].filter(entry.match).length).toBe(0)
    }
  })
})

/**
 * The name of a shelf is said on five surfaces — the nav row, the page heading,
 * the loading frame, each `Move to …` item, and the toast one of them raises —
 * and `shelfName` is the single place all five read it from.
 *
 * These two cases are what make the fallback in it unreachable rather than
 * merely unlikely, which is the claim its doc comment makes.
 */
describe('shelfName', () => {
  it('covers every shelf, so the fallback is unreachable', () => {
    for (const library of AssetLibrarySchema.options) {
      const row = LIBRARY_APPS.find((app) => app.library === library)
      expect(row, `no registry row for the ${library} shelf`).toBeDefined()
      expect(shelfName(library)).toBe(row?.title)
    }
  })

  it('is the name the nav row renders, not a second spelling of it', () => {
    expect(LIBRARY_APPS.map((app) => shelfName(app.library))).toEqual(
      LIBRARY_APPS.map((app) => app.title),
    )
  })
})
