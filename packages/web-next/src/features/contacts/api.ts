import { apiFetch, query } from "@/lib/api/client";
import type {
  Contact,
  ContactCreate,
  ContactUpdate,
  Page,
  ServiceCategory,
} from "@/lib/api/types";

/**
 * The operations address book. The same `contact` rows the vendor sheet manages as a
 * whole set, edited here one at a time — plus standalone entries with no vendor.
 */

export type ContactFilters = {
  vendor_id?: string;
  /** The vendor's trade, reached by joining through `vendor`. A closed vocabulary — an
   *  unknown value is a 422, not an empty page. */
  category?: ServiceCategory;
  /** Contacts belonging to no vendor. **`true` or absent, never `false`** — the API takes
   *  `bool | None` and `false` means unfiltered, so sending it would be a filter that
   *  reads as switched off (the `?notice_gap=false` defect, 0.12.1). */
  unlinked?: true;
  q?: string;
  cursor?: string;
  limit?: number;
};

export const contactService = {
  list: (params: ContactFilters = {}) =>
    apiFetch<Page<Contact>>(`/contacts${query(params)}`),

  get: (id: string) => apiFetch<Contact>(`/contacts/${id}`),

  create: (data: ContactCreate) =>
    apiFetch<Contact>("/contacts", { method: "POST", body: JSON.stringify(data) }),

  update: (id: string, data: ContactUpdate) =>
    apiFetch<Contact>(`/contacts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  remove: (id: string) => apiFetch<void>(`/contacts/${id}`, { method: "DELETE" }),
};
