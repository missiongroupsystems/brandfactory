"use client";

import { SCOPES } from "@/lib/api/cache";
import { useCursorPages } from "@/lib/api/use-cursor-pages";
import type { Influencer } from "@/lib/api/types";

import { influencerService, type InfluencerFilters } from "./api";

export function useInfluencerPages(filters: InfluencerFilters = {}) {
  return useCursorPages<Influencer>(SCOPES.influencers, filters, (cursor) =>
    influencerService.list({ ...filters, cursor }),
  );
}

/**
 * There is no `useInfluencerMutations`, and that is deliberate rather than unfinished.
 *
 * Every mutation in this app invalidates by scope and then renders the server's answer, because
 * the API applies domain rules the client cannot predict. There is no API here — `mock.ts`
 * refuses an unregistered write with a 503 — so a mutations hook would be three functions that
 * exist only to surface that refusal as a toast. The screen's create button says what is true
 * instead: nothing is stored yet.
 *
 * It arrives with the route, not before it.
 */
