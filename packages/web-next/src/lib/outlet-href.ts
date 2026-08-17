import type { Outlet } from "@/lib/api/types";

/**
 * The link to an outlet's homepage — its slug when the caller holds it, its id otherwise.
 *
 * `GET /outlets/{key}` resolves a slug *or* a raw id, so both forms land on the same page
 * (`domain/outlet_operations.get_outlet_by_ref`). That is what lets this degrade cleanly:
 * a table row that fetched the whole `Outlet` emits the readable `/outlets/casa-vostra`,
 * while the ~20 cross-area sites that carry only an `outlet_id` from some other payload
 * (dashboard, review, networks, licences, service reports) pass the bare id and still
 * resolve. Neither is a redirect dependency — the id→slug rewrite on the page is cosmetic.
 *
 * Accepts either the outlet (preferred — it carries the slug) or a bare id string, so a
 * call site does not have to branch on which it happens to hold.
 */
export function outletHref(outlet: Pick<Outlet, "id" | "slug"> | string): string {
  if (typeof outlet === "string") return `/outlets/${outlet}`;
  return `/outlets/${outlet.slug || outlet.id}`;
}
