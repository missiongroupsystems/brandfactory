"use client";

import type { CreateDeckInput, CreateDeckVersionInput } from "@brandfactory/shared";
import * as React from "react";
import useSWR from "swr";

import { SCOPES, useInvalidate } from "@/lib/api/cache";

import { deckService, type DeckWithVersions } from "./api";

/**
 * A brand's decks, each carrying its own version stack and `current`.
 *
 * **The id comes from the route, not from `useActiveBrand`** — `useResources`'s reason applies
 * unchanged: `/brands/:id/decks` already names the brand in the path.
 *
 * `undefined` while `brandId` is not yet known, expressed with a `null` key rather than an array
 * holding an empty id — the same "an SWR array key is truthy however empty its contents" rule
 * `useResources` follows.
 */
export function useDecks(brandId: string | undefined) {
  const { data, error, isLoading } = useSWR<DeckWithVersions[]>(
    brandId ? [SCOPES.bfDecks, brandId] : null,
    () => deckService.list(brandId!),
    { revalidateOnFocus: false },
  );

  return {
    decks: data ?? [],
    isLoading,
    error,
  };
}

/**
 * Create a deck — the one mutation 2E needs. On `useResourceMutations`' shape: a plain async
 * function that calls the service and then invalidates by scope. **Nothing is optimistic**, the
 * same rule every mutation hook in this package follows: a deck the server has not yet answered
 * for is not a deck this page shows.
 */
const DECK_SCOPES = [SCOPES.bfDecks];

export function useDeckMutations(brandId: string | undefined) {
  const invalidate = useInvalidate();

  const create = React.useCallback(
    async (input: CreateDeckInput) => {
      if (!brandId) throw new Error("No brand resolved");
      const created = await deckService.create(brandId, input);
      await invalidate(...DECK_SCOPES);
      return created;
    },
    [invalidate, brandId],
  );

  const addVersion = React.useCallback(
    async (deckId: string, input: CreateDeckVersionInput) => {
      if (!brandId) throw new Error("No brand resolved");
      const updated = await deckService.addVersion(brandId, deckId, input);
      await invalidate(...DECK_SCOPES);
      return updated;
    },
    [invalidate, brandId],
  );

  return { create, addVersion };
}
