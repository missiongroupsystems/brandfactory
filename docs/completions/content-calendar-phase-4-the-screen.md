# Content calendar Phase 4 — the screen the team asked for

**Shipped in:** 1.56.0. **Migration:** none. **Wire:** one new route,
`GET /workspaces/:id/calendar/entries`. **New dependency:** none.

## What this phase is

Step 4 of `docs/executing/content-calendar-plan.md`, and the first one the marketing team can see.
`/calendar` in `web-next`: every brand's posts, shoots and the events team's bookings on one grid,
with a day plan under it.

It also lands the workspace-level read phase 2 deferred, because a month grid across seven brands
cannot be built out of seven per-brand calls.

## `listSocialPostsByWorkspace`, and what it leaves out

Scheduled entries only, every brand, both day bounds inclusive.

**The unscheduled tray stays per-brand, deliberately.** A grid cannot draw a dateless idea, and a
workspace-wide tray would pour seven brands' loose thoughts into one list nobody asked for.
`listSocialPostsByBrand` is still the read for that, and the legacy calendar still owns it.

The bounds are day keys rather than instants because the caller is a grid and a grid's last cell is
a whole day; `to` is widened to the end of its day in the query rather than by every caller.

## Two reads, two cache scopes, and why they are not one

`bfCalendarEntries` and `bfCalendarEvents` are separate SWR keys.

The entries are ours, and a post edit invalidates them. The events belong to Mission Events, are
never written here, and go stale on their own schedule. One key would mean **every copy change
re-asked another product for a month it already had** — and worse, a Mission Events outage would
take this workspace's own posts off the screen, which is the exact opposite of what a read-through
is for. Only the entries gate the loading state.

## The grid's arithmetic is a tested file, not a component

`grid.ts` holds the month maths, the day bucketing and the summary, with 14 tests. That is the part
a browser pass cannot check: **a cell that is one day out looks completely normal**, and the person
who notices is the one whose shoot moved.

Three things it gets right on purpose:

- **`gridRange` asks for the grid, not the month.** A September screen draws days of August and
  October, and an event in those cells is as real as one in the middle. Asking for the month alone
  is the off-by-one nobody sees.
- **`eventsByDay` repeats a multi-day event in every cell it covers**, capped at 40 days. A ten-day
  festival that appeared only on the day it began would be missing from the nine cells a reader is
  planning around; the cap stops a run-away range in the source flooding every month.
- **Days are added by day**, never by 86,400,000 milliseconds, which silently produces a 23- or
  25-hour day twice a year.

`localDayKey` comes from `@brandfactory/shared` — the same key the legacy calendar groups by, which
is what phase 1 moved it there for.

## An empty slot is a state, not an absence

`isEmptySlot` is `idea` + no copy + no hook + no format + no dish. It draws dashed and reads *No
post yet*.

This is the thing the workshop asked for in as many words: a slot three weeks out that shows it has
no post. A hook with no copy is **not** a slot — it is somebody's half-finished thought, and
showing it as a gap would tell them to start again.

## The events layer says which of three things it is

Off, broken, and configured-but-partly-unmapped are different sentences, because a grid that drew
nothing would look identical in all three:

- no source configured → *the events layer is off*;
- the read failed → *events could not be loaded; the posts below are unaffected*;
- `unmappedOutlets > 0` → *N events hidden because their outlet is not linked to a brand here*.

Tentative bookings draw dashed. A solid chip would let somebody plan a shoot around a booking
nobody has confirmed.

## What is deliberately absent

- **No writes.** This phase reads. Creating and editing an entry from the grid is the next piece of
  work, and shipping a read-only month that is *honest about being read-only* beats shipping a
  half-wired editor.
- **No week view and no export.** Week is the fourth view in the plan's own order and export is
  step 5.
- **No screen tests.** CLAUDE.md is explicit that `web-next` tests auth and workspace resolution
  and not the screens; the logic worth asserting is in `grid.ts`, which is where the tests are.
- **No `<Suspense>`.** The month and the brand filter are component state, not `useSearchParams` —
  the line `lib/table-density.ts` draws for row height.

## The gate

`typecheck`, `lint`, `format:check`, `test`, both builds, plus `web-next`'s own lint and typecheck.
**3161 tests**, 14 more than phase 3, all of them `grid.ts`.

**One honest note on the run.** The first full-suite pass reported four failures in
`NewBrandDialog.test.tsx` and `PostEditorDialog.test.tsx`. Both files pass in isolation and both
passed on the immediate re-run; `NewBrandDialog` alone takes 7.7 seconds, so these are timeouts
under parallel load rather than breakage. They are pre-existing and worth a look — a suite that
fails one run in two teaches people to re-run rather than read.
