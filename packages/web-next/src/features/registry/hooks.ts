"use client";

import * as React from "react";
import useSWR from "swr";

import { SCOPES, useInvalidate } from "@/lib/api/cache";
import { listEvery } from "@/lib/api/list-every";
import { useCursorPages } from "@/lib/api/use-cursor-pages";
import type {
  Entity,
  EntityCloseBody,
  EntityCreate,
  EntityUpdate,
  Outlet,
  OutletCloseBody,
  OutletCreate,
  OutletUpdate,
} from "@/lib/api/types";

import { entityService, outletService, type OutletFilters } from "./api";

/**
 * Server state via SWR — cached, deduplicated, revalidated. Client state (open dialogs, form
 * drafts) stays in `useState` and never comes near here.
 *
 * Keys are arrays including the filters, so two components asking for different filters do not
 * share a cache entry. A string key built by concatenation looks fine until `?status=open` and
 * `?status=closed` collide.
 *
 * Reads and writes are separated on purpose. The `use*` hooks subscribe to the cache; the
 * `use*Mutations` hooks return plain async functions that call the service layer and then
 * invalidate by scope. Mutations are not optimistic anywhere in this app — the API applies
 * domain rules (an entity that still holds outlets refuses to delete, a licence expiry that
 * disagrees with the library raises), so the server's answer is the only one worth rendering.
 */

// ── Outlets ────────────────────────────────────────────────────────────────────────────

export function useOutlets(filters: OutletFilters = {}) {
  return useSWR([SCOPES.outlets, filters], () => outletService.list(filters));
}

/** The paginated list behind the outlets table. */
export function useOutletPages(filters: OutletFilters = {}) {
  return useCursorPages<Outlet>(SCOPES.outlets, filters, (cursor) =>
    outletService.list({ ...filters, cursor }),
  );
}

export function useOutlet(id: string | undefined) {
  // `null` key means "do not fetch" — the documented SWR way to express a dependency that is not
  // ready, rather than firing a request for `/outlets/undefined`.
  return useSWR(id ? [SCOPES.outlet, id] : null, () => outletService.get(id!));
}

/**
 * Every outlet, for pickers, for resolving `outlet_id` to a name, and for the org chart.
 *
 * The networks and devices endpoints return `outlet_id` and nothing else, so without this the
 * networks table would either say "6e1f…" in its first column or fire one request per row. One
 * cached list is neither.
 *
 * **It walks the cursor to exhaustion**, which is the one thing separating this from a plain
 * `list({ limit: 200 })`. A picker missing the outlet you are looking for is a bad way to find
 * out about a page boundary, and the org chart makes it worse still: a board is a *map*, and an
 * outlet stranded on page two would be silently absent from its company's card — an absence that
 * reads as fact rather than as truncation. The walk is capped at `MAX_PAGES` so a paging bug on
 * the API side cannot spin here forever, and `hasMore` reports having hit that cap.
 *
 * `hasMore` therefore keeps the meaning every caller already reads it with — "there are outlets
 * you are not being shown" — while becoming very much harder to be true: 2,000 outlets against
 * an estate of 23. Surfaced rather than swallowed, so a caller can say so instead of quietly
 * listing a subset.
 *
 * **It returns no grouping.** `byEntityId` and `unassigned` used to live here, on the argument
 * that a grouping is a fact about the index rather than about the org chart. That argument
 * stopped holding when the board gained a second dimension: it now groups by `entity_id` or by
 * `brand_id` from one expression, which is what makes the two boards behave identically. Two
 * hand-written maps here would be two chances to bucket the null differently, and the difference
 * would surface as one board quietly disagreeing with the other.
 */

export function useOutletIndex() {
  const { data, error, isLoading } = useSWR(
    [SCOPES.outlets, "index"],
    () => listEvery((params) => outletService.list(params)),
    { revalidateOnFocus: false },
  );

  const outlets = React.useMemo(() => data?.items ?? [], [data]);

  const byId = React.useMemo(() => {
    const map = new Map<string, Outlet>();
    for (const outlet of outlets) map.set(outlet.id, outlet);
    return map;
  }, [outlets]);

  return {
    outlets,
    byId,
    hasMore: Boolean(data?.truncated),
    error,
    isLoading,
  };
}

/**
 * **Brand scopes go with every outlet write that can move `brand_id`.**
 *
 * `BrandRead.outlet_count` is computed server-side by counting outlets, so a write here changes
 * a *brand's* answer without touching a brand row — and nothing in the type system connects the
 * two. Without this, the brand detail page reads "2 outlets" over five chips: the chip list is
 * `SCOPES.outlets` and refreshes, while the count is `SCOPES.registryBrand` and does not.
 *
 * That is the shape AGENTS.md calls out on the review queue — *"a `2 of 1` badge where the
 * summary had refetched and the list had not"* — and it was live here until the Stage 3 browser
 * pass, having passed lint, typecheck and build. A derived aggregate belongs to whatever it is
 * derived *from*, not to the table it is served on.
 */
const BRAND_SCOPES = [SCOPES.registryBrands, SCOPES.registryBrand] as const;

/**
 * The open contracts a close of this outlet would dispose of, for the disposition dialog.
 *
 * `enabled` gates the fetch: a null key while the dialog is shut means "do not fetch", the
 * documented SWR way — an array key holding the id fetches however shut the dialog is, which
 * is a request per outlet row nobody is looking at. Revalidate-on-focus off: the set is read
 * once when the dialog opens and the user acts on it; a refetch mid-decision would reshuffle
 * the list under them.
 */
export function useOutletRelatedContracts(id: string | undefined, enabled: boolean) {
  return useSWR(id && enabled ? [SCOPES.outlet, id, "related-contracts"] : null, () =>
    outletService.relatedContracts(id!),
  );
}

export function useOutletMutations() {
  const invalidate = useInvalidate();

  const create = React.useCallback(
    async (data: OutletCreate) => {
      const created = await outletService.create(data);
      await invalidate(SCOPES.outlets, ...BRAND_SCOPES);
      return created;
    },
    [invalidate],
  );

  const update = React.useCallback(
    async (id: string, data: OutletUpdate) => {
      const updated = await outletService.update(id, data);
      // Both outlet scopes: the row in the table and the record on the detail page are two cache
      // entries holding the same truth, and refreshing one leaves the other lying. Brands for the
      // same reason one table over — see above.
      await invalidate(SCOPES.outlets, SCOPES.outlet, ...BRAND_SCOPES);
      return updated;
    },
    [invalidate],
  );

  const replaceAttributes = React.useCallback(
    async (id: string, attributes: string[]) => {
      const updated = await outletService.replaceAttributes(id, attributes);
      // No brand scopes: attributes cannot move `brand_id`, so no brand count can change.
      await invalidate(SCOPES.outlets, SCOPES.outlet);
      return updated;
    },
    [invalidate],
  );

  const close = React.useCallback(
    async (id: string, data: OutletCloseBody) => {
      const closed = await outletService.close(id, data);
      // Contracts too: a close ceases / re-assigns / orphans them, so the contracts table and
      // any open contract record are now stale — the whole point of the operation.
      await invalidate(
        SCOPES.outlets,
        SCOPES.outlet,
        SCOPES.contracts,
        SCOPES.contract,
        ...BRAND_SCOPES,
      );
      return closed;
    },
    [invalidate],
  );

  const remove = React.useCallback(
    async (id: string) => {
      await outletService.remove(id);
      await invalidate(SCOPES.outlets, SCOPES.outlet, ...BRAND_SCOPES);
    },
    [invalidate],
  );

  return { create, update, close, replaceAttributes, remove };
}

// ── Entities ───────────────────────────────────────────────────────────────────────────

export function useEntities(params: Parameters<typeof entityService.list>[0] = {}) {
  return useSWR([SCOPES.entities, params], () => entityService.list(params));
}

export function useEntityPages(params: Parameters<typeof entityService.list>[0] = {}) {
  return useCursorPages<Entity>(SCOPES.entities, params, (cursor) =>
    entityService.list({ ...params, cursor }),
  );
}

export function useEntity(id: string | undefined) {
  return useSWR(id ? [SCOPES.entity, id] : null, () => entityService.get(id!));
}

/**
 * Every entity, for the "holding entity" pickers on outlet forms, for resolving `entity_id` to a
 * name in the outlets table, and for the org chart's company cards.
 *
 * One request rather than an N+1 per row, and cached hard: a picker that refetches the company
 * list every time a form opens is noise.
 *
 * **It walks the cursor to exhaustion, exactly as `useOutletIndex` does** — see `listEvery` for
 * why the two have to agree. A single page was defensible while this only fed pickers, where a
 * missing company is at worst a visible gap in a dropdown. It stopped being defensible the moment
 * the org chart drew a *map* from it, and for one release it was left behind: the outlet half was
 * rebuilt to walk and this half was not.
 *
 * `hasMore` reports having hit the page cap. The org chart is the first caller to read it, and
 * says so on screen rather than quietly drawing a subset of the group.
 */
export function useEntityIndex() {
  const { data, error, isLoading } = useSWR(
    [SCOPES.entities, "index"],
    () => listEvery((params) => entityService.list(params)),
    { revalidateOnFocus: false },
  );

  // Memoised rather than `data?.items ?? []` inline: a fresh array on every render restarts every
  // consumer's `useMemo` that sorts or groups it, and the board sorts on every render.
  const entities = React.useMemo(() => data?.items ?? [], [data]);

  const byId = React.useMemo(() => {
    const map = new Map<string, Entity>();
    for (const entity of entities) map.set(entity.id, entity);
    return map;
  }, [entities]);

  return {
    entities,
    byId,
    hasMore: Boolean(data?.truncated),
    error,
    isLoading,
  };
}

export function useEntityMutations() {
  const invalidate = useInvalidate();

  // Brand scopes for the same reason as outlets, one column over: `BrandRead.entity_count` is
  // computed by counting entities.
  const create = React.useCallback(
    async (data: EntityCreate) => {
      const created = await entityService.create(data);
      await invalidate(SCOPES.entities, ...BRAND_SCOPES);
      return created;
    },
    [invalidate],
  );

  const update = React.useCallback(
    async (id: string, data: EntityUpdate) => {
      const updated = await entityService.update(id, data);
      await invalidate(SCOPES.entities, SCOPES.entity, ...BRAND_SCOPES);
      return updated;
    },
    [invalidate],
  );

  const close = React.useCallback(
    async (id: string, data: EntityCloseBody) => {
      const closed = await entityService.close(id, data);
      // Outlets (transferred or closed) and contracts (disposed) both move under an entity
      // close, alongside the entity's own two scopes.
      await invalidate(
        SCOPES.entities,
        SCOPES.entity,
        SCOPES.outlets,
        SCOPES.outlet,
        SCOPES.contracts,
        SCOPES.contract,
        ...BRAND_SCOPES,
      );
      return closed;
    },
    [invalidate],
  );

  const remove = React.useCallback(
    async (id: string) => {
      await entityService.remove(id);
      // Outlets too: an outlet row shows its entity's name, and a deleted company must not keep
      // appearing under one.
      await invalidate(SCOPES.entities, SCOPES.entity, SCOPES.outlets, ...BRAND_SCOPES);
    },
    [invalidate],
  );

  return { create, update, close, remove };
}
