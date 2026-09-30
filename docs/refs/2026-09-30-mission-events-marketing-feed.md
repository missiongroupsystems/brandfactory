# Mission Events — the marketing feed, as their team specified it

**Source:** the Mission Events team, 30 September 2026, when the feed went live in production.
Recorded as they sent it, with two corrections agreed the same day (point 3 of the assumptions,
and staging). BrandFactory's side of this is `packages/adapters/events/` and
`docs/completions/content-calendar-events-service-endpoint.md`.

The events feed is live in production. The service key is a server secret, so keep it out of the
browser.

- **Base URL:** `https://supa-schedule-backend.fly.dev`
- **Auth:** send the key in the `X-Service-Key` header on every request. The key is tied to the
  Ebb & Flow Group organisation on their side, so the caller never passes an org.

## Endpoints

- `GET /api/v1/internal/marketing/events?from=YYYY-MM-DD&to=YYYY-MM-DD[&status=…][&skip=0&limit=500]`
- `GET /api/v1/internal/marketing/outlets[?skip=0&limit=500]` returns `{id, slug, name}` for every
  active outlet. Build the outlet → brand mapping from this. If an outlet is not listed, it does not
  exist on their side (the Casa Vostra question). Match on the slug, not the display name (the
  Firebird naming).

**Response envelope:** not `ListResponse`. Every list endpoint paginates as
`{ "items": [...], "total", "skip", "limit" }`. Keep fetching while `skip + len(items) < total`.
The default and maximum `limit` is 500.

**Event fields:** `id, name, status, event_type, date_start, date_end, is_all_day, outlet_id,
outlet_slug, outlet_name, room_name, guest_count, updated_at`. Nothing else is returned. Revenue,
ticketing, payment and credit fields, internal notes, lost reason, terms, setup fields and all
contact data never appear. `guest_count` is included.

## Behaviour

- `from` and `to` are inclusive **Singapore** calendar days. An event is included if any part of it
  overlaps the range. The range can be at most 93 days.
- If `status` is omitted, the feed returns `tentative`, `confirmed` and `completed`. Repeat the
  parameter to choose (`&status=confirmed&status=tentative`).
- **403:** wrong key. **422:** header missing, bad dates, `to` before `from`, or a range over 93
  days. **429:** more than 60 requests a minute from one IP.

## The three assumptions BrandFactory asked about

1. **Naive UTC timestamps:** yes. **Filtering on UTC days:** no. Filter and place events on
   Singapore days. An all-day event on 1 October is stored as `2026-09-30T16:00:00`, so a UTC-day
   grid would put it on 30 September.
2. **No all-day flag:** they still do not store one, but the feed now returns `is_all_day`. It is
   true when an event starts at midnight Singapore time and has no end, or ends at 23:59 Singapore
   time. Use the flag rather than working it out.
3. **What completes an event:** a person does, or an order completion does today; that automatic
   move is being retired. A finished event often stays `confirmed`, so request both statuses.

**Do not build incremental reads on `updated_at` yet.** Some status-change code paths do not update
it, and deleted events simply drop out of results, so a deletion would never be seen. Re-fetch the
window.

## Keys

- **Rotation:** the header accepts either of two keys during a changeover. They add the new key,
  BrandFactory switches, then they remove the old one.
- **Leaks:** tell them if the key may have leaked, and they replace it the same day.
- **Staging:** `https://stage-supa-schedule-backend.fly.dev`, with its own key — available on
  request.

## Their WebSocket note

Their `core/ws_manager.py` drives live updates only on the customer portal's ticket and order pages,
not the admin UI. With two Fly machines, an update fired on one machine does not reach a customer
connected to the other, so a customer sometimes misses a live refresh. It is on their list. This is
their app; BrandFactory's own cross-machine realtime is the separate backplane in 1.56.0.
