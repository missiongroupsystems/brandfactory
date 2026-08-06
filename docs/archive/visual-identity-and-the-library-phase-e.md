# Phase E — the rail card: the palette gets a card of its own

**Status:** complete, 2026-08-04. Written against `main` at **1.21.3** +
Phases A–D.

Executes §7 of
[`docs/executing/visual-identity-and-the-library.md`](../executing/visual-identity-and-the-library.md).
**The phase the original ask was actually about** — *"Visual Identity could
become a separate righthand side block instead of an 'App'"* — and deliberately
last of the UI phases so it lands on a model that already supports it.

The hub's right column holds two cards. The palette has moved out of the Brand
context card, which is back to one rule with no exception. 4 source files, 3 test
files, +15 tests.

---

## 1. What moved, and what that buys

```
┌─ Brand context ─────────────┐
│ 3 written · 4 suggested     │   unchanged, minus the palette
│ TL;DR / Overview            │
│ ──────────────────────────  │
│ Voice & tone / …            │
│ Talk it through · Research  │
└─────────────────────────────┘
┌─ Visual identity ───────────┐   new
│ ▣  Wordmark                 │   the declared mark, or the monogram
│ ▪▪▪▪▪ Palette · 5 colours   │   moved out of the card above
│ Aa Satoshi — headings       │   typefaces, when there are any
│ ──────────────────────────  │
│ Photography · 24            │   the hub's way into the other two shelves
│ Collateral · 6              │
└─────────────────────────────┘
```

**The palette was always a guest.** It went into the Brand context card in 1.8.0
because there was nowhere else on the hub for it, under a hairline of its own,
and that card's comment conceded the point in as many words: *"the section list
above is the meter — written sections and unwritten suggestions, one list — and a
swatch row inside it would be neither."*

So the move is not decoration. It buys the Brand context card back its one clean
rule, and it gives the swatches a card where they are the tenant. Both are ~200px
apart in the same column, which is what makes it cheap.

## 2. The card renders nothing at all, and that is the design

`VisualIdentityCard` returns `null` for a brand with no mark, no colours and no
typefaces. A brand with an empty identity is a legitimate brand
(`docs/vision.md:28`), and a card saying *"no marks, no colours, no typefaces"*
is exactly the scolding 1.7.0 spent a pass removing.

**The two shelf links go with it.** They are the card's footer, not a fifth
block, and a footer with no card is a floating pair of counts. Nothing becomes
unreachable — the `Library` nav group is on screen on every page of the brand.

Every block follows the `undefined` ≠ `[]` rule the palette block already
carried: `undefined` is *not known* (pending or failed) and renders silence, `[]`
is *none* and renders silence, and the difference matters because a block that
flashes empty on every navigation is worse than one that appears 100ms late.

**Mutation-verified.** Replacing the guard with `if (false)` fails five tests
across two files — the three shapes of "no identity yet", the stray-colour case,
and the hub's own omission case.

## 3. Typefaces read a role, and infer nothing

The block lists `role === 'typeface'` assets by label. A font file with **no**
role is a file on the identity shelf and is not claimed here.

That is the same rule migration 0011 states for not backfilling: a role is a
declaration about one asset, and nothing infers one from a mime type or an
extension. `defaultLibraryFor` can file a typeface on the identity shelf; it
cannot tell you that a given `.woff2` *is* the brand's. A user marks it — from
the Typefaces section, which is F3.

**Labels, not specimens.** Rendering the brand's own face needs the bytes served
with a real font content-type and an injected `@font-face` on an origin whose CSP
allows it. Separate pass, stated non-goal, and the file says so.

## 4. A finding: the width belonged to the column, not the rail

The rail carried `sm:max-w-[calc(50%-0.375rem)] lg:w-80 lg:max-w-none lg:shrink-0`
as its own `className`, which was correct while it was the only thing in the
right column. A second card beside it would have had to repeat all four values
or drift at every breakpoint.

The classes moved up to a new `<aside className="flex flex-col gap-3 …">`. Same
values, one level up, and `gap-3` between the cards — matching the tile grid's
own gap so the column reads as one rhythm. The comment explaining *why* the
measure is `calc(50% - 0.375rem)` (it is one column of the `sm:grid-cols-2 gap-3`
grid, so the card's right edge lands on the grid's) moved with it, since that
reasoning is now about the column rather than about the rail.

## 5. What the rail lost, exactly

- The `colors` prop, the `paletteHref` prop, the block, and the
  `ColorSwatches`/`paletteSummary` import.
- The `BrandAsset` type import — **this component no longer knows what an asset
  is**, which is a better statement of the split than the comment that used to
  explain it.

Only `BrandHubView` ever passed either prop (`brands.$brandId.context.tsx` passes
neither), so the context page is untouched — verified by grep before deleting.

`BrandHubView` lost `colors` and `visualHref` with them, and its `assetsOfKind`
import: the card takes the whole `assets` list and derives its own, which is the
same work done in the component that owns the question.

## 6. The tests moved rather than being rewritten

E4's instruction, followed literally: the palette cases are in
`VisualIdentityCard.test.tsx` now, so what they proved is not quietly lost with
the block.

What stayed in `BrandContextRail.test.tsx` is the assertion that only makes sense
from *that* side, and it is new: **the rail draws no swatches at all.** Without
it, re-adding the block would go unnoticed, because every remaining test in that
file passes a brand with no assets and would pass either way.

Four cases are new rather than moved, and each pins something the block never had
to answer:

- **The mark.** Named when declared, `Monogram` when not — and a `proposed` logo
  is *not* the mark, because `logoAsset` applies the active filter itself.
- **A stray colour.** A colour filed on another shelf is not this brand's
  palette. Nothing in the UI can produce one today (`handleAddColor` files
  identity always), which is precisely why the filter is asserted rather than
  assumed.
- **An identity file with no role** claims no Typefaces block.
- **The shelf links**, with each shelf's own count, and `0` rather than silence
  for an empty one — the query resolved; the shelf is empty.

## 7. The files

| File | Change |
| --- | --- |
| `components/brand/VisualIdentityCard.tsx` | **new** — mark, palette, typefaces, two shelf links; `null` on an empty identity |
| `components/brand/BrandContextRail.tsx` | palette block, both props, two imports, and the exception in its doc comment all deleted |
| `components/brand/BrandHubView.tsx` | the `<aside>` column; the card; `colors`, `visualHref` and `assetsOfKind` gone |
| `components/brand/VisualIdentityCard.test.tsx` | **new** — 14 tests |
| `components/brand/BrandContextRail.test.tsx` | palette cases out, the "no swatches at all" pair in; asset fixtures deleted |
| `components/brand/BrandHubView.test.tsx` | +2 (both cards; the card absent), 1 rewritten to locate the palette inside the card |

## 8. Verification

```
pnpm typecheck                    clean — all 10 packages
pnpm lint                         clean (whole repo)
pnpm format:check                 clean (whole repo)
pnpm test                         1454 passed | 68 skipped (136 files)
pnpm -F @brandfactory/web build   clean
```

Tests **1439 → 1454 (+15)**. Cumulative A–E: **1394 → 1454 (+60)**, skipped
64 → 68.

## 9. Caveats

- **Not seen in a browser, and this is now the biggest of the debts.** A card
  was added to a column that had one, a block moved between them, and jsdom
  cannot say how that column reads at any breakpoint. Specifically worth looking
  at: whether two cards `gap-3` apart read as a pair or as clutter; the card's
  own hairline density (heading, mark, palette, typefaces, footer is four rules
  in one card — one more than the Brand context card's); and the stacked
  sub-`lg` layout, where the column is now two cards deep below the tiles rather
  than one. Phase G, non-skippable.
- **Typefaces has no producer yet.** `role: 'typeface'` exists (0011) and nothing
  writes it until F3, so the block is unreachable on a real brand today. The
  tests drive it directly.
- **`AssetLibraryView` is still unchanged** — all three shelves render the same
  derived sections. F is the last of the build phases.
