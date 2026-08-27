import type {
  BrandAsset,
  CreateBrandAssetInput,
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

  /**
   * Adds a photograph to the shelf.
   *
   * **The server never sees the file.** The client mints a write URL, PUTs the bytes
   * straight to storage, and posts the returned key here — the transport `assets.ts` was
   * built around, and the reason this service takes a key rather than a `File`.
   *
   * `library: "photography"` is passed explicitly rather than left to `defaultLibraryFor`.
   * That helper would file an image here anyway, but a screen that knows which shelf it is
   * should say so: the default exists for clients that have no opinion, and this one does.
   */
  createPhoto: async (brandId: string, input: CreateBrandAssetInput): Promise<BrandAsset> =>
    callJson<BrandAsset>(
      await bf.brands[":id"].assets.$post({ param: { id: brandId }, json: input }),
    ),

  /**
   * Re-position a set of photographs in one write.
   *
   * **`PATCH` on the collection, not one call per photo.** `routes/assets.ts` records what
   * the obvious spelling cost: a literal segment where a sibling route has a parameter
   * makes Hono's `RegExpRouter` refuse to compile and `SmartRouter` fall back to
   * `TrieRouter` *for the whole app* — whose symptom was a 404 on blob reads, in a module
   * that change never touched. The collection patch has no such collision, and it lands as
   * one transaction: a mid-list failure leaves the order intact rather than half-applied.
   */
  reorder: async (
    brandId: string,
    updates: { id: string; position: number }[],
  ): Promise<BrandAsset[]> =>
    callJson<BrandAsset[]>(
      await bf.brands[":id"].assets.$patch({
        param: { id: brandId },
        json: { updates } as never,
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
