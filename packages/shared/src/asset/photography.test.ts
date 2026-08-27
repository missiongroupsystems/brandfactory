import { describe, expect, it } from 'vitest'
import type { BrandAsset } from './asset'
import { assetsOfKind, byPosition, logoAsset } from './asset'
import { byPinnedThenPosition, photographyInReadingOrder } from './photography'

function makeAsset(overrides: Partial<Record<keyof BrandAsset, unknown>> = {}): BrandAsset {
  return {
    id: 'a1',
    brandId: 'b1',
    kind: 'image',
    source: 'blob',
    blobKey: 'blobs/one.jpg',
    role: null,
    status: 'active',
    library: 'photography',
    label: 'A photo',
    position: 100,
    isPinned: false,
    pinnedAt: null,
    deletedAt: null,
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  } as BrandAsset
}

describe('byPinnedThenPosition', () => {
  it('puts pinned photos first', () => {
    const pinned = makeAsset({ id: 'p', position: 900, isPinned: true })
    const plain = makeAsset({ id: 'q', position: 100 })
    expect([plain, pinned].sort(byPinnedThenPosition).map((a) => a.id)).toEqual(['p', 'q'])
  })

  it('keeps the drag order inside each half', () => {
    // The pin and the manual order are separate axes: unpinning must put a photo
    // back where it was, not at the end.
    const list = [
      makeAsset({ id: 'a', position: 300, isPinned: true }),
      makeAsset({ id: 'b', position: 100, isPinned: true }),
      makeAsset({ id: 'c', position: 400 }),
      makeAsset({ id: 'd', position: 200 }),
    ]
    expect(list.sort(byPinnedThenPosition).map((a) => a.id)).toEqual(['b', 'a', 'd', 'c'])
  })
})

describe('the guard on byPosition', () => {
  it('does not change which image is the brand logo', () => {
    // **The test this phase exists around.** `byPosition` has three callers and
    // `logoAsset` is one of them; its docstring fixes the rule as "First by
    // `position` among active, which is the resolution rule for every non-unique
    // role". A pin-aware `byPosition` would silently rewrite that on any brand
    // where somebody pinned a photograph.
    const pinnedLater = makeAsset({
      id: 'pinned',
      kind: 'image',
      role: 'logo',
      library: 'identity',
      position: 900,
      isPinned: true,
    })
    const firstByPosition = makeAsset({
      id: 'first',
      kind: 'image',
      role: 'logo',
      library: 'identity',
      position: 100,
    })
    expect(logoAsset([pinnedLater, firstByPosition])?.id).toBe('first')
  })

  it('leaves every other shelf ordered by position alone', () => {
    const pinned = makeAsset({
      id: 'p',
      kind: 'file',
      library: 'collateral',
      position: 900,
      isPinned: true,
    })
    const plain = makeAsset({ id: 'q', kind: 'file', library: 'collateral', position: 100 })
    expect(assetsOfKind([pinned, plain], 'file').map((a) => a.id)).toEqual(['q', 'p'])
  })

  it('is a different function from byPosition', () => {
    // Cheap, and it fails the day somebody "simplifies" one into the other.
    const pinned = makeAsset({ id: 'p', position: 900, isPinned: true })
    const plain = makeAsset({ id: 'q', position: 100 })
    expect(byPosition(pinned, plain)).toBeGreaterThan(0)
    expect(byPinnedThenPosition(pinned, plain)).toBeLessThan(0)
  })
})

describe('photographyInReadingOrder', () => {
  it('takes only the photography shelf', () => {
    const photo = makeAsset({ id: 'photo', library: 'photography' })
    const logo = makeAsset({ id: 'logo', library: 'identity' })
    expect(photographyInReadingOrder([photo, logo]).map((a) => a.id)).toEqual(['photo'])
  })

  it('drops soft-deleted photos and keeps proposed ones', () => {
    // Inherited from `assetsOfLibrary` rather than restated: a hidden photo is
    // out, and a `proposed` one is still filed somewhere.
    const hidden = makeAsset({ id: 'hidden', deletedAt: '2026-08-01T00:00:00.000Z' })
    const proposed = makeAsset({ id: 'proposed', status: 'proposed' })
    expect(photographyInReadingOrder([hidden, proposed]).map((a) => a.id)).toEqual(['proposed'])
  })

  it('puts the pinned ones at the top of the shelf', () => {
    const list = [
      makeAsset({ id: 'a', position: 100 }),
      makeAsset({ id: 'b', position: 200, isPinned: true }),
    ]
    expect(photographyInReadingOrder(list).map((a) => a.id)).toEqual(['b', 'a'])
  })
})
