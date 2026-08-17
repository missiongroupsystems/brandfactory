"use client";

import { usePathname, useSearchParams } from "next/navigation";
import * as React from "react";

/**
 * Filters live in the URL, and the URL is the single source of truth for them.
 *
 * This is a product requirement rather than a preference: spec §6 says any filtered view is
 * shareable, and the whole reason this app exists is that "when does the liquor licence expire"
 * got lost in a meeting. "Open outlets in the pipeline, filtered, send me the link" has to
 * survive being pasted into a chat. A `useState` filter cannot be pasted.
 *
 * Consequences worth knowing:
 *
 *   - `replaceState`, not `pushState`. Six filter tweaks should not mean six presses of Back to
 *     leave the page. The trade is that Back does not undo a single filter change, which is the
 *     better half of the deal for a table people poke at.
 *   - No scroll. Re-filtering a table you have scrolled down is not navigation, and a native
 *     history write does not scroll — which is what `router.replace`'s `scroll: false` used to
 *     buy before `write` stopped calling it. See the note there; that swap fixed a defect.
 *   - Empty means absent. `?status=` is dropped rather than sent, so a cleared filter produces a
 *     clean URL and `query()` in the API client never sees an empty string.
 *
 * NOTE: any component calling this must sit under a `<Suspense>` boundary. `useSearchParams`
 * opts its subtree out of static prerendering, and Next fails the build ("missing suspense
 * boundary with csr bailout") rather than silently shipping a client-only page. The pattern used
 * throughout this app is a server page rendering the header, then `<Suspense>` around the
 * client browser component.
 */
export function useQueryFilters<K extends string>(keys: readonly K[]) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Rebuilt from the URL on every render rather than mirrored into state — mirroring is what
  // creates the class of bug where the URL says one thing and the controls show another.
  const filters = React.useMemo(() => {
    const result: Partial<Record<K, string>> = {};
    for (const key of keys) {
      const value = searchParams.get(key);
      if (value) result[key] = value;
    }
    return result;
    // `keys` is a module-level constant at every call site; spreading it would make this
    // memo useless on any caller that inlines the array.
  }, [searchParams, keys]);

  /**
   * `window.history.replaceState`, **not** `router.replace` — and this is load-bearing.
   *
   * Next's own docs name the native History API as the way to update search params without
   * navigating ("Linking and Navigating → Native History API"): the calls integrate into
   * the router, so `usePathname` and `useSearchParams` both re-render off them. That is
   * exactly this hook's job — every key here is a filter, the route never changes, and
   * there is no server work to do because the list refetches through SWR.
   *
   * `router.replace` was the original implementation and it is **broken in production
   * builds**: on a list screen loaded *directly* on a URL that already carries search
   * params — which is to say, on every shared filtered link, the thing spec §6 exists for —
   * the navigation is silently dropped and **every filter control on the page is dead for
   * the life of the page**. Not just the first write: changing a select, removing a chip,
   * Clear all and emptying the search box all became no-ops. Confirmed on `/contracts` and
   * `/outlets`, so it was every list screen in the product.
   *
   * It survived this long because it is invisible from three of the four places you would
   * look: `lint`, `typecheck` and `build` cannot see it, **`pnpm dev` does not reproduce
   * it at all**, and a browser pass that opens a bare `/contracts` and clicks around never
   * hits it — the first write from a params-free URL is the one case that always worked.
   * It needs a production build *and* a hard load on a filtered URL, together.
   *
   * `scroll: false` is gone with it: a native history write does not scroll, which is the
   * behaviour that option was buying.
   */
  const write = React.useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, searchParams],
  );

  const setFilter = React.useCallback(
    (key: K, value: string | null | undefined) => {
      write((params) => {
        if (value) params.set(key, value);
        else params.delete(key);
      });
    },
    [write],
  );

  /**
   * Several keys in one `router.replace`. Two back-to-back `setFilter` calls both build
   * their URLSearchParams from the same rendered `searchParams`, so the second write
   * silently drops the first — any "set this, clear that" interaction needs one write.
   */
  const setFilters = React.useCallback(
    (entries: Partial<Record<K, string | null | undefined>>) => {
      write((params) => {
        for (const [key, value] of Object.entries(entries) as [
          K,
          string | null | undefined,
        ][]) {
          if (value) params.set(key, value);
          else params.delete(key);
        }
      });
    },
    [write],
  );

  const clearAll = React.useCallback(() => {
    write((params) => {
      for (const key of keys) params.delete(key);
    });
  }, [write, keys]);

  const activeCount = Object.keys(filters).length;

  /**
   * A stable string identity for the current filter set.
   *
   * Used as a React `key` on the list component, which resets `useSWRInfinite`'s accumulated
   * page count when the filters change. Without it, filtering while on "page 3" refetches three
   * pages of the *new* filter and shows 150 rows where the user asked for a fresh list.
   *
   * A `key` rather than an effect calling `setSize(1)` on purpose: setting state in an effect is
   * the pattern `react-hooks/set-state-in-effect` rejects, and it already broke the build once
   * in this codebase (see `hooks/use-mobile.ts`). Remounting expresses "this is a different
   * list" directly.
   */
  const filterKey = filterIdentity(keys, filters);

  return { filters, setFilter, setFilters, clearAll, activeCount, filterKey };
}

/**
 * The same identity `filterKey` carries, for a filter set the page has adjusted.
 *
 * Exists for the search debounce: a results component remounted on the *raw* `q` (via
 * `key={filterKey}`) remounts on every keystroke, and a debounce living inside the
 * remounted component re-seeds from the current value on mount — so the 250ms never
 * elapses and every keystroke fetches. The page debounces `q` itself, swaps it into the
 * filter set, and keys the results on *this* — non-search filters still remount
 * instantly, typing remounts once, when the debounce settles.
 */
/**
 * The values the API's own parser calls true, and therefore the ones a boolean filter must.
 *
 * Every boolean query parameter in this product is `bool | None` on a FastAPI route, so the
 * string is handed to pydantic, which accepts `1 / on / t / true / y / yes` case-insensitively
 * and rejects anything outside its two sets with a 422. Reproducing the *true* half here is what
 * makes a hand-written link mean the same thing to the table as it does to the API.
 */
const FLAG_TRUTHY = new Set(["1", "on", "t", "true", "y", "yes"]);

/**
 * Whether a URL flag is on — **the one reading**, shared by the control, the chip, the trigger's
 * count and the request.
 *
 * `AGENTS.md`: *"A boolean filter needs one reading of the URL, not one per consumer."* On
 * `/contracts` those four had drifted into two rules, and `?notice_gap=false` filtered the table
 * while the checkbox sat unticked — `"false"` being a non-empty string. The rule is per filter,
 * so a second screen with a second flag is not obliged to share this function; it is here
 * because the *rule* is the same one and a per-screen copy of the truthy set is how the sets
 * come to disagree. Promoted on `/service-reports`' `?missing_doc=`, the second such flag.
 *
 * A value in neither of pydantic's sets (`?flag=maybe`) is **off** here, where the API would
 * answer 422. Erring towards the unfiltered set is the safe direction: the reader sees every row
 * and can tell something is off, rather than a narrowed table they have no reason to doubt.
 */
export function isFlagOn(value: string | undefined): boolean {
  return value !== undefined && FLAG_TRUTHY.has(value.toLowerCase());
}

/**
 * The only value a page should ever *write* into a boolean filter.
 *
 * A boolean filter has two representations and only one of them is "set": `useQueryFilters`
 * deletes empty values, so `?flag=false` would be a key that is *present* — counted by a
 * trigger, drawn as a chip, carried into a shared link — while meaning "unfiltered". Off is the
 * key's absence, never a falsy value in it.
 */
export const FLAG_ON = "1";

export function filterIdentity<K extends string>(
  keys: readonly K[],
  filters: Partial<Record<K, string>>,
): string {
  return keys.map((key) => `${key}=${filters[key] ?? ""}`).join("&");
}
