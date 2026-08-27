import type {
  AssetKind,
  AssetLibrary,
  AssetRole,
  AssetStatus,
  BrandAsset,
  BrandAssetId,
  BrandId,
} from '@brandfactory/shared'
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
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
  /**
   * **Required, unlike its optional counterpart on the wire.** The route is the
   * only caller and it always resolves a value — `body.library ?? defaultLibraryFor(…)`.
   * Making it optional here would put a second copy of the default rule in the
   * query layer, which is the one thing `defaultLibraryFor`'s doc comment
   * forbids by naming its callers.
   */
  library: AssetLibrary
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
    library: input.library,
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
  /** Move to… — refiling one asset onto another shelf is this key and nothing else. */
  library: AssetLibrary
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
      ...(patch.library !== undefined ? { library: patch.library } : {}),
      updatedAt: sql`now()`,
    })
    // Scoped by brand as well as id: the route resolves access against the
    // brand, so an id from another brand must miss rather than update.
    //
    // `deletedAt IS NULL` since the Stage 1–2 review: a soft-deleted row is
    // absent from every read path, so a patch that lands on one is editing
    // something the caller cannot see and cannot have meant. It now misses and
    // 404s, which is what a client that has drifted out of date should be told.
    // `restoreAsset` is the one writer that deliberately targets a hidden row.
    .where(
      and(eq(brandAssets.id, id), eq(brandAssets.brandId, brandId), isNull(brandAssets.deletedAt)),
    )
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
    // Already-hidden rows miss, so a double delete 404s instead of silently
    // moving `deletedAt` forward — which would quietly extend the window an
    // Undo is measured against.
    .where(
      and(eq(brandAssets.id, id), eq(brandAssets.brandId, brandId), isNull(brandAssets.deletedAt)),
    )
    .returning()
  return row ? rowToBrandAsset(row) : null
}

/**
 * Un-hides an asset. The other half of a soft delete, and the reason the delete
 * route can offer an Undo rather than a confirmation dialog.
 *
 * 1.10.0 shipped delete with neither, and named the gap: *"a misclick is a
 * disappearance. The fix is an Undo, not a dialog."* The row was always
 * recoverable — nothing sweeps its bytes, by design — but no caller could reach
 * it. This is that caller.
 *
 * Deliberately **not** a `status` or a field on `UpdateBrandAssetInput`:
 * `deletedAt` is the one column a patch must not be able to set, or a client
 * could resurrect a row as a side effect of renaming it. Restore is its own
 * verb, and it only matches rows that are actually hidden.
 */
export async function restoreAsset(brandId: BrandId, id: BrandAssetId): Promise<BrandAsset | null> {
  const [row] = await db
    .update(brandAssets)
    .set({ deletedAt: null, updatedAt: sql`now()` })
    .where(
      and(
        eq(brandAssets.id, id),
        eq(brandAssets.brandId, brandId),
        isNotNull(brandAssets.deletedAt),
      ),
    )
    .returning()
  return row ? rowToBrandAsset(row) : null
}

/**
 * Pin or unpin one asset.
 *
 * **Sets both columns together, and derives neither from the other.**
 * `pinned_at` is `null` exactly when `is_pinned` is false — a timestamp that
 * outlived its pin would be a column disagreeing with the one beside it, and a
 * pin with no timestamp would be a shortlist nobody could ever order by *when
 * the team decided*.
 *
 * **`position` is untouched, on purpose.** The pin is a second axis, not a
 * reordering: unpinning has to put a photo back exactly where it was, which it
 * cannot do if pinning moved it. That is the request's own line — *the pin is a
 * separate mark on the photo, not the manual drag order the library already
 * supports*.
 *
 * Scoped by brand and to live rows, exactly as `updateAsset` is: a soft-deleted
 * asset is hidden, and pinning one would put it at the top of a view it is not
 * in.
 */
export async function setAssetPinned(
  brandId: BrandId,
  id: BrandAssetId,
  isPinned: boolean,
): Promise<BrandAsset | null> {
  const [row] = await db
    .update(brandAssets)
    .set({
      isPinned,
      pinnedAt: isPinned ? sql`now()` : null,
      updatedAt: sql`now()`,
    })
    .where(
      and(eq(brandAssets.id, id), eq(brandAssets.brandId, brandId), isNull(brandAssets.deletedAt)),
    )
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
        .where(
          and(
            eq(brandAssets.id, id),
            eq(brandAssets.brandId, brandId),
            isNull(brandAssets.deletedAt),
          ),
        )
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
