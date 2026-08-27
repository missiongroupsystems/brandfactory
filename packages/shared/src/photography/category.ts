import { z } from 'zod'
import { BrandIdSchema, PhotoCategoryIdSchema } from '../ids'

// ---------------------------------------------------------------------------
// PhotoCategory — what a photograph is *of*
// ---------------------------------------------------------------------------
//
// Interior, food, people, product. **A table rather than a pgEnum, and the
// request is explicit about why**: *"the category set must be editable, because
// subjects differ per brand."* An enum turns every edit into a migration, and
// migration 0011 records what adding a value to a live one costs — its own file,
// and no `UPDATE` anywhere in that batch may name the new value.
//
// That is also the contrast with `ResourceTypeSchema`, which *is* an enum: the
// shapes of link a brand keeps are the same for every brand, and the subjects a
// brand photographs are not.

export const PhotoCategoryNameSchema = z.string().trim().min(1).max(80)

export const PhotoCategorySchema = z.object({
  id: PhotoCategoryIdSchema,
  brandId: BrandIdSchema,
  name: PhotoCategoryNameSchema,
  /**
   * Sparse ints, as `guideline_sections.priority` and `brand_assets.position`
   * already are — room to insert between two rows without renumbering.
   *
   * **This one earns its column** where `brand_resources` did not: the filter
   * bar renders these in order, and a set of subject buckets has a shape the
   * team chooses (interior before food, because that is how they shoot).
   */
  position: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type PhotoCategory = z.infer<typeof PhotoCategorySchema>

export const CreatePhotoCategoryInputSchema = z.object({ name: PhotoCategoryNameSchema })
export type CreatePhotoCategoryInput = z.infer<typeof CreatePhotoCategoryInputSchema>

export const UpdatePhotoCategoryInputSchema = z.object({ name: PhotoCategoryNameSchema })
export type UpdatePhotoCategoryInput = z.infer<typeof UpdatePhotoCategoryInputSchema>

/**
 * Photos filed under one category, or — for `null` — the ones filed under none.
 *
 * **Uncategorised is a real bucket, not an empty state.** Every photo that
 * predates 3B has no category and no rule could give it one: `defaultLibraryFor`
 * could derive a shelf from `kind` and `role` because purpose was recoverable
 * from the bytes, and nothing recovers *interior* from a PNG. A grid that hid
 * those would hide the whole existing library on the day this shipped.
 */
export function assetsInCategory<T extends { categoryId: string | null }>(
  assets: readonly T[],
  categoryId: string | null,
): T[] {
  return assets.filter((a) => a.categoryId === categoryId)
}
