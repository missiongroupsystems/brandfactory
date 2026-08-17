"use client";

import * as React from "react";
import useSWR from "swr";

import { SCOPES, useInvalidate } from "@/lib/api/cache";
import { useCursorPages } from "@/lib/api/use-cursor-pages";
import type { TenancyCreate, TenancyUpdate } from "@/lib/api/types";

import { tenancyService, type TenancyFilters, type TenancyRecord } from "./api";

export type { TenancyFilters };

export function useTenancyPages(filters: TenancyFilters = {}) {
  return useCursorPages<TenancyRecord>(SCOPES.tenancies, filters, (cursor) =>
    tenancyService.list({ ...filters, cursor }),
  );
}

export function useTenancy(id: string | undefined) {
  return useSWR(id ? [SCOPES.tenancy, id] : null, () => tenancyService.get(id!));
}

/** A single-page list, for the outlet detail card. Not paginated — an outlet has a handful of
 * leases at most, and `limit: 200` fetches them all. */
export function useTenancies(filters: TenancyFilters = {}) {
  return useSWR([SCOPES.tenancies, filters], () => tenancyService.list(filters));
}

/** The engine's obligations against one lease, for the option/renewal card. Null key when
 * there is no id, because an SWR array key is truthy however empty its contents. */
export function useTenancyObligations(id: string | undefined) {
  return useSWR(id ? [SCOPES.obligations, "tenancy", id] : null, () =>
    tenancyService.obligations(id!),
  );
}

// A tenancy write can move the dashboard (option deadlines, expiry decisions, deposit-guarantee
// renewals) as well as every tenancy surface.
const TENANCY_SCOPES = [SCOPES.tenancies, SCOPES.tenancy, SCOPES.obligations, SCOPES.dashboard];

export function useTenancyMutations() {
  const invalidate = useInvalidate();

  const create = React.useCallback(
    async (data: TenancyCreate) => {
      const created = await tenancyService.create(data);
      await invalidate(...TENANCY_SCOPES);
      return created;
    },
    [invalidate],
  );

  const update = React.useCallback(
    async (id: string, data: TenancyUpdate) => {
      const updated = await tenancyService.update(id, data);
      await invalidate(...TENANCY_SCOPES);
      return updated;
    },
    [invalidate],
  );

  return { create, update };
}
