import { apiFetch, query } from "@/lib/api/client";
import type {
  Page,
  ServiceCategory,
  Vendor,
  VendorContactInput,
  VendorCreate,
  VendorKind,
  VendorListItem,
  VendorStatus,
  VendorUpdate,
} from "@/lib/api/types";

/**
 * **The Operations Hub's vendor book** — the companies `fixtures/agencies.ts` and
 * `fixtures/contracts.ts` invented, answered from `mock.ts`.
 *
 * It was `features/vendors` until BrandFactory's vendor needed the plain word, and the
 * rename is `features/registry-brands`' exactly: same folder-plus-cache-scope move, same
 * reason, and **not one line of this folder's behaviour changed with it**. `VendorRead` is
 * still snake_case, still carries a `kind` and a `ServiceCategory` of building trades, and
 * still comes from the frozen `schema.d.ts`.
 *
 * **It is still live.** `/contracts` resolves every `contract.vendor_id` to a name through
 * `useVendorIndex`, and the review queue creates a contact against a vendor — which is why
 * this is a rename rather than a deletion. The sixteen fixture agreements name these nine
 * companies by *their* ids, so the real vendors cannot serve that screen.
 *
 * Split out of `features/contracts` when vendors became a top-level area. The two stay
 * neighbours rather than one thing: a vendor is a company we have a relationship with,
 * a contract is one agreement with it, and the questions ops asks about each ("is this
 * relationship live" vs "when does this expire") are different questions.
 *
 * `useVendorContracts` deliberately did **not** come along — it fetches *contracts*
 * filtered by vendor, so it stays in `features/contracts/hooks.ts` and this feature
 * imports it. A second contracts query living here is how two definitions of "this
 * vendor's contracts" start.
 */

export const vendorService = {
  list: (
    params: {
      // `service_provider | landlord`. Omitted returns every kind, which is what `useVendorIndex`
      // relies on to resolve landlord names — and what the `/vendors` screen now sends: marketing
      // buys from no landlords, so that screen dropped the dimension rather than pinning it to
      // one value. The parameter stays for the tenancy screens, which narrow to landlords.
      kind?: VendorKind;
      status?: VendorStatus;
      // A closed vocabulary since 0.16.0 — the API answers an unknown value with a 422
      // rather than an empty page, so a `string` here would be a lie the caller pays for.
      category?: ServiceCategory;
      q?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ) => apiFetch<Page<VendorListItem>>(`/vendors${query(params)}`),

  /** `VendorListItem`, not `Vendor` — the detail route carries the same four contract
   * aggregates the list does, so a page fetched by id can render the summary line the
   * sheet built from a row. The write paths below still answer with `Vendor`. */
  get: (id: string) => apiFetch<VendorListItem>(`/vendors/${id}`),

  create: (data: VendorCreate) =>
    apiFetch<Vendor>("/vendors", { method: "POST", body: JSON.stringify(data) }),

  update: (id: string, data: VendorUpdate) =>
    apiFetch<Vendor>(`/vendors/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  /** PUT — the complete contact list; the primary swap must be one request. */
  replaceContacts: (id: string, contacts: VendorContactInput[]) =>
    apiFetch<Vendor>(`/vendors/${id}/contacts`, {
      method: "PUT",
      body: JSON.stringify({ contacts }),
    }),

  remove: (id: string) => apiFetch<void>(`/vendors/${id}`, { method: "DELETE" }),
};
