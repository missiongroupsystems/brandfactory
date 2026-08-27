import type {
  BrandId,
  CreatePhotoCategoryInput,
  PhotoCategory,
  PhotoCategoryId,
  UpdatePhotoCategoryInput,
} from '@brandfactory/shared'
import { and, asc, eq, max } from 'drizzle-orm'
import { db } from '../client'
import { rowToPhotoCategory } from '../mappers'
import { photoCategories } from '../schema'

// Sparse integer ordering, as `guideline_sections.priority` and
// `brand_assets.position` already are — room to insert between two rows without
// renumbering the list.
const POSITION_STEP = 100

/** A brand's subject buckets, in the order the team put them in. */
export async function listPhotoCategoriesByBrand(brandId: BrandId): Promise<PhotoCategory[]> {
  const rows = await db
    .select()
    .from(photoCategories)
    .where(eq(photoCategories.brandId, brandId))
    .orderBy(asc(photoCategories.position), asc(photoCategories.id))
  return rows.map(rowToPhotoCategory)
}

/**
 * Appends to the end of the brand's list.
 *
 * The position is computed from the current maximum rather than from a count:
 * a count is wrong the moment anything has ever been deleted, and would collide
 * two categories onto one slot.
 */
export async function createPhotoCategory(
  brandId: BrandId,
  input: CreatePhotoCategoryInput,
): Promise<PhotoCategory> {
  const [{ value: highest } = { value: null }] = await db
    .select({ value: max(photoCategories.position) })
    .from(photoCategories)
    .where(eq(photoCategories.brandId, brandId))

  const [row] = await db
    .insert(photoCategories)
    .values({
      brandId,
      name: input.name,
      position: (highest ?? 0) + POSITION_STEP,
    })
    .returning()
  return rowToPhotoCategory(row!)
}

export async function updatePhotoCategory(
  brandId: BrandId,
  categoryId: PhotoCategoryId,
  input: UpdatePhotoCategoryInput,
): Promise<PhotoCategory | null> {
  const [row] = await db
    .update(photoCategories)
    .set({ name: input.name, updatedAt: new Date().toISOString() })
    .where(and(eq(photoCategories.id, categoryId), eq(photoCategories.brandId, brandId)))
    .returning()
  return row ? rowToPhotoCategory(row) : null
}

/**
 * Deletes a category and **uncategorises its photos** — `ON DELETE SET NULL` on
 * `brand_assets.category_id` does the second half.
 *
 * That is the whole reason this is safe to offer: a subject bucket is a filing
 * decision, and undoing one must not destroy what was filed. The screen still
 * owes the reader a count before it happens, because the effect lands somewhere
 * they are not looking.
 */
export async function deletePhotoCategory(
  brandId: BrandId,
  categoryId: PhotoCategoryId,
): Promise<PhotoCategory | null> {
  const [row] = await db
    .delete(photoCategories)
    .where(and(eq(photoCategories.id, categoryId), eq(photoCategories.brandId, brandId)))
    .returning()
  return row ? rowToPhotoCategory(row) : null
}
