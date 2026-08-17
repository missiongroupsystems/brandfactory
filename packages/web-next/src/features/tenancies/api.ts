import { apiFetch, query } from "@/lib/api/client";
import type {
  Obligation,
  Page,
  Tenancy,
  TenancyCreate,
  TenancyExtractionResponse,
  TenancySensitive,
  TenancyStatus,
  TenancyUpdate,
  TenancyView,
} from "@/lib/api/types";

/**
 * Tenancy agreements — the leases behind the doors.
 *
 * A tenancy response arrives as one of two shapes: narrow with `hasTenancyRent()`, never a
 * null test, the same discipline the network passwords and `contract.value` follow. The
 * landlord is a `vendor` with `kind = landlord`, referenced by `landlord_id` and fetched
 * through `features/vendors`; this file never fetches it.
 */

export type TenancyRecord = Tenancy | TenancySensitive;

export type TenancyFilters = {
  outlet_id?: string;
  status?: TenancyStatus;
  landlord_id?: string;
  /** Leases whose term ends on or before this ISO date — the expiring-window worklist. */
  expiring_before?: string;
  /**
   * Only leases with an option to renew and no notice period recorded — the same rows Stage 9
   * raises as `tenancy_option_notice_missing`, from the same backend predicate.
   *
   * **`true` or absent, never `false`.** `query()` stringifies whatever it is given, so a
   * `false` becomes a literal `?option_gap=false` — harmless to the API (read as "do not
   * narrow") but a filter that *looks* set in a shared link. The caller passes `undefined` off.
   */
  option_gap?: true;
  /** Omitted means the API default, `current` — live occupancy, no drafts, no resolved history. */
  view?: TenancyView;
  cursor?: string;
  limit?: number;
};

export const tenancyService = {
  list: (params: TenancyFilters = {}) =>
    apiFetch<Page<TenancyRecord>>(`/tenancies${query(params)}`),

  get: (id: string) => apiFetch<TenancyRecord>(`/tenancies/${id}`),

  create: (data: TenancyCreate) =>
    apiFetch<TenancyRecord>("/tenancies", { method: "POST", body: JSON.stringify(data) }),

  update: (id: string, data: TenancyUpdate) =>
    apiFetch<TenancyRecord>(`/tenancies/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  /** The obligations the engine generates against this lease — the option deadline, the
   * expiry decision, the deposit-guarantee renewal. Read-only here; the dashboard owns the
   * actions on them. */
  obligations: (id: string) =>
    apiFetch<Page<Obligation>>(
      `/obligations${query({ subject_type: "tenancy_agreement", subject_id: id, limit: 200 })}`,
    ),

  /** Ask the backend to read a lease PDF and propose the terms it contains. A proposal, not a
   * write — applying it is the ordinary PATCH. **503 while extraction is dark** (tas.md §4.4),
   * surfaced honestly by the review sheet. */
  extract: (id: string, attachmentId: string) =>
    apiFetch<TenancyExtractionResponse>(`/tenancies/${id}/extract`, {
      method: "POST",
      body: JSON.stringify({ attachment_id: attachmentId }),
    }),
};
