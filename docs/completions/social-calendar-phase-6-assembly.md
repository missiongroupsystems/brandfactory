# Social calendar, Phase 6 — assembly

**Status:** shipped, 2026-08-03. Executes Phase 6 of
[`docs/executing/social-calendar-implementation.md`](../executing/social-calendar-implementation.md)
(proposal §5 "Components", upper half, of
[`docs/executing/social-calendar.md`](../executing/social-calendar.md)).
Follows [Phase 5](social-calendar-phase-5-pure-pieces.md).

Six files, all new. **The calendar now exists end to end and is still
unreachable** — nothing imports `SocialCalendarPage`, the registry still says
Soon, and the tile still opens the stub. That flip is Phase 7, deliberately one
commit.

Test baseline: **1279 → 1323 (+44)**.

---

## `CalendarMonthGrid.tsx` (6.1) — what the month is shaped like

Monday-start, padded to whole weeks, every cell a local calendar day. All the
arithmetic is Phase 5's; this file is layout and callbacks.

**Only scheduled posts appear here, and that is the grid's one blind spot.** A
post with no slot has no cell it could honestly occupy, so the header counts
them and hands them to the list view rather than inventing a place. Without
that pointer an idea in the tray would be invisible on the surface people
actually open — which is why the count is a *button* when there is a list to
send it to, and a plain statement when there is not.

Three decisions worth recording:

- **The add affordance is per cell, and only inside the month.** It fills
  whatever vertical space the chips leave, so clicking an empty cell means what
  it looks like it means, and it is invisible until hover or focus — 31
  permanent `+` glyphs is clutter, but a keyboard user still has to reach it. A
  padding day gets none: it belongs to a month this grid is not showing, and
  creating there would write into a view nobody is looking at.
- **The chip stacks `HH:mm · Platform` above the copy** rather than putting
  them on one line. The cell is about 130px wide; `09:00 Instagram` alone fills
  it, and the excerpt is the part that says which post this is.
- **A `posted` chip is dimmed, not struck through.** The month's job is to show
  what is coming, so something already out is context rather than work — but it
  happened, it was not cancelled.

The month label carries `aria-live="polite"`: the arrows move an entire grid
whose only label is that line.

## `SocialCalendarView.tsx` (6.2) — the pure half

`PageHeader` (title, description and glyph from the registry row) with the
segmented view toggle and "New post" as its action; then the grid or the list;
then the dialog. Every piece of state it renders belongs to the page.

**The toggle is built from `Button` primitives, not `@radix-ui/react-tabs`.**
Two mutually exclusive renderings of one list are not a tab-panel relationship
— there is no panel per tab, only one region that changes — and a two-state
toggle does not warrant a new dependency. `aria-pressed` carries the state to
assistive tech; the `variant="secondary"` fill is the same fact for the eye.

The grid's "N unscheduled" wires straight to `onViewChange('list')`, so the
pointer and the toggle are the same mechanism rather than two ways to change
one piece of state.

## `SocialCalendarPage.tsx` (6.3) — the data half

`VisualIdentityPage`'s shape: every query, every mutation, and all the local
state (`view`, the `{year, month}` cursor, the dialog's open/edit/seed trio,
`uploading`). Notable choices:

- **"New post" from the header seeds today, not the tray.** The view passes
  `null` because it does not know what the header should mean; the page turns
  that into `localDayKey(new Date())`. A post started from the header is far
  more often meant for today than for nowhere, and the date is one click from
  being cleared again.
- **The dialog closes in `onSuccess`, never on submit.** A rejected write has
  to leave it standing with the copy still in it — the contract Phase 5's
  dialog was built to.
- **Deleting closes the editor.** Delete is reachable from the row menu while
  that same post is open in the dialog; without this the dialog would go on
  editing a row that no longer exists.
- **Delete offers Undo rather than a confirmation**, `VisualIdentityPage`'s
  rule: a dialog taxes every deliberate delete to catch the rare accidental
  one, and the row is soft-deleted with its join rows intact, so restore brings
  the post back with its attachments. The excerpt is in the toast because a
  calendar of chips gives no other clue which one just left.
- **Uploads are sequential and failure-tolerant.** The server appends
  `position` by reading the current maximum, so N concurrent creates race onto
  one number (`VisualIdentityPage`'s reason verbatim). A file that fails is
  toasted and skipped rather than failing the batch — the ones that landed are
  real library assets and their ids are worth returning to the dialog.
- **The asset query has no gate.** Attachments are a nicety; a calendar that
  refused to render because the library is slow would be worse than one whose
  thumbnails arrive a moment later. Only the brand and the posts gate.

## The tests (6.4) — 44, in three registers

**`CalendarMonthGrid` (14), no mocks, fixed `now`:** the month label and the
Monday-start weekday row; padding days present but inert; the arrows and Today;
a chip in its own local day carrying time and platform; the platform-name
fallback for empty copy; chip → `onEditPost`; a chip still rendered (as
non-interactive text) without the callback; no unscheduled post anywhere in the
grid; the tray count as a button, as a plain statement, and absent when the
tray is empty; the cell add handing back the right day key, including on a day
that already has posts; and no add affordance at all without the callback.

**`SocialCalendarView` (10), no mocks:** the header's heading and action;
"New post" reporting `null`; `aria-pressed` on both toggle buttons; the toggle
reporting the other view; grid-vs-list dispatch in both directions; the grid's
unscheduled pointer reaching `onViewChange('list')`; the dialog closed, mounted
in create mode with the page's seed in the date field, and mounted in edit mode
on the right post.

**`SocialCalendarPage` (20), view stubbed** one-button-per-callback, the
`VisualIdentityPage.test.tsx` model: both loading gates and both error gates;
posts and blob resolver passed through; rendering before assets arrive; the
header seeding today while a cell seeds its own day; edit setting the post and
clearing the seed; the dialog staying open until `onSuccess` and staying open
on `onError` with the toast; `pending` forwarded; the update patch; mark-posted
as a status patch with no dialog; the Undo toast and its restore; the editor
closing on delete; a failed delete toasting without offering Undo; the cursor
starting on the current month and moving by whole months; and the upload loop
returning the landed ids, plus the toast-and-continue on failure.

One thing worth writing down for the next person: **mutation handlers invoked
directly in a test have to be wrapped in `act`.** `VisualIdentityPage.test.tsx`
calls them bare because it asserts on mock calls; these tests assert on
rendered state, so React has to be given the chance to flush.

## Verification

```
pnpm typecheck                    clean (all 10 packages)
pnpm lint                         clean (whole repo)
pnpm format:check                 clean (whole repo)
pnpm test                         1323 passed | 64 skipped (full tree)
pnpm -F @brandfactory/web build   clean
```

1279 → **1323 (+44)**.

**No live pass** (no Docker, no `.env`), and nothing here has been seen in a
browser — the components are still unreachable from any route. Unobserved:
whether a 130px cell holds a two-line chip legibly at real font sizes, whether
the hover-only add button is discoverable enough to be the primary create
gesture, and how six rows of cells behave beside the two-column side nav at
narrow widths.

## Notes for Phase 7

Phase 7 is the flip, and the plan is right that it must be **one commit** — the
dispatch keys off `unit` while the Soon stub keys off `enabled`, so splitting
them ships a half-state. Six edits: `miniApps.ts` (`unit` gains `'post'`, the
`social` row flips to `enabled: true, unit: 'post'`, `create`/`match` retained
for classification with the `visual` row's comment),
`routes/brands.$brandId.apps.$appId.tsx` (fourth branch →
`<SocialCalendarPage brandId={brandId} app={app} />`), `BrandNavPanel.tsx`
(`useBrandSocialPosts` beside the unconditional `useBrandAssets`, plus the
`countOf` arm), and the three existing suites whose Soon-stub expectations
invert.

After that, Phase 8 is the changelog entry (ships as a minor version) and
moving both plan documents out of `docs/executing/`.
