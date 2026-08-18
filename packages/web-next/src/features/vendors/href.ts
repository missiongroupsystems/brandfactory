/**
 * The link to a vendor's page — their slug when the caller holds it, their id
 * otherwise.
 *
 * `GET /workspaces/:workspaceId/vendors/:ref` resolves a slug *or* a raw id, so
 * both forms land on the same page. That is what lets this degrade cleanly: a
 * table row that fetched the whole vendor emits the readable
 * `/vendors/northlight-talent-pte-ltd`, while anything carrying only an id passes
 * the bare id and still resolves. Neither is a redirect dependency — the id→slug
 * rewrite on the page is cosmetic.
 *
 * **In `features/vendors/` rather than in `lib/`**, on `influencerHref`'s
 * argument: `outletHref` sits in `lib/` because four feature folders emit outlet
 * links, and there is one screen linking to a vendor. AGENTS.md's promotion rule
 * applies as written — something reaches `lib/` once two features use it.
 *
 * **It must not be given a `VendorListItem`.** The Operations Hub's vendor book
 * has ids of its own and its rows carry no slug at all, so a call from
 * `features/registry-vendors` would compile against the string overload and emit
 * `/vendors/<ops-id>` — a link into this page for a record this server does not
 * hold. That folder does not link to a vendor page and must not start.
 */
export function vendorHref(vendor: { id: string; slug: string } | string): string {
  if (typeof vendor === "string") return `/vendors/${vendor}`;
  // `slug` is `not null` in the column and the server chooses it at create, so the
  // fallback is defensive rather than expected. It exists because the alternative
  // is `/vendors/undefined`, which resolves to a 404 page with no way to tell a bad
  // link from a deleted vendor.
  return `/vendors/${vendor.slug || vendor.id}`;
}
