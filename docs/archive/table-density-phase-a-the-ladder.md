# Phase A — The ladder and the primitives

`packages/web-next/src/lib/table-density.ts` holds three rungs, and
`components/ui/table.tsx` applies whichever one the reader chose.

## What landed

- **`lib/table-density.ts`** — the type, the ladder, the labels, the parser and
  the store.
- **`components/ui/table.tsx`** — a density context that `Table` provides once,
  read by `TableHead` and `TableCell`.
- **`components/layout/query-states.tsx`** — `LoadingRows` follows the rung.
- **`lib/table-density.test.ts`** — 21 tests that parse the ladder back.

No migration. Nothing crosses the wire.

## The preference, not the URL

`lib/stored-preference.ts` already existed for exactly this class of thing and
already had two consumers — the active workspace and the active brand. Row
height is the third, and it is the clearest case of the line those two draw:

> Filters, grouping and sorting live in the URL because they describe *what is
> on screen* and a pasted link has to reproduce it. Density describes *how the
> reader likes to look at it*, and a link carrying one would impose one person's
> eyesight on somebody else's.

So `createStoredPreference("brandfactory.table-density")`, namespaced like
`brandfactory.active-brand` so two Mission Systems apps on one origin cannot
read each other's rungs.

**No pre-paint script**, which is the one thing that does not transfer from the
sibling app this is modelled on. Launchpad stamps `data-density` on `<html>`
before first paint because half of it is server-rendered markup styled by
hand-written CSS. Nothing here reads an attribute: every table in this package
is a client component behind SWR that renders `LoadingRows` first, so by the
time a real row exists hydration is long finished and `useSyncExternalStore` has
already re-read the store. The rung is still mirrored onto the `<table>` element
so what a table is *actually* rendering at is legible in the inspector rather
than living only inside React.

## The ladder

|             | cell           | head        | band   | skeleton |
| ----------- | -------------- | ----------- | ------ | -------- |
| comfortable | `h-12 px-4 py-2`   | `h-10 px-4`   | `h-11` | `h-10`   |
| cosy        | `h-10 px-3 py-1.5` | `h-9 px-3`    | `h-10` | `h-8`    |
| compact     | `h-8 px-2.5 py-1`  | `h-8 px-2.5`  | `h-8`  | `h-6`    |

**Comfortable is what the app already shipped**, and that is the default. A
release that adds a control and silently re-draws twenty-two tables for
everybody who never touches it is a redesign wearing a control's clothes. The
sibling app defaults to `compact` on its owner's instruction; that decision is
left open here.

**32px is a floor, not a taste.** `Badge` is `h-6` — 24px — and a table row's
height in CSS is a *minimum*, so a row carrying a status pill cannot render
shorter than 24 plus its own padding whatever the map says. `compact` is that
arithmetic exactly, 24 + 2×4, and a rung below it would produce a table whose
rows are 32px where there is a pill and 28px where there is not. The test
asserts the identity rather than the number.

**Horizontal padding rides the same rung**, because it passes the test height
passes and type size fails: it changes how much fits without changing what any
cell says. It was a constant `px-4` in the primitive — 16px a side, so 32px at
every column boundary, which on the eight-column influencers table is ~224px of
the measure. Type size is deliberately *not* on the ladder: `max-w-[24ch]` on
the Brands cell is measured in characters, so a smaller face would silently
re-truncate it.

**Every height is a literal class.** `h-[${n}px]` is the trap AGENTS.md already
names for the group rails — Tailwind scans source text, so a class name it
cannot read as a literal emits no CSS at all. The numbers exist only in the
test, which parses the strings back and asserts the ladder descends on all six
axes.

## One subscription per table, not one per cell

`Table` calls `useTableDensity()` once and hands the answer down by context.
`TableCell` reading the store itself would be one `useSyncExternalStore` per
cell — over a thousand subscriptions on the 146-row influencers table, to answer
a question that cannot differ between two cells of the same table.

The consequence is worth stating because it caught two call sites in Phase B: a
component that *renders* a `<Table>` sits **above** its own provider, so it must
read `useTableDensityClasses()` from the store rather than the context. Every
grouped table's band is in that position.

## Why `LoadingRows` is on the ladder at all

A skeleton exists to be the shape of the content it stands in for. A fixed 40px
bar over a table the reader has set to 32px rows is a card that shrinks the
moment the data lands — the jump the component exists to prevent. It reads the
store rather than the context, because it renders *instead of* a table.
