"use client";

import type { BrandResource } from "@brandfactory/shared";
import useSWR from "swr";

import { SCOPES } from "@/lib/api/cache";

import { resourceService } from "./api";

/**
 * A brand's resources.
 *
 * **The id comes from the route, not from `useActiveBrand`.** `/brands/:id/resources` already
 * names the brand in the path — see `BrandOutletsPage` for the same shape one screen over — so
 * there is no fallback to resolve here and no wait for a workspace's brand list to land first.
 *
 * `undefined` while `brandId` is not yet known, expressed with a `null` key: an array key is
 * truthy however empty its contents, so `[SCOPES.bfResources, ""]` would fire a request for
 * `/brands//resources` before the id arrives.
 */
export function useResources(brandId: string | undefined) {
  const { data, error, isLoading } = useSWR<BrandResource[]>(
    brandId ? [SCOPES.bfResources, brandId] : null,
    () => resourceService.list(brandId!),
    { revalidateOnFocus: false },
  );

  return {
    resources: data ?? [],
    isLoading,
    error,
  };
}
