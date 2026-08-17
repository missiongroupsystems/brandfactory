"use client";

import * as React from "react";
import useSWR from "swr";

import { SCOPES, useInvalidate } from "@/lib/api/cache";
import { useCursorPages } from "@/lib/api/use-cursor-pages";
import type {
  License,
  LicenseCreate,
  LicenseRequirement,
  LicenseRequirementCreate,
  LicenseRequirementUpdate,
  LicenseType,
  LicenseUpdate,
} from "@/lib/api/types";

import {
  licenseService,
  licenseTypeService,
  requirementService,
  suggestionService,
  type ExpiringFilters,
  type LicenseFilters,
  type LicenseTypeFilters,
  type RequirementFilters,
} from "./api";

/** Same shape as the registry hooks: `use*` subscribes, `use*Mutations` writes and
 * invalidates by scope. Nothing optimistic — the API applies domain rules (an expiry
 * that disagrees with the library refuses, a duplicate requirement conflicts) and the
 * server's answer is the only one worth rendering. */

// ── The library ────────────────────────────────────────────────────────────────────────

export function useLicenseTypePages(filters: LicenseTypeFilters = {}) {
  return useCursorPages<LicenseType>(SCOPES.licenseTypes, filters, (cursor) =>
    licenseTypeService.list({ ...filters, cursor }),
  );
}

/**
 * All 29 types in one cached fetch, for resolving `license_type_id` to a record in
 * requirement and licence tables — the same pattern as `useOutletIndex`, and the same
 * reason: the alternative is a request per row or a UUID in the first column.
 * The library is reference data and changes only on re-seed, so it is cached hard.
 */
export function useLicenseTypeIndex() {
  const { data, error, isLoading } = useSWR(
    [SCOPES.licenseTypes, "index"],
    () => licenseTypeService.list({ limit: 200 }),
    { revalidateOnFocus: false },
  );

  const byId = React.useMemo(() => {
    const map = new Map<string, LicenseType>();
    for (const type of data?.items ?? []) map.set(type.id, type);
    return map;
  }, [data]);

  return { types: data?.items ?? [], byId, error, isLoading };
}

// ── Suggestions ────────────────────────────────────────────────────────────────────────

export function useSuggestions(outletId: string | undefined) {
  return useSWR(outletId ? [SCOPES.suggestions, outletId] : null, () =>
    suggestionService.list(outletId!),
  );
}

// ── Requirements ───────────────────────────────────────────────────────────────────────

export function useRequirements(filters: RequirementFilters = {}) {
  return useSWR([SCOPES.requirements, filters], () => requirementService.list(filters));
}

export function useRequirementPages(filters: RequirementFilters = {}) {
  return useCursorPages<LicenseRequirement>(SCOPES.requirements, filters, (cursor) =>
    requirementService.list({ ...filters, cursor }),
  );
}

export function useReadiness(outletId: string | undefined) {
  return useSWR(outletId ? [SCOPES.readiness, outletId] : null, () =>
    requirementService.readiness(outletId!),
  );
}

// Requirements, suggestions and readiness are three projections of one truth, and the
// dashboard's gaps panel is a fourth. Refresh them together or one of them lies.
const REQUIREMENT_SCOPES = [
  SCOPES.requirements,
  SCOPES.suggestions,
  SCOPES.readiness,
  SCOPES.dashboard,
];

export function useRequirementMutations() {
  const invalidate = useInvalidate();

  const create = React.useCallback(
    async (data: LicenseRequirementCreate) => {
      const created = await requirementService.create(data);
      await invalidate(...REQUIREMENT_SCOPES);
      return created;
    },
    [invalidate],
  );

  const update = React.useCallback(
    async (id: string, data: LicenseRequirementUpdate) => {
      const updated = await requirementService.update(id, data);
      await invalidate(...REQUIREMENT_SCOPES);
      return updated;
    },
    [invalidate],
  );

  const acceptSuggestions = React.useCallback(
    async (outletId: string, keys: string[]) => {
      const created = await suggestionService.accept(outletId, keys);
      await invalidate(...REQUIREMENT_SCOPES);
      return created;
    },
    [invalidate],
  );

  return { create, update, acceptSuggestions };
}

// ── Held licences ──────────────────────────────────────────────────────────────────────

export function useLicensePages(filters: LicenseFilters = {}) {
  return useCursorPages<License>(SCOPES.licenses, filters, (cursor) =>
    licenseService.list({ ...filters, cursor }),
  );
}

export function useLicenses(filters: LicenseFilters = {}) {
  return useSWR([SCOPES.licenses, filters], () => licenseService.list(filters));
}

/**
 * The live Expiring tab: the whole expiring+expired set, soonest first, computed
 * server-side against today. Its own scope (`licenses-expiring`), so a buffer change
 * invalidates it without disturbing the paginated held-licences list, which the sweep —
 * not this read — moves.
 */
export function useExpiringLicenses(filters: ExpiringFilters = {}) {
  return useSWR([SCOPES.licensesExpiring, filters], () => licenseService.expiring(filters));
}

// A licence write moves readiness, gaps and (via the generator's next run) the
// obligation list; requirements because create auto-links the waiting one.
const LICENSE_SCOPES = [
  SCOPES.licenses,
  SCOPES.license,
  SCOPES.requirements,
  SCOPES.readiness,
  SCOPES.dashboard,
];

export function useLicenseMutations() {
  const invalidate = useInvalidate();

  const create = React.useCallback(
    async (data: LicenseCreate) => {
      const created = await licenseService.create(data);
      await invalidate(...LICENSE_SCOPES);
      return created;
    },
    [invalidate],
  );

  const update = React.useCallback(
    async (id: string, data: LicenseUpdate) => {
      const updated = await licenseService.update(id, data);
      await invalidate(...LICENSE_SCOPES);
      return updated;
    },
    [invalidate],
  );

  const linkRequirement = React.useCallback(
    async (id: string, requirementId: string) => {
      const updated = await licenseService.linkRequirement(id, requirementId);
      await invalidate(...LICENSE_SCOPES);
      return updated;
    },
    [invalidate],
  );

  return { create, update, linkRequirement };
}

/** One licence row for panels that already hold the list — kept for the detail page. */
export function useLicense(id: string | undefined) {
  return useSWR(id ? [SCOPES.license, id] : null, () => licenseService.get(id!));
}
