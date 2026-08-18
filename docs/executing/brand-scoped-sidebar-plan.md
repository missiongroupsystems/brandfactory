# A sidebar that knows whether you are in a brand

## The problem

The Next shell has one sidebar and a brand dropdown pinned to its header. That
shape says the brand is a *filter* applied to a fixed set of screens. It is not.
The brand is the thing the product is about, and the screens divide cleanly into
two kinds:

- **Workspace screens.** Dashboard, Contracts, Quotations, Vendors, Influencers,
  Review, Marketing Requests. Every one of them is a table across all brands with
  a Brand column and a brand filter. None of them is *inside* a brand.
- **Brand screens.** Brand profile, and Outlets once it is scoped. These have no
  meaning until you name a brand.

The dropdown flattened the difference. It offered a brand switch on the Dashboard,
where nothing answers to it, and it made the brand profile reachable only through
a control that reports changes — so re-picking the brand you were already in did
nothing at all.

Three further consequences of the same mistake:

- `Registry` grouped *Brand profile* and *Outlets* under a label borrowed from the
  Operations Hub. There is no registry here; there is a brand and the things that
  hang off it.
- The brand never appeared in the URL. A link to a brand profile opened whichever
  brand the *reader* had last selected — a preference in their own `localStorage`.
- `/brands` — the product's most important plural — stayed unclaimed for four
  releases while `/brand` and `/brand/:id` both rendered the same page.

## The shape

Two sidebars, and the route decides which one you get.

```
MAIN SIDEBAR                     BRAND SIDEBAR   (under /brands/:id)
  Dashboard                        ← All brands
  Brands                           ▣ Casa Vostra
                                   ───────────────
CONTRACTS & SERVICES                 Brand profile
  Contracts                          Outlets
  Quotations
  Vendors
  Influencers

TOOLS
  Marketing funnel
  Photography

RESOURCES
  Review
  Marketing Requests
```

`/brands` is a gallery of cards, one per brand. Opening a card is what "selecting
a brand" means, and it is a navigation rather than a preference write — so the
selection is in the URL, the back button undoes it, and a pasted link opens the
brand it names for whoever opens it.

## The decisions

**The mode is derived from the path, and from nothing else.** `brandIdFromPath`
returns the id under `/brands/:id` and `null` everywhere else, including on
`/brands` itself. There is no second stored flag and no context provider: a
sidebar mode held in state would need clearing on every navigation away, and the
one place it would eventually be forgotten is a browser back button.

**The stored preference survives, demoted.** `active-brand.ts` still answers
"which brand" for screens that have no id in their route, and every list screen
still reads its `brands` array under one shared SWR key. What it no longer does is
decide what the brand profile shows. Opening a brand writes the preference on the
way past, so the two never disagree.

**`/outlets` stays reachable and leaves the nav.** The brand's outlets live at
`/brands/:id/outlets`, filtered to that brand, with no Brand column and no brand
filter — a column of one repeated value is furniture. The workspace-wide
`/outlets` route stays because Dashboard and Review link into outlet records from
screens that know an outlet id and no brand; it is simply no longer a door in the
sidebar. `OutletsBrowser` and `OutletDetail` take a `brandId` / `basePath` pair
rather than being forked.

**`/brand` and `/brand/:id` go.** Both rendered the profile; `/brands/:id` now
does. Nothing outside the deleted switcher linked to either.

## The work

1. `nav.ts` — drop `/brand` and `/outlets` from `NAV_ITEMS`, add `/brands` beside
   Dashboard in the unlabelled group, add the `Tools` group with two placeholders.
   Add `BRAND_NAV_ITEMS`, `brandNavHref`, `brandIdFromPath`, `isActiveBrandNav`.
2. `app-sidebar.tsx` — two modes; delete the `BrandSwitcher` row from the header.
   `brand-nav.tsx` holds the brand column: back link, mark, name, items.
3. `features/brands/components/brands-gallery.tsx` — the cards, plus `New brand`.
4. Routes: `/brands`, `/brands/[id]`, `/brands/[id]/outlets`,
   `/brands/[id]/outlets/[slug]`. Delete `/brand` and `/brand/[id]`.
5. `/tools/funnel` and `/tools/photography` on a `PlaceholderPage` that states it
   is empty rather than looking unfinished.
6. `outlet-href.ts`, `outlets-browser.tsx`, `outlet-detail.tsx` — take a base path
   and an optional brand scope.
7. Tests: `nav.test.ts` for the new groups and the two path helpers.

The placeholder titles and routes are one edit each in `NAV_ITEMS`; they are named
from `docs/plans/feedback.md` so the group is not two rows called `Tool one`.
