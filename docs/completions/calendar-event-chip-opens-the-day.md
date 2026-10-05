# The event chip opens the day plan

**Released in:** 1.60.0. **Migration:** none. **Wire:** none — no route changed.
**Screens:** the month grid's event chip and the week view's event card.
**New dependency:** none.

Reported by the owner: *"I can see the events on the calendar, but I cannot get more info.
Clicking on it doesn't do anything. Is that right?"*

It was right, in the sense that nothing was broken. It was also a defect.

## What the chip promised and did not do

`EventChip` was a `<div>` with no handler. Its only affordance was a native `title` tooltip. Two
things made that a false promise rather than a neutral absence:

- it drew a **`Link2` icon**, which reads as *this goes somewhere*;
- it sat between **`EntryChip`s, which are real `<button>`s** with `onClick={onEdit}`.

So a reader is taught by the chips either side of it that a chip opens something, told again by the
link glyph, and then gets nothing. The week view had the identical shape — an inert `<div>`, same
`Link2` — so fixing only the month grid would have left the same false promise one tab away.

## It selects the day rather than opening a sheet

The detail the reader was looking for already existed, one click away in a place the chip did not
advertise: `DayPlan`'s event card names the outlet, the room, the time or *All day*, the status, and
the entries made for that booking.

**A sheet of its own would have been the wrong fix.** The event is not ours to edit — Mission Events
owns the booking, and the day plan says so in as many words: *"Read-only here — the events module
owns this booking."* A sheet implies controls, and there are none to offer. Selecting the day puts
the reader in front of the detail that exists, in the one place on this screen that already states
who owns it.

`DayPlan` renders outside the view conditional, so the week view's card selects the day too and the
same panel opens under it.

## Two things kept deliberately

**The visible name stays the accessible name.** An `aria-label` would *replace* it, and every event
chip in the month would then announce identically — the lesson `CellTrigger` records from the
influencer roster. The extra context is appended `sr-only` instead, so the name reads *"Lunar New
Year dinner, from Mission Events — open this day"*.

**A tentative booking still draws dashed.** Making it clickable does not make it certain, and a
solid chip would let somebody plan a shoot around a booking nobody has confirmed. Asserted, because
it is the kind of thing a restyle quietly drops.

## One screen test, and why it exists here

`CLAUDE.md` keeps `web-next` tests off the screens — a browser pass covers them, and the calendar's
own logic worth asserting lives in `grid.ts`. This change is a `<div>` becoming a `<button>`: there
is no pure logic to extract, and **the browser pass could not be run**, because the events feed is
production-only configuration and the local `.env` carries none of it. So the assertion lives in
`calendar-view.test.tsx` rather than nowhere, following the `photography-view.test.tsx` pattern of
mocking the feature's hook.

Four tests: the chip is a button, clicking it opens the day plan and reveals the ownership line and
the outlet, the event name is still the accessible name, and a tentative booking is still dashed.

**Checked against a deliberate break.** With the `<div>` put back, all four fail with *"Unable to
find an accessible element with the role button and name /Lunar New Year dinner/"*. The first
attempt at that break did not compile, which proved nothing — a test only counts as checked once the
break is syntactically clean and the assertion is what fails.

## The gate

`typecheck` 0 errors across all 11 packages. `lint` 0 errors, root and `web-next`. `format:check`
clean. Both frontends build; `/calendar` is still `○ (Static)`.

**3375 tests passing, 0 skipped, 0 failed** across 249 files — run with `DATABASE_URL` set, so the
live tests are included.

## What this does not do

- **No sheet for an event**, and none should be added while Mission Events owns the booking.
- **No deep link into Mission Events.** The `Link2` icon means *this came from another product*, not
  *this opens it*. A real link would need a URL the feed does not send.
- **No browser pass.** Still owed, and it needs the events feed configured.
