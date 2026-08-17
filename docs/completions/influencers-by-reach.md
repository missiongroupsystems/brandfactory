# Influencers by reach

The Influencers screen stops being the Operations Hub's address book under a new label and
becomes a roster of creators. It groups by **reach tier**, filters by brand, vertical, platform
and status, and points at no vendor at all.

No migration. Nothing here touches `packages/db`, `packages/server` or the wire between them.
`packages/web` is untouched and still serves production.

The user's report was two sentences and both were about the same mistake: *"grouping by vendor
doesn't make any sense. Nor should those influencers be linked to Vendors."*

---

## 0. What was decided, and by whom

Asked and answered before any code, because each answer changed what got built:

| Question | Answer |
|---|---|
| What replaces vendor as the grouping axis? | **Tier by reach** — derived from the follower count |
| Does the agency survive on the row? | **No. Drop it entirely** |
| How far does the record change? | **A full influencer record**, declared in this app |

The first answer is the one that shaped the most code, and it was not the option this plan
recommended. Brand was — the 1.37.0 precedent, one aggregate over. Reach turns out to be the
better axis for a reason the recommendation missed: **it is derived**, so the entire class of
problem the vendor grouping had cannot occur (§3).

---

## 1. The record replaced, not re-pointed

1.37.0 re-pointed two fields of a generated record. This replaces the record.

The rows were `ContactRead`:

```
name · role · email · phone · vendor_id · is_primary
```

Not one of the six things a creator is actually chosen by is in that list — handle, platform,
reach, engagement, vertical, the brand they work for. So the screen filed people by the company
they sit with and offered a filter over `ServiceCategory`, the Ops Hub's thirteen building
trades, of which the only true value for a talent agency is `other`.

`lib/api/types.ts` now declares `Influencer` and three unions. It is safe there for exactly the
reason `ContractCategory` gives beside it and no other: **there is no server.** `schema.d.ts` is
frozen against a FastAPI document this repository does not contain, the Hono server holds no
influencer routes, and the fixture is the only writer.

Three fields carry decisions rather than data:

- **`followers` is not nullable.** A follower count is public and is the first thing anyone looks
  up, so "not recorded" is not a state this record needs. That is what makes the grouping *total*
  (§3).
- **There is no agency field.** Not renamed, not kept as text — absent. This is the user's second
  sentence taken literally.
- **`brand_ids` is multi-valued**, like a contract's, and an empty array is a fact rather than a
  gap.

`InfluencerVertical` has **no `other` member**, which is a deliberate break from the three
category unions above it. An unclassified creator carries `null` and renders the em dash.
`other` in those unions is a value somebody *chose*; here "no vertical" is the absence of a
choice, and one bucket holding both the generalists and the unclassified is unreadable.

## 2. The agencies survived the row

Dropping the agency from the record nearly deleted six vendors that hold contracts.

The six talent agencies lived in `fixtures/influencers.ts`, and that file's docstring justified
it by the screen: `ContactsBrowser` resolved `contact.vendor_id` through `useVendorIndex`, and an
unresolved id renders as `…`, so creators without agencies in the same fixture would have been
twenty rows under a column of ellipses. *"The two sets are one fixture because neither is legible
without the other."*

That was true and is now false. But `fixtures/contracts.ts` looks the agencies up **by name** as
the counterparties of six of the sixteen agreements — a talent retainer is a real marketing
agreement and an agency is a real vendor. Deleting them to make this change tidy would have
deleted six contracts' vendors with them.

So they moved to `fixtures/agencies.ts` and the split is finally the honest one:

- an **agency** is a company you have an agreement with → `agencies.ts`, `/vendors`
- an **influencer** is a person you engage for a brand → `influencers.ts`, `/influencers`

Nothing joins the two files. `contacts` is `[]` on all six now: the roster used to be *derived*
into the agency's contact list, which was the same wrong model read from the company side.

## 3. Why a derived grouping is a smaller component

`ContactsBrowser` was 701 lines and the vendor grouping is most of the reason. Its buckets came
from the data, so their existence, their order and their names were three separate questions, and
it carried **three tiers** of group:

1. a named vendor,
2. the real `null` bucket ("No vendor"),
3. **a group whose vendor has not resolved yet** — kept apart from (2) on purpose, because
   folding a slow request into "has no agency" states a fact about a creator that is not true.

A reach tier is computed from a number the row already carries. There is no index to resolve, so
no band can be pending; `followers` is not nullable, so there is no unknown bucket. The grouping
is **total** — every loaded row lands in exactly one band and the counts always sum to the rows —
which is what lets the band headers carry numbers honestly.

`groupByTier` is therefore a walk over a closed, ordered list rather than a `Map` plus a
three-tier comparator:

```ts
REACH_TIERS.map((tier) => ({ tier, influencers: items.filter(…) }))
           .filter((group) => group.influencers.length > 0)
```

The walk *is* the sort, and an empty tier drops out instead of needing to be suppressed.

`features/influencers/tiers.ts` holds the ladder — Mega / Macro / Mid-tier / Micro / Nano at
1M / 500k / 100k / 10k. The boundaries are the trade's, not invented, which matters because the
reader has met them and because a rate card is quoted against them. **Ordered largest first**,
the opposite of every other grouped table here, because reach descending is the order a budget
conversation happens in.

Two smaller calls in that file:

- **`nano` has `min: 0`**, not `min: 1_000`. The trade says nothing below 1k, and a ladder with a
  gap at the bottom would drop a 940-follower row out of the grouping entirely — the one thing a
  total grouping may not do.
- **The rail is by position, not hashed.** `railFor()` hashes its key, which is right for an
  *open* set of groups; the tiers are closed and ordered, so position gives every band the same
  colour on every reload and paints the ramp in the ladder's own order.

## 4. The route moved with the label

The nav item has said "Influencers" since 1.34.1 while pointing at `/contacts`, on the stated
argument that the noun should lead and the model would follow. It has followed, so folder, route,
cache scope **and wire path** all say `influencers` — the rule `/registry-brands` cost a release
to learn.

The wire path moves too, which is the one place this differs from that precedent. `/brands` stayed
`/brands` because it is the Ops backend's and not this app's to rename. There is no endpoint behind
`/influencers`, so nothing about it is frozen.

`/contacts` is **not** redirected here. It is a live Ops path that still means the address book:
`useContactMutations` is called by the tenancy intake sheet and the review queue, both of which
create a person against a vendor — a perfectly good model for a landlord, and only ever the wrong
one for a creator. A redirect would claim the two screens are one under two names.

What went, and what stayed:

| | |
|---|---|
| Deleted | `app/(app)/contacts/page.tsx`, `contacts-browser.tsx` (701 lines), `contact-search.tsx`, `contact-form.tsx`, `useContactPages` |
| Kept | `features/contacts/{api,hooks}.ts` — the mutations two other features still call |
| Kept | `SCOPES.contacts` / `SCOPES.contact`, because those writes still invalidate the vendor lists that embed the rows |

`/contacts` is no longer registered in `mock.ts` and falls through to rule 2, which answers empty
— true, because no screen reads that list.

## 5. Three surfaces had to answer for the change rather than absorb it

- **`/vendors` lost its header cross-link.** The button to `/contacts` was described as "the
  people half of the Vendors & Contacts directory". That was true of an address book of the people
  *at these companies*. It is not true of a roster: an agency you hold a retainer with is on the
  vendors table, and none of the creators is one of its contacts. A button promising the other half
  of a directory that no longer has two halves is worse than no button.
- **`mock.ts`' `/vendors` registration lost its reason and kept its route.** It was registered
  *because the Influencers screen needed it*. It now answers only the question it names.
- **The primary action became an import, not a create.** A create form was right for an address
  book — a name and a phone number are things a person types. Reach and engagement are not: a
  follower count is pulled from a platform and is stale within the day, so a box asking someone to
  type `1,240,000` invites a figure nobody can stand behind, stated on the row beside four that
  came from the same box. `SyncInfluencersButton` follows 1.36.0's `Import or sync outlets`
  placeholder and commits to no shape.

## 6. The table

Grouped by default, `?group=none` for the flat view, which adds the tier back as a column.

| Column | Notes |
|---|---|
| Creator | Name, handle below it. Both are matched by `q`, so both carry `HighlightMatch` |
| Platform | One per row, not a set — §7 |
| Reach | `formatCompactNumber`, right-aligned and tabular |
| Tier | Ungrouped only; grouped it is the band |
| Engagement | `3.1%`, or the em dash where nobody has measured it. Never `0%` |
| Vertical | Glyph plus label, never the glyph alone |
| Brands | `BrandNamesCell` with `empty="Not engaged yet"` |
| Status | Active / Prospect / Past |

**The filters are the overflow form** (`FilterToolbar` + `FilterPopover` + `ActiveFilterChips`),
which `AGENTS.md` reserves for `/contracts`. Measured rather than assumed: search at `sm:w-72`
plus four selects at `sm:min-w-44` is about 1050px before gaps, and the view toggle plus the
primary action take another 300 on the right — so a single wrapping row puts the filters on two
ragged lines at 1280. Four panel filters is one fewer than that screen and still over the
threshold, because the action group here is a wide button.

**There is no `tier` filter.** The tier is the grouping, and a filter on the same axis as the
bands is a second way to ask one question.

**The `Brands` empty state is not `Group level`.** `BrandNamesCell`'s default names a contract
held for the whole group, deliberately. A creator with no brand is a *prospect* — on a shortlist,
never booked — which is a different stated fact. The `empty` prop 1.38.0 added for the vendors
table's second reading is what makes this a third one for free.

## 7. The one simplification worth naming

**One platform per row, not a set.** A creator with an Instagram grid and a TikTok account has two
follower counts and two engagement rates, so one row holding a platform array would have to pick
which number to show — and every reach figure on the screen would silently be "on whichever
platform we recorded". One row per platform keeps every number attributable. It is the same call
`planning-and-dispatch` made for one idea per platform (Q8).

## 8. Verification

```
pnpm typecheck                         clean (11 packages)
pnpm lint                              clean (whole repo)
pnpm format:check                      clean
pnpm test                              2211 passed | 92 skipped (184 files)
pnpm -F @brandfactory/web build        clean
pnpm -F @brandfactory/web-next lint    clean
pnpm -F @brandfactory/web-next build   clean — /influencers is ○ (Static); /contacts is gone
```

The count moves by fifteen, all in `features/influencers/tiers.test.ts`. The tier ladder is the
one part of this change that is pure logic and invisible in a browser pass until the day it is
wrong: a band that silently swallowed 100,000 into Micro would look completely correct on screen.
So each boundary is asserted **twice** — the first count in the tier and the last count below it,
because a one-sided assertion passes against `>` where `>=` was meant. Totality is asserted
directly, and `GROUP_RAILS.length >= REACH_TIERS.length` is pinned so a sixth tier fails the suite
rather than rendering a colourless band.

**No browser pass** — the wall 1.36.0 §9 named, which 1.38.0 partly took down for the two tables
it touched. What that leaves unseen here: whether five bands read well at nineteen rows, whether
ten vertical glyphs are distinguishable at 16px, whether the reach column's mixed `k`/`M` units
scan down the column, and whether "Not engaged yet" reads as a decision rather than as a gap.
