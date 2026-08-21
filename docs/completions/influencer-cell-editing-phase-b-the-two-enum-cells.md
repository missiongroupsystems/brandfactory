# Phase B — the two enum cells become menus

**Plan:** `docs/executing/influencer-cell-editing-and-profile-links-plan.md`, Phase B.
**Files:** `features/influencers/components/inline-editors.tsx`, new `inline-editors.test.tsx`.
**Migration:** none. **Wire:** unchanged. **New dependency:** none.

Vertical and Status stop swapping the cell for a native `<select>` and start opening a menu
anchored to it, with the current value ticked.

## Why a menu is the honest control

`DropdownMenu` with `menuitemradio` children is the clear side of the line AGENTS.md draws between a
menu and a popover: this is **a single choice from a closed list**, not a panel of form controls, so
`role="menu"` is what it actually is.

The Brands picker keeps its `Popover` for the same rule read the other way — a column of checkboxes
in a `role="menu"` announces "menu, N items" and fights their keyboard handling.

## It retires a bounded defect rather than only restyling one

This is the part that is easy to read as a restyle and is not. `EnumEditor`'s own docstring recorded
the cost it had accepted:

> arrow keys on a *closed* select fire `change` per press, so a keyboard user stepping through three
> statuses could fire three writes. The editor is **disabled while the write is in flight**, which
> caps it at one write per open.

That is a race won by a lock, not a case that does not exist. A menu moves a **highlight** on the
arrow keys and commits on `Enter` or on click, so stepping through the list writes nothing at all.

`inline-editors.test.tsx` pins it: open the status menu, press `ArrowDown` twice and `ArrowUp` once,
and assert `commit` was never called. That test is the reason the file exists.

## The open state is controlled, and closing is this file's job

Base UI's `Menu.RadioItem` does **not** close the popup on select by default — a radio group is
often something you tick more than once. Here it is exactly one choice, so the menu is closed from
`onValueChange` *before* the write is started. Leaving it open over a cell that is already saving
would offer a second choice the disabled trigger has no way to refuse. Asserted.

## Two details that would otherwise be discovered

- **`w-auto min-w-40` on the content.** `DropdownMenuContent` defaults to `w-(--anchor-width)`,
  which here is the width of a 14%-share table column — and "Family & lifestyle" does not fit in
  one. `align="start"`, because both columns are read from their left edge.
- **`Generalist` is a real, labelled item** rather than a blank one. `InfluencerSchema` says `null`
  there is *"a genuine generalist, not an unclassified row"*, which is why the union has no `other`
  member. Asserted, including that it reads as ticked when the record's `vertical` is `null`.

## The shape of an editor changed

`VerticalEditor` and `StatusEditor` used to be render-prop children of `EditableCell` and took an
`EditorSlot`. They are now self-contained components on `BrandsEditor`'s shape: they take
`{influencer, commit, display}` and own their own `open` and `isPending`.

The `settle` helper and the shared `EditorSlot` type went with the swap. Each editor marks its own
pending state around its own `await`, which is what `CellTrigger`'s `pending` prop renders.

## Tests

Five, in a new `inline-editors.test.tsx`: the radio roles and the ticked item, one commit per
choice with the right `FieldEdit`, the menu closing on the choice, the arrow-key assertion above,
and `Generalist` as a labelled ticked option.
