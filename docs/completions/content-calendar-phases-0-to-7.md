# The content calendar (MKT-0 to MKT-2) — Phases 0 to 7

**Plan:** `docs/completions/content-calendar-plan.md`.
**Released in:** 1.56.0 (phases 0 to 6) and 1.57.0 (phase 7).
**Migrations:** 0023 — `social_posts` widened, hand-edited — 0024 — `brands.events_outlet_id` —
and 0025, the realtime backplane, which has its own note.
**Wire:** two new workspace routes, `GET /calendar/entries` and `GET /calendar/events`; three
schemas widened; the post routes gain one check.
**New package:** `@brandfactory/adapter-events`, the sixth port.
**New infrastructure:** one Vercel project, `brandfactory-calendar`.
**New dependency:** none, at any phase — and in phase 5 that is the decision the phase turned on.

The 16 September workshop (`docs/refs/2026-09-16-marketing-build-plan-module-02.md`) found adoption
at zero for a reason on our side. This is MKT-0, MKT-1 and MKT-2 of that plan.

| Phase | What landed | Release |
| --- | --- | --- |
| 0 | A deployment for the Vite app, which had none | 1.56.0 |
| 1 | The 92 key dates move to `@brandfactory/shared` | 1.56.0 |
| 2 | `social_posts` becomes a five-stage pipeline (0023) | 1.56.0 |
| 3 | The events adapter and the brand map (0024) | 1.56.0 |
| — | Mission Events built an endpoint, so the adapter changed | 1.56.0 |
| 4 | `/calendar` — the month grid and the day plan | 1.56.0 |
| 5 | The list view and the CSV export | 1.56.0 |
| 6 | Create, edit, delete and undo from the grid | 1.56.0 |
| 7 | The week view, the shoot and event links, attachments | 1.57.0 |

Phases 4 and 5 shipped **read-only on purpose**, and both said so. Shipping a read-only month that
is honest about being read-only beats shipping a half-wired editor.

## Phase 0 (MKT-0) — the calendar gets a deployment again

**Migration:** none. **Wire:** none — no route changed.

The build plan called this "not a build — a deploy and twenty minutes", on the belief that the
calendar had been pulled off a deployed front end and could be put back. The first half was right
and the second was not.

What the Vercel account actually holds:

- One project, `brandfactory-web`, on `branding.missionsystems.ai`, **framework `nextjs`**. The live
  HTML carries `_next`. It serves `packages/web-next`.
- `packages/web`, which still holds the working calendar, had **no deployment at all**.

And the project's own environment variables say how that happened. `brandfactory-web` still carries
five `VITE_*` production variables created in May 2026, alongside the `NEXT_PUBLIC_*` ones added in
September. **It is the same project, repurposed.** Nobody deleted the calendar and nobody deleted
its deployment: the one project that served it was pointed at the other package, and everything the
Vite app rendered went dark in the same moment. That is the whole regression, and it is invisible in
the git history, which is why the release-process question in the plan is the real fix.

### What this phase does

Gives the Vite app its own project, so the calendar is reachable while MKT-1 is built.

`brandfactory-calendar` — root directory `packages/web`, framework `vite`, git-linked to the
repository, deploying `dev/dani`. Vercel Auth is on for every `.vercel.app` URL, so it is
team-visible only until a custom domain is attached.

### The rewrites, and why the server was not touched

`packages/web/vercel.json` carried the SPA fallback and nothing else, so a deployed build would have
called `/api` on its own origin and found a static host. The fix is two rewrites that reproduce
`vite.config.ts`:

```json
{ "source": "/api/:path*",   "destination": "https://brandfactory.fly.dev/:path*" },
{ "source": "/blobs/:path*", "destination": "https://brandfactory.fly.dev/blobs/:path*" }
```

`/api` **loses its prefix**, because the dev proxy strips it (`path.replace(/^\/api/, '')`) and the
server mounts its routes at the root — `GET https://brandfactory.fly.dev/workspaces` answers 401,
not 404. `/blobs` passes through verbatim, the way the dev proxy already documents.

The point of doing it this way is what did **not** change: the browser sees one origin, so
`CORS_ALLOWED_ORIGINS` stays unset on Fly, and no production secret and no server restart were
needed to put a second front end in front of the same API.

`/rt` is deliberately absent. A Vercel rewrite does not carry a WebSocket upgrade, so proxying it
would fail anyway. The realtime client backs off and retries rather than throwing, and the social
calendar subscribes to nothing, so the one screen this phase exists for does not notice.

### Verified

Through Vercel Auth, with `vercel curl`:

- `GET /` → `<title>BrandFactory</title>` and `assets/index-*.js` — the Vite build, not Next.
- `GET /api/workspaces` → `{"code":"UNAUTHORIZED","message":"missing bearer token"}` — the
  BrandFactory server's own refusal, through the rewrite. A broken proxy gives a Vercel 404 and a
  broken origin gives a CORS error; this is neither.

### Not done here, and deliberately

- **Supabase redirect URLs.** Sign-in is `supabase`, and the new origin has to be in the project's
  allowed redirect list before a magic link or the Google button can return to it. A dashboard
  setting, not a repository one.
- **A custom domain.** `brandfactory-calendar-missionsystems.vercel.app` is what the team can reach
  today, and it is Vercel-Auth-gated.
- **`main`.** The rewrites live on `dev/dani`. A production deployment from the default branch needs
  them there first.
- **Accounts for Natalie and Chloe.** The other half of MKT-0, and the half no deploy can do.

### Found while doing this, and not fixed here

`fly.toml` states the single-instance commitment in full: `native-ws` is an in-process bus, and "two
instances break the fan-out without an error". `flyctl scale show -a brandfactory` reports **count
2** in `sin`. Realtime fan-out is therefore already broken in production for any client not on the
machine that published. It is a one-command change to a live app, so it was reported rather than
taken — and then fixed properly in migration 0025, which has its own note,
`realtime-cross-instance-backplane.md`.

## Phase 1 — the key dates leave the app that cannot share them

**Migration:** none — the dataset has no schema and still does not want one. **Wire:** no new
route; the 92 dates never crossed it and still do not.

The calendar that MKT-1 builds lives in `web-next`. The key dates it has to enrich lived in
`packages/web/src/lib/key-dates/`, which `web-next` cannot import. So they move to
`@brandfactory/shared` before anything is built on top of them.

Nothing about the data changes: the same 92 dates, the same three sets, the same curated-through
line. A reader of the legacy calendar sees exactly what they saw yesterday. This is a move, and the
proof it is only a move is the test count: 3104 before, 3104 after.

### Why three date helpers came with it

`select.ts` — the one file in the dataset that answers questions rather than holding rows — opens
with:

```ts
import { dayKeyToDate, localDayKey, monthLabel } from '../calendar'
```

`../calendar` is `packages/web/src/lib/calendar.ts`. A package cannot import from the app that
consumes it, so the move was never going to be the folder alone. The three functions are pure,
depend on nothing but `Date` and `Intl`, and are exactly the vocabulary a date dataset speaks, so
they are now `packages/shared/src/date/day-key.ts` with their doc comments and the UTC-versus-local
invariant intact.

`monthGridDays`, `shiftMonth`, `groupByDay` and the two converters stayed in web. They are the month
grid's arithmetic, not the dataset's, and `groupByDay` takes a `SocialPost`.

### The re-export, and why it is not a second copy

`lib/calendar.ts` imports the three back and re-exports them:

```ts
import { type SocialPost, dayKeyToDate, localDayKey, monthLabel } from '@brandfactory/shared'
export { dayKeyToDate, localDayKey, monthLabel }
```

Eight files in web read `localDayKey` from `@/lib/calendar`, and this file's header still describes
every function a caller gets from it. Splitting those eight imports in two — one line for the
helpers that moved, one for the helpers that did not — would have made each call site record an
implementation detail of the monorepo's package graph. One module stays one module; only the bodies
moved.

The import is needed as well as the export because `isoToLocalParts`, `localPartsToIso`,
`groupByDay` and `formatDayHeading` call them internally, and `export … from` binds nothing in the
re-exporting module's own scope. `tsc` said so, in six errors, before this was right.

### What moved where

| Before | After |
| --- | --- |
| `packages/web/src/lib/key-dates/*` (11 files) | `packages/shared/src/key-dates/*` |
| `localDayKey`, `dayKeyToDate`, `monthLabel` in `lib/calendar.ts` | `packages/shared/src/date/day-key.ts` |
| their cases in `lib/calendar.test.ts` | `packages/shared/src/date/day-key.test.ts` |
| 22 × `from '@/lib/key-dates'` | 22 × `from '@brandfactory/shared'` |

`key-dates-prefs.ts` stayed in web, deliberately. It is a `localStorage` preference, and *a user
preference is not a column* — nor is it shared data. It now imports the types from `shared` like
every other consumer.

Tests travelled with their code, which is why `calendar.test.ts` lost two `describe` blocks and one
case and gained nothing: the same assertions run, in the package that now owns the functions.

**Gate:** 2939 passed, 165 skipped, **3104 total** — identical to the count `297c468` recorded. A
move that changes a test count is not a move.

## Phase 2 — `social_posts` becomes a production pipeline

**Migration:** 0023, hand-edited. **Wire:** no new route; three schemas widened.

The table the marketing team already writes into learns the five stages they named, the plan fields
they asked for, and the two links the calendar needs.

Deliberately **not** in this phase: the `GET /calendar/entries` route and any screen. The enum
rename touches every surface that renders a post, and doing that in one commit with the schema is
already the largest change the plan has.

### Widened, not replaced

`social_posts` already held brand, platform, a nullable `scheduled_at` (the unscheduled tray), a
`body` where `''` means *slot claimed, copy pending*, soft delete, attachments and provenance.
`funnel_activities.social_post_id` points at it (1.55.0). A new `content_items` table would have
orphaned that link and duplicated five routes to gain nothing the columns below could not carry.

| Added | Why |
| --- | --- |
| `status` → `idea, approved, filming, editing, posted` | The pipeline the workshop named. `draft → idea`, `ready → approved`. |
| `kind` → `post, shoot` | A shoot has its own date and crew and feeds posts scheduled separately. |
| `shoot_id` | Post → shoot, one way. `ON DELETE SET NULL`: deleting a shoot must not take the posts it fed. |
| `format, hook, dish, talent, filmed_by, canva_url, cleared_with` | The content plan, all free text. |
| `approved_at, approved_by` | Who cleared it, and when. Server-owned. |
| `events_event_id` | The Mission Events event, **no foreign key** — another app's database. |
| `social_platform` + `xiaohongshu`, `threads` | The roster has carried Xiaohongshu accounts since 1.47.0. |

### Free text, and why that is the decision

Talent is a chef one week, a floor team the next, a booked creator the week after. The freelancer
behind a camera may be a vendor row or a name in somebody's phone. Structure chosen now is a guess
about which, and the first wrong guess costs more than the typing does. A month of what the team
actually writes is the evidence for linking any of these to a real record, and nothing typed is lost
when that happens.

`''` and `null` both mean nobody filled it in, so `blankToNull` collapses the blank in the mapper and
no reader downstream tests for two empties.

### The migration is hand-edited, and had to be

`drizzle-kit` generated this for the status change:

```sql
ALTER TABLE social_posts ALTER COLUMN status SET DATA TYPE text;
DROP TYPE social_post_status;
CREATE TYPE social_post_status AS ENUM('idea', …);
ALTER TABLE social_posts ALTER COLUMN status SET DATA TYPE social_post_status USING status::social_post_status;
```

That cast rejects every row still holding `'draft'` or `'ready'` — which is every row the table has.
It also set the new default before the type that would accept it existed. 0023 therefore drops the
default first, maps the values with a `CASE` while the column is text, and restores the default at
the end. Generated for its number, corrected for its content.

### The approval stamp is written once

`APPROVED_OR_LATER` is the four stages past `idea`, not `approved` alone: a team plans a shoot it has
already agreed and creates the row straight into `filming`, and a stamp keyed to one value would
leave those unstamped and the unreviewed pile wrong.

The write is `coalesce(approved_at, now())`, so a post pushed back to `idea` and approved again keeps
its **first** approval. The question the pair answers is *did anybody ever clear this?*, and a second
answer to it would erase the first.

The approver is the session user, passed as an argument rather than read from the payload: a client
that could name its own approver could name anybody. `clearedWith` is the free-text companion —
approval today is anyone signed in, because the marketing team uses this tool alone and the people
they clear with are not on the platform. That field records the fact honestly instead of a role
column claiming an authority the product does not have.

### The pill is a ramp, not a traffic light

Five stages needed five treatments, and the feedback tints were available and wrong. `index.css`
already refused them once, where the key-date sets are defined: those colours mean error, warning,
success and information, and `Filming` is not a warning.

So the pill is one hue at increasing strength — grey, outline, outlined green, tinted, settled. The
steps differ in lightness rather than hue, so the ramp survives deuteranopia, and the word is always
beside it. Full Tailwind class strings, never composed: the same silent failure `KEY_DATE_APPEARANCE`
documents.

### Two tests that were quietly wrong

`'threads'` was the stand-in for *not a platform* in two rejection tests. It is a platform now, so
both asserted the opposite of what they were written to assert the moment the enum grew. They use
`'bereal'`, which the product has genuinely not adopted.

**Gate:** **3105 tests**, one more than 1.55.0's 3104 — the blank-collapsing rule in
`rowToSocialPost` is new behaviour and earns the assertion. 2940 passed, 165 skipped.

⚠️ The live tests in `packages/db` still skip, and **0023 was not run against a real database**. It
should be applied to a copy of production before production, because the `CASE` is the part that
matters and only real rows prove it.

## Phase 3 — the events adapter, and the map to a brand

**Migration:** 0024 — `brands.events_outlet_id`, additive. **Wire:** one new route,
`GET /workspaces/:id/calendar/events`. **New package:** `@brandfactory/adapter-events`.

BrandFactory can now read the events team's bookings without Mission Events changing a line, and
without storing any of them.

### The decision this rests on: nothing is copied

The plan argued it and the port repeats it, because it is the one thing a future reader will be
tempted to "fix": there is no `events` table, no sync job, no cursor and no reconcile.

That is not laziness. In Mission Events a delete is soft, **a soft delete does not bump
`updated_at`**, and no endpoint reports tombstones. A copy here could therefore never learn that an
event had gone — it would show a cancelled party until a person noticed and went looking. A
read-through is correct on the next read, for nothing.

The cost is latency and a rate limit, which the cache absorbs. The benefit is that the hardest bug in
this integration cannot be written.

### Three things the source's shape forced

**Time.** The source stores naive timestamps that *hold* UTC. `new Date('2026-10-20T19:00:00')` reads
that as local time, which in Singapore is an eight-hour shift and an evening event landing in the
small hours of the next day. `parseSourceInstant` appends the `Z`, in the one place the strings
enter.

**All-day.** There was no flag at first. Its own importer wrote all-day rows as a midnight start with
either no end or 23:59 on the last day, so `inferAllDay` read that shape. Inferring was not optional:
without it every holiday and festival draws as a 00:00 appointment — a confident wrong answer on
every cultural date in the year. **This inference was deleted later in the same release** — see the
endpoint section below.

**`completed`.** Nothing over there moves an event to `completed` when its date passes; a person
does, or an order transition does. So a `confirmed` event that finished last month is still
`confirmed` at the source. `foldStatus` folds it. It does **not** fold `tentative`: a tentative event
in the past is not a thing that happened, it is a thing that never firmed up, and that difference is
why the team asked to see tentatives at all.

### The map is stored, not inferred

`brands.events_outlet_id`, set once per brand. Six of the seven brands match an Events outlet by
slug, so a normaliser would work *today* — and would quietly file the next brand under whichever
concept had a similar name. A wrong mapping here puts another brand's parties on this brand's
calendar.

**Verified against both live databases, 5 October 2026**, and the argument for storing it got
stronger rather than weaker. See the verification section at the foot of this document: their
`slug` is **not unique**, so there is no slug a normaliser could safely match on.

An event whose outlet maps to nothing is dropped **and counted**. `unmappedOutlets` is what turns a
missing mapping into a number on screen instead of an event that silently never appears.

### `configured` is a positive test, and its first version was not

The route reports whether a real source is behind the port, so the screen can say *the events layer
is off* rather than *the events team has nothing booked*. The two look identical on a grid and mean
opposite things.

It was first written `EVENTS_PROVIDER !== 'none'`, and the route test caught it: `testEnv` did not set
the key, `undefined !== 'none'` is true, and a test harness with no source was reporting a configured
feed. It is `=== 'mission-events'` now, and `testEnv` states the default like every other provider.

### Two failure modes, kept apart

`EVENTS_UNAUTHORIZED` (a revoked or mistyped key — somebody's settings, will not recover) and
`EVENTS_UNAVAILABLE` (a 5xx, a timeout, a body we cannot parse — worth another look in a minute).
Both are 502.

**Neither is an empty month.** A calendar that drew "no events" for a broken feed would tell a reader
they can stop worrying about Friday.

### The noop answers, it does not refuse

`NoopEventsSource` returns no events rather than throwing, which is the opposite of
`NoopResearchProvider`. Research is a feature you opt into, so reaching its noop means a gate failed
and a loud error is how that is found. Events is a *layer* on a calendar that works without it: a
developer with no key still needs the grid, and an exception on every month render would make the
screen impossible to develop against.

**Gate:** **3147 tests**, 42 more than phase 2 — 32 in the adapter and 10 on the route. 2982 passed,
165 skipped. `.env.example`'s drift guard failed until it documented the new keys, which is the guard
working.

## Mission Events built the endpoint, so the adapter changed

**Shipped in 1.56.0, after phase 3.** **Wire:** none — `GET /calendar/events` keeps its shape.
**Secret renamed:** `MISSION_EVENTS_CALENDAR_TOKEN` → `MISSION_EVENTS_SERVICE_KEY`.

Phase 3 read Mission Events through their **public calendar share link**, because at the time that
was the only mechanism they had that answered without a user session. That was the wrong shape and
the reviewer said so: the share link exists so a venue can put a calendar on a website. Its scope,
its projection and its rate limit were designed for that reader, and somebody could re-scope it
without knowing we depended on it.

They agreed, and built a **purpose-built service endpoint** instead — two of them, under
`/api/v1/internal/marketing/`, guarded by `X-Service-Key`. That is the same shared-secret pattern
their own `internal.py` already used for cron, so it needed no new precedent on their side.

Their standing rule is *"Launchpad hides; Events enforces"*: every caller carries the end-user's
token, and no endpoint gets a trusted-caller path. That is right, and this adapter is still built to
be replaced by it. It is not available today, because it needs Passport to span both products and it
needs the marketing team to hold accounts in an app they do not open.

The share link phase 3 used in the meantime worked like this, recorded because the decision to
abandon it is only legible beside what it was: an admin over there scoped one link to outlets,
statuses and a window, it answered without a session, we held its token as a server secret, and it
was revocable in one click. It exposed strictly less than a user session would. It also **needed the
Mission Events owner's agreement**, which the endpoint made moot.

### They corrected a real bug

Phase 3 inferred `allDay` from a midnight start **in UTC**. Mission Events store naive UTC and filter
on **Singapore** days, so an all-day event on 1 October is stored `2026-09-30T16:00:00`.

That inference would have called it neither all-day nor October — wrong flag, wrong cell, on every
public holiday and festival in the year. The endpoint now returns `is_all_day`, computed against
Singapore midnight, and `inferAllDay` is **deleted rather than fixed**. A fact the source can state
is not ours to guess.

### Three things their contract does better than the sketch we sent

**`PaginatedResponse`, not `ListResponse`.** Every list endpoint there paginates. A client that read
page one and stopped would draw a month that *looked complete and was not*, which is the worst shape
of wrong a calendar has. `readAllPages` follows their stopping rule — `skip + items.length >= total`
— with a bounded guard so a `total` the pages never reach cannot spin.

**An outlets endpoint.** `GET /internal/marketing/outlets` returns `{id, slug, name}` for active
outlets, which is how `brands.events_outlet_id` gets set against a name a person can check rather
than a bare uuid. It also answers the open question from phase 3: if Casa Vostra is not in that list,
it does not exist in production.

**Singapore days.** The filter boundary and our grid now agree, and the port says so in its type.

### What changed on our side

| Before | After |
| --- | --- |
| `listMonth({year, month})` | `listRange({from, to})` — Singapore days |
| Three calls per grid, de-duplicated by id | One call; `monthsBetween` deleted |
| `inferAllDay` from UTC midnight | `is_all_day`, reported |
| — | `listOutlets()`, for the mapping |
| — | `guestCount` on the event |

`guestCount` is the one figure on that booking a marketing reader uses: a shoot planned around a
200-person party is a different shoot from one around a table of eight. Everything else the endpoint
excludes stays excluded — revenue, pricing, deposits, contacts, internal notes.

The route now guards the 93-day limit itself, so a caller learns it from us rather than from a 422 it
cannot interpret. Their full spec is in `docs/refs/2026-09-30-mission-events-marketing-feed.md`.

### `updated_at` is read and deliberately unused

They warned that some status-change paths do not touch it, and that a soft-deleted event simply drops
out of results. So it is carried on the wire and drives nothing. A field that some writers skip, on a
source where deletions are invisible, is not a sync cursor — the window is re-read.

### The gate on this change, and an honest note on it

**1611 tests pass across every package this change touches** — `adapter-events` (32), `server`,
`shared` and `web-next`.

The full-root run also reported 3–5 failures in `@brandfactory/web`, which this change does not
touch. Every one passes in isolation, and the set is different each run. I first blamed the suite
and raised `testTimeout` to fix it; **that was wrong and is reverted.** The machine was carrying a
**load average of 160 on 8 cores** with none of my processes running — at that contention a 500 ms
test fails whatever its timeout. The suite is not the problem and should not be changed for it.
Re-run the root suite on an idle machine before reading anything into those numbers.

### To turn it on

```bash
fly secrets set \
  MISSION_EVENTS_URL=https://supa-schedule-backend.fly.dev \
  MISSION_EVENTS_SERVICE_KEY=... \
  EVENTS_PROVIDER=mission-events
```

Staging is `https://stage-supa-schedule-backend.fly.dev` with its own key, and is the honest place to
point first. Rotation is theirs to start: they accept several keys at once, so they add, we switch,
they remove.

**Production is unblocked on the Events side** (30 September): the endpoint shipped in Mission Events'
CI run for `8023145`, 05:47 UTC, and there is nothing for them to deploy. **A 403 on production means
our service key is wrong** — their org id is configured there, so the other cause of a 403 is ruled
out. On staging a 403 can still mean their org id is missing, so ask them before rotating a staging
key. A 422 names all four causes in their spec; a 429 is their 60-a-minute rate limit.

Then set the `brands.events_outlet_id` values from `listOutlets()`. **Done, and verified on
5 October 2026** — see the verification section at the foot of this document.

## Phase 4 — the screen the team asked for

**Migration:** none. **Wire:** one new route, `GET /workspaces/:id/calendar/entries`.

`/calendar` in `web-next`: every brand's posts, shoots and the events team's bookings on one grid,
with a day plan under it. It also lands the workspace-level read phase 2 deferred, because a month
grid across seven brands cannot be built out of seven per-brand calls.

### `listSocialPostsByWorkspace`, and what it leaves out

Scheduled entries only, every brand, both day bounds inclusive.

**The unscheduled tray stays per-brand, deliberately.** A grid cannot draw a dateless idea, and a
workspace-wide tray would pour seven brands' loose thoughts into one list nobody asked for.
`listSocialPostsByBrand` is still the read for that, and the legacy calendar still owns it.

The bounds are day keys rather than instants because the caller is a grid and a grid's last cell is a
whole day; `to` is widened to the end of its day in the query rather than by every caller.

### Two reads, two cache scopes, and why they are not one

`bfCalendarEntries` and `bfCalendarEvents` are separate SWR keys.

The entries are ours, and a post edit invalidates them. The events belong to Mission Events, are
never written here, and go stale on their own schedule. One key would mean **every copy change
re-asked another product for a month it already had** — and worse, a Mission Events outage would take
this workspace's own posts off the screen, which is the exact opposite of what a read-through is for.
Only the entries gate the loading state.

### The grid's arithmetic is a tested file, not a component

`grid.ts` holds the month maths, the day bucketing and the summary, with 14 tests. That is the part a
browser pass cannot check: **a cell that is one day out looks completely normal**, and the person who
notices is the one whose shoot moved.

Three things it gets right on purpose:

- **`gridRange` asks for the grid, not the month.** A September screen draws days of August and
  October, and an event in those cells is as real as one in the middle. Asking for the month alone is
  the off-by-one nobody sees.
- **`eventsByDay` repeats a multi-day event in every cell it covers**, capped at 40 days. A ten-day
  festival that appeared only on the day it began would be missing from the nine cells a reader is
  planning around; the cap stops a run-away range in the source flooding every month.
- **Days are added by day**, never by 86,400,000 milliseconds, which silently produces a 23- or
  25-hour day twice a year.

`localDayKey` comes from `@brandfactory/shared` — the same key the legacy calendar groups by, which is
what phase 1 moved it there for.

### An empty slot is a state, not an absence

`isEmptySlot` is `idea` + no copy + no hook + no format + no dish. It draws dashed and reads *No post
yet*.

This is the thing the workshop asked for in as many words: a slot three weeks out that shows it has no
post. A hook with no copy is **not** a slot — it is somebody's half-finished thought, and showing it
as a gap would tell them to start again.

### The events layer says which of three things it is

Off, broken, and configured-but-partly-unmapped are different sentences, because a grid that drew
nothing would look identical in all three:

- no source configured → *the events layer is off*;
- the read failed → *events could not be loaded; the posts below are unaffected*;
- `unmappedOutlets > 0` → *N events hidden because their outlet is not linked to a brand here*.

Tentative bookings draw dashed. A solid chip would let somebody plan a shoot around a booking nobody
has confirmed.

### What is deliberately absent

- **No writes.** This phase reads. Creating and editing an entry from the grid is phase 6.
- **No week view and no export.** Week is the fourth view in the plan's own order and export is step
  5.
- **No screen tests.** `CLAUDE.md` is explicit that `web-next` tests auth and workspace resolution and
  not the screens; the logic worth asserting is in `grid.ts`, which is where the tests are.
- **No `<Suspense>`.** The month and the brand filter are component state, not `useSearchParams` — the
  line `lib/table-density.ts` draws for row height.

**Gate:** **3161 tests**, 14 more than phase 3, all of them `grid.ts`.

One honest note on the run. The first full-suite pass reported four failures in
`NewBrandDialog.test.tsx` and `PostEditorDialog.test.tsx`. Both files pass in isolation and both
passed on the immediate re-run; `NewBrandDialog` alone takes 7.7 seconds, so these are timeouts under
parallel load rather than breakage. They are pre-existing and worth a look — a suite that fails one
run in two teaches people to re-run rather than read.

## Phase 5 — the list, and the file the shooting team opens

**Migration:** none. **Wire:** none — the export is built from data the screen already holds.

Step 5 of the plan, plus the list view step 4 left out. They belong together: the export writes the
list's columns, and shipping one without the other would mean a file whose shape no screen could be
checked against.

### CSV, not `.xlsx`

The plan said `.xlsx` first, because the team works in a sheet. It ships as CSV, and the reason is
worth stating rather than discovering later.

`.xlsx` needs a spreadsheet library. This repository has refused a **date** library on the grounds
that a month grid and two converters did not earn one, and a run sheet of thirteen text columns earns
one considerably less. Both Excel and Google Sheets open a CSV natively, which is the actual
requirement — *they use a sheet* — and what `.xlsx` would add is column widths and a bold header row.
If somebody later needs merged cells or a second tab, that is the moment to pay for it.

Two things a hand-written CSV usually gets wrong are handled, and both are the difference between a
file that opens and a file that lies:

- **RFC 4180 quoting.** A hook containing a comma is not an edge case, it is Tuesday. Fields are
  quoted when they hold a comma, a quote or a newline, and inner quotes are doubled. Copy keeps its
  newlines, because a run sheet that joined two sentences would print a claim nobody wrote.
- **Formula defusing.** A spreadsheet evaluates a leading `=`, `+`, `-` or `@`. That is a known attack
  on whoever opens the file, and far more often it is a hook beginning with a dash arriving as
  `#NAME?` instead of as words. Those fields get a leading tab — a tab rather than an apostrophe,
  which Google Sheets displays.

**The BOM is load-bearing.** Without it Excel reads UTF-8 as the system codepage, and this product's
own roster — `罗大雄`, `temper.`, every curly apostrophe in a hook — arrives as mojibake.

### The export writes what is on screen

The current brand filter, the current range. A button that quietly exported more than the reader could
see is the one thing a run sheet must not do: the crew packs from the file.

It is generated in the browser from the entries already fetched, so there is no route, no second
serialisation of a `SocialPost`, and nothing to keep in step with the list beyond the column order
they share.

### The list is the view they already read

Grouped by week, the columns the earlier design pass settled: the hook widest because it is the only
column carrying a sentence, format under the entry type rather than taking a column of its own, and
talent and the freelancer sharing `People` under the labels *On camera* and *Filming*.

The month is the planning surface. This is the working one.

### The status pills moved off the accent, and that was a real violation

They first shipped as a green ramp — `bg-primary/5`, `text-primary` — carried over from the legacy
list. `web-next`'s `AGENTS.md` makes that wrong here, and states the budget: the accent is the primary
button, **one** accent-filled stat card, the selected control state, and small brand chrome. A status
pill repeats on every entry in a month, so green down thirty cells blows that budget many times over.

It is the same argument the package already makes twice — `group-rail.ts` uses the chart series on band
rails rather than the accent, and `platform-icons.tsx` draws six brand marks in one colour rather than
six. So the pills use the chart series: neutral at `Idea`, an outline once somebody cleared it, two
chart hues for the stages where work is happening, a settled fill at `Posted`.

Not the feedback tints either, for the reason the key-date sets refused them: those mean error,
warning, success and information, and `Filming` is not a warning.

The ramp differs in lightness as well as hue, so it survives deuteranopia — and the word is always
beside it, which is what makes colour the fast path rather than the only one. `status-pill.ts` is one
file with both, because two copies of a five-key map is how a legend and a cell come to disagree.

**Gate:** **3175 tests**, 14 more than phase 4, all of them `csv.ts` — the part where a quoting bug is
invisible until somebody opens the file.

## Phase 6 — the calendar can be written to

**Migration:** none. **Wire:** none — every route this uses already existed.

Phases 4 and 5 shipped read-only, so the new screen showed the plan and the old app was the only
place to change it. The team still needed two tools.

The server needed nothing. `POST`, `PATCH`, `DELETE` and `POST …/restore` on
`/brands/:id/social-posts` were already there from phase 2, with the approval stamp set by the route.
So this is `web-next` only.

### What it does

- **`New entry`** in the toolbar — the screen's one primary button. It starts on the brand the reader
  has filtered to.
- **`Add to this day`** in the day plan, with the date filled in.
- **A click on an entry** — a chip on the grid, `Edit` on a day-plan card, or the date in a list row —
  opens the same sheet on that entry. A chip used to open the day; the day number still does.
- **Delete** in the sheet is the existing soft delete, and its toast carries an **Undo** that calls
  restore.

One sheet, `components/entry-form.tsx`, on `ResourceForm`'s shape: the draft resets during render when
`open` flips true, never in an effect, and `SheetContent` is not keyed.

### Decisions

**A date is required.** `/calendar` reads scheduled rows only (phase 4's decision), so an entry
created here without a date would be saved and then vanish from the screen that saved it. The
per-brand tray still holds undated ideas. A new entry starts at 10:00, because a slot needs a
timestamp and midnight would print `00:00` on every chip as if somebody had chosen it.

**Brand and type are fixed once an entry exists.** The route cannot move a post between brands and the
patch schema has no `kind`. The sheet shows both as disabled controls rather than hiding them, so the
reader can see which brand they are editing.

**An edit sends only what changed.** `toUpdateInput` compares the draft with the row and returns the
changed keys, or `null`. Two people plan the same month; a patch that re-sent every field would put
back a hook a colleague rewrote a minute earlier, from a sheet that only meant to move the time. And
the patch schema refuses `{}`, so "nothing changed" closes the sheet without a request and without a
toast. Times are compared as instants, because the server may echo `…00.000Z` for a value sent as
`…00Z`.

**The date and time are built from parts.** `new Date(year, month, day, h, m)` rather than parsing a
string, and a day that rolls over — 31 February becoming 3 March — is refused rather than saved.

**Two cache scopes.** A write revalidates `bfCalendarEntries` for the grid and `bfSocialPosts` for the
funnel's post picker and the brand's social page. `useRevalidate`, not `useInvalidate`, so the month
stays on screen while the new answer loads. Nothing is optimistic, like every other mutation in the
package.

**The writes live in `features/calendar/api.ts`**, beside the screen that makes them, and go to the
brand routes rather than a workspace route: `requireBrandAccess` is where a post's brand is checked,
and a workspace-level write would be a second door past it. `features/social-posts/api.ts` stays
read-only and now says where the writes went.

### The browser pass

Against a local Postgres, migrated and seeded, with the server and `next dev` running, a Playwright
script signed in with the dev token and did these steps:

1. created a Casa Vostra post with a hook, a dish and talent;
2. created an empty Willow slot from `Add to this day` and checked the prefilled date;
3. changed only the status, and asserted that the `PATCH` body was exactly `{"status":"approved"}`;
4. checked that the day plan showed "Cleared on";
5. opened the sheet from a list row;
6. deleted the post and brought it back with Undo.

All six passed, with no console errors.

**Gate:** **3195 tests: 3030 passed, 165 skipped** (the live-database files), 14 of them new. The
machine was idle this time, with a load average of 3.

## Phase 7 — the week, the links, the attachments

**Released in 1.57.0.** **Migration:** none. **Wire:** no new route; the post routes gain one check.

The three things phase 6 left out, asked for together on 30 September. The columns for all three
already existed from phase 2 (`shoot_id`, `events_event_id`, the `social_post_assets` join), so this
is a screen, one server check, and a dev-proxy fix the attachments exposed.

### The shoot link is checked now

The foreign key only proved `shoot_id` was *a* row. It did not prove the row was a shoot, that it was
this brand's, or that it was still live — so a stale picker or a hand-made request could hang one
brand's post off another brand's shoot. `routes/social-posts.ts` now refuses, with a 400:

- `SHOOT_NOT_IN_BRAND` — the target is missing from the brand's live list, is not a shoot, or is the
  row itself;
- `SHOOT_LINK_ON_SHOOT` — a shoot names a shoot. On a patch the row's own kind decides, read from the
  brand's list, because the patch cannot change kind.

The check reads the brand's live list, the same set the picker offers, so it needed no query of its
own. Five route tests.

`events_event_id` stays unchecked, on purpose: it is a reference into another product, it has no
foreign key for the same reason, and the calendar already says "An event not in this month's feed"
when it cannot name one.

### The sheet

- **From shoot** — the brand's live shoots from its own list, undated ones included, because a shoot
  is often planned before its day is fixed. Absent on a shoot.
- **For event** — that brand's bookings in the range the calendar already read. The picker does not
  ask Mission Events again.
- A link the lists cannot show — a shoot since deleted, an event outside this month — still reads as a
  link rather than as "None", or saving an unrelated field would look like it cleared it.
- **Attachments** — ordered thumbnails, "Add from library" over the brand's images, and "Upload",
  which files the image in the library before attaching it: the legacy editor's rule, an upload is a
  brand asset, not an orphan. The list shares the photography shelf's cache key, so an upload appears
  on both. An id whose asset is gone still gets a tile, so it can be removed rather than re-sent
  unseen.
- **Changing the brand of a new entry clears** its attachments, shoot and event. All three belong to
  one brand, and carried across they would be ids the server refuses.
- The patch sends attachments whole, and only when the list or its order changed.

The day plan names both links, and an event card lists the entries made for it.

### The week

Seven columns, each wide enough to read the hook, the dish, who is on camera, who is filming, the
status and the attachment count without opening the entry. Each day has its own add, dated.

The week is its own cursor — a Monday, moved by weeks — and is read through **the month grid its
Thursday falls in**. A month's grid holds every whole week that touches the month, and a week's
Thursday always lies in a month it touches, so all seven days are always in range: the week of 28
September to 4 October included. Switching views keeps the reader in the same stretch of time. The
counts and the export follow what is on screen, so in week view they speak for seven days.

`mondayOf`, `weekDays`, `shiftWeek`, `monthOfWeek` and `weekLabel` are in `grid.ts` with the month
arithmetic, and tested there, including the year boundary and the claim above for three awkward weeks.

### The dev proxy that every upload needed

With `STORAGE_PROVIDER=local-disk`, signed URLs are root-relative (`BLOB_PUBLIC_BASE_URL=/blobs`), so
the browser sends the upload `PUT` to the Next origin. `next.config.ts` forwarded only `/api`, so
**every upload in `web-next` dev answered 404** — photography and decks as well as this. The Vite app
has always proxied `/blobs`. The rewrite is added, keeping the `/blobs` prefix because the server
mounts it at its root. Production uses Supabase storage, which signs absolute URLs, so it never met
this.

### Also

- "1 shoots" and "1 slots" in the summary line read as they should now.
- The on-screen product name is **Brand Base**, in both apps (a separate commit): the sidebar, the
  sign-in lockup, every page title, the public form, and the Vite wordmark and title. The repository
  and packages keep BrandFactory.

### The browser pass

Against a local Postgres, seeded, with the server and `next dev`, a Playwright script signed in and:

1. saw Brand Base on the sign-in page, in the sidebar and in the page title;
2. created a shoot, and checked it offers no shoot link;
3. created a post linked to that shoot, with an uploaded image;
4. reopened the post and found the link and the attachment;
5. opened the day plan, which named the shoot;
6. opened the week view on 28 Sept – 4 Oct, found the post on Friday, stepped a week forward and
   back, and opened `Add` on a day with its date filled in.

No console errors.

### What is deliberately absent

- Drag to reschedule, in the week or the month.
- Reordering attachments by drag. Removing and re-adding changes the order today.

**Gate:** see the 1.57.0 changelog entry. 3208 tests.

## Still open from the plan

- **Step 6 — retire the Vite calendar**, once the team has worked in the new one for two weeks, and
  tell them the day it happens.
- **Nothing on the mapping or the secrets** — both are done. See the verification below.
- **Five live Events outlets have no BrandFactory brand**: AIR CCCC, Firebird, Mountain, Nightjar and
  Ungrafted Vines. Do they belong on the marketing calendar? Curly's was on this list and is now
  **soft-deleted in Events**, so it answers itself.
- **The shooting team's actual sheet.** A copy would let the list view and the export match its
  column order.
- **The legacy planner and brainstorm.** Hide them in the new calendar (MKT-10 is KIV), or keep them
  one click away?
- **The release gap.** A shipped screen left the nav and nobody was told. The fix is a rule, not code:
  a screen leaves the nav only with a changelog line and a message to the people who use it.

## The mapping, verified against both live databases

5 October 2026. Read directly from BrandFactory (`spffglhadlkfrkmbhzdv`) and Mission Events
(`knugabprjyjszwddqgff`), joined on the id the code actually compares.

**All six mappings resolve to a live, non-hidden outlet**, and the names match exactly:

| Brand | Events slug | Events outlet |
| --- | --- | --- |
| Carlitos | `carlitos` | Carlitos |
| Casa Vostra | `casa-vostra` | Casa Vostra |
| Chin Mee Chin | `chin-mee-chin` | Chin Mee Chin |
| Petra | `petra` | Petra |
| Temper | `temper` | Temper |
| Willow | `willow` | Willow |

No duplicate mappings — the check for two brands sharing one outlet id returned nothing, which
matters because `brandByOutlet.set(...)` would silently keep the last of them.

**The seventh brand is `Mission Group`, deliberately unmapped.** It is group-level and there is no
such outlet. `null` is the right answer, so the unmapped banner should never appear for it.

### Three questions this closes, two of them the opposite way round

**Casa Vostra exists over there.** Their spec framed this as an open question — *"if Casa Vostra is
not in that list, it does not exist in production"*. It is, slug `casa-vostra`, and it is mapped.

**The Firebird naming never arose.** Four documents, this one included, carried *"confirm `Firebird
by Suetomi` against the slug `firebird` — the names do not match"*. Production holds no such brand:
its seven are Mission Group, Willow, Chin Mee Chin, Carlitos, Petra, Temper and Casa Vostra. Every
mapped slug is simply its brand name lower-cased. The caveat was advice about a brand that does not
exist, and it is corrected wherever it appeared.

**Matching on slug would have been wrong anyway, for a reason nobody predicted.** Their `slug` is
not unique: `carlitos`, `chin-mee-chin`, `firebird`, `temper` and `willow` each appear twice, one row
soft-deleted and one live. The soft-deleted `temper` is even named `Temper.` — with the full stop the
seed still uses — while the live one is `Temper`. A slug match would have to choose between two rows;
the id does not. **This is the strongest argument for the stored mapping, and it only appeared on the
real data.**

### The drift, and how it was closed

The seed described a different estate from production: it created `Firebird by Suetomi` and
`Ungrafted Vines`, omitted `Mission Group` and `Petra`, and spelled `temper.` with a full stop.
Both seed-only names exist as **live Events outlets**, which is probably where the list came from —
they are real Mission Group concepts, just not brands anybody has set up in Brand Base.

**Reconciled on 5 October 2026.** The seed's roster is now production's seven: Mission Group, Casa
Vostra, Willow, Chin Mee Chin, Carlitos, Temper, Petra. Premises went from ten to nine with
Firebird's.

⚠️ **The roster was mirrored and the depth was not, deliberately.** Production holds **zero
outlets** and a `description` on only one brand, so a literal mirror would have deleted all nine
premises and blanked six descriptions — leaving the outlets screen undevelopable locally and
`outlets.live.test.ts`' collation assertion running against an empty list, where it passes without
testing anything. The roster is what identifies a brand and what leaks into other documents; the
descriptions and premises are fixture depth production has not filled in. `Petra` does carry
`null` for both, because that is true of it and inventing copy for an unopened venue is the exact
failure this reconciliation removed.

⚠️ **Two things the next reader needs.** The seed is insert-if-absent
(`onConflictDoNothing` on `brands.id`), so **the rename does not reach an existing local
database** — `temper.` stays until the database is recreated. And a recreated database inherits
the cluster's collation: this machine's cluster is `C`, and two live tests assert a *linguistic*
order, so it must be created with `lc_collate 'en_US.UTF-8'` or those two fail. Both of those cost
a debugging cycle here.
