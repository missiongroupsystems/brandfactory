import type {
  BrandId,
  BrandResource,
  BrandResourceId,
  CreateBrandResourceInput,
  UpdateBrandResourceInput,
} from '@brandfactory/shared'
import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '../client'
import { rowToBrandResource } from '../mappers'
import { brandResources } from '../schema'

/**
 * Every resource a brand holds, grouped by `type` then title. There is no
 * `position` column — see `brand_resources.ts` — so title order (the index's
 * second column) is the read order within a group, and `id` breaks a tie
 * between two rows sharing a title so two reads of one brand return the same
 * sequence.
 */
export async function listResourcesByBrand(brandId: BrandId): Promise<BrandResource[]> {
  const rows = await db
    .select()
    .from(brandResources)
    .where(eq(brandResources.brandId, brandId))
    .orderBy(asc(brandResources.type), asc(brandResources.title), asc(brandResources.id))
  return rows.map(rowToBrandResource)
}

export async function createResource(
  brandId: BrandId,
  input: CreateBrandResourceInput,
): Promise<BrandResource> {
  const [row] = await db
    .insert(brandResources)
    .values({
      brandId,
      type: input.type,
      title: input.title,
      url: input.url,
      note: input.note,
    })
    .returning()
  if (!row) throw new Error('createResource returned no row')
  return rowToBrandResource(row)
}

/**
 * Partial patch over the columns a user can actually edit — every column but
 * `id` and `brandId`. `undefined` leaves a column alone; `null` clears `note`
 * — the same patch semantics `updateBrand` and `updateAsset` carry.
 */
export async function updateResource(
  brandId: BrandId,
  id: BrandResourceId,
  patch: UpdateBrandResourceInput,
): Promise<BrandResource | null> {
  const [row] = await db
    .update(brandResources)
    .set({
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.url !== undefined ? { url: patch.url } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
      updatedAt: sql`now()`,
    })
    // Scoped by brand as well as id: the route resolves access against the
    // brand, so an id from another brand must miss rather than update.
    .where(and(eq(brandResources.id, id), eq(brandResources.brandId, brandId)))
    .returning()
  return row ? rowToBrandResource(row) : null
}

/**
 * Deletes a resource outright. **No soft delete** — see `brand_resources.ts`
 * on why a link to a font shop does not get the `brand_assets` treatment.
 */
export async function deleteResource(
  brandId: BrandId,
  id: BrandResourceId,
): Promise<BrandResource | null> {
  const [row] = await db
    .delete(brandResources)
    .where(and(eq(brandResources.id, id), eq(brandResources.brandId, brandId)))
    .returning()
  return row ? rowToBrandResource(row) : null
}
