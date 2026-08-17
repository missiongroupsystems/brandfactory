"use client";

import type { BrandSummary } from "@brandfactory/shared";

import { useActiveWorkspace } from "@/features/workspaces/active-workspace";
import { createStoredPreference } from "@/lib/stored-preference";

import { useWorkspaceBrands } from "./hooks";

/**
 * The brand the shell is currently inside — the selection the sidebar's toggle writes.
 *
 * Moved here from the Operations Hub's brand folder when that folder became
 * `features/registry-brands/`, and rescoped from six fixtures to the workspace's real brands.
 * The storage mechanics are unchanged and now live in `lib/stored-preference.ts`, shared with
 * the workspace row.
 *
 * **It is a preference, not a route and not server state.** Nothing in this app is
 * brand-scoped yet, so there is no `/brands/:id` to navigate to and no filter to put in the
 * URL; and `useQueryFilters` would be the wrong home even later, because that hook exists to
 * make one *screen's* view pasteable while this outlives every navigation. The root
 * `CLAUDE.md` records the same call for the sidebar and key-dates preferences: a user
 * preference is not a column.
 *
 * There is no context provider, deliberately. Both halves are already global and deduplicated
 * — SWR shares the list by key, and the preference store is a module singleton — so a provider
 * would add a tree to thread with nothing to keep in it.
 */
const stored = createStoredPreference("brandfactory.active-brand");

export interface ActiveBrand {
  /** The resolved brand, or `undefined` while a request is in flight or the workspace is empty. */
  brand: BrandSummary | undefined;
  /** Every brand in the active workspace, for the switcher's list. */
  brands: BrandSummary[];
  /** The workspace they belong to — what a create needs, and `undefined` before one resolves. */
  workspaceId: string | undefined;
  isLoading: boolean;
  error: unknown;
  select: (id: string) => void;
}

export function useActiveBrand(): ActiveBrand {
  const { workspace, isLoading: workspaceLoading } = useActiveWorkspace();
  const { data, error, isLoading } = useWorkspaceBrands(workspace?.id);
  const storedId = stored.use();

  const brands = data ?? [];

  /**
   * **The fallback is "the first brand in *this* workspace", not "the first brand seen".**
   *
   * One stored id now has to survive a workspace switch, and a brand id from workspace A must
   * not resolve while the header says B. Because `brands` is already the active workspace's
   * list, `find` answers that on its own: an id from elsewhere simply misses and falls through
   * to `brands[0]`, which is a brand you can actually open.
   *
   * Derived, never written back. A stored id naming a brand that has since been deleted falls
   * through the same way, and *correcting* the stored value would be a write during render —
   * the exact pattern the preference store exists to avoid. It corrects itself on the next pick.
   */
  const brand = brands.find((b) => b.id === storedId) ?? brands[0];

  return {
    brand,
    brands,
    workspaceId: workspace?.id,
    // The workspace has to land before the brands can even be asked for, so a shell that
    // reported "no brands" during that first leg would state something it has not checked.
    isLoading: workspaceLoading || isLoading,
    error,
    select: stored.set,
  };
}
