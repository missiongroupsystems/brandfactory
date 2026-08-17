"use client";

import type { CreateOutletInput, Outlet, UpdateOutletInput } from "@brandfactory/shared";
import * as React from "react";
import useSWR from "swr";

import { useActiveWorkspace } from "@/features/workspaces/active-workspace";
import { SCOPES, useInvalidate } from "@/lib/api/cache";

import { outletService } from "./api";

/**
 * Reads and writes separated as everywhere else in this app: the `use*` hooks
 * subscribe to the cache, and `useOutletMutations` returns plain async functions
 * that call the service and then invalidate by scope. Nothing is optimistic — the
 * server applies rules the client does not know (a brand from another workspace
 * is refused), so its answer is the only one worth rendering.
 *
 * **Every key carries the workspace**, and that is not decoration. An outlet id
 * is only meaningful inside its workspace, so `["outlets"]` alone would serve one
 * workspace's list under another's header — the same call `useWorkspaceBrands`
 * makes one aggregate over.
 *
 * The workspace comes from `useActiveWorkspace()` rather than from a prop.
 * Nothing in this shell is workspace-*routed* — there is one workspace and no way
 * to change it — so threading an id through every outlet component would be
 * threading a constant.
 */

/**
 * The workspace's outlets. `undefined` while the workspace is still resolving,
 * which is what the `null` key expresses.
 *
 * `revalidateOnFocus: false`, matching `useWorkspaceBrands`: this is a directory
 * of premises, not a live feed, and a refetch every time somebody tabs back would
 * reshuffle a table they are reading.
 */
export function useOutlets() {
  const { workspace, isLoading: workspaceLoading, error: workspaceError } = useActiveWorkspace();
  // An array key is truthy however empty its contents, so `[SCOPES.bfOutlets, ""]`
  // would fire a request for `/workspaces//outlets` on every render before the
  // workspace resolves. `null` is the documented way to say "not ready".
  const { data, error, isLoading } = useSWR<Outlet[]>(
    workspace?.id ? [SCOPES.bfOutlets, workspace.id] : null,
    () => outletService.list(workspace!.id),
    { revalidateOnFocus: false },
  );

  const outlets = React.useMemo(() => data ?? [], [data]);

  return {
    outlets,
    workspaceId: workspace?.id,
    // The workspace has to land before the outlets can even be asked for, so a
    // screen that reported "no outlets" during that first leg would be stating
    // something it has not checked.
    isLoading: workspaceLoading || isLoading,
    error: workspaceError ?? error,
  };
}

/**
 * One outlet by slug or id, for the detail page.
 *
 * Its own scope beside the list's, the same split every area here makes: the row
 * in the table and the record on the page are two cache entries holding one
 * truth, and a write has to invalidate both.
 */
export function useOutlet(outletRef: string | undefined) {
  const { workspace, isLoading: workspaceLoading, error: workspaceError } = useActiveWorkspace();
  const key = workspace?.id && outletRef ? [SCOPES.bfOutlet, workspace.id, outletRef] : null;
  const { data, error, isLoading } = useSWR<Outlet>(key, () =>
    outletService.get(workspace!.id, outletRef!),
  );

  return {
    outlet: data,
    workspaceId: workspace?.id,
    isLoading: workspaceLoading || isLoading,
    error: workspaceError ?? error,
  };
}

/**
 * Both scopes on every write: the table's list and the detail page's record are
 * two cache entries over one row, and refreshing one leaves the other lying.
 *
 * **No brand scope, unlike the Operations Hub's sibling.** `BrandSummary` carries
 * `sectionCount` and `projectCount`, and neither counts outlets — so moving an
 * outlet between brands changes no brand's answer. `BrandRead.outlet_count` did,
 * which is why `features/registry/hooks.ts` invalidates two more scopes on every
 * outlet write. Copying that here would be cargo.
 *
 * Module-level so the `useCallback`s below have a stable dependency.
 */
const OUTLET_SCOPES = [SCOPES.bfOutlets, SCOPES.bfOutlet];

export function useOutletMutations() {
  const invalidate = useInvalidate();
  const { workspace } = useActiveWorkspace();
  const workspaceId = workspace?.id;

  const create = React.useCallback(
    async (input: CreateOutletInput) => {
      if (!workspaceId) throw new Error("No workspace resolved");
      const created = await outletService.create(workspaceId, input);
      await invalidate(...OUTLET_SCOPES);
      return created;
    },
    [invalidate, workspaceId],
  );

  const update = React.useCallback(
    async (outletId: string, input: UpdateOutletInput) => {
      if (!workspaceId) throw new Error("No workspace resolved");
      const updated = await outletService.update(workspaceId, outletId, input);
      await invalidate(...OUTLET_SCOPES);
      return updated;
    },
    [invalidate, workspaceId],
  );

  const remove = React.useCallback(
    async (outletId: string) => {
      if (!workspaceId) throw new Error("No workspace resolved");
      const removed = await outletService.remove(workspaceId, outletId);
      await invalidate(...OUTLET_SCOPES);
      return removed;
    },
    [invalidate, workspaceId],
  );

  return { create, update, remove, workspaceId };
}
