/**
 * The link to an outlet's page — its slug when the caller holds it, its id
 * otherwise.
 *
 * `GET /workspaces/:workspaceId/outlets/:ref` resolves a slug *or* a raw id, so
 * both forms land on the same page. That is what lets this degrade cleanly: a
 * table row that fetched the whole outlet emits the readable
 * `/outlets/casa-vostra`, while anything carrying only an id from some other
 * payload passes the bare id and still resolves. Neither is a redirect dependency
 * — the id→slug rewrite on the page is cosmetic.
 *
 * **Structurally typed on `{id, slug}` rather than on either `Outlet`**, and
 * that is deliberate: there are two of them in this app. `@brandfactory/shared`'s
 * is the real record; `lib/api/types`' is the Operations Hub's, still rendered by
 * the fourteen cut-from-nav Ops screens. Both carry an `id` and a `slug`, both
 * point at the same route, and a signature naming one of them would make this
 * helper pick a side it does not need to pick.
 *
 * Accepts a bare id string too, so a call site does not have to branch on which
 * it happens to hold.
 *
 * **`basePath` exists because the same outlet has two homes.** Reached from a brand it lives at
 * `/brands/:id/outlets/:ref`, so the sidebar stays in that brand while you read one of its
 * locations; reached from the Dashboard or the review queue — screens that hold an outlet id and
 * no brand — it lives at `/outlets/:ref`. The default is the workspace-wide one, which is what
 * every existing caller wants and is why none of them changed.
 */
export function outletHref(
  outlet: { id: string; slug: string } | string,
  basePath = "/outlets",
): string {
  const ref = typeof outlet === "string" ? outlet : outlet.slug || outlet.id;
  return `${basePath}/${ref}`;
}
