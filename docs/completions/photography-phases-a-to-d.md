# Photography — Phases 3A to 3D

**Released in:** 1.54.0, with loose ends closed in 1.55.0.
**Migrations:** 0019 — two columns on `brand_assets`, no index — and 0020 — one table, one nullable
FK. **Wire:** six routes, plus one new key on the asset patch.
**Screens:** a brand nav row, the grid, and the subject manager behind it. `/tools/photography` is
deleted. **New dependency:** none.

Ask 3 is two features the request states as one, and it says where the seam is:

> The pin is a separate mark on the photo, not the manual drag order the library already supports.

That sentence is the argument for the phase split. The pin touches `brand_assets` — one wide table
serving three shelves and read by two frontends — while the categories add a table of their own. A
shared-table change wants its own release to be wrong in.

| Phase | What landed | Screen |
| --- | --- | --- |
| 3A | The pin: two columns, its own comparator, two routes | None |
| 3B | The categories: one table, four routes, a nullable FK | None |
| 3C | The subject manager | A sheet, opened from 3D |
| 3D | The grid | Photography becomes a brand nav row |

3A and 3B shipped with **no UI at all** — reachable through the API and through nothing else.
`web-next` had no photography grid until 3D, which needed 3B's categories and 2D's blob path first.
3C and 3D then shipped together, because 3C is a sheet opened from 3D and neither is reachable
without the other.

## Phase 3A — the pin, alone

### The defect this phase is built around

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

### Two axes, not one

`position` orders **within** each half. Pinning does not move a photo, so unpinning puts it back
exactly where it was rather than at the end of the shelf — which is what makes the pin a *mark*
rather than a second ordering. The route asserts it, and `setAssetPinned` never writes `position`.

`pinned_at` is set and cleared with `is_pinned`, and neither is derived from the other. A timestamp
outliving its pin is one column disagreeing with the one beside it; a pin with no timestamp is a
shortlist nobody can ever order by *when the team decided*.

### No index, and the one that would be wrong

`listAssetsByBrand` reads every non-deleted row of a brand in one query and the client sections it,
so the pin sorts a list already in memory. There is no per-shelf server-side read to serve.

If one ever arrives, the index it wants is `(brand_id, library, is_pinned DESC, position)` — one
composite covering the whole sort — and **not** a partial `WHERE is_pinned = true`, which finds
pinned rows rather than ordering them. Recorded here because the partial shape is the one
`canvas_blocks` uses, and copying it would look right.

### The fallout, and where it landed

`isPinned` is required on the shared union — it is always present on a row — so every fixture typed
as a `BrandAsset` had to gain it. Sixteen files construct one. Four of them in `packages/web` share
an `ASSET_STAMPS` object, so those became **one** edit rather than twelve, which is the shape the
next column added to this union should also find.

Worth knowing: `pnpm typecheck` did **not** catch the shared package's own fixtures. They are
untyped literals handed to `safeParse`, so the failure was eight red tests rather than a type error.
A typecheck-clean tree is not evidence here.

## Phase 3B — the categories

### A table, not an enum — and the contrast with Resources is the argument

The request is explicit:

> The category set must be editable, because subjects differ per brand.

Nothing like that is said about a Resource's type, and one plan over that field **is** a `pgEnum`.
The two calls are opposite because the facts are: the shapes of link a brand keeps are the same for
every brand, and the subjects it photographs are not. Migration 0011 records what the enum route
would cost per edit — its own file, and no `UPDATE` in that batch may name the new value.

### `category_id` is nullable, and `null` is a bucket rather than a blank

Every photo in `brand_assets` when this column arrived has no category, and **no rule could give it
one**. `defaultLibraryFor` could derive a shelf from `kind` and `role` because purpose was
recoverable from the bytes; nothing recovers *interior* from a PNG. A backfill would be a guess
written into a column — the failure `library.ts` opens by describing.

So *Uncategorised* is a real bucket the grid shows, not an empty state it hides. A view that hid
`null` would have hidden the entire existing library on the day this shipped.

On the patch, **absent and `null` are different writes**: absent leaves the filing alone, `null` is
a bucket somebody chose. `updateAsset` branches on `undefined` for exactly that, and there is a
route test that renames a photo and asserts its category survived.

### Deleting a category keeps the photos

`ON DELETE SET NULL`. A subject bucket is a filing decision, and undoing one must not destroy what
was filed — which is the whole reason a delete is safe to offer at all. It has its own route test,
because the effect lands on rows the reader is not looking at, and 3C owes them a count before it
happens.

### No CHECK against `library`, and that is a decision

Nothing stops a photography category attaching to a logo on the identity shelf. `brand_assets` does
reach for a CHECK when an invariant spans columns — `brand_assets_source_exactly_one` — and it also
records when not to: `brands.website_url` has none, because the rule has one enforcement point and
no second writer. This is the second case. Only the photography screen writes a category, and a
stray one is invisible rather than corrupting: an identity asset with a category renders exactly as
it does today.

Recorded here rather than left silent, so the next reader knows it was weighed. Revisit if a second
writer appears.

### No unique constraint on `(brand_id, name)`

A team that wants "Food" and "Food (styled)" is not making a mistake, and the one real duplicate is
cheaper to fix by renaming than to prevent with a constraint that would 500 the first time somebody
hit it.

### One thing this phase re-learned the hard way

The router was written, the `Db` facade extended, the fake updated, and everything typechecked —
because **nothing was chained into `app.ts`**. The plan warns that an unchained router is "a missing
property on a type, not a 404"; here it was a 404, because the route test calls `app.request` with a
literal path rather than through `hc<AppType>`. Both symptoms are silent in a different way, and the
edit that caused it was a search-and-replace whose anchor did not match this branch's wiring.

## Phases 3C and 3D — the manager and the grid

### Uncategorised is a bucket, and the grid always offers it

Every photograph that predates 3B has `category_id IS NULL`, and no rule could have given it one.
So the filter shows an **Uncategorised** chip whenever anything is in it — including for a brand
with no categories at all, which is every brand on the day this ships. A view that only revealed
that bucket once somebody created a category would have hidden the entire existing library.

There is a test for each half: offered when it holds something, absent when it does not.

### An empty subject says the photos still exist

*"Nothing filed under this subject — the photos are still there."* Not "no photos". An empty grid
under a heading the reader just clicked is indistinguishable from a missing library, and the two
have very different next actions.

### The filter is client-side, and the plan says when that stops being true

`GET /brands/:id/assets` returns every non-deleted asset of the brand with no cursor, so a filtered
count is a **total** and an empty subject is genuinely empty. That is the only reason the chips may
state numbers at all — this package's `AGENTS.md` bans claiming totals over paginated lists, and
`list-every.ts` records the failure: *"a row stranded on page two is silently absent from it — an
absence a reader takes as fact rather than as truncation."*

A subject filter over a truncated library would tell a brand with forty interior shots that it has
none. If that route ever gains a cursor, **the filter and the sort move to SQL in the same change.**

### The view does not sort

`usePhotography` returns `photographyInReadingOrder` — pinned first, then position — and the grid
renders that order as handed to it. A second sort in the component would be a second home for a
rule that already has one, and the two would eventually disagree. Asserted.

### Deleting a subject names its count first

`ON DELETE SET NULL` means the photos survive, but they survive **somewhere the reader is not
looking**: they move to Uncategorised in the grid behind the sheet, with nothing else on screen to
say so. So the confirmation is not "Delete Food?" but *"Delete Food? 23 photos will move to
Uncategorised. They are not deleted."* A reader who is not told that reads the result as data loss.

### Two accessibility findings, both caught by tests rather than by looking

- **The subject chips announced as "All3".** A count in an adjacent span concatenates with no
  separator. The chip now carries an explicit `aria-label` — *"All, 3 photos"* — which also makes
  the number say what it counts, which a bare digit beside a word never does.
- **Every pin button was named "Pin".** In a grid of twenty that is twenty identical controls. Each
  is now named for its photograph, and carries `aria-pressed` so the state is readable rather than
  only visible as a filled glyph.

### `next/image` is deliberately not used

A blob source is a **signed** URL that expires in five minutes and is re-minted by
`useSignedReadUrl` on a four-minute interval. The optimizer would cache that URL and serve a 403
the moment its signature lapsed. A link source is somebody else's host, which would need per-domain
configuration. The `eslint-disable` carries that reasoning inline, so the next person to see the
warning does not "fix" it.

### The nav

Photography moves from the workspace `Tools` group into `BRAND_NAV_ITEMS`, and the placeholder page
is deleted. `nav.ts` wrote the rule for this move before either feature existed — *"if either turns
out to be brand-scoped, it moves to `BRAND_NAV_ITEMS`"* — and the request settles it: subjects
differ per brand.

Phase 0's `never orphans a brand nav row` failed on the new row and passed once it was filed under
`Library`. That is the third time that guard has fired, which is what it was built empty for.

`Tools` is down to the funnel alone. It goes when 4D lands.

## Closed afterwards, in 1.55.0

The shelf learned to **take a photograph and reorder one** — the two controls 3D shipped without.
