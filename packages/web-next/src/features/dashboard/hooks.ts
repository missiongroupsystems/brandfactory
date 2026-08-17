"use client";

import * as React from "react";
import useSWR from "swr";

import { SCOPES, useInvalidate } from "@/lib/api/cache";

import { dashboardService, obligationService } from "./api";

export function useDashboard(filters: { outlet_id?: string; entity_id?: string } = {}) {
  return useSWR([SCOPES.dashboard, filters], () => dashboardService.get(filters));
}

// Completing an obligation moves the dashboard; regenerating can move everything the
// engine derives from licences.
const OBLIGATION_SCOPES = [SCOPES.dashboard, SCOPES.obligations, SCOPES.licenses];

export function useObligationMutations() {
  const invalidate = useInvalidate();

  const complete = React.useCallback(
    async (id: string) => {
      const completed = await obligationService.complete(id);
      await invalidate(...OBLIGATION_SCOPES);
      return completed;
    },
    [invalidate],
  );

  const generate = React.useCallback(async () => {
    const report = await obligationService.generate();
    await invalidate(...OBLIGATION_SCOPES);
    return report;
  }, [invalidate]);

  return { complete, generate };
}
