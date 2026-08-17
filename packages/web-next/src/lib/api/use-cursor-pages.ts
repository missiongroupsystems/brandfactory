"use client";

import * as React from "react";
import useSWRInfinite from "swr/infinite";

import type { Page } from "@/lib/api/types";

/**
 * Accumulating cursor pagination, for every list in the app.
 *
 * The backend pages on a UUIDv7 cursor and hands back `next_cursor` or nothing — see
 * `backend/app/domain/pagination.py` for why it is a cursor and not an offset. That shape maps
 * exactly onto `useSWRInfinite`, and onto "load more" rather than numbered pages: there is no
 * total to number against and no backwards cursor to walk.
 *
 * Two options carry real weight:
 *
 *   - **`revalidateFirstPage: false`.** On by default, and it means pressing "load more" refetches
 *     page 1 every single time. With five pages loaded that is five requests to add one.
 *   - **`keepPreviousData: true`.** While a filter change is in flight the previous rows stay on
 *     screen instead of collapsing to a skeleton. A table that empties and refills on every
 *     keystroke of a search box is unreadable.
 *
 * Note the cursor is part of the key but *not* part of the caller's `params`. `params` identifies
 * the query; the cursor identifies a page within it. Folding one into the other means every page
 * looks like a different query and nothing is ever reused.
 */
export function useCursorPages<T>(
  scope: string,
  params: Record<string, unknown>,
  fetchPage: (cursor: string | undefined) => Promise<Page<T>>,
) {
  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite<
    Page<T>
  >(
    (index, previous: Page<T> | null) => {
      // Returning null is how `useSWRInfinite` is told the list is exhausted; without it, it
      // keeps asking for a page after the last one forever.
      if (index > 0 && !previous?.next_cursor) return null;
      return [scope, params, index === 0 ? null : previous!.next_cursor] as const;
    },
    ([, , cursor]) => fetchPage((cursor as string | null) ?? undefined),
    { revalidateFirstPage: false, keepPreviousData: true },
  );

  // Memoised on `data` rather than on a `data ?? []` local: the fallback array is a new identity
  // every render, which would make the memo below recompute every time and hand a fresh `items`
  // array to every consumer.
  const items = React.useMemo(
    () => (data ? data.flatMap((page) => page.items) : []),
    [data],
  );

  const hasMore = Boolean(data?.at(-1)?.next_cursor);

  // `data[size - 1] === undefined` is the documented way to spot a page in flight: SWR grows the
  // array as pages resolve, so a hole at the end means the newest page has not landed.
  const isLoadingMore = size > 0 && data !== undefined && data[size - 1] === undefined;

  const loadMore = React.useCallback(() => setSize((current) => current + 1), [setSize]);

  return {
    items,
    error,
    isLoading,
    isValidating,
    hasMore,
    isLoadingMore,
    loadMore,
    mutate,
  };
}
