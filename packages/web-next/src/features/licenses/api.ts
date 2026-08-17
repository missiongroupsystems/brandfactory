import { apiFetch, query } from "@/lib/api/client";
import type {
  Confidence,
  HolderLevel,
  License,
  LicenseCreate,
  LicenseExpiring,
  LicenseRequirement,
  LicenseRequirementCreate,
  LicenseRequirementUpdate,
  LicenseStatus,
  LicenseSuggestion,
  LicenseType,
  LicenseUpdate,
  Necessity,
  Page,
  Readiness,
  RequirementStatus,
} from "@/lib/api/types";

/**
 * The licences area: the reference library (read-only — it is the seed file's loaded
 * form, and an edit here would be reverted by the next seed run), requirements
 * (capability A) and held licences (capability C).
 */

export type LicenseTypeFilters = {
  family?: string;
  issuing_authority?: string;
  holder_level?: HolderLevel;
  necessity?: Necessity;
  confidence?: Confidence;
  category?: string;
  q?: string;
  cursor?: string;
  limit?: number;
};

export type RequirementFilters = {
  outlet_id?: string;
  entity_id?: string;
  license_type_id?: string;
  status?: RequirementStatus;
  necessity?: Necessity;
  cursor?: string;
  limit?: number;
};

export type LicenseFilters = {
  outlet_id?: string;
  entity_id?: string;
  license_type_id?: string;
  status?: LicenseStatus;
  q?: string;
  cursor?: string;
  limit?: number;
};

export type ExpiringFilters = {
  outlet_id?: string;
  /** Default true on the API; the tab sends `false` to hide already-expired licences. */
  include_expired?: boolean;
};

export const licenseTypeService = {
  list: (params: LicenseTypeFilters = {}) =>
    apiFetch<Page<LicenseType>>(`/license-types${query(params)}`),

  get: (id: string) => apiFetch<LicenseType>(`/license-types/${id}`),
};

export const suggestionService = {
  list: (outletId: string) =>
    apiFetch<LicenseSuggestion[]>(`/outlets/${outletId}/license-suggestions`),

  /** Bulk acceptance by type key. Types already tracked (any status) are skipped, so
   * accepting the same page twice is harmless and a dismissal is never reversed. */
  accept: (outletId: string, keys: string[]) =>
    apiFetch<LicenseRequirement[]>(`/outlets/${outletId}/license-suggestions/accept`, {
      method: "POST",
      body: JSON.stringify({ keys }),
    }),
};

export const requirementService = {
  list: (params: RequirementFilters = {}) =>
    apiFetch<Page<LicenseRequirement>>(`/license-requirements${query(params)}`),

  create: (data: LicenseRequirementCreate) =>
    apiFetch<LicenseRequirement>("/license-requirements", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: LicenseRequirementUpdate) =>
    apiFetch<LicenseRequirement>(`/license-requirements/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  readiness: (outletId: string) =>
    apiFetch<Readiness>(`/outlets/${outletId}/license-readiness`),
};

export const licenseService = {
  list: (params: LicenseFilters = {}) => apiFetch<Page<License>>(`/licenses${query(params)}`),

  /** The whole expiring+expired set, live and soonest-first — a dedicated aggregate, not a
   * filter on the paginated list (which could not sort across pages). Mirrors `/service-health`. */
  expiring: (params: ExpiringFilters = {}) =>
    apiFetch<LicenseExpiring[]>(`/licenses/expiring${query(params)}`),

  get: (id: string) => apiFetch<License>(`/licenses/${id}`),

  create: (data: LicenseCreate) =>
    apiFetch<License>("/licenses", { method: "POST", body: JSON.stringify(data) }),

  update: (id: string, data: LicenseUpdate) =>
    apiFetch<License>(`/licenses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  linkRequirement: (id: string, requirementId: string) =>
    apiFetch<License>(`/licenses/${id}/link-requirement`, {
      method: "POST",
      body: JSON.stringify({ requirement_id: requirementId }),
    }),
};
