"use client";

import type {
  BrandAsset,
  CreatePhotoCategoryInput,
  PhotoCategory,
  UpdatePhotoCategoryInput,
} from "@brandfactory/shared";
import { photographyInReadingOrder } from "@brandfactory/shared";
import * as React from "react";
import useSWR from "swr";

import { SCOPES, useRevalidate } from "@/lib/api/cache";

import { photographyService } from "./api";

const PHOTO_SCOPES = [SCOPES.bfPhotos, SCOPES.bfPhotoCategories];

/**
 * The brand's photography shelf, already in reading order: **pinned first, then as dragged.**
 *
 * The order comes from `photographyInReadingOrder` in `@brandfactory/shared`, which is a
 * *different* comparator from `byPosition` — deliberately, because `byPosition` also decides which
 * image is the brand's logo and must not learn about the pin. See `asset/photography.ts`.
 */
export function usePhotography(brandId: string | undefined) {
  const assets = useSWR<BrandAsset[]>(
    brandId ? [SCOPES.bfPhotos, brandId] : null,
    () => photographyService.listAssets(brandId!),
    { revalidateOnFocus: false },
  );
  const categories = useSWR<PhotoCategory[]>(
    brandId ? [SCOPES.bfPhotoCategories, brandId] : null,
    () => photographyService.listCategories(brandId!),
    { revalidateOnFocus: false },
  );

  const photos = React.useMemo(
    () => photographyInReadingOrder(assets.data ?? []),
    [assets.data],
  );

  return {
    photos,
    categories: categories.data ?? [],
    isLoading: assets.isLoading || categories.isLoading,
    error: assets.error ?? categories.error,
  };
}

export function usePhotographyMutations(brandId: string | undefined) {
  // `useRevalidate`, not `useInvalidate`: the latter empties the cache entry, so the
  // grid behind a sheet throws itself away and rebuilds on every write.
  const revalidate = useRevalidate();

  const sweep = React.useCallback(async () => {
    await revalidate(...PHOTO_SCOPES);
  }, [revalidate]);

  return React.useMemo(
    () => ({
      createCategory: async (input: CreatePhotoCategoryInput) => {
        const row = await photographyService.createCategory(brandId!, input);
        await sweep();
        return row;
      },
      renameCategory: async (categoryId: string, input: UpdatePhotoCategoryInput) => {
        const row = await photographyService.updateCategory(brandId!, categoryId, input);
        await sweep();
        return row;
      },
      // Sweeps **both** scopes: the photos that were filed here come back
      // uncategorised, so a stale asset list would show them under a heading
      // that no longer exists.
      deleteCategory: async (categoryId: string) => {
        const row = await photographyService.deleteCategory(brandId!, categoryId);
        await sweep();
        return row;
      },
      setCategory: async (assetId: string, categoryId: string | null) => {
        const row = await photographyService.setCategory(brandId!, assetId, categoryId);
        await sweep();
        return row;
      },
      setPinned: async (assetId: string, pinned: boolean) => {
        const row = pinned
          ? await photographyService.pin(brandId!, assetId)
          : await photographyService.unpin(brandId!, assetId);
        await sweep();
        return row;
      },
    }),
    [brandId, sweep],
  );
}
