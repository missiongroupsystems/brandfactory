# Photography Phase 3B — the categories

**Migration:** 0020 — one table, one nullable FK. **Wire:** four new routes, plus one new key on
the asset patch. **New dependency:** none.

## A table, not an enum — and the contrast with Resources is the argument

The request is explicit:

> The category set must be editable, because subjects differ per brand.

Nothing like that is said about a Resource's type, and one plan over that field **is** a `pgEnum`.
The two calls are opposite because the facts are: the shapes of link a brand keeps are the same for
every brand, and the subjects it photographs are not. Migration 0011 records what the enum route
would cost per edit — its own file, and no `UPDATE` in that batch may name the new value.

## `category_id` is nullable, and `null` is a bucket rather than a blank

Every photo in `brand_assets` when this column arrived has no category, and **no rule could give it
one**. `defaultLibraryFor` could derive a shelf from `kind` and `role` because purpose was
recoverable from the bytes; nothing recovers *interior* from a PNG. A backfill would be a guess
written into a column — the failure `library.ts` opens by describing.

So *Uncategorised* is a real bucket the grid shows, not an empty state it hides. A view that hid
`null` would have hidden the entire existing library on the day this shipped.

On the patch, **absent and `null` are different writes**: absent leaves the filing alone, `null` is
a bucket somebody chose. `updateAsset` branches on `undefined` for exactly that, and there is a
route test that renames a photo and asserts its category survived.

## Deleting a category keeps the photos

`ON DELETE SET NULL`. A subject bucket is a filing decision, and undoing one must not destroy what
was filed — which is the whole reason a delete is safe to offer at all. It has its own route test,
because the effect lands on rows the reader is not looking at, and 3C owes them a count before it
happens.

## No CHECK against `library`, and that is a decision

Nothing stops a photography category attaching to a logo on the identity shelf. `brand_assets` does
reach for a CHECK when an invariant spans columns — `brand_assets_source_exactly_one` — and it also
records when not to: `brands.website_url` has none, because the rule has one enforcement point and
no second writer. This is the second case. Only the photography screen writes a category, and a
stray one is invisible rather than corrupting: an identity asset with a category renders exactly as
it does today.

Recorded here rather than left silent, so the next reader knows it was weighed. Revisit if a second
writer appears.

## No unique constraint on `(brand_id, name)`

A team that wants "Food" and "Food (styled)" is not making a mistake, and the one real duplicate is
cheaper to fix by renaming than to prevent with a constraint that would 500 the first time somebody
hit it.

## One thing this phase re-learned the hard way

The router was written, the `Db` facade extended, the fake updated, and everything typechecked —
because **nothing was chained into `app.ts`**. The plan warns that an unchained router is "a missing
property on a type, not a 404"; here it was a 404, because the route test calls `app.request` with a
literal path rather than through `hc<AppType>`. Both symptoms are silent in a different way, and the
edit that caused it was a search-and-replace whose anchor did not match this branch's wiring.

## Not in this phase

**No management UI** — that is 3C. **No grid** — 3D. The categories are reachable through the API
and through nothing else.
