# Social calendar, Phase 5 — the pure pieces

**Status:** shipped, 2026-08-03. Executes Phase 5 of
[`docs/executing/social-calendar-implementation.md`](../executing/social-calendar-implementation.md)
(proposal §5 "Components", lower half, of
[`docs/executing/social-calendar.md`](../executing/social-calendar.md)).
Follows [Phase 4](social-calendar-phase-4-web-data-layer.md).

Six files, all new bar one export. **Still dark** — nothing imports any of it,
the registry still says Soon, and the tile still opens the stub. End of
proposal Stage 2, and a safe stopping point.

Test baseline: **1187 → 1279 (+92)** across the tree.

---

## What landed, file by file

### `lib/calendar.ts` (5.1) — the date arithmetic, and one invariant

No date library: none exists in the monorepo and a month grid plus two
converters do not earn one. Native `Date` + `Intl`, the budget
`formatRelativeTime` already works within.

Everything in the file serves one invariant: **wire timestamps are UTC ISO,
but a calendar is local.** A post at `2026-08-03T23:30:00.000Z` belongs to
4 August in Berlin and 3 August in London, and the cell it lands in has to be
the reader's. That is why no key here is derived from
`toISOString().slice(0, 10)` — the shortest way to write the bug.

The second invariant is arithmetical: **days are added by day, never by
86 400 000 milliseconds.** `monthGridDays` walks `new Date(y, m, 1 - leading + i)`,
which is correct across a DST boundary; millisecond arithmetic produces a 23-
or 25-hour day twice a year and duplicates or skips a cell.

Exports: `WEEKDAY_LABELS` (Monday-first, hard-coded because the week's start
is a decision here, not a locale lookup), `DEFAULT_POST_TIME`, `localDayKey`,
`dayKeyToDate`, `monthGridDays`, `shiftMonth`, `groupByDay`, `isoToLocalParts`,
`localPartsToIso`, `monthLabel`, `formatTimeOfDay`, `formatDayHeading`.

Three decisions worth stating:

- **`month` is 0-based**, like `Date.prototype.getMonth`. Every caller gets
  its value from a `Date`, and a 1-based parameter would put two conventions
  in one component. Out-of-range months wrap the way the constructor wraps
  them, which is what makes `shiftMonth` a three-line function.
- **A blank time beside a real date is not a refusal.** It means the day
  without an opinion about the hour, and `DEFAULT_POST_TIME` (09:00) supplies
  the opinion — a post typed into Thursday means Thursday morning far more
  often than it means the first second of Thursday. A blank *date*, by
  contrast, returns `null`: the dialog's entire unschedule gesture is clearing
  that field, so "no date" has to be a value the function returns rather than
  an error it throws.
- **`dayKeyToDate` round-trips its parts before answering.** `new Date(2026,
  12, 40)` is a perfectly valid `Date` in February; a calendar that answers a
  nonsense day with a real one is worse than one that answers nothing.

`formatDayHeading` appends the year itself rather than asking `Intl` for it:
`en-GB` punctuates the two forms differently (`Mon 4 Jan` but
`Mon, 4 Jan 2027`), so letting the formatter add it would give the list two
heading shapes depending on how far ahead you scroll.

### `lib/calendar.test.ts` (5.2) — 44 tests, none of which know the timezone

The suite runs under whatever `TZ` the machine has, and **pinning it would
hide the exact bug class this module exists to avoid**. So no test writes a
literal UTC instant and expects a particular local day: fixtures are built
from local components (`new Date(2026, 7, 3, 9, 0)`) and converted to ISO for
the wire — the same round trip the app performs, reading the same in Auckland
as in Los Angeles.

The DST test is the one that needed thought. Rather than naming a zone's
transition Sunday, it asserts that **every cell of March and October is one
calendar day after the last**, which is true in every zone and false for any
millisecond-arithmetic implementation.

Also covered: Monday start with and without a leading pad, whole weeks, every
day of the month exactly once, Feb in a leap and an ordinary year, Jan/Dec
wrap at both ends, `groupByDay`'s three rules (unscheduled excluded, unparseable
dropped, input order preserved), converter round-trips and refusals, and the
`Today`/`Tomorrow`/`Yesterday`/dated/with-year ladder.

### `lib/social-copy.ts` + test — the vocabulary, stated once

Not in the plan's file list; it exists because the labels were about to be
written twice, and in Phase 6 a third time. The `research-copy.ts` precedent.

The enums are lowercase identifiers on the wire and **none is presentable as
stored**: `titleCase(platform)` ships `Tiktok`, `Linkedin` and `Youtube`,
which read as typos on a marketing tool. `PLATFORM_LABELS` and `STATUS_LABELS`
are exhaustive `Record`s, so adding a platform to the shared enum fails this
file's typecheck rather than shipping a chip that reads `pinterest` beside
seven proper names; the `<Select>` option lists are derived from them.

`postExcerpt` collapses hard wraps (a body pasted with line breaks must not
turn a one-line chip into a ragged block), clips on a word boundary when the
break is late enough to be worth taking, and — the load-bearing part — **falls
back to the platform name for an empty body, never to an empty string**.
`body: ''` is a claimed slot with the copy still to come, an expected state,
and a chip rendering as a blank rectangle reads as a fault rather than as an
empty post.

### `components/ui/textarea.tsx` (5.3)

`Input`'s multi-line sibling and deliberately nothing more — same border,
radius, placeholder ink, hover, focus outline and `aria-invalid` treatment, so
a form mixing the two reads as one control set. The three differences all
follow from holding a paragraph: a min-height instead of the fixed 40px (§11's
comfortable density is about controls you click, not ones you write in),
`py-2` to keep the first line off the top border, and `resize-y` — horizontal
resize would break out of a dialog's column.

### `components/brand/PostEditorDialog.tsx` (5.4)

One dialog for create and edit, because the fields are the same fields and a
post being created is a post being edited that has no id yet. House style is
`NewBrandDialog`'s (plain `useState` per field, `<form id>` with the submit in
the footer, inline `aria-describedby` errors); the re-seeding is
`RenameDialog`'s conditional mount, **keyed on the post's id and never its
content** — a background refetch that replaces the object must not remount the
form mid-edit, but switching which post is open must.

- **The dialog does not close itself on submit.** It reports through
  `onCreate`/`onUpdate` and the page closes it when the mutation succeeds, so
  a rejected write leaves the dialog standing with the copy still in it.
- **The one exception is a no-op submit.** `UpdateSocialPostInputSchema`
  refuses `{}`, so an untouched form would come back a 400 about a request
  nobody knowingly made. The patch is **diffed** against the post, and an
  empty diff closes the dialog instead of sending anything. Diffing also stops
  an untouched `assetIds` from rewriting the join rows on every save.
- **Platform starts empty**, not on Instagram: picking where a post goes is
  the one decision the author must actually make, and a pre-selected default
  is a guess that ships as a fact.
- **Create mode has no status control.** A post is a `draft` the moment it
  exists (the server's default), and offering `Posted` before the copy exists
  is offering to record something that did not happen.
- **A cleared date unschedules; a date that will not parse is an error.** The
  two are told apart before the payload is built. Worth knowing: a native
  `type=date` control's value is always a full `YYYY-MM-DD` or `''`, so the
  refusal branch is for browsers that fall back to a text input, not the
  common path — noted in the test file rather than tested through a control
  that cannot produce the input.
- **An unresolved attachment id gets a visible tile, not silence.** Read-only
  surfaces skip an attachment whose asset is soft-deleted (proposal §5), but
  this is a write path: an id kept invisibly in state would ride along on the
  next save, and the server refuses a soft-deleted asset with a **400 about an
  attachment the author cannot see**. The tile says `Unavailable` and has the
  same detach button as any other.

Attachments otherwise: ordered thumbs with detach, an inline "Add from
library" grid of images not already attached, and `Upload` behind an
`onUploadFiles` prop that resolves the ids to append — absent prop, absent
control, the invariant every write affordance in this folder carries. The
upload lands in the brand's library whether or not the post is saved, by
design.

### `components/brand/SocialPostList.tsx` (5.5)

Three regions in the order a planner reads them. **Unscheduled leads**, and
that is the point of the list: posts with no slot are invisible in the grid,
so an idea written down and never scheduled must not quietly vanish behind a
month someone has stopped looking at. Then Upcoming (today first, forward) and
Past (yesterday first, backwards) — **both halves run away from now**, so the
rows nearest the present sit nearest the middle and neither half buries today
under a year of history.

The Upcoming/Past split is on the **day key, not the timestamp**: an 18:30
post is still today at 12:00, and grouping by day is what keeps a morning post
from falling out of Today the moment noon passes. `now` is injectable, the
`formatRelativeTime` precedent.

Row: time (absent in the tray, where there is none), platform, status pill,
excerpt, up to three attachment thumbnails with a `+N`, and a ⋯ menu. Two
small decisions:

- **The excerpt is the edit affordance.** A whole clickable row would have to
  nest the ⋯ trigger inside it, and a button inside a button is invalid in
  both the DOM and the accessibility tree.
- **`Mark posted` disappears on a post already marked** rather than
  disabling — the dead-affordance rule from 1.7.0.

`deferUntilMenuClosed` is now exported from `EntityMenu.tsx` rather than
re-written here: `Edit` opens a dialog, which is exactly the two-live-focus-
scopes problem that helper was written for, and its rationale is already
documented in full at its original site.

### `src/test-setup.ts` — three DOM APIs jsdom does not implement

`PostEditorDialog` is the **first component under test to open a Radix
`Select`** (the workspace settings page renders one, but nothing exercised
it), and doing so throws `target.hasPointerCapture is not a function` before a
single assertion runs. `hasPointerCapture` / `setPointerCapture` /
`releasePointerCapture` / `scrollIntoView` / `ResizeObserver` are stubbed to
the least surprising answers — capture is never held, scrolling is a no-op,
nothing ever resizes — each installed with `??=` so a future jsdom that
implements them wins.

### The component tests (5.6) — 40 tests, no mocks

`AssetLibraryView.test.tsx`'s style: real components, fixtures cast to branded
ids, callbacks as `vi.fn()`, comments only where the assertion encodes a rule.

**Dialog (21):** platform required; the seeded day arriving as the right UTC
instant; cleared date creating unscheduled with `scheduledAt: null` *stated*;
no status control in create; the 5000-char refusal; error clearing on answer;
edit re-seeding every field; the diffed patch (body only, `scheduledAt: null`,
status); the no-op submit closing without a call; not closing on a real
submit; disabled while pending; attachment order, detach, the `Unavailable`
tile, the library offering only unattached images, upload append, upload
failure as an inline alert, and no Upload control without the prop; and the
reopen-on-another-post re-seed.

**List (14):** empty state; the three region headings in order; the tray
omitted when every post has a slot; the day-heading ladder across both halves;
18:30-today counted as upcoming; time shown on scheduled rows and absent in
the tray; platform and status; the empty-body fallback; thumbnails with `+N`;
an unresolved id skipped without breaking the row; no menu without callbacks;
Edit/Mark posted/Delete each reported; `Mark posted` gone once marked; the
excerpt as button and as plain text.

**`social-copy` (7):** trademark capitalisation, derived option lists, and
`postExcerpt`'s five rules.

## Verification

```
pnpm typecheck                    clean (all 10 packages)
pnpm lint                         clean (whole repo)
pnpm format:check                 clean (whole repo)
pnpm test                         1279 passed | 64 skipped (full tree)
pnpm -F @brandfactory/web build   clean
```

1187 → **1279 (+92)**: 44 calendar, 21 dialog, 14 list, 7 social-copy, and the
remainder from the shared fixtures' `it.each` expansions.

**No live pass** (no Docker, no `.env`), and this phase is entirely unrendered
in a browser: nothing mounts these components yet. Unobserved specifically —
the row's optical density at real widths, the attachment grid inside the
dialog's `sm:max-w-xl` column, and whether the status pill's three treatments
read as one set on screen rather than in the token names.

## Notes for Phase 6

- Phase 6 assembles: `CalendarMonthGrid` (pure, needs `monthGridDays`,
  `WEEKDAY_LABELS`, `monthLabel`, `groupByDay`, `postExcerpt`),
  `SocialCalendarView` (pure, mounts the dialog and the view toggle), and
  `SocialCalendarPage` (the data half, `VisualIdentityPage` as the model).
- The dialog's contract for the page: it does **not** close itself, so the
  page closes it in the mutations' `onSuccess`; `onUploadFiles` must resolve
  the created asset ids; `seedDayKey` is a `localDayKey` string, `null` for an
  unscheduled seed. The header's "New post" seeds `localDayKey(new Date())`,
  and `DEFAULT_POST_TIME` is applied by the dialog, not by the caller.
- Still uncommitted: Phases 1–5, alongside the autofill stream's finished
  work. The tree is green; the per-phase commits the plan prescribes remain to
  be cut.
