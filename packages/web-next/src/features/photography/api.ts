import type {
  BrandAsset,
  CreatePhotoCategoryInput,
  PhotoCategory,
  UpdatePhotoCategoryInput,
} from "@brandfactory/shared";

import { bf, callJson } from "@/lib/api/bf-client";

/**
 * The photography shelf and the subject buckets it is filed into.
 *
 * **Two services against one screen, because they are two aggregates.** The photos live in
 * `brand_assets` — a table three shelves share — and the categories are their own table. Filing a
 * photo is a `PATCH` on the *asset*, not a write to the category, because the category is a field
 * of the photo.
 *
 * **`listAssets` returns the whole brand, every shelf.** That is the route's shape, and the client
 * sections it (`photographyInReadingOrder`). Do not reach for `useCursorPages` here — there is no
 * cursor to exhaust, and the filter and sort below are only correct *because* the client holds the
 * whole set. If that read ever gains a cursor, both move server-side in the same change.
 */
export const photographyService = {
  listAssets: async (brandId: string): Promise<BrandAsset[]> =>
    callJson<BrandAsset[]>(await bf.brands[":id"].assets.$get({ param: { id: brandId } })),

  listCategories: async (brandId: string): Promise<PhotoCategory[]> =>
    callJson<PhotoCategory[]>(
      await bf.brands[":id"]["photo-categories"].$get({ param: { id: brandId } }),
    ),

  createCategory: async (
    brandId: string,
    input: CreatePhotoCategoryInput,
  ): Promise<PhotoCategory> =>
    callJson<PhotoCategory>(
      await bf.brands[":id"]["photo-categories"].$post({ param: { id: brandId }, json: input }),
    ),

  updateCategory: async (
    brandId: string,
    categoryId: string,
    input: UpdatePhotoCategoryInput,
  ): Promise<PhotoCategory> =>
    callJson<PhotoCategory>(
      await bf.brands[":id"]["photo-categories"][":categoryId"].$patch({
        param: { id: brandId, categoryId },
        json: input,
      }),
    ),

  /**
   * Removes a bucket. **The photos survive, uncategorised** — `ON DELETE SET NULL` on the asset's
   * `category_id`. The caller owes the reader a count first: the effect lands on rows they are not
   * looking at.
   */
  deleteCategory: async (brandId: string, categoryId: string): Promise<PhotoCategory> =>
    callJson<PhotoCategory>(
      await bf.brands[":id"]["photo-categories"][":categoryId"].$delete({
        param: { id: brandId, categoryId },
      }),
    ),

  /** Files one photo under a subject, or — for `null` — back into Uncategorised. */
  setCategory: async (
    brandId: string,
    assetId: string,
    categoryId: string | null,
  ): Promise<BrandAsset> =>
    callJson<BrandAsset>(
      await bf.brands[":id"].assets[":assetId"].$patch({
        param: { id: brandId, assetId },
        json: { categoryId },
      }),
    ),

  /** Pin and unpin are a verb each, not a field edit — see `routes/assets.ts`. */
  pin: async (brandId: string, assetId: string): Promise<BrandAsset> =>
    callJson<BrandAsset>(
      await bf.brands[":id"].assets[":assetId"].pin.$post({ param: { id: brandId, assetId } }),
    ),

  unpin: async (brandId: string, assetId: string): Promise<BrandAsset> =>
    callJson<BrandAsset>(
      await bf.brands[":id"].assets[":assetId"].pin.$delete({ param: { id: brandId, assetId } }),
    ),
};
