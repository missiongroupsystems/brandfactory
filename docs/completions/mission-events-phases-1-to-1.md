# The company's events from Mission Events: phase 1

Plan: `docs/completions/mission-events-plan.md`. Branch `feat/mission-events`, from
`fix/onboarding-polish`. brandbase 1.8.0, migration `0016_events.sql` (not applied to production).
Released with the Pinterest connection from `feat/pinterest-and-events`: 1.8.0 holds 0015 and 0016.

## Phase 1: the hourly pull and the "Our events" row

**What was built.**

- **Core, `feeds.ts`.** A connector that reads. It sends a GET to one configured service with the
  key in a header, reads every page of an `{items, total}` answer (`skip`, `limit` 500, at most
  40 pages, and an empty page stops the read), and keeps only the items whose fields equal the
  payload's `keep`. A 401, 403, 429, other non-2xx answer, wrong shape or a body that is not JSON
  fails the send; it never answers an empty list. The payload's path is checked so the key cannot
  go to another host. `server.ts` (which `main.ts` and connect's `host.ts` both run) adds it as
  `mission_events` (header `X-Service-Key`) when
  `MISSION_EVENTS_URL` and `MISSION_EVENTS_SERVICE_KEY` are both set. `env.ts` refuses one setting
  without the other, and refuses a URL that is not https in production.
- **Core, the test runner.** Every connector that a pack names goes to the case's connector, and a
  call or tick step can set `answer`, so a pack test can supply a page from the feed.
- **Pack 1.8.0.** `event_feeds` (the brand's outlet id, the next step, the last pull) and `events`
  (name, status, type, start, end, all-day, room, guests), with the brand walls. The function
  `source_instant` reads Mission Events' naive UTC times. A value that is not a time gives null,
  and the pull leaves that row out.
  - `event.feed {brand, outlet|null}` (owners and admins, a person) names the outlet and starts the
    hourly chain. Null stops the chain. A different outlet removes the brand's events.
  - `event.tick {brand, at}` asks for `event.pull` now, with the caller's yes, for 14 days back to
    78 days ahead (Singapore days, 93 in all), and asks for the next tick in an hour. A tick whose
    `at` is not the feed's `next_at` does nothing, so a second `event.feed` never runs two chains.
    Each tick has its own key: a call cannot arm itself again under its own key while it runs.
  - `event.pull {brand, from, to}` is an effect on `mission_events`. It upserts the outlet's
    events that it can read and deletes the window's events that the feed no longer returns.
    Events before the window stay as history. An answer with no `items` list changes nothing.
  - `brand.state` adds `events` from 93 days back: `day` and `lastDay` in the brand's zone, `time`,
    `status`, `allDay`, `roomName`, `guestCount`. A timed event that ends before 06:00 the next
    day stays on its first day (an evening that runs past midnight).
  - `post.job_refused` and `post.job_unknown` take any scheduled call's input. Before, a failed
    pull made the scheduler's hook fail and wrote an alert. They still change only a post job.
- **web-next.** `ourEvents` puts each event on the week's "Our events" row, cut to the week. The
  text is "Name · guests", with "(tentative)" when the event is tentative, as the demo's events
  were. Chips are keyed by the event id.

**Decisions.**

- **Rows in the pack, not a read-through.** The archive did not store events: a deleted event
  drops out of the feed with no tombstone. A move here is one SQL statement and cannot call out,
  so the pack keeps rows and each pull replaces its whole window. A deleted event goes at the next
  pull (up to an hour), which keeps the archive's reason. `updated_at` is not used, as Mission
  Events asked.
- **The chain runs as the person who started it.** The core has no system caller, and an effect
  needs a person's yes. If that person leaves the company, `brand.reachable` refuses the next tick
  and the chain stops. An owner calls `event.feed` again to restart it.
- **No fold of `confirmed` into `completed`.** The archive folded a past confirmed event into
  completed for its chip. The calendar already fades past days, so the status is passed as it is.

**Verification.**

- Pack cases (`tests/events.json`, 8 cases): the pull keeps only the outlet's readable events
  (naive UTC, all-day 1 October stored as 30 September 16:00, past midnight, a bad date, a
  cancelled event, another outlet and a null item); a second pull renames one event, removes one
  and keeps the one before the window; an answer with no list and a failed send both keep the
  rows, the chain goes on and no alert is written; arming twice gives one chain; null stops it;
  a new outlet clears; refusals (member, agent, other company, a company not on the list, no
  feed, no yes); a refused tick alerts; a brand in Rome keeps all-day events on Singapore days.
- `feeds.test.ts`: all pages, header and query, keep, empty page, refusals, no other host.
  `env.test.ts`: both or neither, https in production. `remote-calendar.test.ts`: the row, cut at
  the week's edges.
- End to end on a local Postgres 18 (embedded), with a stand-in for the feed on localhost: publish,
  `core test` 167/167, migrate, seed, promote. `event.feed` as admin@local for casa-vostra. Within
  seconds the scheduler ran one tick and one pull (one GET with the key and three statuses) and
  stored three events (not the other outlet's); `brand.state` answered them. web-next on that core:
  the week view, the month view and the phone's day show "Wine dinner · 120",
  "Private dinner · 40" and "Harvest weekend (tentative)" in the "Our events" colour. No console
  errors.
- Gate (after the review fixes): typecheck, lint, format, build. Tests 1099 (895 run, 204
  skipped without a Postgres server). After the fixes, `core test` on a local Postgres 18 passed
  169/169. The end-to-end run and the full Postgres run below were before the fixes. With `CORE_TEST_PG_URL` on that local server, 1092 passed. The one failure,
  `postgres.test.ts` "runs a deployed core as a login that is not a superuser", expects a wrong
  password to be refused. That server ran with `trust` auth, so it accepts any password; this
  change does not touch that test's code.

## Review fixes (Opus and Sonnet panel)

- **The key could follow a redirect.** fetch strips `Authorization` on a cross-origin redirect,
  not `X-Service-Key`. The connector now refuses redirects. A test with two local servers fails
  without the fix. Each page has 15 seconds and the read has 25, under the effect's 30, so no read
  goes on after a timeout.
- **Any company's owner could point a brand at Ebb & Flow's outlets.** The key is tied to one
  Mission Events organisation. A new table `event_orgs` lists the companies whose brands may have
  a feed. Only the operator writes it, and the migration adds `mission-group` if it exists. The
  rule `event.org_allowed` applies to `event.feed` and `event.pull`.
- **One yes could serve two pulls, and a re-arm during a send killed the chain.** The pull's
  payload now names the brand and the tick's time, so each pull has its own yes and `SENDING`
  cannot refuse a tick.
- **A tick that cannot go on ended in silence.** `post.job_refused` and `post.job_unknown` now
  refuse a call from `event.tick` (rule `job.not_events_tick`, 409 `FEED_STOPPED`), so the core
  writes its alert to the person. A failed pull is still recorded quietly, and the next tick tries
  again. `brand.state` adds `eventsPulledAt`, so a screen can tell old events.
- **All-day events in a brand outside Singapore.** They now use Singapore days, as Mission Events
  does. Timed events stay in the brand's zone.
- **A pull recorded after the outlet changed.** The record keeps rows only when the feed's outlet
  is still the one in the approved payload.

**Left as they are, with the reason.**

- `packs.approvals.outcome` keeps each pull's answer, an estimated 20–80 KB an hour for each
  brand. `scheduled_calls` gains one tick row an hour for each brand. Both need a retention job in
  the core.
- A tick that fails with a database error (not a refusal) ends `failed` with no alert, as every
  scheduled call does today. That is a core change.
- An empty answer for the window (a wrong key mapping, an event skipped between pages) removes
  the window's events until the next pull. Mission Events gives no tombstones, so the window is
  the only signal.
- `event.feed` cannot check that the arming person's loadout holds `event.pull`: the runtime role
  cannot read loadouts. If it does not, the first tick is refused and the person is alerted. Run
  `core loadout … all` before `event.feed`.
- Events more than 78 days ahead are not shown (the source's 93-day limit, one read per hour).

**Not done.** Production (secrets, deploy, publish and promote, loadouts, the six `event.feed`
calls): see the plan's production steps. Mission Events' feed was not called: no credential was
used.
