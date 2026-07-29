// ---------------------------------------------------------------------------
// A front-end-local mirror of the proposed `BrandAsset` union
// ---------------------------------------------------------------------------
//
// **This file is the schema review.** `docs/plans/brand-assets.md` proposes a
// `brand_assets` table on three orthogonal axes — what it is (`kind`), where it
// lives (`source`), how settled it is (`status`) — and nothing has been built
// against it. Typing the mockup's fixtures here, rather than against a loose
// `Record<string, unknown>`, is what turns "the fixtures render" into evidence:
// a brand state the fixtures cannot express is a finding to fold back into that
// document before its Phase A is written.
//
// It lives under `src/demo/` and it is **deleted** when `@brandfactory/shared`
// gains the real types. It is deliberately not exported from anywhere the
// product imports.
//
// Findings so far are recorded at the bottom of this file, next to the fields
// that produced them.

/** What the asset is. */
export type AssetKind = 'color' | 'image' | 'file'

/** Where the bytes live. Exactly one of `value | blobKey | url` follows from it. */
export type AssetSource = 'inline' | 'blob' | 'link'

/**
 * What the app may reach for. `null` is the common case — a photo in the
 * library has no role, it is just a photo.
 */
export type AssetRole = 'logo' | 'mark' | 'primary' | null

/**
 * How settled it is. `proposed` is the state `docs/vision.md:28` describes —
 * a brand that arrives as a rough idea rather than a finished deck — and it is
 * the whole reason this column exists rather than being derived from presence.
 */
export type AssetStatus = 'proposed' | 'active'

interface BrandAssetBase {
  id: string
  brandId: string
  kind: AssetKind
  role: AssetRole
  status: AssetStatus
  /** "Primary", "Wordmark, dark bg". Doubles as the image alt — see findings. */
  label: string
  /** Sparse integer ordering, as `guideline_sections.priority` already is. */
  position: number
  deletedAt: string | null
  mime?: string | null
  filename?: string | null
  width?: number | null
  height?: number | null
  /** Bytes on disk. Not in the proposal — finding 1. */
  sizeBytes?: number | null
}

/** `kind: 'color'` — the hex/oklch string lives in the row. */
export interface InlineBrandAsset extends BrandAssetBase {
  source: 'inline'
  value: string
}

/** Ours. Signed read URL, refreshed by `api/queries/blobs.ts` in the real pass. */
export interface BlobBrandAsset extends BrandAssetBase {
  source: 'blob'
  blobKey: string
}

/** Somebody else's. Bring-your-own-hosting (`docs/vision.md:94`). */
export interface LinkBrandAsset extends BrandAssetBase {
  source: 'link'
  url: string
}

/**
 * The exactly-one-of rule, enforced by the union rather than by a comment: an
 * `inline` asset has no `blobKey` to read, a `blob` asset has no `url`. The
 * proposal backs the same rule with a CHECK constraint; this is the app-layer
 * half of the belt-and-braces `canvas_blocks` already gets.
 */
export type BrandAsset = InlineBrandAsset | BlobBrandAsset | LinkBrandAsset

/**
 * The one accessor the proposal promises: every asset resolves to a URL and no
 * caller branches on `source`. `resolveBlob` stands in for the signed-read-URL
 * flow the real pass wires to `fetchReadUrl`; the mockup hands it a static path.
 *
 * Returns `null` for a colour, which has no URL and never wanted one — the
 * caller that asks a swatch for a URL has confused two kinds.
 */
export function assetUrl(asset: BrandAsset, resolveBlob: (key: string) => string): string | null {
  switch (asset.source) {
    case 'inline':
      return null
    case 'blob':
      return resolveBlob(asset.blobKey)
    case 'link':
      return asset.url
  }
}

/** The colour value, or `null` for anything that is not an inline colour. */
export function colorValue(asset: BrandAsset): string | null {
  return asset.kind === 'color' && asset.source === 'inline' ? asset.value : null
}

/**
 * Read paths filter on status by default (assets question 7: a `proposed`
 * asset reaches neither the agent nor `BrandMark`). The *rail* deliberately
 * does not use this — showing the proposed ones is its entire job.
 */
export function activeAssets(assets: readonly BrandAsset[]): BrandAsset[] {
  return assets.filter((a) => a.status === 'active' && a.deletedAt === null)
}

/** Assets of one kind, in `position` order, excluding soft-deleted rows. */
export function assetsOfKind(assets: readonly BrandAsset[], kind: AssetKind): BrandAsset[] {
  return assets.filter((a) => a.kind === kind && a.deletedAt === null).sort(byPosition)
}

/**
 * The brand's mark, or `null`. `role: 'logo'` and `status: 'active'` — a
 * proposed logo is a note to the humans, not the thing the header renders
 * (assets question 7), and the monogram stays the fallback either way.
 */
export function logoAsset(assets: readonly BrandAsset[]): BrandAsset | null {
  return (
    activeAssets(assets)
      .filter((a) => a.kind === 'image' && a.role === 'logo')
      .sort(byPosition)[0] ?? null
  )
}

export function byPosition(a: BrandAsset, b: BrandAsset): number {
  return a.position - b.position
}

// ---------------------------------------------------------------------------
// Findings — the output this file exists for
// ---------------------------------------------------------------------------
//
// 1. **`size_bytes` is missing.** The library renders files as rows, and a file
//    row that cannot say "2.4 MB" is a worse file row. `canvas_blocks` does not
//    carry it either, so this is a gap the proposal inherited rather than
//    introduced. Cheap now, awkward to backfill.
//
// 2. **There is no `alt`.** `canvas_blocks` has one (`UpdateCanvasBlockInput`
//    takes `alt`), `brand_assets` does not. `label` is doing the work here
//    ("Wordmark, dark bg" is a serviceable alt) and that may be the right
//    answer — but it should be a decision, because the two fields diverge the
//    moment a label is "Primary" and the image is a photograph of a dining room.
//
// 3. **`role: 'primary'` is not unique, and the schema implies it is.** The
//    `palette-proposed` fixture has *two* proposed primaries, which is the exact
//    state that prompted this pass. So "the primary colour" is not answerable
//    from `role` alone; `position` is what actually orders them. Either the role
//    is documented as non-unique or the reader that wants one colour is wrong.
//
// 4. **Cardinality wants grouping at the top end** (assets question 6). Twelve
//    colours in one flat `position` list is legible as a ramp only because they
//    happen to be sorted; the `palette-full` fixture is the screenshot that
//    argues for or against a nullable `collection` column.
