"use client";

import type { BrandSummary, CreateBrandInput } from "@brandfactory/shared";
import * as React from "react";
import useSWR from "swr";

import { SCOPES, useInvalidate } from "@/lib/api/cache";

import { brandService } from "./api";

/**
 * Reads and writes separated as everywhere else in this app: the `use*` hooks subscribe to the
 * cache, and `useBrandMutations` returns plain async functions that call the service and then
 * invalidate by scope. Nothing is optimistic — the API applies domain rules the client does not
 * know, so the server's answer is the only one worth rendering.
 *
 * **Keyed by workspace**, and that is not decoration. A brand id is only meaningful inside its
 * workspace, so `["brands"]` alone would serve workspace A's list while the header said B.
 */
export function useWorkspaceBrands(workspaceId: string | undefined) {
  // `null` means "do not fetch". An array key is truthy however empty its contents, so
  // `[SCOPES.bfBrands, ""]` would fire a request for `/workspaces//brands` on every render
  // before the workspace resolves.
  return useSWR<BrandSummary[]>(
    workspaceId ? [SCOPES.bfBrands, workspaceId] : null,
    () => brandService.list(workspaceId!),
    { revalidateOnFocus: false },
  );
}

export function useBrandMutations(workspaceId: string | undefined) {
  const invalidate = useInvalidate();

  const create = React.useCallback(
    async (input: CreateBrandInput) => {
      if (!workspaceId) throw new Error("No workspace selected");
      const created = await brandService.create(workspaceId, input);
      // Revalidate rather than write the row in: `POST` answers with a `Brand` and this list
      // holds `BrandSummary`. Casting one to the other would put a row with no `sectionCount`,
      // no `projectCount` and no `tldr` into a cache typed as having all three.
      await invalidate(SCOPES.bfBrands);
      return created;
    },
    [invalidate, workspaceId],
  );

  return { create };
}
