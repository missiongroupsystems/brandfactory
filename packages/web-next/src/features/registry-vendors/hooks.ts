"use client";

import * as React from "react";
import useSWR from "swr";

import { SCOPES, useInvalidate } from "@/lib/api/cache";
import { useCursorPages } from "@/lib/api/use-cursor-pages";
import type {
  Vendor,
  VendorContactInput,
  VendorCreate,
  VendorListItem,
  VendorUpdate,
} from "@/lib/api/types";

import { vendorService } from "./api";

export function useVendorPages(params: Parameters<typeof vendorService.list>[0] = {}) {
  return useCursorPages<VendorListItem>(SCOPES.registryVendors, params ?? {}, (cursor) =>
    vendorService.list({ ...params, cursor }),
  );
}

/** Every vendor, cached, for resolving `vendor_id` to a name in the contracts table —
 * the outlet-index pattern, third verse.
 *
 * Five screens in `features/contracts` and two in `features/contacts` read this, which
 * is why it is the most-imported thing the Operations Hub's vendor book owns. An id absent from
 * `byId` means the fetch is still in flight, never that the vendor does not exist —
 * every `vendor_id` is a real foreign key. Render `…`, not a dash. */
export function useVendorIndex() {
  const { data, error, isLoading } = useSWR(
    [SCOPES.registryVendors, "index"],
    () => vendorService.list({ limit: 200 }),
    { revalidateOnFocus: false },
  );

  const byId = React.useMemo(() => {
    const map = new Map<string, Vendor>();
    for (const vendor of data?.items ?? []) map.set(vendor.id, vendor);
    return map;
  }, [data]);

  return { vendors: data?.items ?? [], byId, error, isLoading };
}

/** One vendor by id, for the detail page.
 *
 * On `SCOPES.registryVendor`, which `useVendorMutations` already invalidates on update,
 * `replaceContacts` and `remove` — so an edit made from the page refreshes it without a
 * reload, and without this hook having to know that.
 *
 * Returns `VendorListItem`: since Stage 1 the detail route carries the same four contract
 * aggregates the list does, which is what lets a page fetched by id render the summary
 * line the sheet used to build from a row it was handed. */
export function useVendor(id: string | undefined) {
  return useSWR(id ? [SCOPES.registryVendor, id] : null, () => vendorService.get(id!));
}

export function useVendorMutations() {
  const invalidate = useInvalidate();

  // Vendor writes can carry contact rows (create embeds a list, the sheet's PUT
  // replaces one, delete cascades one), and those rows also render on /contacts —
  // so the contacts scope rides along.
  const create = React.useCallback(
    async (data: VendorCreate) => {
      const created = await vendorService.create(data);
      await invalidate(SCOPES.registryVendors, SCOPES.contacts);
      return created;
    },
    [invalidate],
  );

  const update = React.useCallback(
    async (id: string, data: VendorUpdate) => {
      const updated = await vendorService.update(id, data);
      await invalidate(SCOPES.registryVendors, SCOPES.registryVendor);
      return updated;
    },
    [invalidate],
  );

  const replaceContacts = React.useCallback(
    async (id: string, contacts: VendorContactInput[]) => {
      const updated = await vendorService.replaceContacts(id, contacts);
      await invalidate(SCOPES.registryVendors, SCOPES.registryVendor, SCOPES.contacts);
      return updated;
    },
    [invalidate],
  );

  const remove = React.useCallback(
    async (id: string) => {
      await vendorService.remove(id);
      await invalidate(SCOPES.registryVendors, SCOPES.registryVendor, SCOPES.contracts, SCOPES.contacts);
    },
    [invalidate],
  );

  return { create, update, replaceContacts, remove };
}
