import type {
  BrandAssetId,
  BrandId,
  CreateSocialPostInput,
  SocialPost,
  SocialPostId,
  UpdateSocialPostInput,
} from '@brandfactory/shared'
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { db } from '../client'
import { rowToSocialPost } from '../mappers'
import { brandAssets, socialPostAssets, socialPosts } from '../schema'

/**
 * A write named an `assetId` this brand does not (visibly) own — either the id
 * belongs to another brand or its asset is soft-deleted, and the two are
 * deliberately indistinguishable here: both are ids the caller's asset list
 * never showed it. The route converts this to a 400 `ASSET_NOT_IN_BRAND`.
 */
export class AssetNotInBrandError extends Error {
  constructor(assetIds: BrandAssetId[]) {
    super(`Assets not in brand: ${assetIds.join(', ')}`)
    this.name = 'AssetNotInBrandError'
  }
}

// Unlike `db`, the transaction type is not exported by the client module;
// deriving it keeps the helpers callable from inside `db.transaction` only,
// which is where every write-path caller lives.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// The ownership gate on every attachment write. Runs inside the caller's
// transaction so the check and the join-row insert see the same snapshot.
async function assertAssetsInBrand(
  tx: Tx,
  brandId: BrandId,
  assetIds: BrandAssetId[],
): Promise<void> {
  if (assetIds.length === 0) return
  const rows = await tx
    .select({ id: brandAssets.id })
    .from(brandAssets)
    .where(
      and(
        inArray(brandAssets.id, assetIds),
        eq(brandAssets.brandId, brandId),
        isNull(brandAssets.deletedAt),
      ),
    )
  const owned = new Set<string>(rows.map((r) => r.id))
  const missing = assetIds.filter((id) => !owned.has(id))
  if (missing.length > 0) throw new AssetNotInBrandError(missing)
}

// Full replacement of a post's join rows, `position = (i + 1) * 100` — sparse
// ints in array order, the ordering contract the wire's `assetIds` carries.
async function replacePostAssets(
  tx: Tx,
  postId: SocialPostId,
  assetIds: BrandAssetId[],
): Promise<void> {
  await tx.delete(socialPostAssets).where(eq(socialPostAssets.postId, postId))
  if (assetIds.length > 0) {
    await tx.insert(socialPostAssets).values(
      assetIds.map((assetId, i) => ({
        postId,
        assetId,
        position: (i + 1) * 100,
      })),
    )
  }
}

async function assetIdsForPost(dbOrTx: Tx | typeof db, postId: string): Promise<BrandAssetId[]> {
  const joins = await dbOrTx
    .select({ assetId: socialPostAssets.assetId })
    .from(socialPostAssets)
    .where(eq(socialPostAssets.postId, postId))
    .orderBy(asc(socialPostAssets.position))
  return joins.map((j) => j.assetId as BrandAssetId)
}

/**
 * Every post a brand still has, in calendar order: unscheduled first (the
 * tray), then scheduled chronologically, `createdAt` breaking ties — the SQL
 * ordering the shared `bySchedule` helper mirrors. Soft-deleted rows are
 * excluded, which is what soft-delete means at the read boundary.
 *
 * Two queries, grouped in JS — the join rows for all listed posts at once,
 * ordered by `position` within each post. Two selects beat a JSON-agg join
 * for readability at this scale.
 */
export async function listSocialPostsByBrand(brandId: BrandId): Promise<SocialPost[]> {
  const rows = await db
    .select()
    .from(socialPosts)
    .where(and(eq(socialPosts.brandId, brandId), isNull(socialPosts.deletedAt)))
    .orderBy(sql`${socialPosts.scheduledAt} asc nulls first`, asc(socialPosts.createdAt))
  if (rows.length === 0) return []

  const joins = await db
    .select()
    .from(socialPostAssets)
    .where(
      inArray(
        socialPostAssets.postId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(socialPostAssets.postId), asc(socialPostAssets.position))
  const byPost = new Map<string, BrandAssetId[]>()
  for (const join of joins) {
    const list = byPost.get(join.postId) ?? []
    list.push(join.assetId as BrandAssetId)
    byPost.set(join.postId, list)
  }
  return rows.map((row) => rowToSocialPost(row, byPost.get(row.id) ?? []))
}

/**
 * One transaction: the ownership check, the post, the join rows — a bad
 * `assetId` rolls back the lot rather than leaving a post with half its
 * attachments. Omitted keys fall to the column defaults (`body: ''`,
 * `status: 'draft'`, `scheduledAt: null`), which are the documented server
 * defaults of `CreateSocialPostInputSchema`.
 */
export async function createSocialPost(
  brandId: BrandId,
  input: CreateSocialPostInput,
): Promise<SocialPost> {
  const assetIds = input.assetIds ?? []
  return db.transaction(async (tx) => {
    await assertAssetsInBrand(tx, brandId, assetIds)
    const [row] = await tx
      .insert(socialPosts)
      .values({
        brandId,
        platform: input.platform,
        scheduledAt: input.scheduledAt ?? null,
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      })
      .returning()
    if (!row) throw new Error('createSocialPost returned no row')
    if (assetIds.length > 0) {
      await replacePostAssets(tx, row.id as SocialPostId, assetIds)
    }
    return rowToSocialPost(row, assetIds)
  })
}

/**
 * Partial patch, the `updateAsset` semantics: `undefined` leaves a key alone,
 * spread-conditional columns, `updatedAt: now()`, and the write scoped
 * `and(eq(id), eq(brandId), isNull(deletedAt))` so a cross-brand id and a
 * hidden row both miss (route → 404) rather than update.
 *
 * `patch.assetIds !== undefined` is a **full replacement** in the same
 * transaction — add/remove/reorder are one verb, which is what keeps the join
 * table an implementation detail of this module. The ownership check runs
 * before the row update so a bad id rejects the whole patch.
 */
export async function updateSocialPost(
  brandId: BrandId,
  id: SocialPostId,
  patch: UpdateSocialPostInput,
): Promise<SocialPost | null> {
  return db.transaction(async (tx) => {
    if (patch.assetIds !== undefined) {
      await assertAssetsInBrand(tx, brandId, patch.assetIds)
    }
    const [row] = await tx
      .update(socialPosts)
      .set({
        ...(patch.platform !== undefined ? { platform: patch.platform } : {}),
        ...(patch.scheduledAt !== undefined ? { scheduledAt: patch.scheduledAt } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(socialPosts.id, id),
          eq(socialPosts.brandId, brandId),
          isNull(socialPosts.deletedAt),
        ),
      )
      .returning()
    if (!row) return null
    if (patch.assetIds !== undefined) {
      await replacePostAssets(tx, id, patch.assetIds)
      return rowToSocialPost(row, patch.assetIds)
    }
    return rowToSocialPost(row, await assetIdsForPost(tx, id))
  })
}

/**
 * Hides a post. Join rows are untouched — restore brings the attachments back
 * intact. Already-hidden rows miss, so a double delete 404s instead of
 * silently moving `deletedAt` forward under an Undo that is still on screen.
 */
export async function softDeleteSocialPost(
  brandId: BrandId,
  id: SocialPostId,
): Promise<SocialPost | null> {
  const [row] = await db
    .update(socialPosts)
    .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(eq(socialPosts.id, id), eq(socialPosts.brandId, brandId), isNull(socialPosts.deletedAt)),
    )
    .returning()
  if (!row) return null
  return rowToSocialPost(row, await assetIdsForPost(db, id))
}

/**
 * Un-hides a post — the other half of a soft delete, and the reason the
 * delete flow can offer an Undo rather than a confirmation dialog. Only
 * matches rows that are actually hidden, so a replayed Undo is inert.
 * Deliberately not a patch key: `deletedAt` is the one column a patch must
 * not be able to set (`UpdateSocialPostInputSchema` strips it).
 */
export async function restoreSocialPost(
  brandId: BrandId,
  id: SocialPostId,
): Promise<SocialPost | null> {
  const [row] = await db
    .update(socialPosts)
    .set({ deletedAt: null, updatedAt: sql`now()` })
    .where(
      and(
        eq(socialPosts.id, id),
        eq(socialPosts.brandId, brandId),
        isNotNull(socialPosts.deletedAt),
      ),
    )
    .returning()
  if (!row) return null
  return rowToSocialPost(row, await assetIdsForPost(db, id))
}
