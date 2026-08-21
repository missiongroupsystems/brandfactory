# Phase A — the cell is the control

**Plan:** `docs/executing/influencer-cell-editing-and-profile-links-plan.md`, Phase A.
**Files:** `features/influencers/components/editable-cell.tsx`, `editable-cell.test.tsx`.
**Migration:** none. **Wire:** unchanged. **New dependency:** none.

The ask, in the reader's words: *"Instead of a pencil icon next to each cell, let me click the
cell and edit it there. The pen feels dated."*

## What went, and what replaced it

`editable-cell.tsx` used to export two things. Both are gone.

- **`EditPencil`** — a 14px glyph at each editable cell's right edge, `opacity-0` until the row was
  hovered.
- **`EditableCell`** — a display-to-editor **swap**: a render prop, an `Escape` handler, a per-cell
  pending flag, and a `stacked` prop for the Creator cell's two-line stack.

What the file exports now is one component, **`CellTrigger`**: a real `<button>` that fills the
cell, tints on hover, and is what Base UI's `DropdownMenuTrigger` and `PopoverTrigger` render as.

Two costs sat behind the reader's sentence and only one of them is about fashion.

1. **The pencil was a target inside a target.** A reader pointing at the Status cell had to find a
   glyph at the far end of it, in a column whose content is a pill at the near end.
2. **The pencil was the same mark for four different outcomes** — a text box, a native select, a
   checkbox popover, and a navigation to a whole-record form. It said *something happens here* and
   nothing more. A chevron on the cells that open a list says which of them.

## The three properties that were kept

None is what the reader objected to, and all three are easy to lose in a restyle. Each has a test.

- **A real `<button>` in the tab order at all times.** The pencil was `opacity-0` rather than
  `hidden` for exactly this reason — a hidden button is not focusable. A cell-wide button keeps the
  property and improves on it: nothing is revealed, so nothing is reserved, so **nothing shifts on
  hover**. That is what retires the hack in the Reach cell, where the pencil sat *before* the figure
  so its reserved width could not push the numbers off the column's right edge.
- **Sized from the density rung.** `useTableDensityClasses().editor` is the cell's content box
  exactly, so a cell's resting state and whatever opens over it are the same height. A caller with a
  two-line cell overrides it (`className="h-auto"`), and `twMerge` is what makes the override work —
  pinned by a test, because two `h-` classes on one element is the kind of thing that silently stops
  working.
- **Nothing is optimistic.** `CellTrigger` takes a `pending` flag, disables itself and shows a
  spinner beside the value it *still holds*. The cell says "this is being saved", never "this is
  saved".

## The one property that was dropped

**`stacked`.** It existed solely for the Creator cell's two-line stack, and Phase C takes the editor
out of that cell. The 10px regression it was invented to fix in 1.49.0 cannot recur once nothing
edits there.

## The tint is one step deeper than the row's own

This is the decision most likely to be undone by somebody tidying tokens.

`TableRow` already paints `bg-surface-hover` (beige-100) across the whole row on hover. A cell tint
at that same token would be **invisible at exactly the moment it is needed** — the row is already
lit by the time a pointer reaches the cell. So the cell goes to `bg-surface-selected` (beige-200),
which reads as one step further in. Focus and the open state (`aria-expanded:`) take the same token,
so a keyboard user sees what a pointer does and an open menu keeps its cell marked.

`editable-cell.test.tsx` asserts `hover:bg-surface-selected` **and** the absence of
`hover:bg-surface-hover`.

## The accessible name extends rather than replaces

`aria-label` would have been the obvious move and is wrong here: it *replaces* the accessible name,
so 146 buttons would all be named "Edit status" and none of them would say which row. `CellTrigger`
appends an `sr-only` phrase after the cell's own content instead, so the name reads *"Prospect, Edit
status"*.

Where the trigger has no visible content of its own — the sibling in the Platforms cell — that
phrase is the whole name, which is why the prop takes a phrase (`Edit the accounts of Priya Raman`)
rather than a noun.

## The chevron is drawn, never revealed

A mark that appears under the pointer has to reserve its width anyway, and reserving it without
drawing it buys nothing but a flicker. It is `ml-auto` so the chevrons line up down the column
whatever each value's width — the one thing the pencil's position got right.

## What this phase discovered

**The swap has no callers left.** Not "no uses today" — none at all: Phase B turns the two enum
columns into menus, Brands was always a popover, Phase D gives Platforms and Reach a panel, and
Phase C stops the Creator cell being editable. Every cell on this table now opens *something
anchored to it*.

So `EditableCell` was deleted rather than kept for a future text column. That is a consequence the
plan does not state, and it is the reason this file is 130 lines where it was 213.

## Tests

`editable-cell.test.tsx` is rewritten around `CellTrigger`: eight assertions, all of them about
things a browser pass cannot see — the tab order, the accessible name, the tint token, the rung
height, the `h-auto` override, the chevron, and the pending state.
