# Content calendar — Mission Events built the endpoint, so the adapter changed

**Shipped in:** 1.56.0. **Migration:** none. **Wire:** none — `GET /calendar/events` keeps
its shape. **New dependency:** none. **Secret renamed:** `MISSION_EVENTS_CALENDAR_TOKEN` →
`MISSION_EVENTS_SERVICE_KEY`.

## What happened

Phase 3 read Mission Events through their **public calendar share link**, because at the time that
was the only mechanism they had that answered without a user session. That was the wrong shape and
the reviewer said so: the share link exists so a venue can put a calendar on a website. Its scope,
its projection and its rate limit were designed for that reader, and somebody could re-scope it
without knowing we depended on it.

They agreed, and built a **purpose-built service endpoint** instead — two of them, under
`/api/v1/internal/marketing/`, guarded by `X-Service-Key`. That is the same shared-secret pattern
their own `internal.py` already used for cron, so it needed no new precedent on their side.

## They corrected a real bug

Phase 3 inferred `allDay` from a midnight start **in UTC**. Mission Events store naive UTC and
filter on **Singapore** days, so an all-day event on 1 October is stored `2026-09-30T16:00:00`.

That inference would have called it neither all-day nor October — wrong flag, wrong cell, on every
public holiday and festival in the year. The endpoint now returns `is_all_day`, computed against
Singapore midnight, and `inferAllDay` is deleted rather than fixed. A fact the source can state is
not ours to guess.

## Three things their contract does better than the sketch we sent

**`PaginatedResponse`, not `ListResponse`.** Every list endpoint there paginates. A client that
read page one and stopped would draw a month that *looked complete and was not*, which is the worst
shape of wrong a calendar has. `readAllPages` follows their stopping rule —
`skip + items.length >= total` — with a bounded guard so a `total` the pages never reach cannot
spin.

**An outlets endpoint.** `GET /internal/marketing/outlets` returns `{id, slug, name}` for active
outlets, which is how `brands.events_outlet_id` gets set against a name a person can check rather
than a bare uuid. It also answers the open question from phase 3: if Casa Vostra is not in that
list, it does not exist in production.

**Singapore days.** The filter boundary and our grid now agree, and the port says so in its type.

## What changed on our side

The port did most of the absorbing, which is what it is for:

| Before | After |
|---|---|
| `listMonth({year, month})` | `listRange({from, to})` — Singapore days |
| Three calls per grid, de-duplicated by id | One call; `monthsBetween` deleted |
| `inferAllDay` from UTC midnight | `is_all_day`, reported |
| — | `listOutlets()`, for the mapping |
| — | `guestCount` on the event |

`guestCount` is the one figure on that booking a marketing reader uses: a shoot planned around a
200-person party is a different shoot from one around a table of eight. Everything else the
endpoint excludes stays excluded — revenue, pricing, deposits, contacts, internal notes.

The route now guards the 93-day limit itself, so a caller learns it from us rather than from a 422
it cannot interpret. `foldStatus` stays: the date never completes an event there — a person
does, or an order completion does today, a move they are retiring — so a finished event is often
still `confirmed` at the source. Their full spec is in
`docs/refs/2026-09-30-mission-events-marketing-feed.md`.

## `updated_at` is read and deliberately unused

They warned that some status-change paths do not touch it, and that a soft-deleted event simply
drops out of results. So it is carried on the wire and drives nothing. A field that some writers
skip, on a source where deletions are invisible, is not a sync cursor — the window is re-read.

## The gate, and an honest note on it

`typecheck` 0 errors, `lint` 0 errors, `format:check` clean.

**1611 tests pass across every package this change touches** — `adapter-events` (32),
`server`, `shared` and `web-next`.

The full-root run also reports 3–5 failures in `@brandfactory/web`, which this change does not
touch. Every one passes in isolation, and the set is different each run. I first blamed the suite
and raised `testTimeout` to fix it; that was wrong and is reverted. The machine was carrying a
**load average of 160 on 8 cores** with none of my processes running — at that contention a 500 ms
test fails whatever its timeout. The suite is not the problem and should not be changed for it.
Re-run the root suite on an idle machine before reading anything into those numbers.

## To turn it on

```bash
fly secrets set \
  MISSION_EVENTS_URL=https://supa-schedule-backend.fly.dev \
  MISSION_EVENTS_SERVICE_KEY=... \
  EVENTS_PROVIDER=mission-events
```

Staging is `https://stage-supa-schedule-backend.fly.dev` with its own key, and is the honest place
to point first. Rotation is theirs to start: they accept several keys at once, so they add, we
switch, they remove.

**Production is unblocked on the Events side** (30 September): the endpoint shipped in Mission
Events' CI run for `8023145`, 05:47 UTC, and there is nothing for them to deploy. **A 403 on
production now means our service key is wrong** — their org id is configured, so the other cause
of a 403 is ruled out there. On staging a 403 can still mean their org id is missing, so ask them
before rotating a staging key.

Then set the seven `brands.events_outlet_id` values from `listOutlets()`, and confirm
`Firebird by Suetomi` against the slug `firebird` — the names do not match.
