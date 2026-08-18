"use client";

import type { CreateVendorInput, UpdateVendorInput, Vendor } from "@brandfactory/shared";
import * as React from "react";
import useSWR from "swr";

import { useActiveWorkspace } from "@/features/workspaces/active-workspace";
import { SCOPES, useInvalidate } from "@/lib/api/cache";

import { vendorService } from "./api";

/**
 * The workspace's vendors, on `useInfluencers`' shape exactly.
 *
 * **`useVendorPages` is gone**, and with it `useCursorPages`, the `LoadMore` footer and the two
 * filter parameters the screen used to send to a server that did not exist. The route returns
 * the whole book in name order, so there is one request, one array and no accumulation — and
 * the search box and three selects narrow a list the client holds completely.
 *
 * `undefined` while the workspace is still resolving, which is what the `null` key expresses.
 *
 * `revalidateOnFocus: false`, matching `useOutlets`, `useInfluencers` and `useWorkspaceBrands`:
 * this is a directory, not a live feed, and a refetch every time somebody tabs back would
 * reshuffle a table they are reading.
 *
 * The workspace comes from `useActiveWorkspace()` rather than from a prop. Nothing in this shell
 * is workspace-*routed*, so threading an id through every vendor component would be threading a
 * constant.
 */
export function useVendors() {
  const { workspace, isLoading: workspaceLoading, error: workspaceError } = useActiveWorkspace();
  // An array key is truthy however empty its contents, so `[SCOPES.bfVendors, ""]` would fire a
  // request for `/workspaces//vendors` on every render before the workspace resolves. `null` is
  // the documented way to say "not ready".
  const { data, error, isLoading } = useSWR<Vendor[]>(
    workspace?.id ? [SCOPES.bfVendors, workspace.id] : null,
    () => vendorService.list(workspace!.id),
    { revalidateOnFocus: false },
  );

  // Memoised rather than `data ?? []` inline: a fresh array every render restarts every
  // consumer's `useMemo` that filters it.
  const vendors = React.useMemo(() => data ?? [], [data]);

  return {
    vendors,
    workspaceId: workspace?.id,
    // The workspace has to land before the vendors can even be asked for, so a screen that
    // reported "no vendors" during that first leg would be stating something it has not checked.
    isLoading: workspaceLoading || isLoading,
    error: workspaceError ?? error,
  };
}

/**
 * One vendor by slug or id, for the detail page.
 *
 * Its own scope beside the list's, the same split every area here makes: the row in the table and
 * the record on the page are two cache entries holding one truth, and a write has to invalidate
 * both. `SCOPES.bfVendor` was registered in Phase D and read by nothing; this is what reads it.
 *
 * **`revalidateOnFocus` is left at its default here, unlike `useVendors` above.** A directory
 * refetched under a reader reshuffles a table they are scanning; a single record refetched under
 * one puts the same fields back in the same places, and coming back to a page after somebody
 * corrected the company in another tab is exactly when a stale field costs something. `useOutlet`
 * and `useInfluencer` make the same split for the same reason.
 */
export function useVendor(vendorRef: string | undefined) {
  const { workspace, isLoading: workspaceLoading, error: workspaceError } = useActiveWorkspace();
  // The ref belongs in the key, not just in the fetcher: `/vendors/northlight-talent-pte-ltd` and
  // `/vendors/<uuid>` are two entries over one row, which is the cost of a route that resolves
  // both — and it is why the page rewrites the URL cosmetically rather than navigating.
  const key = workspace?.id && vendorRef ? [SCOPES.bfVendor, workspace.id, vendorRef] : null;
  const { data, error, isLoading } = useSWR<Vendor>(key, () =>
    vendorService.get(workspace!.id, vendorRef!),
  );

  return {
    vendor: data,
    workspaceId: workspace?.id,
    isLoading: workspaceLoading || isLoading,
    error: workspaceError ?? error,
  };
}

/**
 * Both scopes on every write: the table's book and the detail page's record are two cache entries
 * over one row, and refreshing one leaves the other lying.
 *
 * **A create invalidates `bfVendor` too, even though it changes no existing record.** The detail
 * scope is keyed on the *ref*, and a ref is a slug — so creating a second "Sunbeam Social" mints
 * `sunbeam-social-2` while a cache entry under `sunbeam-social` may already be held. The cost of
 * sweeping both is one refetch; the cost of sweeping one is a page that disagrees with the table
 * it was opened from.
 *
 * **`SCOPES.contacts` is deliberately not swept, and this is the one place it is tempting.** That
 * is the Operations Hub's address book, and its rows are `ContactRead` — a different record, in a
 * different service, that happens also to describe a person. A `vendor_contacts` row is a value
 * object with no id that lives and dies with its vendor. Sweeping the address book here would
 * refetch the tenancy sheet's and the review queue's data on every vendor edit, for nothing.
 *
 * **No brand scope either**, on `useInfluencerMutations`' argument. `BrandSummary` carries
 * `sectionCount` and `projectCount`, and neither counts vendors, so assigning a company to a brand
 * changes no brand's answer. The Operations Hub's sibling invalidates two more scopes because
 * `BrandRead` carries an `outlet_count`; copying that here would be cargo.
 *
 * Nothing is optimistic. The server applies rules the client does not know — a brand from another
 * workspace is a 400 `BRAND_NOT_IN_WORKSPACE`, a UEN already on the book is a 409
 * `VENDOR_UEN_TAKEN` — so its answer is the only one worth rendering.
 *
 * Module-level so the `useCallback`s below have a stable dependency.
 */
const VENDOR_SCOPES = [SCOPES.bfVendors, SCOPES.bfVendor];

export function useVendorMutations() {
  const invalidate = useInvalidate();
  const { workspace } = useActiveWorkspace();
  const workspaceId = workspace?.id;

  const create = React.useCallback(
    async (input: CreateVendorInput) => {
      if (!workspaceId) throw new Error("No workspace resolved");
      const created = await vendorService.create(workspaceId, input);
      await invalidate(...VENDOR_SCOPES);
      return created;
    },
    [invalidate, workspaceId],
  );

  const update = React.useCallback(
    async (vendorId: string, input: UpdateVendorInput) => {
      if (!workspaceId) throw new Error("No workspace resolved");
      const updated = await vendorService.update(workspaceId, vendorId, input);
      await invalidate(...VENDOR_SCOPES);
      return updated;
    },
    [invalidate, workspaceId],
  );

  const remove = React.useCallback(
    async (vendorId: string) => {
      if (!workspaceId) throw new Error("No workspace resolved");
      const removed = await vendorService.remove(workspaceId, vendorId);
      await invalidate(...VENDOR_SCOPES);
      return removed;
    },
    [invalidate, workspaceId],
  );

  return { create, update, remove, workspaceId };
}
