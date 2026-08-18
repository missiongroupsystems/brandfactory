/**
 * The link to a creator's page — their slug when the caller holds it, their id
 * otherwise.
 *
 * `GET /workspaces/:workspaceId/influencers/:ref` resolves a slug *or* a raw id,
 * so both forms land on the same page. That is what lets this degrade cleanly: a
 * table row that fetched the whole creator emits the readable
 * `/influencers/priyaskin`, while anything carrying only an id passes the bare id
 * and still resolves. Neither is a redirect dependency — the id→slug rewrite on
 * the page is cosmetic.
 *
 * **In `features/influencers/` rather than in `lib/`, unlike `outletHref`.** That
 * one is in `lib/` because four feature folders emit outlet links, and it is
 * structurally typed because there are two `Outlet` records in this app. There is
 * one creator record and one screen that links to it, so AGENTS.md's promotion
 * rule applies as written: something reaches `lib/` once two features use it.
 *
 * The structural signature is kept anyway, because it costs nothing and it is what
 * makes the id fallback expressible — a caller holding only an id does not have to
 * branch.
 */
export function influencerHref(influencer: { id: string; slug: string } | string): string {
  if (typeof influencer === "string") return `/influencers/${influencer}`;
  // `slug` is `not null` in the column and the server chooses it at create, so the
  // fallback is defensive rather than expected. It exists because the alternative
  // is `/influencers/undefined`, which resolves to a 404 page with no way to tell
  // a bad link from a deleted creator.
  return `/influencers/${influencer.slug || influencer.id}`;
}
