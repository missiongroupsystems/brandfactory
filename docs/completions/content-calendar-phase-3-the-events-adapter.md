# Content calendar Phase 3 — the events adapter, and the map to a brand

**Shipped in:** unreleased. **Migration:** 0024 — `brands.events_outlet_id`, additive.
**Wire:** one new route, `GET /workspaces/:id/calendar/events`. **New dependency:** none.
**New package:** `@brandfactory/adapter-events`, the sixth port.

## What this phase is

Step 3 of `docs/executing/content-calendar-plan.md`. BrandFactory can now read the events team's
bookings without Mission Events changing a line, and without storing any of them.

## The decision this rests on: nothing is copied

The plan argued it and the port repeats it, because it is the one thing a future reader will be
tempted to "fix": there is no `events` table, no sync job, no cursor and no reconcile.

That is not laziness. In Mission Events a delete is soft, **a soft delete does not bump
`updated_at`**, and no endpoint reports tombstones. A copy here could therefore never learn that an
event had gone — it would show a cancelled party until a person noticed and went looking. A
read-through is correct on the next read, for nothing.

The cost is latency and a rate limit, which the cache absorbs. The benefit is that the hardest bug
in this integration cannot be written.

## The share link, and the decision it sits beside

Mission Events' standing rule is *"Launchpad hides; Events enforces"*: every caller carries the
end-user's token, and no endpoint gets a trusted-caller path. That is right, and this adapter is
built to be replaced by it.

It is not available today. It needs Passport to span both products, and it needs the marketing team
to hold accounts in an app they do not open. So phase 3 uses the **public calendar share link** that
already exists over there: an admin scopes one to outlets, statuses and a window, and it answers
without a session. We hold the token as a server secret.

It exposes strictly less than a user session would — the projection already excludes revenue, ticket
prices, client contacts, internal notes and deposits — and it is revocable in one click. **It still
needs the Mission Events owner's agreement**, which is the open item the plan names.

## Three things the source's shape forced

**Time.** The source stores naive timestamps that *hold* UTC. `new Date('2026-10-20T19:00:00')`
reads that as local time, which in Singapore is an eight-hour shift and an evening event landing in
the small hours of the next day. `parseSourceInstant` appends the `Z`, in the one place the strings
enter.

**All-day.** There is no flag. Its own importer wrote all-day rows as a midnight start with either
no end or 23:59 on the last day, so `inferAllDay` reads that shape. Inferring is not optional:
without it every holiday and festival draws as a 00:00 appointment — a confident wrong answer on
every cultural date in the year.

**`completed`.** Nothing over there moves an event to `completed` when its date passes; a person
does, or an order transition does. So a `confirmed` event that finished last month is still
`confirmed` at the source. `foldStatus` folds it. It does **not** fold `tentative`: a tentative
event in the past is not a thing that happened, it is a thing that never firmed up, and that
difference is why the team asked to see tentatives at all.

## The map is stored, not inferred

`brands.events_outlet_id`, set once per brand. Six of the seven brands match an Events outlet by
slug and `Firebird by Suetomi` matches `firebird`, so a normaliser would work *today* — and would
quietly file the next brand under whichever concept had a similar name. A wrong mapping here puts
another brand's parties on this brand's calendar.

An event whose outlet maps to nothing is dropped **and counted**. `unmappedOutlets` is what turns a
missing mapping into a number on screen instead of an event that silently never appears.

## `configured` is a positive test, and its first version was not

The route reports whether a real source is behind the port, so the screen can say *the events layer
is off* rather than *the events team has nothing booked*. The two look identical on a grid and mean
opposite things.

It was first written `EVENTS_PROVIDER !== 'none'`, and the route test caught it: `testEnv` did not
set the key, `undefined !== 'none'` is true, and a test harness with no source was reporting a
configured feed. It is `=== 'mission-events'` now, and `testEnv` states the default like every other
provider.

## Two failure modes, kept apart

`EVENTS_UNAUTHORIZED` (a revoked or mistyped token — somebody's settings, will not recover) and
`EVENTS_UNAVAILABLE` (a 5xx, a timeout, a body we cannot parse — worth another look in a minute).
Both are 502.

**Neither is an empty month.** A calendar that drew "no events" for a broken feed would tell a
reader they can stop worrying about Friday.

## The noop answers, it does not refuse

`NoopEventsSource` returns no events rather than throwing, which is the opposite of
`NoopResearchProvider`. Research is a feature you opt into, so reaching its noop means a gate failed
and a loud error is how that is found. Events is a *layer* on a calendar that works without it: a
developer with no token still needs the grid, and an exception on every month render would make the
screen impossible to develop against.

## The gate

`typecheck`, `lint`, `format:check`, `test`, both builds. **3147 tests**, 42 more than phase 2:
32 in the adapter and 10 on the route. 2982 passed, 165 skipped.

`.env.example` documents `EVENTS_PROVIDER`, `MISSION_EVENTS_URL` and
`MISSION_EVENTS_CALENDAR_TOKEN` — its drift guard failed until it did, which is the guard working.

## Not done here

- **The share link itself.** It needs the Mission Events owner to agree and to create it. The prompt
  for that conversation is written.
- **The seven mappings.** `events_outlet_id` is null for every brand until somebody sets it, and the
  route reports the resulting drop count rather than guessing.
- **The screens.** Step 4.
