# Influencers, Phase C — the list on real data

`/influencers` stops rendering `fixtures/influencers.ts` and starts rendering the creators the Hono
server holds. The fixture is deleted, the `/influencers` branch is out of `mock.ts`, and the
hand-written `Influencer` type is out of `lib/api/types.ts`.

The release's centre of gravity, and the phase where the screen's numbers become true: the route is
exhaustive, so the reach bands' counts stop being *"of the rows loaded"* and become totals. The note
that admitted otherwise is deleted.

No migration. Test count **2271 passed | 110 skipped**, up from 2270 | 110.

Phase C of [`../executing/influencers-on-real-data-plan.md`](../executing/influencers-on-real-data-plan.md).
`packages/web` is untouched and still builds.

---

## 1. The shape that landed

```
packages/web-next/src/features/influencers/api.ts          rewritten onto bf/callJson, 5 methods
packages/web-next/src/features/influencers/hooks.ts        useInfluencers replaces useInfluencerPages
packages/web-next/src/features/influencers/components/
  influencers-browser.tsx                                  filters client-side; 4 deletions inside
packages/web-next/src/lib/api/cache.ts                     + bfInfluencers/bfInfluencer, − influencers
packages/web-next/src/lib/api/cache.test.ts                + 1 assertion
packages/web-next/src/lib/labels.ts                        5 records re-keyed off the shared unions
packages/web-next/src/lib/api/mock.ts                      − the /influencers branch and its import
packages/web-next/src/lib/api/types.ts                     − Influencer + its three unions
packages/web-next/src/fixtures/influencers.ts              DELETED
packages/web-next/src/features/registry-brands/components/
  brand-names-cell.tsx                                     map type widened to { name: string }
packages/web-next/src/app/(app)/influencers/page.tsx       docstring
packages/web-next/AGENTS.md                                two standing rules updated
```

`features/influencers/tiers.ts` and `tiers.test.ts` are **unchanged**. They were pure derivation
from `followers` before this phase and they still are, which is the plan's decision holding up: the
one thing the screen computes needed no backend at all.

---

## 2. Four things were deleted, and three of them were built in order to be

`useInfluencerPages`, `useCursorPages` on this screen, `PAGE_LIMIT`, the `LoadMore` footer, and the
note above the table:

> *Showing the first 19 creators — bands below may be incomplete.*

That note is the one worth naming. It existed because a **count on a group header looks like a claim
about that group whether or not one was intended**, and while there was another page to fetch, the
claim was false. It was built rather than written down precisely so it could go the day the route
returned everything — and this is that day. Its docstring in 1.39.0 said so.

Two follow-ons that were not on the plan's list:

**`filterIdentity` and the `key=` on the results component went too.** They existed to remount the
results and reset an accumulated page count when a filter changed. There are no pages to accumulate,
so a remount on every keystroke would be a remount for nothing. The debounce on `q` stays — the
highlight recomputation down a growing roster is the real cost, not the filter.

**A footer replaces the note, and it states a total.** `19 creators`, and it is allowed to be a
total for the same reason `/outlets` is: this route answers with the whole set. It counts what is
*on screen* — filtered — because a footer above a narrowed table that reported the unfiltered figure
would be the `2 of 1` miscount AGENTS.md records one screen over. Both of that file's standing rules
were updated rather than left to disagree with the code: the "only place a footer may state a total"
paragraph now names two routes, and it says explicitly that if a cursor ever comes back here, the
note comes back with it.

---

## 3. The brand index moved, and this is not the thing AGENTS.md bans

The screen resolved `brand_ids` through `useBrandIndex` — `fixtures/brands.ts`, the Operations Hub's
invented F&B group. It now reads the workspace's real brands through `useActiveBrand()`, which is
`useWorkspaceBrands` under one shared SWR key, so the screen adds no second request.

AGENTS.md says, in as many words: *"Do not 'fix' this by pointing the contracts table at
`useWorkspaceBrands`"*. That ban is about `/contracts`, and it is correct there: a contract's
`brand_ids` **are** fixture ids, so re-pointing its index would make every row read `Group level` in
a workspace that had not happened to name a brand `Harbour Table`.

Here the **data itself moved**. A creator's `brandIds` are foreign keys into the workspace's
`brands` table, so the index has to move with them; leaving it on the fixture would resolve nothing
and render `…` down the whole column. Contracts and vendors keep the Ops brands, which is why
`BrandNamesCell` was **widened rather than re-pointed**: its map went from `Map<string, Brand>` to
`Map<string, NamedBrand>`, where `NamedBrand` is `{ name: string }` — the only field the cell has
ever touched. One cell, two record types, no second copy.

**One consequence worth stating.** That cell's reason for existing is the rule *"a cached index that
has not arrived is a pending request, never a missing fact"*, so an unresolvable id renders `…`
rather than being dropped. On this screen an unresolvable id can now **only** be a request in
flight: `influencer_brands` cascades on both sides, so a deleted brand takes the link with it and
cannot leave a dangling reference. That is the whole argument for the join table over a `uuid[]`
column, and it is what makes the ellipsis honest here rather than ambiguous.

The nav's active brand still does not filter the table, as on `/contracts` and `/vendors`. A roster
silently scoped to one brand would hide every prospect, who by definition has none.

---

## 4. The filters moved to the client, predicate for predicate

`matchesFilters` is the four panel filters and the search box, and every predicate in it is the one
`mock.ts` used to run — moved rather than rewritten, including the two that are not equality tests:

- **Brand is a `contains` over the row's set**, because a creator can be engaged for two.
- **Search is name *or* handle**, both of them the row's own fields, so unlike every other search
  box in this app the predicate joins to nothing. That is why the label still names both.

A creator with no vertical matches no vertical filter rather than falling into one — there is no
`other` member for them to be swept into, which is the same reason the enum has none.

**Filter keys went camelCase**: `brand_id` became `brandId`, so the URL now matches the wire. Old
links carrying `?brand_id=` open unfiltered rather than re-arranged — the call 1.38.0 made for
`?kind=` and 1.37.0 for `?group=outlet`, and the right one here because the value in an old link is
an *Operations Hub fixture id* that resolves to nothing in the new index. A redirect would have to
translate an id it cannot map.

One type note: `filters.brandId` is a plain string off the URL and `brandIds` is `BrandId[]`, the
branded type, so the test is `.some((id) => id === filters.brandId)` rather than `.includes`.
`includes` demands its own element type where `===` accepts a string.

---

## 5. `numeric(5,2)` came back one last time

The trap Phase A pinned in the mapper and Phase B saw over the wire has a third face, and it is a
rendering one: `2.00` in the column becomes `2` on the wire, because JSON has one number type and
`Number('2.00')` is `2`.

Rendering the value raw put **`2%` in a column of `3.8%` and `14.2%`** — which does not look like a
bug, it looks like a different kind of measurement. `formatEngagement` fixes it with `toFixed(1)`,
one decimal always, and `null` still falls to `Value`'s em dash because nobody having measured a
prospect is not the same as a measured zero.

This is the one change in the phase that is visible on screen and was not in the plan. It was found
by reading the seeded values over the wire in Phase B rather than in a browser, which is the only
reason it did not ship.

---

## 6. The type left `lib/api/types.ts`

`Influencer`, `InfluencerPlatform`, `InfluencerVertical` and `InfluencerStatus` were the one record
in that file with **no schema type behind it at all** — declared locally, snake_case, safe only
because no server existed to refuse a field. Their docstring named the condition that would end
that: *"the day a real backend arrives it is generated against this shape."*

They are gone. What replaced them in the file is a note saying where they went and why nothing is
left, because that file is only for named aliases over the frozen `schema.d.ts`, and a shape the Hono
server owns has no business in it.

`lib/labels.ts` now keys its five `INFLUENCER_*` records off the shared unions. That is the change
with teeth: **a new `influencer_platform` member fails the typecheck until it has a label** — which
the hand-written copy could never do, because it *was* the list.

The cache scope moved the same way. The plain `influencers` that stood beside `contacts` is deleted
and `bfInfluencers` / `bfInfluencer` replace it, prefixed for the reason the outlet pair is: both
families of people are live at once and only one of them is ours. `cache.test.ts` asserts the new
pair is distinct from `contacts` / `contact` **and** that `SCOPES` no longer has an `influencers`
key at all — the second half is what stops the unprefixed name coming back.

---

## 7. What was checked before deleting the fixture

The plan asked for a grep first rather than after. Done, and it holds: **no Operations Hub file
resolves an influencer id**, through `features/registry/` or anywhere else. Every remaining mention
of the word outside `features/influencers/` is a comment — in `fixtures/agencies.ts`,
`fixtures/contracts.ts`, `features/contacts/hooks.ts` and `components/layout/nav.ts` — and two
contract titles that happen to read *"Influencer analytics add-on"*.

`fixtures/agencies.ts` and `fixtures/contracts.ts` stay, as the plan settled: six of the sixteen
contracts name those agencies as counterparties, **by name**.

`/contacts` is still not registered in `mock.ts` and still not redirected. It means the address book,
`useContactMutations` is live on the tenancy intake sheet and the review queue, and a redirect would
claim the two screens are one under two names.

---

## 8. Verification

```
pnpm typecheck                                     clean (11 packages)
pnpm lint                                          clean (whole repo)
pnpm format:check                                  clean
pnpm test                                          2271 passed | 110 skipped (187 files)
pnpm -F @brandfactory/web build                    clean
pnpm -F @brandfactory/web-next lint                clean
pnpm -F @brandfactory/web-next typecheck           clean
pnpm -F @brandfactory/web-next build               clean — /influencers still ○ (Static)
```

`/influencers` staying **static** is the check worth naming. The page reads no `searchParams` — the
browser component under `<Suspense>` reads them through `useSearchParams` — so the route did not go
dynamic the way `/contracts` did when it started reading a param to redirect.

The count moves by **1**, the `cache.test.ts` assertion. Nothing else here is testable in this
package by its own convention: `web-next` tests auth, workspace resolution and the cache keys a
matcher cannot reach, **not the screens**, because most of the package is still borrowed Operations
Hub UI and the logic worth asserting is the part a browser pass cannot see.

**No browser pass.** That is Phase F, and it now has more to look at than 1.39.0 left it. What is
unseen: whether five bands read well at nineteen rows, whether ten vertical glyphs are
distinguishable at 16px, whether the reach column's mixed `k`/`M` units scan down its length,
whether `Not engaged yet` reads as a decision rather than a gap, and — new to this phase — whether
the `19 creators` footer reads as a total or gets mistaken for the "loaded" count every Ops footer
beside it means.

---

## 9. What Phase D needs from this

- `influencerService.get` exists and takes a slug **or** an id. `useInfluencer(ref)` on
  `SCOPES.bfInfluencer` is the hook that is deliberately not written yet.
- The name cell becomes a link, emitting the slug — the row holds it, so nothing has to be looked
  up.
- `SCOPES.bfInfluencer` is registered and nothing reads it. That is the one loose end this phase
  leaves on purpose, and it is a smaller hazard than a hook nothing calls.
