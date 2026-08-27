# Photography Phase 3A — the pin, alone

**Migration:** 0019 — two columns on `brand_assets`, no index. **Wire:** two new routes.
**New dependency:** none.

## Why this ships by itself

Ask 3 is two features the request states as one, and it says where the seam is:

> The pin is a separate mark on the photo, not the manual drag order the library already supports.

That sentence is also the argument for shipping this alone. The pin touches `brand_assets` — one
wide table serving three shelves and read by two frontends — while the categories (3B) add a table
of their own. A shared-table change wants its own release to be wrong in.

## The defect this phase is built around

The obvious implementation is to teach `byPosition` about `isPinned`. **It is wrong, and quietly.**

`byPosition` has three callers: `assetsOfKind`, `assetsOfLibrary`, and `logoAsset`. The third fixes
a rule for the whole schema:

> First by `position` among active, which is the resolution rule for every non-unique role.

A pin-aware `byPosition` rewrites that. On any brand where somebody pinned a photograph, *which
image is the brand's logo* would be decided by a mark made in a photo grid — no error, no failing
test, just a different logo in the header one day.

So the pin gets **its own comparator** in `asset/photography.ts`, and `byPosition` is untouched.
`photography.test.ts` asserts that directly: a pinned `role: 'logo'` at position 900 must lose to an
unpinned one at position 100. That test is the phase.

## Two axes, not one

`position` orders **within** each half. Pinning does not move a photo, so unpinning puts it back
exactly where it was rather than at the end of the shelf — which is what makes the pin a *mark*
rather than a second ordering. The route asserts it, and `setAssetPinned` never writes `position`.

`pinned_at` is set and cleared with `is_pinned`, and neither is derived from the other. A timestamp
outliving its pin is one column disagreeing with the one beside it; a pin with no timestamp is a
shortlist nobody can ever order by *when the team decided*.

## No index, and the one that would be wrong

`listAssetsByBrand` reads every non-deleted row of a brand in one query and the client sections it,
so the pin sorts a list already in memory. There is no per-shelf server-side read to serve.

If one ever arrives, the index it wants is `(brand_id, library, is_pinned DESC, position)` — one
composite covering the whole sort — and **not** a partial `WHERE is_pinned = true`, which finds
pinned rows rather than ordering them. Recorded here because the partial shape is the one
`canvas_blocks` uses, and copying it would look right.

## The fallout, and where it landed

`isPinned` is required on the shared union — it is always present on a row — so every fixture typed
as a `BrandAsset` had to gain it. Sixteen files construct one. Four of them in `packages/web` share
an `ASSET_STAMPS` object, so those became **one** edit rather than twelve, which is the shape the
next column added to this union should also find.

Worth knowing: `pnpm typecheck` did **not** catch the shared package's own fixtures. They are
untyped literals handed to `safeParse`, so the failure was eight red tests rather than a type error.
A typecheck-clean tree is not evidence here.

## Not in this phase

**No UI.** `packages/web-next` has no photography grid yet — that is 3D, and it needs 3B's
categories and 2D's blob path first. The pin is reachable through the API and through nothing else
until then, which is why this release changes no screen.
