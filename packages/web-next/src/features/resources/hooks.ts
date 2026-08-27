"use client";

import type { BrandResource, CreateBrandResourceInput, UpdateBrandResourceInput } from "@brandfactory/shared";
import * as React from "react";
import useSWR from "swr";

import { SCOPES, useRevalidate } from "@/lib/api/cache";

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

/**
 * Create, update and delete, on the same shape as `useOutletMutations` / `useVendorMutations`:
 * plain async functions that call the service and then revalidate by scope.
 *
 * **`brandId` is a parameter, not read from context.** `useResources` above takes it from the
 * route for the same reason (see its docstring) — there is no fallback to resolve here.
 *
 * **Nothing is optimistic**, matching every other mutation hook in this package
 * (`outlets/hooks.ts`, `vendors/hooks.ts`, and `AGENTS.md`'s "Mutations" section). A resource
 * delete has no domain rule to be refused by — it is a hard delete, or a 404 if the row is
 * already gone — so there is little to gain from optimism here, and adopting it would make this
 * the one mutation in the product that does not wait for the server's answer. The row stays
 * until the request settles; a refusal renders in place through `useSubmit`, exactly like a
 * failed vendor delete.
 *
 * There is no `bfResource` singular scope, unlike outlets and vendors: the server exposes no
 * `GET /brands/:id/resources/:resourceId`, so there is no per-record cache entry to keep in step.
 */
const RESOURCE_SCOPES = [SCOPES.bfResources];

export function useResourceMutations(brandId: string | undefined) {
  // `useRevalidate`, not `useInvalidate`: the latter empties the cache entry, so the
  // grid behind a sheet throws itself away and rebuilds on every write.
  const revalidate = useRevalidate();

  const create = React.useCallback(
    async (input: CreateBrandResourceInput) => {
      if (!brandId) throw new Error("No brand resolved");
      const created = await resourceService.create(brandId, input);
      await revalidate(...RESOURCE_SCOPES);
      return created;
    },
    [revalidate, brandId],
  );

  const update = React.useCallback(
    async (resourceId: string, input: UpdateBrandResourceInput) => {
      if (!brandId) throw new Error("No brand resolved");
      const updated = await resourceService.update(brandId, resourceId, input);
      await revalidate(...RESOURCE_SCOPES);
      return updated;
    },
    [revalidate, brandId],
  );

  const remove = React.useCallback(
    async (resourceId: string) => {
      if (!brandId) throw new Error("No brand resolved");
      const removed = await resourceService.remove(brandId, resourceId);
      await revalidate(...RESOURCE_SCOPES);
      return removed;
    },
    [revalidate, brandId],
  );

  return { create, update, remove };
}
