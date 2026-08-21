# Phase C — The editable cell

**Four columns on `/influencers` edit where they are.** A name, a vertical, a brand set and a
status now take a `PATCH` of exactly one key from the cell the reader is already looking at. The
four derived columns do not, and two of them open the record's own form instead. No server change,
no migration.

Plan: `docs/executing/influencer-quick-add-and-inline-edit-plan.md`, Phase C.

## The argument that changed, and the one that did not

`influencers-browser.tsx` carried this:

> Create only. **Editing lives on the record page**, and that split is deliberate rather than
> unfinished: this table has no actions column, and giving it one to reach a form that the
> creator's own page already holds would put the same sheet behind two entry points.

Half of that was about a **per-row actions menu**, and it is still right — there is still no
actions column, and the rows are still a link rather than a menu.

The other half did not survive the most common edit this table takes. Moving one creator from
`prospect` to `active` cost a navigation, a sheet, a select, a save and a navigation back — and the
sheet it opened **replaces the entire account list and brand set on submit**, because both are
full-replacement keys. So the cheapest correction in the product was also its heaviest write. The
docstring is rewritten to say which half survived.

## What was built

### `lib/table-density.ts` gains a fifth rung — `editor`

`Input` and `Select` are both a fixed `h-10`. That is taller than the content box of every rung but
the loosest, so an editor at its natural height grows the row it opened in and pushes every row
below it down — with the reader's pointer still on the row they clicked.

So the ladder gains an `editor` slot at `h-8` / `h-7` / `h-6`, and its rule is arithmetic rather
than taste: **the cell's height less its own vertical padding, on every rung**, which is the content
box exactly. `compact` lands at 24px, the same 24px the badge floor is built on, so the tightest
rung's editor is as tall as the pill beside it and no taller.

`table-density.test.ts` asserts it — `editor h === cell h − 2 × cell py` for all three rungs, plus
the strict descent the other five axes already get. That test exists because these are literal
Tailwind strings that no type can relate to each other, and the failure ships silently: the editor
only appears on click.

### `features/influencers/patch.ts` — the seam the tests aim at

`patchFor(edit)` returns an `UpdateInfluencerInput` of **exactly one key**, or `null` when the value
cannot be written at all.

Everything else in this phase is a control that has to be clicked to be seen. This is the part that
is arithmetic, and it holds the rules that are wrong by one character:

- **`""` → `null` for the vertical.** The select's empty option is `Generalist`, and
  `InfluencerSchema` says `null` there is *"a genuine generalist, not an unclassified row"*.
  Sending `""` fails the enum; omitting the key silently leaves the old vertical in place, so a
  reader who chose `Generalist` would watch the cell snap back.
- **Trimming the name**, because `InfluencerNameSchema` trims — which is also what lets
  `isUnchanged` answer honestly for a reader who only added a space.
- **The empty brand array is sent**, not omitted. "Not engaged yet" is a fact.

Every branch narrows through the **shared zod schema** rather than through a cast, so this file is
validating with the same object the route validates with and cannot drift from it.

`null` means *do not send this*, never *send an empty patch*: `UpdateInfluencerInputSchema` refuses
a bare `{}` at the wire, so a builder that returned one would turn a local mistake into a round trip
and a 400.

`isUnchanged(influencer, edit)` is the second export and the no-op guard. The case it is really for
is the text editor's blur: click into a name cell, click straight out, and without it the app
writes, sweeps two cache scopes and refetches 146 rows to store what was already there.
**`brandIds` compares as a set** — the server sorts the record's ids and the picker rebuilds in the
brand list's order, so a positional comparison would call every brand edit a change.

### `patch.test.ts` — 21 tests

The one worth naming is parameterised over **every** editable field rather than over the one that
prompted it:

> sends `%s` alone and nothing else

A builder that spread the record and overwrote one key would pass a `{status}` assertion and still
send `accounts` — replacing a creator's whole account list on a status change, which is the sheet's
behaviour and exactly what an inline edit is meant to avoid.

The rest pin the `""` → `null` rule in both directions, the trim, the empty-name refusal, the
enum refusals, the empty brand array, and five `isUnchanged` cases including the one where a
duplicate id must not make a shorter set look equal to a longer list.

### `components/editable-cell.tsx` — the affordance and the swap

**The pencil is a real button in the tab order at all times**; hover only changes whether it is
visible. `opacity-0` and not `hidden` for exactly that reason — a hidden button is not focusable.
Both triggers are wired and neither is enough on its own: `group-hover/row` covers the pointer,
`focus-visible:opacity-100` covers the keyboard.

The row carries `group/row` — **named**, not a bare `group`, because the Reach and Brands cells each
hold a popover and an unnamed group would be claimed by whichever ancestor is nearest.

The editor slot is **borderless with its padding pulled back** by a negative margin, so the value
does not jump sideways as the editor opens over it.

Three behaviours the component owns rather than delegating:

- **`Escape` cancels**, uniformly.
- **`Escape` is ignored mid-write.** Closing over a request that still lands would leave the display
  showing the old value until the refetch replaced it — a table that appears to have ignored an edit
  it actually made.
- **Focus returns to the pencil** on close, so a keyboard user who cancels is not dropped on
  `document.body` halfway down 146 rows.

What it does *not* own is **when** an edit commits, because the four editors disagree and rightly.
The editor is a render prop and calls `close` itself.

### `components/inline-editors.tsx` — four editors and one write

**Name** — text, `autoFocus`, select-all on focus, commits on `Enter` and on blur. One ref guards
both: the input unmounts on close and the browser may fire `blur` on the way out, so without it
`Enter` writes twice and `Escape` writes the value it was cancelling.

**Vertical and Status** — native `<select>`, committed on `change`.

`change` on a native select **is** the platform's "the reader chose this" event, and a control that
visibly moves to `Active` and then does nothing until you click elsewhere is a control that lies
about having taken your input. The cost is real and is bounded rather than argued away: arrow keys
on a *closed* select fire `change` per press, so the editor is **disabled while the write is in
flight**, which caps it at one write per open. The alternative caps nothing and races — three
`PATCH`es over one column, settling in whatever order they return.

**Brands** — a `Popover` with `BrandPicker` and an explicit `Save`. Two reasons, both pre-existing:
a column of checkboxes does not fit a 24px cell, and `BrandPicker`'s own docstring already settled
the write — *"A picker that wrote on every tick would fire a request per box […] and each one would
be a full replacement, so an interrupted pass would leave a set nobody chose."* `Popover` and not
`DropdownMenu`, per AGENTS.md. The draft re-seeds **during render** when `open` flips true, which is
the adjust-state-on-prop-change pattern and not the `set-state-in-effect` rule that fails this build.

**It is the one editor that stays open on a refusal.** The refusal this write actually takes is
`BRAND_NOT_IN_WORKSPACE`, and it names a box the reader can untick; closing would throw away a set
they may have spent several ticks building. The three inline editors close, because the only refusal
anybody can act on locally is an empty name and reopening is one keystroke.

**`useInlineEdit` is called once for the table, not once per row.** `useInfluencerMutations` reaches
`useActiveWorkspace`, which is an SWR subscription plus a `useSyncExternalStore` one; 146 of each to
serve one `PATCH` at a time is a cost with nothing on the other side of it. `commit` takes the
creator as an argument and each cell owns its pending state in a plain `useState`.

**Nothing is optimistic**, so the cell cannot show the new value as a fact while the write is in
flight. What it shows is the editor, disabled, holding what the reader chose, with a spinner beside
it — "this is being saved", never "this is saved". The server's answer is what re-renders the
display.

**A refusal gets a toast; a success does not.** The reverting cell is otherwise an unexplained
flicker, so the server's own sentence has to appear somewhere. A success needs no toast because the
cell itself is the confirmation — the new value is on screen *because the server sent it back*,
which is the whole point of not being optimistic. A toast per status change on a table somebody is
working down would be noise over information.

The shaping is `use-submit`'s, so both refusal classes are handled: `ApiError` from the Operations
Hub transport and `AppError` from the BrandFactory one. AGENTS.md records that a ladder knowing only
the first told readers the backend was down for a whole release.

### The column-by-column line

Written into `InfluencerRow`'s docstring as a table:

| Column | Inline | Why |
|---|---|---|
| Creator | **yes**, text | A field on the row. The slug does not follow — frozen at create |
| Platforms | no → the record's form | A set over the child table, not a field |
| Reach | no → the record's form | `totalReach`, derived and never stored |
| Tier | **never** | Derived from a derived figure. Nothing behind it to open |
| Engagement | **never** | `blendedEngagement`. The parts are one click away in the reach popover |
| Vertical | **yes**, select | A field. `Generalist` is the empty option |
| Brands | **yes**, multi-select | A field — a full-replacement set |
| Status | **yes**, select | A field, and the most-edited one on this table |

The four refusals are one refusal repeated: **you cannot edit a sum by typing over it.**

**The Creator cell keeps the link as its primary target** and the pencil is a sibling beside it —
never a nested interactive. Opening the record is the more common intent, so it keeps the whole
name.

**The Reach pencil sits before the figure, not after it.** `opacity-0` still occupies its width, so
a pencil on the right would either push the numbers off the column's right edge on hover or, if the
space were reserved, unalign the one column on this table that is read down its length.

The two pencils that open the sheet carry **different names** — `Edit platforms and handles` and
`Edit follower counts` — rather than two identical `Edit accounts` in one row. Both land in the
account editor; each names what the reader came to change.

## Done when

> four columns edit in place, the derived four do not, no row moves under an edit, and
> `patch.test.ts` proves a status edit sends `{status}` alone.

- **Four edit, four do not** — the table above, and it is enforced by construction: only four cells
  wrap an `EditableCell`, and `patch.test.ts` pins `EDITABLE_FIELDS` at exactly those four so a
  fifth added to the list without a `patchFor` branch fails.
- **`{status}` alone** — asserted over all four fields, not just status.
- **No row moves under an edit.** This is a property rather than a check: the bands group by reach
  and the default order is reach descending, and not one of the four editable fields is an input to
  either. The exception is a sort *by* one of those columns, where the row moves because the reader
  asked the table to order by the thing they just changed.

`editable-cell.test.tsx` adds 7 tests for the rules that go wrong **silently** — a commit that fires
twice, an `Escape` that writes the value it was cancelling, a keyboard user dropped on
`document.body`, and an editor that does not wear its rung. The write itself is stubbed there; what
it sends is `patch.test.ts`' subject. The split is deliberate: one file is about *when* a commit
happens, the other about *what* it sends.

The three rungs were rendered headlessly with the real class values, at rest and with three editors
open. The row heights match between the two states at every rung.

## The gate

```
pnpm typecheck                          clean, all 11 packages
pnpm lint                               clean
pnpm format:check                       clean
pnpm test                               2685 tests — 2538 passed, 147 skipped without a database
pnpm -F @brandfactory/web build          clean
pnpm -F @brandfactory/web-next build     clean; /influencers stays ○ (Static)
```

2685 against 2654 after Phase B: **31 new** — 21 in `patch.test.ts`, 7 in `editable-cell.test.tsx`,
3 in `table-density.test.ts`. 47 new across Phases A, B and C against 1.48.0's 2638.

## Two things worth flagging

**A pencil on Reach and Platforms is a second entry point to the sheet**, which is close to the
thing the old docstring argued against. The plan calls for it — *"so the affordance is uniform and
the destination is honest"* — and it is built as specified. The distinction it rests on is that a
pencil on a specific cell names a specific field, where an actions menu offers the record; whether
that distinction holds in use is a question for the browser pass. It is cheap to remove: two
`EditPencil` call sites.

**Engagement gets no pencil**, per the plan, even though its parts are per-account and therefore
editable through the same sheet. The reach popover shows every per-account rate one click away, so
the path is not closed — but this is the one cell where the plan's own rule ("a derived cell opens
its source") and its column list disagree. Following the list.

## What this phase did not do

- **No actions column and no per-row menu.** That argument survives intact.
- **No optimistic update.** The server's answer is the only one rendered.
- **No inline editing anywhere else in the package.** Every other list is cursor-paginated; the
  primitive stays in this feature folder until a second screen needs it, per AGENTS.md's
  promote-on-the-second-consumer rule.
- **No browser pass.** Phase D's, with A and B.
