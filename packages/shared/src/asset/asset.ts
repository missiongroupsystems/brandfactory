import { z } from 'zod'
import { BrandAssetIdSchema, BrandIdSchema } from '../ids'

// ---------------------------------------------------------------------------
// BrandAsset — three orthogonal axes
// ---------------------------------------------------------------------------
//
// Lifted from `packages/web/src/demo/assetTypes.ts`, which existed to be lifted:
// the 1.8.0 mockup typed its fixtures against a front-end-local mirror of this
// union so that a brand state the fixtures could not express became a schema
// finding before the migration was written. Five findings came back and are
// resolved in `docs/executing/brand-hub-implementation.md`; `sizeBytes` and
// `alt` are here because of two of them.
//
// The axes are deliberately independent:
//
//   kind    what it is       — a colour, an image, a file
//   source  where it lives   — in the row, in our blob store, on somebody else's host
//   status  how settled      — `proposed` is `docs/vision.md:28`'s brand-in-progress
//
// `status` is a column rather than something derived from presence because a
// brand that arrives as a rough idea has floated colours, and "we are thinking
// about this one" is not expressible by a row existing.

/** What the asset is. */
export const AssetKindSchema = z.enum(['color', 'image', 'file'])
export type AssetKind = z.infer<typeof AssetKindSchema>

/** Where the bytes live. Exactly one of `value | blobKey | url` follows from it. */
export const AssetSourceSchema = z.enum(['inline', 'blob', 'link'])
export type AssetSource = z.infer<typeof AssetSourceSchema>

/**
 * What the app may reach for. `null` is the common case — a photo in the
 * library has no role, it is just a photo.
 *
 * **No role is unique**, `'primary'` least of all: a brand mid-decision has two
 * proposed primaries, which is the exact state that prompted this schema. So
 * "the primary colour" is not answerable from `role` alone — `position` is what
 * orders them, and every accessor here resolves a role as *first by position
 * among active*. No singular accessor named `primaryColor` may exist in any
 * layer; a caller that wants one colour takes the head of the list at the call
 * site, where the arbitrariness is visible.
 */
export const AssetRoleSchema = z.enum(['logo', 'mark', 'primary'])
export type AssetRole = z.infer<typeof AssetRoleSchema> | null

/** How settled it is. */
export const AssetStatusSchema = z.enum(['proposed', 'active'])
export type AssetStatus = z.infer<typeof AssetStatusSchema>

/**
 * Somebody else's host — bring-your-own-hosting (`docs/vision.md:94`).
 *
 * Restricted to `http`/`https` for the same reason and by the same rule as
 * `BrandWebsiteUrlSchema`: this value is user-supplied and ends up in a `src`
 * and, in the library, next to affordances that will want an `href`. A bare
 * `z.url()` accepts `javascript:alert(1)` and `data:text/html,…` — both parse
 * as valid URLs — so the restriction lives on the schema, which makes the row,
 * the create body and the patch body restricted by construction rather than by
 * each remembering to be.
 */
export const AssetLinkUrlSchema = z.url({ protocol: /^https?$/ }).max(2048)

const BrandAssetBaseShape = {
  id: BrandAssetIdSchema,
  brandId: BrandIdSchema,
  kind: AssetKindSchema,
  role: AssetRoleSchema.nullable(),
  status: AssetStatusSchema,
  /** "Primary", "Wordmark, dark bg". A caption, not a description — see `alt`. */
  label: z.string().min(1).max(200),
  /** Sparse integer ordering, as `guideline_sections.priority` already is. */
  position: z.number().int(),
  deletedAt: z.iso.datetime().nullable(),
  /**
   * The description, kept separate from `label` because the two diverge the
   * moment a label is "Primary" and the image is a photograph of a dining room.
   * Renderers fall back to `label`, so the common case costs the user nothing.
   */
  alt: z.string().max(1000).nullable().optional(),
  mime: z.string().max(255).nullable().optional(),
  filename: z.string().max(255).nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  /**
   * Bytes on disk, set at upload time from `File.size` — the client already
   * sends it to `POST /blob-urls/upload-url`. A file row that cannot say
   * "6.5 MB" is a worse file row, and backfilling this means re-`HEAD`ing every
   * blob.
   */
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}

/** `kind: 'color'` — the hex/oklch string lives in the row. */
export const InlineBrandAssetSchema = z.object({
  ...BrandAssetBaseShape,
  source: z.literal('inline'),
  value: z.string().min(1).max(255),
})
export type InlineBrandAsset = z.infer<typeof InlineBrandAssetSchema>

/** Ours. Resolved through a signed read URL by `api/queries/blobs.ts`. */
export const BlobBrandAssetSchema = z.object({
  ...BrandAssetBaseShape,
  source: z.literal('blob'),
  blobKey: z.string().min(1),
})
export type BlobBrandAsset = z.infer<typeof BlobBrandAssetSchema>

/** Somebody else's. */
export const LinkBrandAssetSchema = z.object({
  ...BrandAssetBaseShape,
  source: z.literal('link'),
  url: AssetLinkUrlSchema,
})
export type LinkBrandAsset = z.infer<typeof LinkBrandAssetSchema>

/**
 * The exactly-one-of rule, enforced by the union rather than by a comment: an
 * `inline` asset has no `blobKey` to read, a `blob` asset has no `url`. The
 * `brand_assets_source_exactly_one` CHECK backs the same rule in SQL — the
 * belt-and-braces `canvas_blocks` already gets, and worth the duplication here
 * (unlike `brands.website_url`) because this invariant spans three columns and
 * a future writer could plausibly violate it.
 */
export const BrandAssetSchema = z.discriminatedUnion('source', [
  InlineBrandAssetSchema,
  BlobBrandAssetSchema,
  LinkBrandAssetSchema,
])

export type BrandAsset = z.infer<typeof BrandAssetSchema>

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------
//
// `assetUrl` is deliberately **not** here. It takes a blob resolver, which is a
// client concern — the signed read URL it needs expires in five minutes and is
// owned by `useSignedReadUrl`'s refresh. It lives in `packages/web/src/lib`.

export function byPosition(a: BrandAsset, b: BrandAsset): number {
  return a.position - b.position
}

/** The colour value, or `null` for anything that is not an inline colour. */
export function colorValue(asset: BrandAsset): string | null {
  return asset.kind === 'color' && asset.source === 'inline' ? asset.value : null
}

/**
 * Read paths filter on status by default: a `proposed` asset reaches neither
 * the agent nor `BrandMark`. The *rail* deliberately does not use this —
 * showing the proposed ones is its entire job.
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
 * proposed logo is a note to the humans, not the thing the header renders, and
 * the monogram stays the fallback either way. First by `position` among active,
 * which is the resolution rule for every non-unique role.
 */
export function logoAsset(assets: readonly BrandAsset[]): BrandAsset | null {
  return (
    activeAssets(assets)
      .filter((a) => a.kind === 'image' && a.role === 'logo')
      .sort(byPosition)[0] ?? null
  )
}
