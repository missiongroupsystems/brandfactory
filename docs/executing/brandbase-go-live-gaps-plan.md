# BrandBase go-live gaps: implementation plan

Status: phase 1 landed 14 Oct 2026 on `feat/brandbase-backend` (completion notes:
`docs/completions/brandbase-go-live-gaps-phases-1-to-3.md`); phases 2 and 3 to come. Three gaps the backend left (see "Not
built" in `docs/completions/brandbase-backend-phases-1-to-5.md`) that matter once real people use
the app on the API. Nothing here deploys or touches production.

## Phase 1: the calendar on real dates

**The gap.** Every day in the app is a `dayN` string, the day of the month inside the demo's one
month (5 Oct to 1 Nov 2026), and `remote-days.ts` converts it to a date at the API boundary. A
date outside that month has no `dayN`, so from 2 November nothing new shows on the calendar, and
nothing can be planned past 1 November. "Today" is fixed at Tuesday 6 October in several places
(`month.ts`, `calendar-view.ts`, the composer's `'6'`, the day picker's "Today 6 Oct").

**The fix: a day is its date.**

- `Day.n` becomes `Day.date`, a `YYYY-MM-DD` string; the printed number is read from it. Every
  `dayN` key (store calls, idea cards, shoots, URL `?day=`, picker values) becomes that date. The
  demo's data files are rewritten to dates (5 to 31 are October 2026, 1 is 1 November), so the
  static demo draws exactly what it drew before.
- `remote-days.ts`'s `dateOf` and `dayNOf` go: the store sends its dates as they are. The labels
  that guessed the month from the number ("a day below 5 is November": `dayLabel`, `slotFor`) read
  it from the date.
- **Today** has one source, `lib/today.ts`: 6 October 2026 in the demo, the server's `today` (the
  brand's zone, already in `GET /brands/:id/state`) on the API. The composer's "now", the day
  picker, the calendar's Today button and the month offsets read it.
- **Weeks on the API.** `calendarOf` builds a run of weeks from two months before today's month to
  six months after it, stretched to hold every dated post, idea and shoot. The demo's October
  skeleton still gives its weeks their city events; other weeks get `month.ts`'s holidays.
- **A month on screen** is the weeks whose Monday falls in it (the rule the demo already follows).
  The schedule page cuts the shown month out of the brand's weeks, and falls back to `monthView`
  (the demo's archive, or open days) for a month the weeks do not reach. Month offsets count from
  today's month.
- **The day picker** shows one month at a time, starting at the picked day's month, with arrows to
  the months the brand's weeks reach. In the demo there is one month, so it looks as before.
- The server's seed reads the dates straight from the data files.

**Not changed.** The demo's insights, inbox and archive data keep their fixed 2026 dates. The
holidays in `month.ts` are 2026's; a holiday that moves each year is only right in 2026.

**Checks.** The gate, with tests for: a post dated in November and one in December reach their
weeks; a month cut from the weeks; today from the state; the labels across a month and a year end.
Playwright on the demo (unchanged screens) and on the API with `PIN_NOW` set to 3 November: today's
week shows, a post planned for 20 November shows after the arrows, and a drag across into the next
month stays after a reload.

## Phase 2: the composer waits for the server

**The gap.** On the API, "Schedule" and "Post now" show the done screen at once. If the server
refuses (a story already on that day, a post posted elsewhere, a lost connection), the person sees
a message and the calendar reloads, but the composer still says done.

**The fix.** `push` returns the change's own outcome to a caller that wants it (the queue order
stays). With the API on, the composer's primary button waits: it shows that it is working, and
only a stored change moves to the done screen. A refusal keeps the composer open with the
server's reason in its hint line, so nothing typed is lost. Saving a draft does the same. The
demo, with no server, is unchanged.

**Checks.** A test that a refused send keeps the composer open with the reason; Playwright on the
API: a schedule that lands, and one refused (a second story on a day taken in another tab).

## Phase 3: browser-only data kept on the server

**The gap.** Three things live only in the browser on the API, so they are lost on another device
or a reload: moodboard sources other than Pinterest (which accounts are linked as sources), pasted
references, and story ideas in the story row.

**The fix.** Each gets a home on the server, in the existing tables where one fits and a small
table where not, with a route each, loaded in `GET /brands/:id/state` and written through the
queue like everything else. The exact shape is settled after reading each feature's store; this
plan is updated with it before the code.

**Checks.** Server tests per route (brand scoping, a create sent twice makes one record);
Playwright: add each, reload, and see it still there.

## Order and review

One phase per commit, each after the full gate and an adversarial review of exactly what is
committed. Each gated commit is pushed to the feature branch. No deploy, no production database,
no merge.
