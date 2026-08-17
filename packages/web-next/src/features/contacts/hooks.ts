"use client";

import * as React from "react";

import { SCOPES, useInvalidate } from "@/lib/api/cache";
import { useCursorPages } from "@/lib/api/use-cursor-pages";
import type { Contact, ContactCreate, ContactUpdate } from "@/lib/api/types";

import { contactService, type ContactFilters } from "./api";

export function useContactPages(filters: ContactFilters = {}) {
  return useCursorPages<Contact>(SCOPES.contacts, filters, (cursor) =>
    contactService.list({ ...filters, cursor }),
  );
}

// A contact write can move a vendor row too: the same records ride embedded in
// `VendorRead.contacts`, so the vendors table's "Primary contact" column and the vendor
// sheet's list are cache entries holding the same truth.
const CONTACT_SCOPES = [SCOPES.contacts, SCOPES.contact, SCOPES.vendors, SCOPES.vendor];

export function useContactMutations() {
  const invalidate = useInvalidate();

  const create = React.useCallback(
    async (data: ContactCreate) => {
      const created = await contactService.create(data);
      await invalidate(...CONTACT_SCOPES);
      return created;
    },
    [invalidate],
  );

  const update = React.useCallback(
    async (id: string, data: ContactUpdate) => {
      const updated = await contactService.update(id, data);
      await invalidate(...CONTACT_SCOPES);
      return updated;
    },
    [invalidate],
  );

  const remove = React.useCallback(
    async (id: string) => {
      await contactService.remove(id);
      await invalidate(...CONTACT_SCOPES);
    },
    [invalidate],
  );

  return { create, update, remove };
}
