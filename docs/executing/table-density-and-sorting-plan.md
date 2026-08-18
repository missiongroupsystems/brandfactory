# Row height is the reader's, column order is the link's

## The problem

The Influencers table answers two questions badly, and they are not the same
kind of question.

**How much is there.** Every row is 48px, because `components/ui/table.tsx` says
`h-12` and no reader has ever been asked. The roster is 146 people. On a 900px
viewport that is fourteen rows visible out of a hundred and forty-six, and the
first thing anybody does with a media list — scan it — costs ten screens of
scrolling. Nothing in the product says 48px is right; it is the shadcn default
that arrived with the Operations Hub shell and was never revisited.

**What order they are in.** The rows arrive in reach order because the server
sorts them that way, and that is the only order there is. A reader who wants the
roster by name, by engagement, by status or by vertical has no control at all —
the column headings are `<th>` elements with text in them. Every other list app
this group uses lets you click a heading.

The second one has a rule against it in `packages/web-next/AGENTS.md`:

> **Do not add column sorting.** No list endpoint takes a sort parameter, so a
> sortable header could only reorder the rows already fetched — on a paginated
> list, sorting by name puts "Zephyr" at the top of page one while "Alma" sits
> unfetched on page three. It needs backend support first.

The rule is right and the reasoning is exact. It is also **about pagination**,
and `/influencers` is not paginated. `GET /workspaces/:id/influencers` returns
the whole roster in one response — that is what 1.40.0 built and what
`useInfluencers` consumes, and it is the same property that lets the tier bands
claim true counts and the footer claim a total. "Zephyr alone on page one"
cannot happen on a list with no page two.

So this release does one thing the rule forbids, on the one screen where the
reason for the ban does not hold, and amends the rule to say which property
earns the exception rather than deleting it.

## The shape

Two changes that share a toolbar and nothing else.

```
ROW HEIGHT                            COLUMN SORT
  a reader preference                   a view of the data
  localStorage                          the URL
  every table in the app                /influencers only
  no server involvement                 no server involvement, because
                                        this list is exhaustive
```

They land in one release because they are the same sentence to the person who
asked for them — "let me control the table" — and they are kept apart everywhere
below because a shared link must reproduce the sort and must **not** impose
somebody's eyesight on the reader.

### Row height is a preference, so it is not in the URL

`launchpad` settled this argument already and the reasoning transfers whole: how
tight a reader likes their rows is a fact about the reader, the same class of
thing as a theme and the opposite of a filter. Filters, grouping and now sorting
live in the URL because they describe *what is on screen* and a pasted link has
to reproduce it. Density describes *how the reader likes to look at it*.

`lib/stored-preference.ts` is already this app's answer for that class — the
active workspace and the active brand both use it, and `AGENTS.md` records the
call. Density becomes the third.

**Three rungs, and each is a literal Tailwind class.** Comfortable is the 48px
row this app ships today, so the default changes nothing until somebody picks a
rung. Compact is 32px and that is a **floor rather than a taste**: `Badge` is
`h-6`, a row height in CSS is a minimum, and a table whose rows are 32px where
there is a status pill and 28px where there is not is worse than one that is
honestly 32px throughout.

Horizontal padding rides the same rung. It passes the test height passes and
type size fails — it changes how much fits without changing what any cell says —
and 16px a side means 32px at every column boundary, which on this eight-column
table is a quarter of the measure.

**The classes are written out, never built.** `h-[${n}px]` is the trap: Tailwind
scans source text, so a class name it cannot read as a literal emits no CSS at
all. The numbers exist only in the test, which parses the strings back and
asserts the ladder descends.

### The control is central, so it lands everywhere at once

Every list screen in this package renders `FilterBar` or `FilterToolbar`. Those
two components render the **View** popover themselves, which is what put the
row-height control on twenty toolbars in one edit rather than twenty edits that
would each need remembering.

Two of them nest — `/outlets`, `/vendors` and `/contracts` put a `FilterBar`
inside a `FilterToolbar` — so the slot is claimed through context. The toolbar
takes it and the bar inside sees it is taken. Not a `density={false}` prop at
three call sites: that is a rule enforced by whoever remembers it, and the
fourth screen to nest them would ship two View buttons.

The panel is `FilterPopover`'s shape, for `FilterPopover`'s reason — collapsing
controls is acceptable when what is *set* stays legible outside. Density is the
exception to that and is deliberately excluded from the trigger's active state:
it is a remembered preference, so counting it would light the trigger up forever
for everybody who once chose 32px rows, and a signal that is always on is not a
signal.

### Sorting turns grouping off

`/influencers` groups by reach tier by default, and the two controls are
exclusive by design rather than composed.

A sort inside the bands would mean the table has two orders at once — bands in
reach order, rows in name order — and the reader has to hold both to predict
where a row is. Worse, it makes the screen's one strong claim ambiguous: the
bands exist to say *this is what reach buys*, which is a statement about
ordering, and a band whose rows are alphabetical no longer makes it.

So a click on a heading writes `?group=none` with the sort, the bands go, and
the **Tier** column comes back — the column the ungrouped view already has.
Pressing `Group by reach` clears the sort and the bands return. One state, one
order, always legible from the URL.

**Every column sorts by what it shows.** Text columns A→Z, numbers 1→n, and the
two set-valued columns — Platforms and Brands — by how many. That last rule is
stated on the control rather than left to be discovered: a column holding
`Instagram, TikTok` has no alphabet of its own, and count is the only ordering a
reader can predict.

**Three states, not two.** Ascending, descending, then off — off being the
server's own reach order, which is the order the screen opens in. A two-state
toggle would leave no way back to the default without editing the URL.

## Phases

**A — The ladder and the primitives.** `lib/table-density.ts` and the density
context in `components/ui/table.tsx`; `LoadingRows` follows the rung so the
placeholder is still the shape of the content it stands in for. Tests parse the
ladder back.

**B — The control.** `TableDensityControl`, the `ViewSettings` panel, the slot
context, and the three grouped tables whose band height is hand-written and has
to join the ladder.

**C — Sorting on `/influencers`.** The comparators and their tests, a
`SortableHead` that carries `aria-sort`, the exclusivity with grouping, and the
`AGENTS.md` amendment that says which property earns the exception.

**D — The release.** One completion document per phase, the changelog entry, the
full gate.

## What this does not do

- **No server sort parameter.** The list is exhaustive, so the client holds the
  whole roster and can order it truthfully. The moment `/influencers` paginates —
  `listInfluencersByWorkspace` names ~150 rows as the tripwire, and the roster is
  at 146 — the sort has to move to SQL with the cursor. That is written into the
  amended rule rather than left as a surprise.
- **No sorting anywhere else.** Every other list in this package is
  cursor-paginated, so the ban stands for all of them unchanged.
- **No column picker.** The screenshot that prompted this carries one, and it is
  a different piece of work: it needs a per-screen column registry and a stored
  set, and neither exists here yet.
