# Plan: the company's own events from Mission Events (brandbase 1.8.0)

## Why

The Schedule page's "Our events" row is empty on the core: 2.35.1 took away the demo's invented
events, and only city events and holidays are left. The events team keeps the real bookings in
Mission Events. The old BrandFactory server read them (`archive/main-2026-10-07`); this ports that.

## What the archive had

- `packages/adapters/events`: `EventsSource` with `listRange({from, to})` and `listOutlets()`,
  a Mission Events client and a noop. `docs/refs/2026-09-30-mission-events-marketing-feed.md`
  is Mission Events' own spec.
- The feed: `GET {MISSION_EVENTS_URL}/api/v1/internal/marketing/events?from&to&status…&skip&limit`
  and `/outlets`, header `X-Service-Key`. `from` and `to` are Singapore days, both inclusive, at
  most 93 days. Pages are `{items, total, skip, limit}`, `limit` at most 500. 403 is a wrong key,
  422 a bad request, 429 over 60 requests a minute. Fields: `id, name, status, event_type,
  date_start, date_end, is_all_day, outlet_id, outlet_slug, outlet_name, room_name, guest_count,
  updated_at`. Timestamps are naive UTC (append `Z`). `is_all_day` is reported, not inferred.
- `brands.events_outlet_id` mapped one Mission Events outlet to one brand, by id, set by hand
  (their slugs are not unique). Six brands were mapped on 5 October; Mission Group has no outlet.
- Settings: `EVENTS_PROVIDER=mission-events`, `MISSION_EVENTS_URL`, `MISSION_EVENTS_SERVICE_KEY`.
- No copy: the route read through on each screen, with a 5-minute cache, because a deleted event
  drops out of the feed with no tombstone and `updated_at` is not reliable.
- The web app drew each event as a chip on its days, tentative ones dashed.

## The design on the core

The core has no read-through: a move is one SQL statement. So the pack keeps a copy, and each pull
**replaces the whole window**: an event in the window that the feed no longer returns is deleted.
That keeps the archive's reason for no copy (a deleted event must go) at the cost of up to one
hour's lag. Events before the window keep their last state (history).

1. **Core: a feed connector** (`packages/core/src/feeds.ts`). A connector that reads: a GET to one
   configured service with its key in a header, every page of an `{items, total}` answer, and only
   the items whose fields equal the payload's `keep`. The pack's payload names the path and query;
   the key never leaves the core and the path cannot change the host. `main.ts` adds it as
   `mission_events` when `MISSION_EVENTS_URL` and `MISSION_EVENTS_SERVICE_KEY` are both set
   (`env.ts` refuses one without the other). No business words.
2. **Core: the test runner** gives every connector a pack names to the case's connector, and a
   step can set what the connector answers (`answer`), so a pack test can feed a canned page.
3. **Pack migration 0016_events**: `brandbase.event_feeds (brand_id pk, outlet_id uuid, next_at,
   pulled_at)` and `brandbase.events (brand_id, id, name, status, event_type, starts_at, ends_at,
   all_day, room_name, guest_count, pulled_at)`, walls as every brand table, and
   `brandbase.source_instant(text)` (naive UTC to `timestamptz`, null for a bad value).
4. **Moves**
   - `event.feed {brand, outlet|null}`: an owner or admin, a person, names the brand's outlet. It
     arms the hourly pull at once; null stops it and removes the brand's events.
   - `event.tick {brand, at}`: the scheduler's hourly step. It asks for a pull now (with the
     arming person's yes) and the next tick in an hour. A tick whose `at` is not the feed's
     `next_at` does nothing, so arming again never runs two chains.
   - `event.pull {brand, from, to}`: the effect on `mission_events`. Payload: the path, the window
     and statuses (tentative, confirmed, completed), and `keep: {outlet_id}`. It upserts what came
     back and deletes the rest of the window.
   - `brand.state` adds `events`: each with `day` and `lastDay` in the brand's zone, `time`,
     `status`, `allDay`, `roomName`, `guestCount`.
   - `post.job_refused` and `post.job_unknown` take any scheduled call's input (a failed pull is
     not a post job); they still change only a post job.
5. **web-next**: `calendarOf` puts each event on the "Our events" row (`layer: 'ours'`), split by
   week; a tentative one reads "Name (tentative)".

The window: from 14 days before today (Singapore) to 78 days after, 93 days. The pull runs as the
person who armed it; a person who leaves the company stops it (re-arm with `event.feed`).

## Production steps (not done here)

1. Check the Fly secrets on `brandfactory` (the archive set them): `fly secrets list -a
   brandfactory` shows the names. Set `MISSION_EVENTS_URL` and `MISSION_EVENTS_SERVICE_KEY` if
   missing (the key from the Mission Events team).
2. Deploy the core, then publish, test and promote brandbase 1.8.0; run `core loadout <id>
   brandbase all` again for each person (new moves).
3. Check that the company is `mission-group` (`brandbase.event_orgs` gets it from the
   migration). Add any other company only after the Mission Events team agrees.
4. Read the six outlet ids from the old BrandFactory database (`brands.events_outlet_id`), or from
   `/outlets` with the key, and call `event.feed` once per brand as an owner.
5. Check: `brandbase.events` fills within a minute; the Schedule page shows the row.

## Not in this plan

The outlet list in the app (an admin screen), the archive's "N events have no brand" count, an
"events unavailable" state on screen, the event's room and guest count on screen.
