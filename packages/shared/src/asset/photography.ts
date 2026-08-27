import { byPosition, type BrandAsset } from './asset'
import { assetsOfLibrary } from './library'

// Imports run `photography.ts → library.ts → asset.ts`, one direction only.
// `library.ts`'s own note explains why that matters: a cycle here fails as a
// `ReferenceError` decided by whichever module an importer happens to reach
// first.

// ---------------------------------------------------------------------------
// The photography shelf's own order — pinned first, then position
// ---------------------------------------------------------------------------
//
// **This is a new comparator and deliberately not a change to `byPosition`.**
// That function has three callers — `assetsOfKind`, `assetsOfLibrary` and
// `logoAsset` — and the third is the one that makes the difference matter.
// `logoAsset`'s docstring fixes the resolution rule for the whole schema:
//
//   > First by `position` among active, which is the resolution rule for every
//   > non-unique role.
//
// Teach `byPosition` about the pin and that rule quietly changes: on any brand
// where somebody pinned a photograph, *which image is the brand's logo* is
// decided by a mark made in a photo grid. The pin belongs to one shelf, so the
// comparator does too.

/**
 * Pinned first, then `position` ascending.
 *
 * `position` still orders **within** each half, which is what keeps the pin and
 * the drag order independent: unpinning a photo puts it back exactly where it
 * was rather than dropping it at the end. The request draws that line itself —
 * *"the pin is a separate mark on the photo, not the manual drag order the
 * library already supports"*.
 */
export function byPinnedThenPosition(a: BrandAsset, b: BrandAsset): number {
  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
  return byPosition(a, b)
}

/**
 * The photography shelf in reading order: pinned first, then as dragged.
 *
 * Built on `assetsOfLibrary` rather than repeating its filter, so the rules
 * about `deletedAt` and `status` stay in one place — a soft-deleted photo is
 * out, and a `proposed` one is still filed somewhere and stays in.
 */
export function photographyInReadingOrder(assets: readonly BrandAsset[]): BrandAsset[] {
  return assetsOfLibrary(assets, 'photography').sort(byPinnedThenPosition)
}
