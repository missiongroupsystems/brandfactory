# The sidebar learns whether you are in a brand

One phase, one release. No migration, no server change, no new wire path.

## What changed

**Two navs, and the path picks one.** `brandIdFromPath` reads the id under `/brands/:id` and
returns `null` everywhere else. `AppSidebar` branches on it once, at the top, and the two halves
below are `WorkspaceNav` (the eleven tables that span all brands) and `BrandNavItems` (the two
screens that have no meaning without one). The header branches with them: the product lockup on
the workspace side, the way back to `/brands` plus the brand's mark and name on the other.

**`/brands` exists and is the only door into a brand.** A card each: the monogram, the line the
brand describes itself with — `brandDescriptionLine`, so this app and `packages/web` print the
same line under the same brand — and the two counts `BrandSummary` carries. Cards rather than the
table every other list screen uses, because a workspace holds a handful of brands and nobody sorts
them; what matters is recognising one.

**The brand switcher is deleted.** `components/layout/brand-switcher.tsx` is gone, with the
`DropdownMenuRadioGroup` whose change-only semantics meant re-picking the brand you were already
in did nothing at all.

**`Registry` is gone, and it is not a rename.** It held one genuinely brand-scoped screen and one
workspace table, which is why no label could have been right for it. Both left: *Brand profile* is
`/brands/:id` and *Outlets* is `/brands/:id/outlets`.

**`Tools` arrives with two placeholders**, `/tools/funnel` and `/tools/photography`, both tagged
`Empty` in the rail and both rendering `PlaceholderPage` — a screen that states it holds nothing
rather than a spinner or a table of invented rows.

**`/brand` and `/brand/:id` are deleted.** Nothing outside the switcher linked to either.

## The three decisions worth keeping

**The mode is derived, never stored.** A sidebar mode held in state has to be cleared on every
navigation away from a brand, and the browser's back button is where that would eventually be
forgotten — leaving a rail headed *Casa Vostra* over a workspace page. One pure function reading
`usePathname()` cannot drift, and `nav.test.ts` pins it against the neighbours that would fool a
plain `startsWith`: `/dashboard`, `/brandsomething`, and the Operations Hub's `/registry-brands`.

`brandNavHref` and `brandIdFromPath` are tested as a **round trip** rather than separately. They
are the two ends of the same switch, so a writer that escapes and a reader that does not would be
a brand rail that vanishes on the first id with a character in it.

**Outlets is *scoped* by the route, not filtered by it.** `OutletsBrowser` takes `brandId`, and
what that removes is the point: the Brand column's sub-line, the brand filter, the "By brand"
grouping and the brand half of the empty state. A column of one repeated value is furniture and a
filter the reader cannot clear is a lie about being a filter. `by` is *forced* to flat rather than
merely hidden, so a `?by=brand` pasted from the workspace table cannot resurrect a control the
screen no longer draws — and the scope is applied before every other predicate, so `Clear filters`
cannot widen past it.

**Which screens moved, and the test for the next one.** An outlet belongs to exactly one brand, so
a per-brand table is its true shape. Contracts, Vendors and Influencers are each many-to-many with
brands — a contract names several — so the cross-brand table is *their* true shape and a per-brand
view would be a filter pretending to be a scope. They stayed. That is the test to apply before
adding a row to `BRAND_NAV_ITEMS`, and it is written down in `AGENTS.md`.

## What was left alone, and why

**`/outlets` and `/outlets/[slug]` still exist.** Seven live links reach an outlet from a screen
that holds an outlet id and no brand — four on the Dashboard, three in the review queue — and
nineteen more from the cut-from-nav Ops areas. They are simply no longer doors in the rail. Inside
a brand the same two components render under `/brands/:id/outlets`, told apart by one `basePath`
prop that moves the back link, the delete redirect and the cosmetic id→slug rewrite. Forking the
components would have been two copies of a 700-line table to keep in step.

**The stored preference survives, demoted.** `active-brand.ts` still answers "which brand was I
last in" — the card the gallery marks, and the fallback for a surface with no id in its path — and
every list screen still reads its `brands` array under one shared SWR key, so none of them gained a
request. What it no longer does is decide what a brand page shows. `BrandNavHeader` writes it on
the way past, guarded on a brand the workspace actually holds, so a stale link cannot overwrite a
good selection with a dead id.

## Gate

`typecheck`, `lint`, `format:check`, `next build` and the full suite all pass. 13 tests added — 11
in `nav.test.ts` for the two path helpers and the new groups, 2 in `outlet-href.test.ts` for the
base path.
