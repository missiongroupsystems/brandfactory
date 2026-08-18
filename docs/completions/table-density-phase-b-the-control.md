# Phase B — The control, on every list screen

A **View** popover holding the row height, rendered by `FilterBar` and
`FilterToolbar` rather than by twenty screens.

## What landed

- **`components/layout/table-density.tsx`** — `TableDensityControl`, three
  buttons.
- **`components/layout/view-settings.tsx`** — `ViewSettings`,
  `ViewSettingsSection`, and the slot context.
- **`components/layout/filter-bar.tsx`** — both containers render the panel.
- The three grouped tables — `/influencers`, `/outlets`, `/contracts` — whose
  band height was hand-written and had to join the ladder.

No migration.

## Three buttons, and the glyphs are the measurement

`Rows2` · `Rows3` · `Rows4` draw two, three and four bars in the same box: the
icon shows how many rows fit, which is the actual question. Icon-only is only
acceptable because the word is not lost — every button carries a tooltip and an
`sr-only` label, which is the trade AGENTS.md requires wherever a glyph is the
visible carrier.

`aria-pressed` rather than `role="radiogroup"`: they act immediately and there
is nothing to submit, so radio semantics would promise arrow-key selection the
control does not implement. That is `SegmentedControl`'s recorded reasoning for
the same shape, and this deliberately wears that component's shell — same
height, border, surface and 2px inset — so a panel carrying both does not read
as two kinds of control.

The preference is global and remembered, and that is stated in the group's
accessible name rather than in visible copy. A sentence of explanation on twenty
toolbars would be twenty copies of something one use teaches.

## Why a panel and not the bare control in the row

The argument for the bare control is real: a setting you change *while looking
at the thing it changes* should cost one click, in place, with the answer
visible behind it. The arithmetic on this app's toolbars beats it.
`/influencers` already carries a search field, **Filters**, `Group by reach`,
**Sync** and **Add creator**. A three-button glyph cluster is the sixth control,
the row wraps, and the cluster is stranded on a line of its own under the search
box — at which point it has already lost the adjacency the one-click argument
was buying.

So presentation folds into one trigger, in the shape `FilterPopover` already
established for the filters, for the same reason: collapsing controls is
acceptable when what is *set* stays legible outside — and a row height is
legible in the rows.

## The trigger's active state deliberately ignores the density

`modified` is the caller's business — a grouping the reader turned off, a sort
they chose. Density is excluded, because it is a *remembered* preference:
folding it in would light the trigger up permanently for everybody who once
chose 32px rows, and a signal that is always on is not a signal. Same
distinction `FilterPopover` draws when its count excludes `q`.

Nothing passes `settings` yet, so the panel currently holds row height alone on
every screen.

## The slot context, and the bug it prevents

`FilterBar` and `FilterToolbar` both render the panel, which is what put the
control on every list screen in one edit. **Three screens nest them** —
`/outlets`, `/vendors` and `/contracts` put a `FilterBar` inside a
`FilterToolbar`'s children — so without a claim those three would ship two
**View** buttons side by side.

`ViewSettingsSlotClaimed` wraps the toolbar's subtree and the bar inside reads
`useViewSettingsSlotTaken()`. Deliberately a context and not a `density={false}`
prop at the three call sites: that is a rule enforced by whoever remembers it,
and the fourth screen to nest them would ship the bug.

## Position in the row

In `FilterToolbar` the trigger is **last in the left cluster**, beside Filters
rather than beside the primary action. Both are questions about the table below
— one narrows what is in it, the other decides how it is drawn — and the right
cluster is where the thing that *writes a row* lives. A reading preference next
to "Add creator" is a miscategorisation the reader can see.

In `FilterBar` it sits after the filters and **before** "Clear", which is the
only position that does not move: put last it would slide sideways every time a
filter is set or cleared. It is not counted by `activeCount` — it narrows
nothing, and "Clear 3 filters" must never mean "and put the rows back to 48px".

## The bands could not inherit

A group band is a `TableCell` with `p-0` and a button inside, so it takes its
height from a hand-written `h-11` rather than from the cell. Three tables render
one, and all three now ask `useTableDensityClasses()` for the same rung — read
from the store rather than the context, because each of them is the component
that *renders* the `<Table>` and therefore sits above its own provider.

## What was left alone

`/contracts` has its own **Columns** popover, which is the other half of the
panel in the screenshot that prompted this work. It is not folded into **View**
here: it is a per-screen column registry with its own URL state, and moving it
is a change to a screen nobody asked about. It is the obvious next occupant of
`settings`.
