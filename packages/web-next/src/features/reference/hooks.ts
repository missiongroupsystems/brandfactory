"use client";

import useSWR from "swr";

import { referenceService } from "./api";

/**
 * Reference data changes only when the seed file does, so it is cached hard: no refetch on
 * focus, no refetch on reconnect. Revalidating the twenty attribute keys every time someone
 * alt-tabs would be pure noise.
 */
const STATIC = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: false,
} as const;

export function useOutletAttributes() {
  return useSWR("reference/outlet-attributes", referenceService.outletAttributes, STATIC);
}

export function useConfidenceLevels() {
  return useSWR("reference/confidence-levels", referenceService.confidenceLevels, STATIC);
}
