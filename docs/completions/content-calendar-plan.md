# The content calendar, and the order it comes back in

**Status:** built. Phases 0 to 6 shipped in 1.56.0 and phase 7 in 1.57.0, written up in
`docs/completions/content-calendar-phases-0-to-7.md`. **Not finished:** step 6 — retiring the Vite
calendar — and the open questions at the foot of this file. Moved here 5 October 2026.
**Source:** `docs/refs/2026-09-16-marketing-build-plan-module-02.md` (MKT-0, MKT-1, MKT-2), plus the
clarifications of 25 September 2026 recorded below.
**Surface:** `packages/web-next` — one workspace-level route, `/calendar`, and one nav row.
**Migrations:** two. **Wire:** one new route group, one widened. **New dependency:** none.
**New adapter:** `events` (Mission Events), the sixth port.
**Mockups:** the "Content calendar — MKT-0 / MKT-1 proposal" row of the BrandFactory screens canvas.

## Why this is first

Adoption is zero, and the cause is ours. The social calendar shipped in the Vite app in 1.20.0
(3 August) and grew key dates in 1.23.0 and a planner in 1.26.0. The Next shell arrived in 1.31.0
(17 August) "beside the Vite app it will replace", and its nav never carried a calendar: the only
trace is a read-only `/brands/:id/social` that no nav row links to. The marketing team asked for the
calendar, lost it in a migration, and was not told. Nothing else in Module 02 has an audience until
it is back.

## What the workshop asked for

The calendar is a production pipeline, not a calendar:

- every brand on one grid;
- posts, shoots and events together, events arriving from Mission Events rather than re-typed;
- cultural and public holidays;
- a day that opens the content plan — format, hook, dish, talent, who films — with a status running
  **idea → approved → filming → editing → posted**;
- empty slots, so a gap three weeks out shows as a gap;
- a per-brand filter and an export for the shooting team.

What they ranked last, unprompted: AI ideation. It is MKT-10 and stays KIV.

## Settled on 25 September

| Question | Answer |
|---|---|
| What is the events module? | **Mission Events** (repo `supaschedule`, the legacy name). Show `tentative` and `confirmed`; show `completed`, and treat a `confirmed` event whose end has passed as completed. |
| Talent | Anyone — chefs, floor staff, external talent. **Free text.** |
| Freelancer who films | **Free text** for now. A later pass may link it to a vendor with the `Freelancer` category. |
| Dish | **Free text.** |
| Who approves | **Anyone.** BrandFactory has no roles: 1.29.0 opened every workspace to every signed-in user. Approval records that the team cleared the item with stakeholders who may not be on the platform. A Launchpad approver role is a later expansion. |
| Cadence | **Not defined.** No target per brand. Every view shows counts instead. |
| Platforms | **One full list for every brand**, with no per-brand restriction. |
| What the shooting team uses | **A sheet.** The export is an `.xlsx` in the list view's columns first. |

## The data: widen `social_posts`, do not replace it

`social_posts` already holds most of a content item: brand, platform, a nullable `scheduled_at` (the
unscheduled tray), a `body` where `''` already means "slot claimed, copy pending", soft delete,
attachments through `brand_assets`, and `created_by`. `funnel_activities.social_post_id` points at
it (1.55.0). A new `content_items` table would orphan that link and duplicate every route. So the
table widens.

**Migration A — the pipeline.**

- `social_post_status` becomes `idea | approved | filming | editing | posted`. Existing rows map
  `draft → idea`, `ready → approved`, `posted → posted`. Postgres cannot drop enum members in place,
  so the migration builds the new type, casts the column through a `CASE`, and drops the old type.
  The zod schema in `@brandfactory/shared` moves with it, per the enum convention.
- New nullable text columns: `format`, `hook`, `dish`, `talent`, `filmed_by`, `canva_url`,
  `cleared_with`.
- `approved_at` (timestamptz) and `approved_by` (user id), stamped by the route when status first
  reaches `approved`, and left alone after that.
- `kind`: `post | shoot`, default `post`. A shoot is a row of its own — it has a date, a location in
  `hook`, and a crew in `talent` and `filmed_by` — and posts point at it through a nullable
  `shoot_id` self-reference. One shoot feeds many posts; a post knows which shoot it came from.
- `social_platform` gains `xiaohongshu` and `threads`. The influencer roster already uses
  Xiaohongshu.
- `events_event_id` (uuid, nullable, no foreign key): the Mission Events event a post is for. It is
  a reference into another system, so it cannot be a constraint.

An **empty slot** needs no new column: it is a row with a date, a platform and an empty `body`, in
status `idea`. That is what `body = ''` already means.

**Migration B — the brand map.** `brands.events_outlet_id` (uuid, nullable): the Mission Events
outlet that stands for this brand. Set by hand once per brand; see "The brand map" below.

## Mission Events: read through a share link, store nothing

### What Mission Events is

A FastAPI backend with its own Postgres on Supabase. Every route expects a real user's Supabase JWT
and resolves the caller's organisation and outlet access from its own `users` table. There is no
machine credential. The Launchpad integration kept it that way on purpose: *Launchpad hides; Events
enforces.*

An event links to an **outlet**, and in Events an outlet is a concept: `casa-vostra`, `willow`,
`chin-mee-chin`, `temper`, `carlitos`, `firebird`, `ungrafted-vines`, plus `curlys` / `petra`,
`air-cccc` and `mountain`, which BrandFactory does not have. Statuses are `inquiry`, `tentative`,
`confirmed`, `completed`, `cancelled`, `lost`. Nothing sets `completed` by date.

### The choice

Events already has **public calendar share links** (`calendar_share_links`): an admin creates a link
scoped to outlets, statuses (`scoped_statuses`, a list per link) and a date window, and
`GET /api/v1/public/calendar/{token}/month?year&month` returns a projection that already leaves out
revenue, ticket prices, client contacts, internal notes and deposits. It is rate-limited to 60 a
minute and the link is revocable.

Phase 1 uses one such link, scoped to `tentative`, `confirmed` and `completed`:

- The token is a server secret, `MISSION_EVENTS_CALENDAR_TOKEN`, beside `MISSION_EVENTS_URL`. It
  never reaches the browser. `.env.example` follows, per its drift guard.
- The calendar route asks the adapter for the months in view. The adapter caches each month for five
  minutes, in process — the one-instance rule already holds.
- **Nothing is copied into BrandFactory.** A soft delete in Events does not bump `updated_at`, and
  Events keeps no tombstones, so a copied table would need a new Events endpoint just to learn what
  vanished. A read-through is correct on the next read, for free.

Rejected for now:

- **Forwarding the user's token** (the Launchpad pattern). Right in the long run — Events then
  applies each person's own outlet access — but it needs Passport to span both apps and needs
  Natalie and Chloe to hold Events accounts. Revisit when Passport lands.
- **A new machine-credential endpoint in Events with an `updated_at` feed.** It would be the first
  trusted caller Events has, against its stated rule, to solve a sync problem the read-through does
  not have.

### The adapter

`packages/adapters/events`, shaped like `packages/adapters/research`:

- a port, `EventsSource`, with `listMonth(year, month): Promise<ExternalEvent[]>`;
- `mission-events.ts`, the share-link client;
- `noop.ts`, which returns nothing when the env is unset, so a dev stack runs without Events;
- a fixture-backed fake for tests.

`buildAdapters(env)` in `packages/server/src/adapters.ts` selects it, and `createApp(deps)` receives
it like the other five. No vendor name leaves the adapter.

`ExternalEvent` is `{ id, name, status, eventType, start, end, outletId, outletName, roomName }`, with
`status` already folded: `completed`, or `confirmed` with an end in the past, becomes `completed`.

### Time

Events stores naive timestamps that hold UTC, and its date filters work on UTC days. The adapter
converts to `Asia/Singapore` and asks for one extra day at each edge of the month, so an 11pm event
on the last day is not lost. Events has no all-day flag; an all-day event starts at midnight and, if
it spans days, ends at 23:59 on its last day. The adapter marks both shapes `allDay`.

### The brand map

Events outlets match BrandFactory brands by slug for six of seven; `firebird` needs its alias to
`Firebird by Suetomi`. The mapping is stored, not inferred: `brands.events_outlet_id`, set once. An
event whose outlet maps to no brand is dropped from the calendar and counted in a quiet "N events
from unmapped outlets" line, so a missing mapping is visible rather than silent.

### A post for an event

A post may carry `events_event_id`. The day panel lists the posts for an event under it. If the
event later leaves the feed — cancelled, lost, deleted — the post shows "No longer in Mission
Events" instead of breaking.

## The screens

One route, `/calendar`, in the workspace nav beside Dashboard, because it spans every brand.

- **Month** — every brand on one grid, a brand filter, toggles for posts, shoots, events, key dates
  and empty slots, and a status legend with counts. Tentative events draw dashed.
- **Week** — the same, seven columns wide enough for the content plan in each entry.
- **List** — the sheet they use today, as a table: date, brand, entry (type and format), hook, dish,
  people (talent and who films), status. Grouped by week. Cells edit in place, the pattern the
  influencer table set in 1.49.0 and 1.52.0.
- **Day plan** — a sheet from the right with each entry's full plan, a five-step status control, the
  day's events, and "Fill this slot" on each empty slot.
- **Export** — one brand and a date range to `.xlsx` in the list's columns first; a PDF run sheet and
  a read-only share link after.

Every view carries a summary line and **no targets**: per brand, counts by status, empty slots,
shoots, events, and key dates with no post, by week in the week view and by month in the month view.

**Key dates** move from `packages/web/src/lib/key-dates/` to `@brandfactory/shared`, so both
frontends read one copy. They stay static data, per the "not every fact needs a table" rule.

**Scheduling stays in Brandwatch and design stays in Canva.** The calendar sets `posted` by hand, and
`canva_url` is a plain link.

## Order of work

0. **MKT-0 — this week, no build.** Put the legacy Vite calendar back where the team can reach it,
   add Natalie and Chloe to Launchpad, and walk them through it. It costs a deploy and twenty
   minutes, and every later phase needs an audience.
1. **Key dates to `shared`.** No migration. Unblocks every phase after it.
2. **Migration A and its routes.** The widened `social_posts`, the zod schemas, the status mapping,
   the approval stamp, shoots, and a workspace-level
   `GET /calendar/entries?from&to&brandId[]` that reads across brands.
3. **The `events` adapter and migration B.** The share-link client, the fake, the brand map, and
   `GET /calendar/events?from&to`.
4. **`/calendar` in web-next.** Month, day plan and list, in that order. Week last.
5. **Export.** `.xlsx` first.
6. **Retire the Vite calendar** once the team has worked in the new one for two weeks, and tell them
   the day it happens.

## Open

- **The Mission Events owner** must agree to a long-lived, server-held share-link token. The data it
  exposes is already public-safe, and they can revoke it.
- **Curly's, AIR CCCC and Mountain** exist in Events and not in BrandFactory. Do they belong on the
  marketing calendar?
- **The shooting team's actual sheet.** A copy would let the list view and the export match its
  column order on day one.
- **The legacy planner and brainstorm.** Hide them in the new calendar (MKT-10 is KIV), or keep them
  one click away?
- **The release gap.** A shipped screen left the nav and nobody was told. The fix is a rule, not
  code: a screen leaves the nav only with a changelog line and a message to the people who use it.

## Phase 6 — create and edit from `/calendar`

Added 30 September 2026, after phases 0–5 shipped read-only. The server already takes every write
this needs — `POST`, `PATCH`, `DELETE` and `POST …/restore` on `/brands/:id/social-posts`, with
the approval stamp set server-side — so this phase is `web-next` only. No migration, no new route.

- **One sheet for both modes**, on `ResourceForm`'s shape: brand and kind (create only — a post
  does not change brand, and a shoot does not become a post), platform, date and time, status,
  format, hook, dish, on camera, filmed by, cleared with, Canva link, copy.
- **A date is required.** `/calendar` reads scheduled rows only, so an entry created here without a
  date would vanish on save. The per-brand tray keeps undated ideas.
- **Edit sends only what changed.** The patch schema rejects `{}`, and a full-row patch would
  overwrite a colleague's edit to a field this person never touched.
- **Doors:** a primary `New entry` in the toolbar; `Add to this day` in the day plan, dated; a
  click on an entry chip, a day-plan card or a list row opens it for editing.
- **Delete** is the existing soft delete, with an Undo that calls restore.
- **Out of this phase:** linking a post to a shoot (`shootId`) or to an event (`eventsEventId`),
  attachments, and the week view.
- **Tests:** the payload logic — date and time to ISO, blanks to `null`, the changed-keys diff —
  lives in `features/calendar/entry-form.ts` with its own test file. The sheet itself is not
  tested, per CLAUDE.md's rule for `web-next` screens.

## Phase 7 — week view, shoot and event links, attachments

Added 30 September 2026, with the build rather than ahead of it: the three pieces were the
"not in this phase" list of phase 6, so their scope was already written down there.

- **Links.** Two pickers in the sheet: the brand's live shoots (undated ones too) and that
  brand's Mission Events bookings in the month on screen. The route checks the shoot: a live
  shoot of the same brand, never the row itself, never on a shoot.
- **Attachments.** Library ids in order, a picker over the brand's images, an upload that files
  the image in the library first. A brand change on a new entry clears attachments, shoot and
  event.
- **Week view.** Seven columns wide enough for the plan, read through the month grid its
  Thursday falls in; the counts and the export follow what is on screen.
- **Out of this phase:** drag to reschedule, and reordering attachments by drag.
