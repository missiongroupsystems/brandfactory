# Photography Phases 3C and 3D — the manager and the grid

**Migration:** none. **Wire:** no new routes — 3A and 3B built them all.
**New dependency:** none.

Shipped together because 3C is a sheet opened from 3D and neither is reachable without the other.
Photography becomes a brand nav row here and `/tools/photography` is deleted.

## Uncategorised is a bucket, and the grid always offers it

Every photograph that predates 3B has `category_id IS NULL`, and no rule could have given it one.
So the filter shows an **Uncategorised** chip whenever anything is in it — including for a brand
with no categories at all, which is every brand on the day this ships. A view that only revealed
that bucket once somebody created a category would have hidden the entire existing library.

There is a test for each half: offered when it holds something, absent when it does not.

## An empty subject says the photos still exist

*"Nothing filed under this subject — the photos are still there."* Not "no photos". An empty grid
under a heading the reader just clicked is indistinguishable from a missing library, and the two
have very different next actions.

## The filter is client-side, and the plan says when that stops being true

`GET /brands/:id/assets` returns every non-deleted asset of the brand with no cursor, so a filtered
count is a **total** and an empty subject is genuinely empty. That is the only reason the chips may
state numbers at all — this package's `AGENTS.md` bans claiming totals over paginated lists, and
`list-every.ts` records the failure: *"a row stranded on page two is silently absent from it — an
absence a reader takes as fact rather than as truncation."*

A subject filter over a truncated library would tell a brand with forty interior shots that it has
none. If that route ever gains a cursor, **the filter and the sort move to SQL in the same change.**

## The view does not sort

`usePhotography` returns `photographyInReadingOrder` — pinned first, then position — and the grid
renders that order as handed to it. A second sort in the component would be a second home for a
rule that already has one, and the two would eventually disagree. Asserted.

## Deleting a subject names its count first

`ON DELETE SET NULL` means the photos survive, but they survive **somewhere the reader is not
looking**: they move to Uncategorised in the grid behind the sheet, with nothing else on screen to
say so. So the confirmation is not "Delete Food?" but *"Delete Food? 23 photos will move to
Uncategorised. They are not deleted."* A reader who is not told that reads the result as data loss.

## Two accessibility findings, both caught by tests rather than by looking

- **The subject chips announced as "All3".** A count in an adjacent span concatenates with no
  separator. The chip now carries an explicit `aria-label` — *"All, 3 photos"* — which also makes
  the number say what it counts, which a bare digit beside a word never does.
- **Every pin button was named "Pin".** In a grid of twenty that is twenty identical controls. Each
  is now named for its photograph, and carries `aria-pressed` so the state is readable rather than
  only visible as a filled glyph.

## `next/image` is deliberately not used

A blob source is a **signed** URL that expires in five minutes and is re-minted by
`useSignedReadUrl` on a four-minute interval. The optimizer would cache that URL and serve a 403
the moment its signature lapsed. A link source is somebody else's host, which would need per-domain
configuration. The `eslint-disable` carries that reasoning inline, so the next person to see the
warning does not "fix" it.

## The nav

Photography moves from the workspace `Tools` group into `BRAND_NAV_ITEMS`, and the placeholder page
is deleted. `nav.ts` wrote the rule for this move before either feature existed — *"if either turns
out to be brand-scoped, it moves to `BRAND_NAV_ITEMS`"* — and the request settles it: subjects
differ per brand.

Phase 0's `never orphans a brand nav row` failed on the new row and passed once it was filed under
`Library`. That is the third time that guard has fired, which is what it was built empty for.

`Tools` is down to the funnel alone. It goes when 4D lands.
