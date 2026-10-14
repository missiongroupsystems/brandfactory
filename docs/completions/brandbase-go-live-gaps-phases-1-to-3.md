# BrandBase go-live gaps: phases 1 to 3

Built on `feat/brandbase-backend` from the plan in `docs/executing/brandbase-go-live-gaps-plan.md`.
Nothing is deployed and no production database was touched.

## Phase 1: the calendar on real dates

Landed 14 Oct 2026 (2.13.0).

Every day is its `YYYY-MM-DD` date. `Day.n` became `Day.date`, and every `dayN` key with it
(store calls, idea cards, moments, shoots, the composer's `?day=`, picker values). The demo's data
files were rewritten to dates by script, so the static demo draws exactly what it drew before.
`lib/dates.ts` holds the helpers (weekday, Monday, labels, slots) and today: 6 October 2026 in the
demo, the server's `today` once a brand loads (`remote.ts` sets it before the stores hydrate, and
the calendar place resets to today's week when it changes).

On the API, `calendarOf` builds a run of weeks from two months before today's month to six after
it, stretched to every dated post, idea and shoot, with each day's posts and ideas found by date.
The demo's October skeleton still gives its weeks their city events; other weeks get `month.ts`'s
holidays. Months on screen are cut from the brand's weeks (the weeks whose Monday falls in the
month); a month they do not reach falls back to `monthView` (the demo's archive, or open days on
the API, where the archive is off). Month offsets count from the month of this week's Monday.

The day picker and the composer's day grid share `useMonthPages`: one month a page, arrows only
when there is more than one month, every week with a day of the month on its page, and a day
that belongs to another month's page dimmed and still pickable. The month view's Today opens
today's own month (Thu 1 Oct sits in a September week but is October's day).

**Verified.** Gate (see the changelog). In a browser on the API with the clock pinned to Tuesday 3
November 2026: the calendar opens on 2 – 8 Nov with the 3rd as today and Deepavali on the 8th; a
post dated 20 November shows two weeks on; a post dragged from Monday 30 November to Wednesday 2
December is stored as 2 December and survives a reload; the composer opens on Tue 10 Nov and its
grid turns to December, where 1 to 6 December show. Against the last commit's demo, pixel for
pixel: the week, month (October, September, November) and day views, Ideate and the composer are
identical, and the day picker shows no visible change.

**Review.** One Sonnet pass. Fixed: the month view's Today landed on the previous month in the
days before a month's first Monday; 1 November had turned grey in the demo's pickers; the
composer's day grid jumped back to the picked day's month whenever the calendar reloaded; moving
holidays repeated their 2026 dates in other years. Not a defect: the composer's default day reads
today before the brands load (pages render only after every brand loads).

**Not changed.** The demo's insights, inbox and archive data keep their fixed 2026 dates. Today is
one value for the app: the last brand loaded sets it, which is right while every brand is in
Singapore's zone. The API calendar's run of weeks grows with the oldest dated post. The demo's "Our events" in October (a private dinner, a wine
night) still show on the API in those weeks, as before.

## Phase 2: the composer waits for the server

Landed 14 Oct 2026 (2.13.1).

`sent(brandId, send)` in `lib/remote.ts` is `push` for a caller that waits: the same ordered queue,
the same message and reload on a refusal, and an answer (the refusal in words, or null once
stored). `push` stays fire-and-forget for every other store. On the API the composer's Schedule,
Post now and Save wait for it: the button says "Sending…" or "Saving…" and ignores a second
press, a stored change moves to the done screen, and a refusal leaves the composer as it was. The
refused change's reload drops a post whose first save failed, so the next press makes it again
under the id it already had (`planPost` takes the caller's `postId`); a create is idempotent by
id, so a save that half landed is not made twice. With real dates, a draft whose day has passed
now says "Pick a day ahead." before it can be scheduled; the browser run below found it.

**Review.** One Sonnet pass, no confirmed defect; two likely ones fixed. A retry got a fresh
idempotency key, so a send whose answer was lost could go out twice; one key now covers a send
until it is stored (the server keeps a key only for a stored send). Whether to make or move the
post was read from the calendar, which the reload after a refusal may not have reached; it now
comes from what the server stored. Left as is: today is one value for the app (see phase 1).

**Verified.** Tests: the done screen waits for the answer, a second press sends nothing, a
refusal keeps the composer open and a retry sends again, a refused first save is made again
under the same id, a passed day blocks the send. In a
browser on the API (clock on 3 November): with a post marked posted in another tab, Schedule
showed "This post is posted and cannot change." and the composer stayed open; the pasta draft,
on 13 October, said "Pick a day ahead."; moved to 20 November it showed the done screen, and the
server held it scheduled with a job per account.

