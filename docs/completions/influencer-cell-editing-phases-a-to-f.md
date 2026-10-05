# Influencer cell editing and profile links — Phases A to F

**Plan:** `docs/completions/influencer-cell-editing-and-profile-links-plan.md`.
**Released in:** 1.52.0, with a post-release review pass as 1.52.1.
**Migration:** none, at any phase. **Wire:** unchanged throughout — the panel writes through the
`PATCH …/influencers/:id` that already existed. **New dependency:** none.
**Surface:** `/influencers` — the roster table, and the two other screens that read `account.url`.

Two asks, from the person who reads this table.

1. *"Instead of a pencil icon next to each cell, let me click the cell and edit it there. The pen
   feels dated."*
2. *"The platform badges should be clickable and open that platform's profile in a new tab."*

The second was already built — 1.51.0 shipped it, and it is correct. It was invisible because of
the data: **215 of the 216 seeded accounts hold `url: null`**, so exactly one badge on the whole
roster was a link. Phase E is the reversal that made it visible.

| Phase | What landed |
| --- | --- |
| A | `CellTrigger` replaces the pencil and the display-to-editor swap |
| B | Vertical and Status become menus |
| C | The Creator cell stops being editable |
| D | The accounts panel, from either the Platforms or the Reach cell |
| E | A profile URL derived from a handle, for five platforms of six |
| F | The release, and what the browser pass found |

## Phase A — the cell is the control

**Files:** `features/influencers/components/editable-cell.tsx`, `editable-cell.test.tsx`.

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

### The three properties that were kept

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

### The one property that was dropped

**`stacked`.** It existed solely for the Creator cell's two-line stack, and Phase C takes the editor
out of that cell. The 10px regression it was invented to fix in 1.49.0 cannot recur once nothing
edits there.

### The tint is one step deeper than the row's own

This is the decision most likely to be undone by somebody tidying tokens.

`TableRow` already paints `bg-surface-hover` (beige-100) across the whole row on hover. A cell tint
at that same token would be **invisible at exactly the moment it is needed** — the row is already
lit by the time a pointer reaches the cell. So the cell goes to `bg-surface-selected` (beige-200),
which reads as one step further in. Focus and the open state (`aria-expanded:`) take the same token,
so a keyboard user sees what a pointer does and an open menu keeps its cell marked.

`editable-cell.test.tsx` asserts `hover:bg-surface-selected` **and** the absence of
`hover:bg-surface-hover`.

### The accessible name extends rather than replaces

`aria-label` would have been the obvious move and is wrong here: it *replaces* the accessible name,
so 146 buttons would all be named "Edit status" and none of them would say which row. `CellTrigger`
appends an `sr-only` phrase after the cell's own content instead, so the name reads *"Prospect, Edit
status"*.

Where the trigger has no visible content of its own — the sibling in the Platforms cell — that
phrase is the whole name, which is why the prop takes a phrase (`Edit the accounts of Priya Raman`)
rather than a noun.

### The chevron is drawn, never revealed

A mark that appears under the pointer has to reserve its width anyway, and reserving it without
drawing it buys nothing but a flicker. It is `ml-auto` so the chevrons line up down the column
whatever each value's width — the one thing the pencil's position got right.

### What this phase discovered

**The swap has no callers left.** Not "no uses today" — none at all: Phase B turns the two enum
columns into menus, Brands was always a popover, Phase D gives Platforms and Reach a panel, and
Phase C stops the Creator cell being editable. Every cell on this table now opens *something
anchored to it*.

So `EditableCell` was deleted rather than kept for a future text column. That is a consequence the
plan does not state, and it is the reason this file is 130 lines where it was 213.

`editable-cell.test.tsx` is rewritten around `CellTrigger`: eight assertions, all of them about
things a browser pass cannot see — the tab order, the accessible name, the tint token, the rung
height, the `h-auto` override, the chevron, and the pending state.

## Phase B — the two enum cells become menus

**Files:** `features/influencers/components/inline-editors.tsx`, new `inline-editors.test.tsx`.

Vertical and Status stop swapping the cell for a native `<select>` and start opening a menu anchored
to it, with the current value ticked.

### Why a menu is the honest control

`DropdownMenu` with `menuitemradio` children is the clear side of the line `AGENTS.md` draws between
a menu and a popover: this is **a single choice from a closed list**, not a panel of form controls,
so `role="menu"` is what it actually is.

The Brands picker keeps its `Popover` for the same rule read the other way — a column of checkboxes
in a `role="menu"` announces "menu, N items" and fights their keyboard handling.

### It retires a bounded defect rather than only restyling one

This is the part that is easy to read as a restyle and is not. `EnumEditor`'s own docstring recorded
the cost it had accepted:

> arrow keys on a *closed* select fire `change` per press, so a keyboard user stepping through three
> statuses could fire three writes. The editor is **disabled while the write is in flight**, which
> caps it at one write per open.

That is a race won by a lock, not a case that does not exist. A menu moves a **highlight** on the
arrow keys and commits on `Enter` or on click, so stepping through the list writes nothing at all.

`inline-editors.test.tsx` pins it: open the status menu, press `ArrowDown` twice and `ArrowUp` once,
and assert `commit` was never called. That test is the reason the file exists.

### The open state is controlled, and closing is this file's job

Base UI's `Menu.RadioItem` does **not** close the popup on select by default — a radio group is
often something you tick more than once. Here it is exactly one choice, so the menu is closed from
`onValueChange` *before* the write is started. Leaving it open over a cell that is already saving
would offer a second choice the disabled trigger has no way to refuse. Asserted.

### Two details that would otherwise be discovered

- **`w-auto min-w-40` on the content.** `DropdownMenuContent` defaults to `w-(--anchor-width)`,
  which here is the width of a 14%-share table column — and "Family & lifestyle" does not fit in
  one. `align="start"`, because both columns are read from their left edge.
- **`Generalist` is a real, labelled item** rather than a blank one. `InfluencerSchema` says `null`
  there is *"a genuine generalist, not an unclassified row"*, which is why the union has no `other`
  member. Asserted, including that it reads as ticked when the record's `vertical` is `null`.

### The shape of an editor changed

`VerticalEditor` and `StatusEditor` used to be render-prop children of `EditableCell` and took an
`EditorSlot`. They are now self-contained components on `BrandsEditor`'s shape: they take
`{influencer, commit, display}` and own their own `open` and `isPending`.

The `settle` helper and the shared `EditorSlot` type went with the swap. Each editor marks its own
pending state around its own `await`, which is what `CellTrigger`'s `pending` prop renders.

Five tests, in a new `inline-editors.test.tsx`: the radio roles and the ticked item, one commit per
choice with the right `FieldEdit`, the menu closing on the choice, the arrow-key assertion above,
and `Generalist` as a labelled ticked option.

## Phase C — the Creator cell stops being editable

**Files:** `features/influencers/patch.ts`, `patch.test.ts`,
`features/influencers/components/inline-editors.tsx`, `influencers-browser.tsx`,
`components/quick-add-sheet.tsx` (one comment).

The reader's decision, taken directly: *"The Creator cell stays a link and always opens the
creator's profile."* The name is not editable from the table.

### What was removed, in order

1. The `EditableCell` wrapper around the name cell → the cell is the `<Link>` and the handle
   sub-line, and nothing else.
2. **`NameEditor`** — the text editor with its `settled` ref, its select-on-focus, its
   commit-on-`Enter`-and-on-blur, and its `maxLength={200}`.
3. **`stacked`** and its arithmetic, which existed only for this cell (Phase A).
4. The **`name` branch** of `FieldEdit`, `patchFor` and `isUnchanged`.
5. **`name` from `EDITABLE_FIELDS`**, which is now `["accounts", "vertical", "brandIds", "status"]`.

`UpdateInfluencerInputSchema.name` **stays**. The server's rule is unchanged and the record's own
form still renames; what went is this table's path to it.

### Why this is a removal rather than an omission

The name editor was the most expensive cell on the table to get right and the least used. It is a
**two-line stack** — a 21px name over an 18.84px handle — so its editor had to take the height of
the *line it replaced* rather than of the cell's content box, and getting that wrong added 10px to
the tallest cell in the row and pushed every row below it down under the reader's pointer. That was
1.49.0's browser-pass finding, and `stacked` was the fix.

Against that: nobody renames a creator from a roster. It is a correction you make on the record,
where you are already looking at the thing you are correcting.

### What the toast now says

`useInlineEdit`'s local-refusal message had a `name` branch — *"A creator needs a name."* — for the
one refusal a reader could produce (clearing the box and pressing `Enter`). That branch is replaced
by the accounts one, which is the new reachable local refusal:

> Those accounts cannot be saved. Check the handles and the follower counts.

`patch.test.ts` loses the `name` describe block (the trim rule, the empty-box refusal, the
over-length refusal) and the `isUnchanged` name case. The `EDITABLE_FIELDS` assertion is updated,
and both the "sends %s alone" table and the "builds a body the wire schema accepts" loop drop `name`
and gain `accounts`. The docstring records the swap explicitly, so a reader coming to the file for
the name rule finds out where it went rather than concluding it was never there.

## Phase D — the accounts panel

**Files:** new `features/influencers/components/accounts-panel.tsx` and `accounts-panel.test.tsx`;
deleted `reach-breakdown.tsx` and `reach-breakdown.test.tsx`; `features/influencers/patch.ts`,
`patch.test.ts`, `account-drafts.ts`, `account-drafts.test.ts`,
`components/influencers-browser.tsx`.

One panel, opened from either the Platforms cell or the Reach cell, because both render the same
child table from different angles.

### `ReachBreakdown` became this panel rather than sitting beside it

It was already the same table with the figures read-only, so keeping both would have put a
read-only view and an editable one behind two controls in one cell — and the read-only one is a
strict subset. Its two hard-won properties carry over unchanged: **`w-auto` with no `max-w`**,
because a truncated handle is the one value here nobody can act on; and the caller's choice of
alignment, because a trigger in a right-aligned numeric column near the card's edge cannot open
rightwards (`align="end"` on Reach, `"start"` on Platforms).

### It is a compact table, not the record's account form

`AccountRows` draws a bordered card with a `FieldGrid` per account; ten of those in a popover is a
page, in a popup, over a table. The panel keeps `ReachBreakdown`'s shape — one row per account,
short columns — and turns the boxes into inputs:

```
Platform      Handle       Followers   Engagement
[Instagram ▾] [lennardy]     [534000]        [ — ]        ✕
[TikTok    ▾] [lennardy]     [981600]        [ — ]     ⤒  ✕
+ Add account            Edit the full record for URLs and notes
                                          Cancel     Save
```

Two things the plan's sketch did not spell out and that are here because the panel does not work
without them:

- **The handle is an input.** The sketch drew it as text, but `+ Add account` produces an empty row
  and a new account cannot be entered without a handle box.
- **A make-primary control**, as a `⤒` icon button on every row after the first. The plan names
  `makeAccountPrimary` among the rules it imports, and position 0 **is** the primary account —
  there is no `is_primary` column — so without a control that rule has no way in. One button rather
  than drag-and-drop: this app has exactly one dnd surface and it is the calendar.

### Three consequences, stated before they were discovered

- **The panel renders for a single-account creator.** `ReachBreakdown` returned `null` below two
  accounts, and rightly: `1 account` under eighty-odd rows was noise. That rule was about a
  *sub-line*; the trigger is the cell now. So a one-account creator can correct their follower count
  from the roster for the first time — and the sub-line stays hidden for them, which is the original
  rule kept where it still applies.
- **`url` is not in the panel** — the one account field with no column to spare and the one nobody
  edits from a roster. It is **not dropped from the write**: `accountDraftsFrom` seeds it from the
  record and `toAccountPayload` hands it back, so correcting a follower count cannot clear a stored
  profile link. That is the one way this write could quietly lose data, so it has a test of its own.
- **The write is one key.** `{accounts}` through `UpdateInfluencerInputSchema` — a full replacement
  of the account list and nothing else. That is **safer than the pencil it replaces**: that pencil
  opened `InfluencerForm`, which submits a whole `CreateInfluencerInput` and rewrites the brand set
  on every save.

### Every list rule is imported; one is composed

The cap, the cannot-empty guard, `makeAccountPrimary`, `setAccountDraft`, `addAccountDraft` and
`duplicateAccountIndexes` are all `account-drafts.ts`', already pure and already asserted.

One function is **new**, and it composes those rather than adding a fifth opinion:
**`accountsProblem(drafts)`** — why this list cannot be saved yet, in one sentence, or `null`.

It exists because the panel has **no `<form>` to lean on**. `InfluencerForm` marks its boxes
`required` and lets the browser refuse the submit; a panel in a popover over a table cell has to
disable its own `Save` and say why — and *"Too small: expected string to have >=1 characters"* is
not a sentence anybody can act on. So the two failures a person actually produces are worded here
and everything else falls through to `InfluencerAccountsSchema`'s own message.

**The order is deliberate: the duplicate is reported first.** It is the one failure whose fix is to
delete a row rather than to fill one in, and reporting an empty box on the row somebody is about to
remove sends them to the wrong end of the panel.

The empty-follower-box test is made **on the string, before the conversion** — `Number("")` is `0`,
which is the exact trap the string-valued draft exists to prevent: a creator silently entered on
zero followers lands in Nano and looks like a real reading.

### `patch.ts` gains an `accounts` branch

`patchFor` narrows through `InfluencerAccountsSchema`, so the panel's second line of defence is the
same zod object the route validates with. The panel's own `accountsProblem` is about *telling
somebody why*; this one is about *what leaves the browser*.

`isUnchanged` compares the account list **as an ordered list, not as a set** — and that is not an
inconsistency with `brandIds`, which genuinely is a set. Position 0 is the account the creator is
known by, so moving an account to the top is a real edit with no field changed, and a set comparison
would throw it away and leave the reader watching a `Make primary` that does nothing. Tested, along
with `NaN !== NaN` never reading as unchanged, and the `url` the panel never shows.

### The row: one trigger where the plan expected two

The plan says cells holding their own interactive content get a **sibling** trigger, and names
Platforms and Reach. Two adjustments came out of building it.

- **The Reach cell takes a whole-cell trigger, not a sibling.** The sibling rule is about cells that
  hold *other* interactive content. Once `ReachBreakdown`'s account-count trigger becomes the cell
  itself, the Reach cell holds none — so one button over both lines is one control rather than two
  peers to the same panel. There is no button inside a button either way.
- **The Brands cell is a third cell that needs a sibling**, which the plan does not name.
  `BrandNamesCell` renders `NamesTooltip` on a real button whenever a creator holds more than one
  brand, so that cell cannot wrap either. Its trigger is `min-w-6 flex-1` and carries **no
  chevron** — the plan puts a chevron on the two enum cells, and a chevron promises *pick one thing
  from a list* where this opens a panel of checkboxes with a `Save`.

### What was deleted with the pencils

**The roster's second `InfluencerForm`.** It existed only for the Platforms and Reach pencils, which
navigated a reader into a whole-record sheet to change one follower count. With `editing`,
`editOpen`, `openRecord` and `onOpenRecord` gone, the roster carries one form again — the toolbar's,
which is create-only. The record's own page still has its Edit sheet, and the panel's footer links
to it.

Nine tests, in `accounts-panel.test.tsx`. It inherits `reach-breakdown.test.tsx`'s order assertion —
now sharper, because the panel *writes* that order, so a helpful `.sort()` by follower count would
silently re-primary a creator on the next save — and adds the url round trip, the single-account
case, both disabled-`Save` sentences, the last-account guard, make-primary, and the draft reset on
close. Six more in `account-drafts.test.ts` for `accountsProblem`.

## Phase E — a profile URL derived from a handle

**Files:** new `packages/shared/src/influencer/profile-url.ts` and `profile-url.test.ts`;
`packages/shared/src/index.ts`, `influencer/influencer.ts`;
`packages/db/src/schema/influencer_accounts.ts`, `src/seed.ts`;
`packages/web-next/src/features/influencers/platforms.ts`, `platforms.test.ts`,
`components/platform-badges.tsx`, `components/influencer-detail.tsx`.

The reversal. Four places used to say *"nothing derives a URL from a handle"*, and one test asserted
it. The rule is now **narrower rather than gone**, and the narrowing is what makes it defensible.

### Why it had to change

The argument behind the old rule was sound: a wrong link to a real stranger's profile is worse than
no link. What made it untenable was the data. **215 of the 216 accounts on the seeded roster hold
`url: null`**, so the linked badge 1.51.0 shipped lit up exactly one row out of 146 — a feature
nobody could see, on a column the reader had asked for twice.

### The three guards

| Platform | Derived from a handle |
| --- | --- |
| `instagram` | `https://instagram.com/{handle}` |
| `tiktok` | `https://tiktok.com/@{handle}` |
| `youtube` | `https://youtube.com/@{handle}` |
| `facebook` | `https://facebook.com/{handle}` |
| `linkedin` | `https://linkedin.com/in/{handle}` |
| `xiaohongshu` | **never** |

1. **A stored URL always wins.** Derivation is a fallback, never an override — so a URL somebody
   checked, or one the quick-add lookup grounded against a page it actually read, is never replaced
   by a template.
2. **XiaoHongShu never derives.** It addresses users by an opaque numeric id, so
   `xiaohongshu.com/<handle>` is not a wrong profile — it is not a profile. This is also the one
   platform a reader could not check by eye, which is why it is the refusal that keeps the original
   argument alive.
3. **Only a handle that is a plausible path segment derives.** `InfluencerHandleSchema` is
   deliberately loose — anything up to 100 characters, because handle grammar differs per platform
   and xiaohongshu handles are not latin at all. That looseness is right for *storing* a handle and
   wrong for *building a URL out of one*: a handle carrying a space or a slash is a **name** somebody
   typed into the wrong box. So derivation requires `^[A-Za-z0-9._-]+$` and answers `null` otherwise.

`PROFILE_URL_TEMPLATES` is a `Record<InfluencerPlatform, …>`, so a seventh platform fails to compile
rather than silently deriving nothing — and `xiaohongshu` is spelled out as `null` rather than
omitted, because the one platform that must never derive is the one that most needs its refusal
written down.

**No second parse through `WebsiteUrlSchema`.** The character class admits only characters that are
unreserved in a path segment, and the scheme and host are literals in the file, so that schema could
not refuse anything the guard admits — and the roster asks this question twice per row.

### It lives in `@brandfactory/shared`

Two surfaces read `account.url`: the roster's platform badges and the record page's account list. A
derivation only the roster knew about would make a badge open a profile while the same account, one
click away, rendered as plain text. So `accountProfileUrl(account)` sits beside the schema whose
docstring states the rule, and both surfaces call it.

(The plan counted three surfaces. The third was `ReachBreakdown`'s handle column, and Phase D
replaced that panel with one whose handles are inputs — so there are two.)

### What is knowingly given up

A stored URL was checked by a person or grounded by a retrieval log; a derived one is a template
over a string. **A handle that is correct on Instagram but wrong on TikTok now produces a confident
link to whoever holds that name on TikTok.** Nothing on screen tells the two apart, because the
reader chose not to mark derived links as unverified — a media list is worked by opening profiles,
and marking 211 of 216 of them "unverified" would make the mark the thing nobody reads rather than
the link.

That is recorded in `profile-url.ts` as a decision, not an oversight.

### The four places that stated the old rule

- `InfluencerAccountSchema.url` — rewritten to say what the column still means: *a stored URL is a
  fact; a derived one is a defensible guess*, and this column holds the first.
- `influencer_accounts.url` in `@brandfactory/db` — same.
- `seed.ts`'s account docstring — now says the screens fall back to a template for the other 215.
- `platform-badges.tsx` — now says the component decides nothing and the caller answers.

**The migration comment in `drizzle/0016_*.sql` was left alone.** A migration is a historical record
of what was true when it ran, and editing one is how a migration stops being trustworthy.

### Measured on the real roster, in a browser

The pass in Phase F counted the rendered anchors across all 165 creators **on the dev database**,
which carries rows the seed does not — the seed has 146 creators and no YouTube, Facebook or
LinkedIn account, and derives 210 links. See the review pass below:

- **226 badge links**: `instagram.com` 146, `tiktok.com` 75, `youtube.com` 2, `facebook.com` 1,
  `linkedin.com` 1 — and **`www.instagram.com` 1**, which is Jaime Lee's *stored* URL. That last
  host is the proof that stored beats derived: the template would have produced `instagram.com`.
- **Every visible Xiaohongshu badge is a `<span>`, not an `<a>`.** Zero linked.
- Every link carries `target="_blank"` with `rel="noreferrer noopener"`.

Eight tests in `packages/shared/src/influencer/profile-url.test.ts` — the five templates spelled out
rather than generated from the table (a test that reads the table asserts only that the function
calls it), the xiaohongshu refusal, the enum exhaustiveness, the path-segment guard including a
non-latin handle, and both directions of stored-versus-derived.

`platforms.test.ts`'s *"derives nothing from a handle"* becomes *"derives one from the handle where
the record holds none"*, plus a new xiaohongshu assertion and a new stored-wins assertion. Its
skip-a-URL-less-account test moves to **xiaohongshu**, because that is the only platform where
"answers nothing" is still reachable — an Instagram pair would now exercise the fallback instead of
the skip and would pass whether or not the loop continued.

## Phase F — the release, and what the browser pass found

**Files:** `features/influencers/components/influencers-browser.tsx`, `inline-editors.tsx`.

```
pnpm typecheck                         ✓  11 packages
pnpm lint                              ✓
pnpm -F @brandfactory/web-next lint    ✓
pnpm format:check                      ✓
pnpm test                              ✓  2868 tests — 2721 passing, 147 skipped
pnpm -F @brandfactory/web build        ✓
pnpm -F @brandfactory/web-next build   ✓  /influencers still ○ (Static)
```

28 more tests than 1.51.0's 2840.

The plan asked for a browser pass *because* every claim in Phase A is about a hover state and a row
height, and neither is visible to a headless render — "which is the exact gap that let 1.49.0's 10px
regression through". It found one such regression and one width cost.

### 1. The Reach cell grew 2.16px, and only on rows with more than one account

**Measured, not eyeballed.** Row heights at `comfortable` came back alternating **61px and
58.84px** — a table with two row heights depending on whether a creator has one account or two,
which is exactly what the density ladder exists to prevent.

The cause is a trap worth writing down, because it is invisible in the source. The Reach cell's
class list is `text-right font-mono text-helper tabular-nums text-ink`, and it goes through
`TableCell`'s `cn()`. **`twMerge` drops `text-helper` where it meets `text-ink`** — they land in the
same `text-*` group — so that column has always rendered at 14px/21px rather than at the
13px/18.84px its class list claims.

`ReachBreakdown`'s sub-line said `font-sans text-helper` explicitly and so was 18.84px. The
replacement inherited from the cell instead and came out 21px: 21 + 2 + 21 = 44px, against the
Creator cell's 41.84px, which made the Reach cell the tallest thing in those rows.

The fix is one class — `text-helper` back on the sub-line — with a comment recording *why* it is
stated rather than inherited, so the next person does not tidy it away. Re-measured after: **one row
height per rung, at all three** — comfortable 58.84, cosy 54.84, compact 50.84.

### 2. The Brands trigger was taking width the pencil did not

The Brands cell's sibling trigger shipped as `min-w-10` (40px) with a chevron, against a pencil that
occupied 18px. On a 13%-share column whose names already truncate at `max-w-[24ch]`, that is real.

It is `min-w-6` with **no chevron** now. The plan puts a chevron on *the two enum cells*, and the
distinction turns out to be a good one: a chevron promises *pick one thing from a list*, and Brands
opens a panel of checkboxes with an explicit `Save`.

Net width against the pencil it replaces: Vertical and Status are **unchanged** (14px chevron for
14px pencil, both `ml-auto`); Platforms and Brands cost **+6px** each.

### What else was checked, and found true

- **The Vertical menu** opens with 11 items, `Generalist` first, the record's value ticked, the cell
  tinted a step deeper than the row, and the row itself lit by `has-aria-expanded`.
- **The accounts panel** opens from both cells, seeds from the record, and disables `Save` with
  *"Every account needs a follower count."* the moment a follower box is cleared.
- **A real write end to end**: a status changed through the menu, the cell re-rendered from the
  server's answer, and **the row did not move** — the bands group by reach and status is not an
  input to it. Reverted afterwards.
- **No console errors**, no hydration warnings, no Base UI errors on load or on any popup.
- **226 derived and stored badge links** across the roster, zero of them xiaohongshu, every one
  carrying `rel="noreferrer noopener"`. See Phase E.

### How the pass was run, and one thing it could not judge

The repo `.env` points `DATABASE_URL` at a **production** Supabase database and `AUTH_PROVIDER` at
Supabase, so the running dev server could not be signed into and must not be written to. The pass
used a throwaway server on `:3011` with `AUTH_PROVIDER=local` against the **docker Postgres on
:5432**, and a Next dev server on `:3010` proxied to it. Both were stopped afterwards; the server on
`:3001` was left alone.

**Column widths were not judged.** The available browser viewport was 760 CSS px, where the
eight-column budget 1.49.1 measured cannot hold — the `Prospect` badge alone (72px) exceeds a
10%-share Status column (70px) at that width, with or without this change. The width *deltas* above
are arithmetic against the pencil rather than a reading off the screen, and a pass at a normal
desktop width is the honest place to confirm them.

## The review pass on 1.52.0 — a panel that saved by erasing

Released as **1.52.1**. **Files:** `features/influencers/account-drafts.ts`,
`account-drafts.test.ts`, `components/accounts-panel.tsx`, `accounts-panel.test.tsx`,
`components/inline-editors.tsx`, `inline-editors.test.tsx`, `components/influencers-browser.tsx`,
`components/influencer-detail.tsx`, `packages/web-next/AGENTS.md`.

A post-release review of the whole of 1.52.0. Three defects, two of them in the accounts panel and
one of them a data loss. The gate was green on the release and is green on this: nothing here was
findable by `typecheck`, `lint`, `format:check`, either build, or the 2868 tests.

### What the gate said, and why it could not have said otherwise

Every claim 1.52.0 made was checked before anything was changed, and the checkable ones are true.
The seed holds **215 accounts on `url: null`** and one stored `https://www.instagram.com/jaim/`;
**214 of 216 handles** pass `HANDLE_PATH_SEGMENT`, and the two that do not are `罗大雄` and `王开花`,
both on xiaohongshu, which never derives anyway. 146 creators, 216 accounts. Phase E's arithmetic is
exact.

What the gate cannot see is a value that is **wrong and legal**, and that is where all three defects
were.

### 1. The panel saved successfully and erased a measurement

The one that had to be fixed before a push.

The Engagement box in the accounts panel was a plain text `Input` carrying `inputMode="decimal"`,
which is a hint to a soft keyboard and constrains nothing on a desktop. So `3.2%` could be typed
into it. Traced end to end:

```
problem     : null                ← Save is enabled
payload     : engagementRate: null
patch sent  : {"accounts":[{… "engagementRate": null …}]}
record was  : 3.2
```

`toNullableNumber` answers `null` for anything that is not finite. **`null` is a legal value on this
field** — it means nobody has measured this account — so `InfluencerAccountsSchema` passed it,
`Save` stayed enabled, the write succeeded, and a recorded 3.2 became "not measured". The reader saw
an em dash appear and got no message at all. `3,2`, `~3` and `3.2 %` fail the same way.

**The record's own form never had this defect.** `account-rows.tsx` has carried `type="number"`,
`min`, `max` and `step` on both figure boxes since it was written. The panel is the same three
fields and shipped with none of them.

**It is the same laundering `toAccountPayload` documents, one field over, with the defence
inverted.** That docstring spends a paragraph on `Number("") === 0` for followers — and the guard
that catches an unreadable *follower* count is that it becomes `NaN`, which the schema refuses. An
unreadable *rate* becomes a value the schema wants. The two boxes fail in opposite directions and
only one of them was noisy about it.

Two fixes, because either alone leaves a hole:

- **`type="number"` on both boxes**, matching `account-rows.tsx` exactly. A browser then refuses the
  character rather than the panel refusing the value.
- **`figureProblem`**, a new pure rule in `account-drafts.ts`, composed into `accountsProblem` after
  the empty-box sentences and before the schema. It is the second line of defence and the one that
  holds if the attribute is ever removed — and it is what catches the cases a number input admits
  anyway, because `min` and `step` mark a value invalid **without emptying it**.

### 2. The follower box answered in zod's words, which is what `accountsProblem` exists to prevent

Same missing attribute, louder failure. Measured on the shipped panel:

| Typed | Sentence on screen |
| --- | --- |
| `412,000` | `Invalid input: expected number, received NaN` |
| `84.5` | `Invalid input: expected int, received number` |
| `-5` | `Too small: expected number to be >=0` |

A comma in a follower count is the likeliest mistake anybody makes in this panel, because **the cell
it opens from prints `412K` and `1.24M`**. And `accountsProblem`'s own docstring rejects exactly this
shape of sentence: *"'Too small: expected string to have >=1 characters' is not a sentence anybody
can act on."*

`figureProblem` words all three, with the fix in the sentence rather than left to be guessed:
*"Every follower count must be a whole number. Enter 412000 rather than 412,000."*

One consequence worth recording: `account-drafts.test.ts`' *"falls through to the schema's own
words"* test used an engagement rate of 140, which no longer falls through — `figureProblem` words
the out-of-range case now, because a percent box holding 140 is somebody who read the column as an
audience share. The test moved to a handle carrying its own `@`, which is a real fall-through with a
schema message that names its own fix. **The change of example is the change of behaviour**, so it is
noted in the test rather than quietly swapped.

### 3. A keyboard reader lost focus on every status and vertical edit

`CellTrigger` sets `disabled={disabled || pending}`, and `EnumMenu.choose` closes the menu and sets
that flag in **one commit**. So Base UI restores focus to a trigger that is already disabled, a
browser applies the HTML focus fixup rule and blurs it, and focus falls to `document.body`. The
trigger comes back enabled when the write returns and nothing puts focus back on it — so changing
one status left a keyboard reader at the top of a 146-row table.

**The deleted `EditableCell` held this property on purpose.** Its docstring: *"focus returns to the
pencil afterwards — a keyboard user who cancels an edit must not be dropped on `document.body` in
the middle of a 146-row table."* Its pencil was never disabled, and the swap it wrapped restored
focus with an effect.

**Why thirteen new tests walked past it:** because **jsdom does not implement the focus fixup rule**.
Measured directly:

```
focused before disable                        : true
still focused after disable                   : true   ← a browser gives false
jsdom lets .focus() land on a disabled button : false
```

A focused button stays `document.activeElement` there after `disabled` is set. Every assertion in
`editable-cell.test.tsx` and `inline-editors.test.tsx` is true in jsdom and true in a browser; the
one thing that differs is the thing that broke. The test that covers it now **performs the blur by
hand** and says in its comment that it is doing so, because a test that silently depends on a
platform rule the runtime lacks is worse than no test.

The restore is an effect on `isPending` going true → false — not the banned pattern, because it sets
no state and moves focus, which is a DOM side effect with nowhere else to live. **It fires only out
of `document.body`**: a reader who tabbed into the search box while the request was in flight chose
that, and taking focus back off them a few hundred milliseconds later is its own defect. Both
directions are asserted.

Only `EnumMenu` was affected. `AccountsPanel` and `BrandsEditor` never pass `pending`, because their
panels stay open and their own `Save` carries the pending state.

### 4. `AGENTS.md` still described the pencils

Not cosmetic: it is the file an agent reads before touching this feature, and it described a screen
that no longer exists. It said the name is editable, that Reach and Platforms *"carry a pencil that
opens the record's form"*, and that a cell in flight *"shows its editor, disabled"*.

The section is rewritten around what shipped — the cell is the trigger, the sibling rule, the menu
versus the popover, the accounts panel — and it gains the two rules this pass paid for: **a control
disabled mid-write owes a focus restore**, and **a panel in a popover owes its own refusals**, with
both figure-box traps written down beside each other. Four rules became six.

### 5. Two formatting leftovers

`influencers-browser.tsx` had a double blank line where the removed `editing` / `editOpen` state
was. `influencer-detail.tsx`'s new `return (` left its JSX at the old depth. Neither is caught by
anything: the root `format:check` skips `web-next` on purpose and that package's own gate runs no
prettier. The file was not prettier-clean before this release either, so the re-indent follows the
surrounding style rather than the tool.

### The gate on the review pass

```
pnpm typecheck                         ✓  11 packages
pnpm lint                              ✓
pnpm -F @brandfactory/web-next lint    ✓
pnpm format:check                      ✓
pnpm test                              ✓  2881 tests — 2734 passing, 147 skipped
pnpm -F @brandfactory/web build        ✓
pnpm -F @brandfactory/web-next build   ✓  /influencers still ○ (Static)
```

13 more tests than 1.52.0's 2868: seven on `figureProblem`, two more on `accountsProblem`, two on
the panel wearing them, and two on the focus restore.

### What was checked and found sound

Recorded so the next reader does not pay for it twice.

- **The `url` round trip is real.** The draft seeds it from the record and `toAccountPayload` hands
  it back, so correcting a follower count cannot clear a stored profile link.
- **`isUnchanged` compares accounts as an ordered list**, and `NaN !== NaN` behaves as its comment
  claims — an empty follower box always reaches `patchFor`.
- **`accountProfileUrl` puts the stored URL first**, `PROFILE_URL_TEMPLATES` is exhaustive by
  construction, and the character class admits only characters unreserved in a path segment. There is
  no escaping hole. Handles are stored without `@` — `InfluencerHandleSchema` refuses one — so the
  templates cannot produce `instagram.com/@@name`.
- **No stale import** of the five deleted exports survives anywhere in the repo.
- **A native `<select>` in a Base UI popover has precedent** here — `filter-bar.tsx` and
  `requests-view.tsx` both do it.
- **A suspected performance defect was measured and dismissed.** `accountsProblem` runs a zod
  `safeParse` on every render of every *closed* panel — 292 of them per table render, since each row
  carries two. It costs **0.6 ms** for the whole table. Not worth a `useMemo`, and recorded so nobody
  adds one on suspicion.

### One thing this pass could not check

**The browser-pass counts in 1.52.0 came from a dev database, not the seed.** The changelog reports
*"226 badge links across the whole seeded roster — 146 Instagram, 75 TikTok, 2 YouTube, 1 Facebook,
1 LinkedIn"*, and Phase E says *"165 seeded creators"*. The seed holds **146 creators, 216 accounts,
and no YouTube, Facebook or LinkedIn account at all** — 139 Instagram, 71 TikTok, 6 xiaohongshu.
Against the seed the figure is **210 links**: 209 derived plus Jaime Lee's stored one.

The measurement is real and the docker database it ran against had rows the seed does not. The word
"seeded" is what is wrong, and it is corrected in the 1.52.0 entry rather than left to make the next
count irreproducible.
