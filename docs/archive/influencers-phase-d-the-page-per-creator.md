# Influencers, Phase D — the page per creator

A creator gets a URL worth pasting. `/influencers/priyaskin` is a record page reading
`GET /workspaces/:id/influencers/:ref`, the name in the table is the link to it, and
`SCOPES.bfInfluencer` — registered in Phase C and read by nothing — finally has a reader.

No migration, no server change, no wire change. `packages/web` is untouched and still builds.
Test count **2282 passed | 110 skipped**, up from 2271 | 110.

Phase D of [`../executing/influencers-on-real-data-plan.md`](../executing/influencers-on-real-data-plan.md).

---

## 1. The shape that landed

```
packages/web-next/src/app/(app)/influencers/[slug]/page.tsx   NEW — the server shell
packages/web-next/src/features/influencers/
  components/influencer-detail.tsx                            NEW — the record page
  href.ts · href.test.ts                                      NEW — influencerHref, 3 assertions
  format.ts · format.test.ts                                  NEW — 8 assertions
  hooks.ts                                                    + useInfluencer(ref)
  components/influencers-browser.tsx                          name cell → link; two extractions
  tiers.ts                                                    a docstring pointing at a deleted type
```

`api.ts` is **unchanged**. `influencerService.get` was written in Phase C against a route that
already resolved a slug or an id, and Phase C's own note listed it as the thing this phase needed
from it. Nothing about the service layer had to move to put a page on top of it.

---

## 2. The page shows the record, and stops there

Who they are, where they post, how far they reach, how well that audience engages, what they
cover, which brands they are engaged for, and whatever somebody wrote down. Three cards —
**Audience**, **Brands**, **Record** — and no fourth.

There is no campaign history, no post list and no rate card, because **none of those exists**. Not
on this table, not on this server, not anywhere in this repository. `outlet-detail.tsx` records
inheriting thirteen cards over exactly that kind of nothing and cutting twelve of them; building
them fresh over a table one release old would be the same mistake made deliberately.

Four decisions inside the three cards:

**The follower count is shown in full — `1,240,000`, not `1.24M`.** The table's compact figure
exists because a column of counts is scanned down its length and `1.24M` beside `84.2k` is
comparable at a glance where the full digits are not. A record page has the opposite job: it is
where somebody checks a number before quoting it, and a rounded one is the single thing it must
not show them. That is `formatFollowers`, and it is the reason the page is worth opening at all
for a row already visible in the table.

**The reach tier carries its range.** `Mega · 1M+`, not `Mega`. The band is *derived* from the
number two rows above it, and without the threshold beside it the reader has no way to see what it
was derived against — a creator on 99,800 followers sits one band below one on 100,200, and the
range is what makes that visible rather than surprising.

**`Last updated` is on the page because reach goes stale.** A follower count is pulled from a
platform and is out of date within the day. When the row was last touched is what says whether the
figure above it is worth quoting, which makes a timestamp a fact about the data rather than
bookkeeping.

**No monogram in the header, unlike the outlet's.** `BrandMark` draws a *brand's* mark, and a
creator has between zero and fifty brands. Drawing one would pick a brand out of a set the record
deliberately keeps unordered; drawing none is honest about a person this product holds no picture
of.

### The first line names the platform, and that is load-bearing

`@priyaskin on Instagram`, under the name and before the badges.

The slug comes from the **handle**, so one person on Instagram and TikTok gives `priyaskin` and
`priyaskin-2` and the URL does not say which is which. `InfluencerSlugSchema` states that cost in
so many words and names this page as where it is paid. It is the one line on the page that exists
because of a decision made in Phase A rather than because of a field.

---

## 3. Two things came out of the browser, and one of them was wrong on screen

Both are extractions the second surface forced, which is the usual way a duplicated rule gets
found.

**`formatEngagement` moved to `features/influencers/format.ts`.** It was a private function inside
`influencers-browser.tsx`, and it carries the trap that has now surfaced three times: the column is
`numeric(5,2)`, so `2.00` in the database becomes `2` on the wire, and rendering it raw puts `2%`
in a column of `3.8%` and `14.2%`. A second copy on the detail page is exactly the drift a rule
that is only ever wrong by one character does not survive. It is now **tested** — it was not
before, and `formatEngagement(2) === "2.0%"` is precisely the kind of thing a browser pass reads
straight past.

**A creator with no vertical says `Generalist`, on both surfaces.** This is a correction and the
only thing in the phase that changes what an existing screen states.

`InfluencerSchema`'s comment on the field is unambiguous: *"`null` = a genuine generalist, not an
unclassified row"*, which is why the union has no `other` member — so nobody has to file a
photographer who shoots whatever the brief is beside the rows nobody has classified yet. The table
rendered `Value`'s em dash for it, and the em dash is this app's word for *not recorded*. So the
cell stated the one thing the schema went out of its way not to mean.

The word is one exported constant read by both surfaces, on `GROUP_LEVEL`'s precedent one
aggregate over, and it renders in tertiary ink — the same register as `Not engaged yet` two cells
along, which is the other stated absence in that row. Changing the table rather than only the page
is the point: two surfaces of one release disagreeing about one value is worse than either reading
of it.

---

## 4. `influencerHref` is in the feature folder, not in `lib/`

`outletHref` lives in `lib/` because four feature folders emit outlet links, and it is
structurally typed because there are two `Outlet` records in this app. Neither is true here: one
creator record, one screen that links to it. AGENTS.md's promotion rule applies as written —
something reaches `lib/` once two features use it — so `features/influencers/href.ts` is where it
sits, beside `tiers.ts`, which is the same shape of file.

The structural signature is kept anyway, because it costs nothing and it is what makes the id
fallback expressible. `slug` is `not null` and the server chooses it at create, so
`slug || id` is defensive rather than expected; it exists because the alternative is
`/influencers/undefined`, which resolves to a 404 with no way to tell a bad link from a deleted
creator.

**The link fills the name cell and the row is not clickable as a whole.** A row-level `onClick`
makes the text unselectable and cannot be opened in a new tab — `outlets-browser.tsx`'s call,
unchanged — and here there is a second reason: the handle underneath the name carries the search
highlight, and a link wrapping both would fight it.

---

## 5. `useInfluencer` and the two entries over one row

On `useOutlet`'s shape, with the ref in the key rather than only in the fetcher:
`[bf-influencer, workspaceId, ref]`.

That is the cost of a route that resolves both forms — `/influencers/priyaskin` and
`/influencers/<uuid>` are two cache entries over one row — and it is exactly why the page rewrites
the URL **cosmetically**. `window.history.replaceState`, not `router.replace`: the SWR entry is
keyed on the ref the page was opened with, so navigating would refetch the record already on
screen to land on an identical one.

**`revalidateOnFocus` is left at its default here, unlike `useInfluencers`.** A roster refetched
under a reader reshuffles a table they are scanning; a single record refetched under one puts the
same fields back in the same places. And coming back to a page after editing the creator in
another tab is the moment a stale follower count actually costs something.

The brand names reuse `resolveBrandNames` from `brand-names-cell.tsx` rather than rendering the
cell: the page has room for the names themselves, but the *rule* is the one that cell exists for —
one unresolved id makes the whole set unknown rather than making the list shorter, because two
brands rendered where the row names three is a false statement that looks like a true one.

---

## 6. Verification

```
pnpm typecheck                             clean (11 packages)
pnpm lint                                  clean (whole repo)
pnpm format:check                          clean
pnpm test                                  2282 passed | 110 skipped (189 files)
pnpm -F @brandfactory/web build            clean
pnpm -F @brandfactory/web-next lint        clean
pnpm -F @brandfactory/web-next typecheck   clean
pnpm -F @brandfactory/web-next build       clean
```

The build output is the check worth naming: `/influencers` is still **○ (Static)** and
`/influencers/[slug]` is **ƒ (Dynamic)** — the same pair `/outlets` and `/outlets/[slug]` have.
The list page did not go dynamic, because nothing was added to it that reads `searchParams` on the
server, and the detail page is dynamic because its segment is a param rather than because it reads
one.

The count moves by **11**: 8 in `format.test.ts` and 3 in `href.test.ts`. Both are pure functions,
which is the only kind of thing this package tests — `web-next` tests the logic a browser pass
cannot see, and `formatEngagement(2)` returning `"2.0%"` rather than `"2%"` is the definitive
example of a rule a browser pass reads straight past.

**No browser pass.** That is Phase F, and this phase adds to its list: whether three cards read as
a record or as a stub, whether the full follower figure beside a `Mega · 1M+` band is the pairing
the page is for, and whether `Generalist` reads as a statement in a column of ten labels.

---

## 7. What Phase E needs from this

- `useInfluencerMutations` is the one hook still missing, and the reason has not changed: what is
  missing now is the form.
- The detail page has **no Edit and no Delete button**. Both arrive with the form, and delete goes
  behind an `AlertDialog` from this page only — the table never deletes a row it cannot describe.
- `useInfluencer` and `useInfluencers` are two scopes over one row, so every write invalidates
  **both**. `useOutletMutations` is the shape.
- The four form traps AGENTS.md already records are live on `influencer-form.tsx`: a sheet's
  content survives its close, `SheetContent` is never keyed on anything that changes as it closes,
  a required label reads as `Name*` in `textContent`, and `followers` is a required number nobody
  should invent — the form shows `updatedAt` beside it once the row exists.
