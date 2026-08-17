"use client";

import * as React from "react";
import useSWR from "swr";

import { SCOPES, useInvalidate } from "@/lib/api/cache";
import { listEvery } from "@/lib/api/list-every";
import { useCursorPages } from "@/lib/api/use-cursor-pages";
import type { Brand, BrandCreate, BrandUpdate } from "@/lib/api/types";

import { brandService, type BrandFilters } from "./api";

/**
 * Reads and writes separated as everywhere else: the `use*` hooks subscribe to the cache, and
 * `useBrandMutations` returns plain async functions that call the service and invalidate by
 * scope. Nothing is optimistic — the API refuses a delete while an outlet or a company still
 * carries the brand, and a refusal that names the count is worth more than a guess.
 */

export function useBrandPages(filters: BrandFilters = {}) {
  return useCursorPages<Brand>(SCOPES.registryBrands, filters, (cursor) =>
    brandService.list({ ...filters, cursor }),
  );
}

export function useBrand(id: string | undefined) {
  // `null` key means "do not fetch" — an array key is truthy however empty its contents, so
  // `[SCOPES.registryBrand, ""]` would fire a request for `/brands/`.
  return useSWR(id ? [SCOPES.registryBrand, id] : null, () => brandService.get(id!));
}

/**
 * Every brand, for resolving `brand_id` to a name and for the pickers that assign one.
 *
 * `OutletRead` and `EntityRead` carry `brand_id` and no `brand_name`, deliberately: a
 * denormalised name on every outlet row would be a second copy of the one thing this table exists
 * to make renameable, and a rename would then be atomic in the database and stale on screen.
 *
 * **It walks the cursor to exhaustion**, like the outlet and entity indexes and for the reason
 * `listEvery` sets out. Stage 6's org chart depends on that being true — a brand card that is
 * never drawn takes every outlet it holds off the board — and building it right here costs
 * nothing.
 *
 * `isLoading` is exported and callers are expected to use it. **A brand id absent from `byId` is
 * a pending request, never a missing fact**: every `brand_id` in the product is a real foreign
 * key, so a cell that renders an em dash while this is in flight is stating that an outlet has no
 * brand, which is a different and false thing.
 */
export function useBrandIndex() {
  const { data, error, isLoading } = useSWR(
    [SCOPES.registryBrands, "index"],
    () => listEvery((params) => brandService.list(params)),
    { revalidateOnFocus: false },
  );

  // Memoised rather than `data?.items ?? []` inline: a fresh array every render restarts every
  // consumer's `useMemo` that sorts or filters it.
  const brands = React.useMemo(() => data?.items ?? [], [data]);

  const byId = React.useMemo(() => {
    const map = new Map<string, Brand>();
    for (const brand of brands) map.set(brand.id, brand);
    return map;
  }, [brands]);

  return { brands, byId, hasMore: Boolean(data?.truncated), error, isLoading };
}

export function useBrandMutations() {
  const invalidate = useInvalidate();

  /**
   * Outlets and entities go with every write, and the reason is the whole point of the table.
   *
   * A brand's *name* is resolved through `useBrandIndex` on every outlet row, every entity row
   * and the outlet detail badge. Renaming one is a single atomic `PATCH` on the server — and if
   * only the brand scopes were invalidated, every one of those screens would go on rendering the
   * old name from a cached index until something else happened to refetch it. "Every screen
   * follows a rename" is the thing a free-text column could not do, and this is where the client
   * half of it is kept.
   */
  const invalidateAll = React.useCallback(
    () => invalidate(SCOPES.registryBrands, SCOPES.registryBrand, SCOPES.outlets, SCOPES.outlet, SCOPES.entities),
    [invalidate],
  );

  const create = React.useCallback(
    async (data: BrandCreate) => {
      const created = await brandService.create(data);
      // A new brand changes no outlet, but it does change what the pickers offer.
      await invalidate(SCOPES.registryBrands);
      return created;
    },
    [invalidate],
  );

  const update = React.useCallback(
    async (id: string, data: BrandUpdate) => {
      const updated = await brandService.update(id, data);
      await invalidateAll();
      return updated;
    },
    [invalidateAll],
  );

  const remove = React.useCallback(
    async (id: string) => {
      await brandService.remove(id);
      await invalidateAll();
    },
    [invalidateAll],
  );

  return { create, update, remove };
}
