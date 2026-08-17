import type { Page } from "./types";

/**
 * Walk a cursor-paginated list to exhaustion.
 *
 * **The index hooks' shared half.** `useOutletIndex`, `useEntityIndex` and `useBrandIndex` all
 * build a `Map` that some screen resolves a foreign key through, and every one of them is doing
 * it for the same reason: a board is a *map*, and a row stranded on page two is silently absent
 * from it — an absence a reader takes as fact rather than as truncation. That argument is
 * symmetric, and it has already been half-applied once: the outlet index was rebuilt to walk and
 * the entity half was left behind for a release, during which an undrawn company card took every
 * outlet it held off the org chart — and those outlets did not fall into the board's tray either,
 * because the tray holds only the outlets with *no* `entity_id` and these had one.
 *
 * So the walk belongs to all three or to none, which is why it lives here rather than in one
 * feature. It moved out of `features/registry/hooks.ts` when brands became the third caller —
 * `AGENTS.md`'s rule for promoting to `lib/` is two features and no feature-specific logic, and
 * this is both.
 *
 * `truncated` reports having hit `INDEX_MAX_PAGES`, i.e. "there are rows you are not being shown".
 * Surfaced rather than swallowed, so a caller can say so instead of quietly listing a subset.
 */

/**
 * One request covers the estate several times over; the cap is a runaway guard, not a budget.
 *
 * 200 is `pagination.MAX_LIMIT` on the API, which clamps rather than rejects — asking for more
 * would silently get 200 back and make this constant a lie about the request being sent.
 */
const INDEX_PAGE_SIZE = 200;
const INDEX_MAX_PAGES = 10;

export async function listEvery<T>(
  fetchPage: (params: { limit: number; cursor?: string }) => Promise<Page<T>>,
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < INDEX_MAX_PAGES; page++) {
    const result = await fetchPage({ limit: INDEX_PAGE_SIZE, cursor });
    items.push(...result.items);
    if (!result.next_cursor) return { items, truncated: false };
    cursor = result.next_cursor;
  }

  return { items, truncated: true };
}
