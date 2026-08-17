"use client";

import * as React from "react";

import { useBrandIndex } from "./hooks";
import type { Brand } from "@/lib/api/types";

/**
 * The brand the shell is currently inside — the selection the sidebar's toggle writes.
 *
 * **It is a preference, not a route and not server state.** Nothing in this app is
 * brand-scoped yet, so there is no `/brands/:id` to navigate to and no filter to put in the
 * URL; and `useQueryFilters` would be the wrong home even later, because that hook exists to
 * make one *screen's* view pasteable, while this outlives every navigation. `localStorage`
 * plus a module-level store is the same call the root `CLAUDE.md` records for the sidebar and
 * key-dates preferences: a user preference is not a column.
 *
 * **`useSyncExternalStore`, not `useState` + an effect.** Reading `localStorage` during render
 * is wrong on the server and seeding it from an effect is `react-hooks/set-state-in-effect`,
 * which fails this build — the rule `hooks/use-mobile.ts` was rewritten for. This is the shape
 * that hook exists to demonstrate: subscribe, read, and hand the server a separate snapshot.
 * The server snapshot is `null` because there is no storage during SSR, and guessing a brand
 * would put the wrong name in the static HTML.
 *
 * There is no context provider, deliberately. Both halves are already global and deduplicated
 * — SWR shares `useBrandIndex` by key, and the store below is a module singleton — so a
 * provider would add a tree to thread with nothing to keep in it.
 */

const KEY = "brandfactory.active-brand";

/** Same-tab subscribers. The `storage` event fires in *other* tabs only, so a write here has
 *  to notify locally or the toggle would not re-render on its own click. */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Cross-tab: two windows on the same product should agree about which brand you are in.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Storage access throws rather than returning null when it is unavailable — Safari's private
 * mode and a blocked third-party context both do it — so every touch is guarded. Losing the
 * persistence is a degraded session; an exception here would take the whole sidebar down.
 */
function getSnapshot(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function getServerSnapshot(): string | null {
  return null;
}

function useStoredBrandId() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export type ActiveBrand = {
  /** The resolved brand, or `undefined` while the index is in flight or genuinely empty. */
  brand: Brand | undefined;
  /** Every brand, for the switcher's list. */
  brands: Brand[];
  isLoading: boolean;
  error: unknown;
  select: (id: string) => void;
};

export function useActiveBrand(): ActiveBrand {
  const { brands, isLoading, error } = useBrandIndex();
  const storedId = useStoredBrandId();

  const select = React.useCallback((id: string) => {
    try {
      window.localStorage.setItem(KEY, id);
    } catch {
      // Unavailable storage means the choice lasts this render and no longer. The listeners
      // still fire, so the toggle follows the click either way — it just will not survive a
      // reload, which is better than a click that appears to do nothing.
    }
    for (const listener of listeners) listener();
  }, []);

  // Derived, never written back. A stored id naming a brand that has since been deleted falls
  // through to the first one, and *correcting* the stored value would be a write during render
  // — the exact pattern the store above exists to avoid. It corrects itself on the next pick.
  const brand = brands.find((b) => b.id === storedId) ?? brands[0];

  return { brand, brands, isLoading, error, select };
}
