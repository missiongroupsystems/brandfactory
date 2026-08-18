"use client";

import type {
  CreateInfluencerInput,
  Influencer,
  UpdateInfluencerInput,
} from "@brandfactory/shared";
import * as React from "react";
import useSWR from "swr";

import { useActiveWorkspace } from "@/features/workspaces/active-workspace";
import { SCOPES, useInvalidate } from "@/lib/api/cache";

import { influencerService } from "./api";

/**
 * The workspace's creators, on `features/outlets/hooks.ts`' shape.
 *
 * **`useInfluencerPages` is gone**, and with it `useCursorPages`, `InfluencerFilters` and the
 * `limit` the screen used to pass. The route returns the whole roster in reach order, so there is
 * one request, one array and no accumulation — and the four panel filters narrow a list the client
 * holds completely, which is what makes the tier bands' counts true.
 *
 * `undefined` while the workspace is still resolving, which is what the `null` key expresses.
 *
 * `revalidateOnFocus: false`, matching `useOutlets` and `useWorkspaceBrands`: this is a roster, not
 * a live feed, and a refetch every time somebody tabs back would reshuffle a table they are
 * reading.
 *
 * The workspace comes from `useActiveWorkspace()` rather than from a prop. Nothing in this shell is
 * workspace-*routed*, so threading an id through every influencer component would be threading a
 * constant.
 */
export function useInfluencers() {
  const { workspace, isLoading: workspaceLoading, error: workspaceError } = useActiveWorkspace();
  // An array key is truthy however empty its contents, so `[SCOPES.bfInfluencers, ""]` would fire
  // a request for `/workspaces//influencers` on every render before the workspace resolves. `null`
  // is the documented way to say "not ready".
  const { data, error, isLoading } = useSWR<Influencer[]>(
    workspace?.id ? [SCOPES.bfInfluencers, workspace.id] : null,
    () => influencerService.list(workspace!.id),
    { revalidateOnFocus: false },
  );

  // Memoised rather than `data ?? []` inline: a fresh array every render restarts every consumer's
  // `useMemo` that filters or groups it, and this screen has three.
  const influencers = React.useMemo(() => data ?? [], [data]);

  return {
    influencers,
    workspaceId: workspace?.id,
    // The workspace has to land before the creators can even be asked for, so a screen that
    // reported "no creators" during that first leg would be stating something it has not checked.
    isLoading: workspaceLoading || isLoading,
    error: workspaceError ?? error,
  };
}

/**
 * One creator by slug or id, for the detail page.
 *
 * Its own scope beside the list's, the same split every area here makes: the row in the table and
 * the record on the page are two cache entries holding one truth, and a write has to invalidate
 * both. `SCOPES.bfInfluencer` was registered in Phase C and read by nothing; this is what reads it.
 *
 * **`revalidateOnFocus` is left at its default here, unlike `useInfluencers` above.** A roster
 * refetched under a reader reshuffles a table they are scanning; a single record refetched under
 * one puts the same fields back in the same places, and coming back to a page after editing the
 * creator in another tab is exactly when a stale figure costs something. `useOutlet` makes the
 * same split for the same reason.
 */
export function useInfluencer(influencerRef: string | undefined) {
  const { workspace, isLoading: workspaceLoading, error: workspaceError } = useActiveWorkspace();
  // The ref belongs in the key, not just in the fetcher: `/influencers/priyaskin` and
  // `/influencers/<uuid>` are two entries over one row, which is the cost of a route that
  // resolves both — and it is why the page rewrites the URL cosmetically rather than navigating.
  const key =
    workspace?.id && influencerRef ? [SCOPES.bfInfluencer, workspace.id, influencerRef] : null;
  const { data, error, isLoading } = useSWR<Influencer>(key, () =>
    influencerService.get(workspace!.id, influencerRef!),
  );

  return {
    influencer: data,
    workspaceId: workspace?.id,
    isLoading: workspaceLoading || isLoading,
    error: workspaceError ?? error,
  };
}

/**
 * Both scopes on every write: the table's roster and the detail page's record are two cache
 * entries over one row, and refreshing one leaves the other lying.
 *
 * **A create invalidates `bfInfluencer` too, even though it changes no existing record.** The
 * detail scope is keyed on the *ref*, and a ref is a slug — so creating a second `@priyaskin`
 * mints `priyaskin-2` while a cache entry under `priyaskin` may already be held. The cost of
 * sweeping both is one refetch; the cost of sweeping one is a page that disagrees with the table
 * it was opened from.
 *
 * **No brand scope**, on `useOutletMutations`' argument. `BrandSummary` carries `sectionCount`
 * and `projectCount`, and neither counts creators, so engaging a creator for a brand changes no
 * brand's answer. The Operations Hub's sibling invalidates two more scopes because `BrandRead`
 * carries an `outlet_count`; copying that here would be cargo.
 *
 * Nothing is optimistic. The server applies rules the client does not know — a brand from another
 * workspace is a 400 `BRAND_NOT_IN_WORKSPACE`, a handle already on that platform is a duplicate —
 * so its answer is the only one worth rendering.
 *
 * Module-level so the `useCallback`s below have a stable dependency.
 */
const INFLUENCER_SCOPES = [SCOPES.bfInfluencers, SCOPES.bfInfluencer];

export function useInfluencerMutations() {
  const invalidate = useInvalidate();
  const { workspace } = useActiveWorkspace();
  const workspaceId = workspace?.id;

  const create = React.useCallback(
    async (input: CreateInfluencerInput) => {
      if (!workspaceId) throw new Error("No workspace resolved");
      const created = await influencerService.create(workspaceId, input);
      await invalidate(...INFLUENCER_SCOPES);
      return created;
    },
    [invalidate, workspaceId],
  );

  const update = React.useCallback(
    async (influencerId: string, input: UpdateInfluencerInput) => {
      if (!workspaceId) throw new Error("No workspace resolved");
      const updated = await influencerService.update(workspaceId, influencerId, input);
      await invalidate(...INFLUENCER_SCOPES);
      return updated;
    },
    [invalidate, workspaceId],
  );

  const remove = React.useCallback(
    async (influencerId: string) => {
      if (!workspaceId) throw new Error("No workspace resolved");
      const removed = await influencerService.remove(workspaceId, influencerId);
      await invalidate(...INFLUENCER_SCOPES);
      return removed;
    },
    [invalidate, workspaceId],
  );

  return { create, update, remove, workspaceId };
}
