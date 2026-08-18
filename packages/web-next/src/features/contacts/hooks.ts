"use client";

import * as React from "react";

import { SCOPES, useInvalidate } from "@/lib/api/cache";
import type { ContactCreate, ContactUpdate } from "@/lib/api/types";

import { contactService } from "./api";

/**
 * **This folder has no screen any more, and what is left is deliberately only the writes.**
 *
 * `/contacts` was the Operations Hub's address book, and the Influencers nav item pointed at it
 * for three releases — a creator filed under the talent agency holding their contract. That
 * screen is now `features/influencers/`, on its own record and its own route, so
 * `contacts-browser.tsx`, `contact-search.tsx`, `contact-form.tsx` and `useContactPages` are all
 * gone with it.
 *
 * The mutations stay because two other features still call them: the tenancy intake sheet creates
 * the landlord's contact as part of taking a lease, and the review queue's actions fill in a
 * contact a migration could not confirm. Both create a person **against a vendor**, which is what
 * this address book always was and is a perfectly good model for a landlord or a building
 * manager. It was only ever the wrong model for a creator.
 *
 * `contactService.list` and `get` stay on the service layer for those routes' sake and have no
 * caller here. Delete this folder when those two features go, not before.
 */

// A contact write can move a vendor row too: the same records ride embedded in
// `VendorRead.contacts`, so the vendors table's "Primary contact" column and the vendor
// sheet's list are cache entries holding the same truth.
const CONTACT_SCOPES = [SCOPES.contacts, SCOPES.contact, SCOPES.registryVendors, SCOPES.registryVendor];

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
