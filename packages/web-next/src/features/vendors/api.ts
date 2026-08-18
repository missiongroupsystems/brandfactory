import type {
  CreateVendorInput,
  UpdateVendorInput,
  Vendor,
} from "@brandfactory/shared";

import { bf, callJson } from "@/lib/api/bf-client";

/**
 * Vendors — the companies the workspace buys from, read and written against the Hono server.
 *
 * **Not `features/registry-vendors/`.** That folder is the Operations Hub's vendor book: it is
 * `VendorRead` out of the frozen `schema.d.ts`, snake_case, it carries a `kind` and a
 * `ServiceCategory` of thirteen building trades, and it is answered from `lib/api/mock.ts`. It
 * is still live, because `/contracts` resolves every `contract.vendor_id` to a name through its
 * `useVendorIndex` and the review queue creates a contact against one. The two share the word
 * and nothing else — the same split `features/outlets` / `features/registry` and
 * `features/brands` / `features/registry-brands` already make, and the reason Phase C renamed
 * that folder before this one took the name.
 *
 * **Workspace-scoped, because the record is.** `GET /workspaces/:workspaceId/vendors` is the
 * only list route; there is no `GET /vendors` on this server. A vendor's brands are a join
 * table rather than its parent — see `vendor/vendor.ts` in `@brandfactory/shared` for why, and
 * for why a company nobody has assigned yet is a fact rather than a gap.
 *
 * **A vendor's contacts ride in this call.** There is no `PUT /vendors/:id/contacts` here: the
 * list is a full replacement on create and on patch, the same call `brandIds` makes. That is
 * also what makes swapping the primary contact one request rather than two — see
 * `VendorContactsSchema`.
 *
 * The paths below are checked against the server's own route tree at compile time — `bf` is
 * `hc<AppType>`, and `AppType` is inferred from the chained `.route()` calls in
 * `packages/server/src/app.ts`. A renamed segment is a type error here, not a 404 in a browser.
 */
export const vendorService = {
  /**
   * Every vendor in the workspace, in name order.
   *
   * **A plain array, not a page, and no filter parameters at all.** `useVendorPages`,
   * `useCursorPages`, the `LoadMore` footer and `Page<VendorListItem>` are all gone with the
   * Ops copy: the route returns one array, there is no cursor to exhaust and nothing on the
   * server to narrow.
   *
   * That is what lets the screen state a total and what makes the search box and the three
   * selects honest — they narrow an array the client holds completely. The tripwire is in
   * `listVendorsByWorkspace`: past roughly 150 rows a keyset cursor on `(name, id)` and the SQL
   * filters land **together**, because a paginated list with client-side filters is the failure
   * `AGENTS.md` bans by name.
   *
   * **Alphabetical, and not by anything derived.** A directory is read by arriving with a name
   * and looking for its row — the opposite of the influencer roster, which leads with reach
   * because it is read as a budget conversation.
   */
  list: async (workspaceId: string): Promise<Vendor[]> =>
    callJson<Vendor[]>(
      await bf.workspaces[":workspaceId"].vendors.$get({ param: { workspaceId } }),
    ),

  /**
   * One vendor by **slug or id**. `GET /workspaces/:id/vendors/:ref` resolves either, which is
   * what lets a link degrade: a row that fetched the whole vendor emits the readable form, and
   * anything holding only an id still resolves.
   *
   * `useVendor(ref)` and `/vendors/[slug]` read it. Every method in this object has a caller as
   * of Phase F, which is the phase the service layer was written whole for.
   */
  get: async (workspaceId: string, vendorRef: string): Promise<Vendor> =>
    callJson<Vendor>(
      await bf.workspaces[":workspaceId"].vendors[":vendorRef"].$get({
        param: { workspaceId, vendorRef },
      }),
    ),

  /**
   * Answers `201` with the row, slug and all — the slug is chosen server-side from the name.
   *
   * Two refusals this can take are about the body rather than the path: a brand this workspace
   * does not hold is a 400 `BRAND_NOT_IN_WORKSPACE`, and a UEN already on another vendor is a
   * 409 `VENDOR_UEN_TAKEN`. A duplicate *name* is neither — a company name is not an
   * identifier, so the slug takes a `-2` and the row lands.
   */
  create: async (workspaceId: string, input: CreateVendorInput): Promise<Vendor> =>
    callJson<Vendor>(
      await bf.workspaces[":workspaceId"].vendors.$post({
        param: { workspaceId },
        json: input,
      }),
    ),

  /**
   * A real partial patch: an omitted key is left alone and an explicit `null` clears it.
   *
   * `brandIds` and `contacts` are the exceptions and are **full replacements** — the client
   * holds the whole set and sends the whole set, the same call `attributes` makes on an outlet.
   *
   * Strictly an id, unlike {@link get}: a caller holding a slug has already read the row it is
   * patching.
   */
  update: async (
    workspaceId: string,
    vendorId: string,
    input: UpdateVendorInput,
  ): Promise<Vendor> =>
    callJson<Vendor>(
      await bf.workspaces[":workspaceId"].vendors[":vendorRef"].$patch({
        param: { workspaceId, vendorRef: vendorId },
        json: input,
      }),
    ),

  /** Hard delete, answering with the row that went — brand links and contacts included. */
  remove: async (workspaceId: string, vendorId: string): Promise<Vendor> =>
    callJson<Vendor>(
      await bf.workspaces[":workspaceId"].vendors[":vendorRef"].$delete({
        param: { workspaceId, vendorRef: vendorId },
      }),
    ),
};
