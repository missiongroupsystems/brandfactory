import type {
  AssetKind,
  AssetRole,
  AssetStatus,
  BrandAsset,
  BrandAssetId,
  BrandId,
} from '@brandfactory/shared'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../client'
import { rowToBrandAsset } from '../mappers'
import { brandAssets } from '../schema'

/**
 * Every asset a brand still has, in `kind` then `position` order.
 *
 * **Proposed rows are included.** Filtering by status is the *reader's* job and
 * the readers disagree: `BrandMark` wants active only (`logoAsset` applies that
 * itself), while the hub rail's entire purpose is to show a brand mid-decision.
 * A query that dropped `proposed` would make the rail impossible to write
 * without a second query. Soft-deleted rows are excluded — that is not a
 * disagreement, it is what soft-delete means at the read boundary.
 */
export async function listAssetsByBrand(brandId: BrandId): Promise<BrandAsset[]> {
  const rows = await db
    .select()
    .from(brandAssets)
    .where(and(eq(brandAssets.brandId, brandId), isNull(brandAssets.deletedAt)))
    .orderBy(asc(brandAssets.kind), asc(brandAssets.position))
  return rows.map(rowToBrandAsset)
}

// Insert input mirrors the shared union minus server-generated fields (`id`,
// `createdAt`, `updatedAt`, `deletedAt`) and keeps the union distributive, so
// the per-source required column survives — the same idiom `CreateBlockInput`
// uses. `status` defaults at the DB level.
export type CreateAssetInput = (
  | { source: 'inline'; value: string }
  | { source: 'blob'; blobKey: string }
  | { source: 'link'; url: string }
) & {
  brandId: BrandId
  kind: AssetKind
  label: string
  position: number
  role?: AssetRole
  status?: AssetStatus
  alt?: string | null
  mime?: string | null
  filename?: string | null
  width?: number | null
  height?: number | null
  sizeBytes?: number | null
}

export async function createAsset(input: CreateAssetInput): Promise<BrandAsset> {
  const shared = {
    brandId: input.brandId,
    kind: input.kind,
    source: input.source,
    label: input.label,
    position: input.position,
    role: input.role ?? null,
    ...(input.status !== undefined ? { status: input.status } : {}),
    alt: input.alt ?? null,
    mime: input.mime ?? null,
    filename: input.filename ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    sizeBytes: input.sizeBytes ?? null,
  } as const

  let values: typeof brandAssets.$inferInsert
  switch (input.source) {
    case 'inline':
      values = { ...shared, value: input.value }
      break
    case 'blob':
      values = { ...shared, blobKey: input.blobKey }
      break
    case 'link':
      values = { ...shared, url: input.url }
      break
  }

  const [row] = await db.insert(brandAssets).values(values).returning()
  if (!row) throw new Error('createAsset returned no row')
  return rowToBrandAsset(row)
}

/**
 * Partial patch over the columns a user can actually edit.
 *
 * `source`, `kind` and the three source columns are **not** here: changing
 * where an asset's bytes live is not an edit to that asset, it is a different
 * asset, and allowing it through a patch is the one shape that could walk a row
 * past the CHECK a column at a time. Swap by creating a new row.
 *
 * `undefined` leaves a column alone; `null` clears it — the same patch
 * semantics `updateBrand` carries, and for the same reason.
 */
export type UpdateAssetPatch = Partial<{
  label: string
  position: number
  role: AssetRole
  status: AssetStatus
  alt: string | null
}>

export async function updateAsset(
  brandId: BrandId,
  id: BrandAssetId,
  patch: UpdateAssetPatch,
): Promise<BrandAsset | null> {
  const [row] = await db
    .update(brandAssets)
    .set({
      ...(patch.label !== undefined ? { label: patch.label } : {}),
      ...(patch.position !== undefined ? { position: patch.position } : {}),
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.alt !== undefined ? { alt: patch.alt } : {}),
      updatedAt: sql`now()`,
    })
    // Scoped by brand as well as id: the route resolves access against the
    // brand, so an id from another brand must miss rather than update.
    .where(and(eq(brandAssets.id, id), eq(brandAssets.brandId, brandId)))
    .returning()
  return row ? rowToBrandAsset(row) : null
}

/**
 * Hides an asset. **Its bytes are not swept**, here or by any caller of this
 * function: a soft-deleted asset can come back (`docs/vision.md:51`), and
 * sweeping would make "hidden" mean "destroyed". Blob cleanup happens on the
 * brand cascade, via `listBlobKeysByBrand`, and nowhere else.
 */
export async function softDeleteAsset(
  brandId: BrandId,
  id: BrandAssetId,
): Promise<BrandAsset | null> {
  const [row] = await db
    .update(brandAssets)
    .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(eq(brandAssets.id, id), eq(brandAssets.brandId, brandId)))
    .returning()
  return row ? rowToBrandAsset(row) : null
}

/**
 * Re-position a set of assets atomically, returning the brand's full list.
 * Same shape and same transaction discipline as `reorderSections`: a
 * mid-list failure leaves the brand's ordering intact rather than half-applied.
 */
export async function reorderAssets(
  brandId: BrandId,
  updates: Array<{ id: BrandAssetId; position: number }>,
): Promise<BrandAsset[]> {
  return db.transaction(async (tx) => {
    for (const { id, position } of updates) {
      const result = await tx
        .update(brandAssets)
        .set({ position, updatedAt: sql`now()` })
        .where(and(eq(brandAssets.id, id), eq(brandAssets.brandId, brandId)))
        .returning({ id: brandAssets.id })
      if (result.length === 0) {
        throw new Error(`Asset ${id} not found in brand ${brandId}`)
      }
    }
    const rows = await tx
      .select()
      .from(brandAssets)
      .where(and(eq(brandAssets.brandId, brandId), isNull(brandAssets.deletedAt)))
      .orderBy(asc(brandAssets.kind), asc(brandAssets.position))
    return rows.map(rowToBrandAsset)
  })
}
