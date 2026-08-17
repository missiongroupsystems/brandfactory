# Contracts by brand

**Companion to [`../executing/contracts-by-brand-plan.md`](../executing/contracts-by-brand-plan.md).**
That file is the argument and the four decisions; this is what was built.

A contract stops being an agreement about premises and becomes an agreement about a brand.
`/contracts` groups by brand, filters by brand and links to brands on create; the outlet
dimension leaves the contracts domain entirely; and `category` stops borrowing the Operations
Hub's vocabulary of trades and gets a marketing one.

No migration. Nothing here touches `packages/db`, `packages/server` or the wire between them.
`packages/web` is untouched and still serves production.

---

## 1. The type had to move before anything else could

`src/lib/api/schema.d.ts` is generated from a FastAPI document this repository does not
contain. It is frozen. It said:

```
ContractRead.category: ServiceCategory      // aircon | pest_control | grease_trap | …
ContractRead.outlet_ids: string[]
```

Both are wrong for this product and there is no backend to regenerate the file from — the Hono
server holds no contracts routes, and `/contracts` has been a fixture since 1.36.1.

So `features/contracts` stops taking its record from the generated schema and declares it. The
declarations stay in `lib/api/types.ts`, the one file allowed to reach into `schema.d.ts`, and
are built as `Omit<…> & {…}` over the aliases — nineteen of the twenty-one fields are unchanged
and still arrive from one place, so a reader sees the whole delta at once:

```ts
export type Contract = Omit<S["ContractRead"], "category" | "outlet_ids"> & {
  category: ContractCategory;
  brand_ids: string[];
};
```

`ContractCategory` is declared beside it with a docstring saying it is **not** a schema type.
Eleven members: Retainer, Media buy, Production, Talent & influencer, PR & communications,
Events & activations, Sponsorship, Creative & design, Research & insights, Tooling & software,
Other.

`ServiceCategory` is untouched. Vendors, Influencers and the review queue still read it, and
re-pointing those is a different decision about different screens. A vendor filed under `other`
is the same complaint one screen over and the honest fix is a vendor vocabulary nobody has
asked for.

**The fixture's own docstring had argued this was impossible**, and the argument is worth
recording because only half of it failed. It said: `ServiceCategory` is frozen, of its thirteen
values exactly two are true of a marketing agreement, so the glyph column is nearly monotone
and the filter narrows to two buckets — all true — and therefore *"inventing one here would put
a slug on screen that no server would accept"*. That conclusion did not survive contact with
the reason there is a fixture at all: **there is no server**. Nothing can refuse a slug.

## 2. Brand went from two hops to zero

Brand used to be derived: `contract → outlet → brand`. That made the cell multi-valued,
permanently partial while either index was in flight, and — because every fixture outlet
carried `brand_id: null` — empty on every row. `BrandCell` had **five** states and four of them
were ways of saying "not yet".

It is the row's own `brand_ids` now. One hop, so there is one way for a fact to be pending: a
name that has not arrived. The `unbranded` state went with the outlet it described.

`BrandCoverage` is three fields instead of four, and `BrandCell` is four states instead of five:

| State | Renders |
|---|---|
| `groupLevel` — the agreement names no brand | **Group level**, in tertiary ink |
| `pending` — a `brand_id` has no name yet | `…`, for the whole cell |
| one brand | the name |
| more than one | `🏷 n`, names in the tooltip |

**`Group level` is the wording decision that matters.** It was going to be "No brand" or "No
brand yet", and both describe an *unanswered question* — which is what the phrase meant while
brand was inherited and half the estate was unattributed. It is a stated fact now: a seat
licence and a press office retainer are held for the whole group, deliberately, and there is
nothing to fix. The em dash would be worse again, because `Value` has taught this table to read
it as "not recorded". One constant names the bucket, the band and the cell, so the three cannot
drift.

The Brand column is **on by default**, which it was not. Both halves of the argument for hiding
it have changed: it is a value rather than a derivation, and it is what the table groups by — a
column hidden by default while the toggle beside it is named after the same word reads as a bug.

## 3. What the table lost

- **The Coverage column.** `⌂ 3 · 🏢 2` was two derived counts over two cached indexes, and
  `CoveragePair`, `coverageFor`, `companyLabel` and `CoverageCell` went with it. `ColumnLookups`
  is two maps instead of four.
- **The Outlet filter.** It narrowed by *where the work happens*, which a marketing agreement
  does not record.
- **`?group=outlet`.** The value is `?group=brand`, so an old link lands **ungrouped** rather
  than grouped by a dimension that no longer exists. Reading any truthy value as "group by
  brand" would re-arrange a table somebody linked to for a different reason.

Brand also moves to the **top** of the filter panel. It was last, beside Outlet, on the
argument that both narrowed by where the work happens; that argument left with the outlet.

## 4. The service workflow went with the outlet

Schedules, visits, reports and the health verdict were all keyed on a `(contract, outlet)`
pair. A contract names no outlet, so none of them has a question left to answer.

Deleted: `features/service-reports/` (five files), `app/(app)/service-reports/`,
`visits-card.tsx`, `outlet-service-card.tsx`, `outlet-contracts-card.tsx`, `serviceService`,
the six service hooks, and four cache scopes. The contract detail page is three cards shorter;
`CoverageCard` became `BrandsCard`, which is the same PUT-the-whole-set editor one dimension
over.

Three places had to answer for the loss rather than quietly absorb it:

- **`?view=health`** no longer redirects. It went to `/service-reports?view=expected` for one
  release and there is nowhere to send it now, so it falls through to the contracts table like
  any unrecognised value. A redirect to a 404 would be worse than none.
- **The outlet-close dispositions** (`close-dialogs.tsx`) are inert. `related-contracts` is gone
  from `mock.ts`, so the list is always empty and renders "No contracts cover this outlet" —
  which is *true*. The machinery stays because deleting it is a decision about
  `features/registry`, not about contracts. The "ceasing ends the whole contract, it still
  covers X" warning went, because it could only ever be silent.
- **The ISP contract picker** in the network form is removed rather than re-pointed. It narrowed
  to `category === "internet"` and there is no member an ISP line could honestly be filed under.
  Narrowing to `tooling` would offer a scheduling subscription as the thing behind the router;
  narrowing to nothing leaves a select whose only option is "Not linked", which reads as broken
  rather than absent. `contract_id` stays on the record, so an existing link survives a save.

## 5. `/brands` is registered again, and that is a reversal

`mock.ts` left `/brands` deliberately unregistered in 1.33.0: the real brands moved to the Hono
server, and what remained reading that path was `features/registry-brands/` — an Ops dimension
that was only ever *resolved*, never grouped or filtered by. `EMPTY` was the honest answer.

It is not the honest answer now. Brand is the contracts table's grouping, its primary filter and
the first thing its create form asks for. An empty index would mean one bucket called `…`, a
filter with no options, and a screen that looks broken rather than empty — the exact reading
1.36.1 rejected for the contracts themselves, one dimension up.

**These are not the brands the sidebar switcher shows**, and `fixtures/brands.ts` opens with why
they cannot be. Those are the workspace's, on the Hono server, and in the dev seed are
`Acme Coffee` and `Northwind`. A static fixture cannot know the ids of rows a live server
creates; a contracts table wired to them would render `Group level` on every row in every
workspace that had not happened to name a brand `Harbour Table`. The Ops fixtures — outlets,
companies, vendors, influencers and contracts — are one coherent invented F&B group, and the
brand is the piece of it that was missing.

Four brands, and they fall out of `registry.ts` rather than being invented: its six outlets
trade under three names, its three companies hold them, and the fourth is the group itself.
**Eastside Kitchens is `retired` and holds three contracts**, which is the case the brand filter
is written not to hide — retiring a brand does not un-sign what was signed for it.

`BRAND_IDS` lives in `registry.ts`, not in `brands.ts`, and the direction is forced: `brands.ts`
derives `outlet_count` and `entity_count` from the rows, so `registry.ts` cannot import back
without a cycle. Writing the four literals out twice would be the unchecked-duplicate-id class
1.36.2's third finding closed.

## 6. The agreements

Sixteen, up from fourteen. Every branch the table carries still has a row that reaches it, and
two dimensions changed shape:

- **Brands in all three shapes** — six at group level, six naming one, four naming several, one
  of those reaching all four brands (the group-wide tracking study, which has to look different
  from `Group level` and does).
- **Ten of the eleven categories.** Only `other` has no row, deliberately: it is the escape
  hatch somebody reaches for when nothing fitted, so a fixture that pre-filled it would be
  modelling the data-entry problem the vocabulary exists to prevent. The two new rows —
  a brand identity refresh and a brand-tracking study — exist for `creative` and `research`,
  which would otherwise be two words in the legend and two filter options narrowing to nothing.

`outlets_covered` on the vendor aggregates became **`brands_covered`**, because the number it
counted stopped existing. Leaving it at `0` would have been worse than removing it: a vendor
holding three live retainers reading "0 outlets covered" is a false statement that looks like a
true one. It is still derived from the agreements rather than typed — the rule 1.36.1 set — and
a vendor whose live work is all group-level reads **Group level** rather than "0 brands".

## 7. Verification

```
pnpm typecheck                         clean (11 packages)
pnpm lint                              clean (whole repo)
pnpm format:check                      clean
pnpm test                              2193 passed | 92 skipped (182 files)
pnpm -F @brandfactory/web build        clean
pnpm -F @brandfactory/web-next lint    clean
pnpm -F @brandfactory/web-next build   clean — /service-reports gone from the route table
```

The count moves by three. `contracts.test.ts` lost the two coverage assertions and gained five:
brand references resolve, every category has a glyph and a word, all three brand-cell shapes are
present, a retired brand holds an agreement, and the brand counts are derived from the rows that
name them rather than typed.

**Still no browser pass.** The wall is the one 1.36.0 §9 records and its seven checks stand
unchanged. What that leaves unseen here is the part a suite cannot assert: whether the group
bands read well at four brands, whether eleven category glyphs are distinguishable at 16px, and
whether `Group level` reads as a decision rather than as a gap.
