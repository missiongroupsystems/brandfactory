# BrandBase backend: implementation plan

Status: executing, from 13 Oct 2026, on `feat/brandbase-backend`. Built on
`docs/executing/brandbase-backend-handoff.md` (the spec and the owner's eight decisions) and the
archive branch `archive/main-2026-10-07`.

## Shape

- A new package, `packages/server` (`@brandfactory/server`): Hono on Node with
  `createApp(deps)`, the pattern the archive server used. Every dependency (database, auth,
  storage, publisher, clock, logger) enters through `deps`, so tests run every route with
  `app.request()` and no vendor.
- Drizzle, as in the archive's `packages/db`, on two drivers: `pg` against Supabase Postgres in a
  deployment, and PGlite (in-process Postgres, already used by `packages/connect`) in tests and
  local development. Migrations are generated with `drizzle-kit` into `packages/server/drizzle/`.
- **The tables live in a Postgres schema of their own, `brandbase`.** The existing Supabase
  database holds the archive's tables in `public`; a separate schema reuses that database without
  touching or colliding with them. No migration runs against production without the owner's
  go-ahead.
- The server is self-contained: it imports no other workspace package. The archive's auth and
  storage ports (Supabase JWT check by JWKS, Supabase Storage, a local disk store for
  development) are copied in, trimmed to what BrandBase uses. The archive's six-package adapter
  split is not brought back; two adapters do not need their own packages.
- `packages/web-next` keeps working with no server. When `NEXT_PUBLIC_API_URL` is set, its stores
  load from the server and write each change through to it. The Vercel preview stays a static
  demo until the owner switches it.

## Data model (decisions applied)

| Handoff item | Server answer |
|---|---|
| D1 client ids | Every create takes the id from the client (`^[A-Za-z0-9_-]{1,80}$`, the client sends UUIDs). A repeated create with the same id and brand returns the stored row, so a double click or a second `ideaOfTile` makes one record. An id held by another brand is refused (409). Ids are primary keys, so they are unique across brands |
| D2 posted is final | One guard, `assertNotPosted`, runs before every post write: move, stage, unplan, edit, media, delete. 409 `POST_POSTED` |
| D3 manual stages | `posts.marked` = `scheduled` or `posted` set by hand, apart from the jobs. A manual Scheduled with no channels is refused (400 `NO_CHANNELS`) |
| D5 post model | `posts` (one per post, all composer fields) plus `post_jobs` (one per account). The stage is derived: a job failed → `failed`; every job live → `posted`; any job → `scheduled`; no job → the hand mark, else `draft` |
| D8 timezone | `brands.timezone` (`Asia/Singapore` for all three). A post has a local `day` (date) and `time` (`HH:MM`); "today", "past day" and "this week" are computed in the brand's zone by one `brandToday(brand, clock)` |
| Text keys | A calendar idea tile is an idea with a `day` and no post, found by id. Crew members, inbox people and send-to are rows with ids. Sentiment and insights dedupe stay demo-only (see "Not in scope") |
| Shoots `planned` set | `shoots.origin` = `planned`, `manual` or `lark`; pruning drops only empty `planned` shoots |
| Share links | `share_links.token` is 32 random bytes (base64url). The guest route reads only by token and checks `who` and `can` on the server. Guest `can: edit` lets the guest change the brief's hook, angle and storyboard titles (D6), nothing else |
| Lost composer state | `posts.draft` (jsonb) keeps the whole draft: caption, overrides, YouTube title, made for kids, TikTok answers, first comment, location, collaborators, tags, crops, labels, AI label, per-account extras |
| Media | `media` rows: storage key, `kind` (`photo`/`video`), mime, bytes, width, height, duration. Uploads go straight to storage by a signed write URL; the read URL is signed on the way out |
| Voice versions | `voice_versions` with `UNIQUE(brand_id, n)`; `n` is computed in the insert's transaction |
| Lost updates | Every mutable row has `version` (integer). A write may send `ifVersion`; a mismatch answers 409 `STALE` with the current row |
| Idempotent send | `POST /posts/:id/send` takes an `Idempotency-Key`; a repeat with the same key returns the first result |

## Rules the server enforces (each cites the demo rule it mirrors)

- Move or reschedule: refuse posted, then no day, then a past day (in the brand zone); a story
  refuses a day another planned story holds or that has posted stories (`move-post.ts`).
- Plan: an idea becomes a post on a day; the idea keeps `post_id`; unplan deletes the post and
  puts the idea back on that day (`posts-store.tsx` `planPost`, `unplanPost`).
- Add an idea to the calendar: a preferred day that holds a post is refused, then the first empty
  day after this week, else none (`calendar-slot.ts` `landingDay`).
- Publish rules from `publish/model.ts`: allowed platforms per format, text limits in code points,
  caption required except for a story, TikTok privacy and promotion blockers, media count per
  format. A send with a blocker answers 400 with the blockers in the demo's order.
- Shoots: an idea is in one shoot at most; empty planned shoots are pruned except on
  `remove-idea`; hours keep their length and never end before they start (`shoot/model.ts`).
  Invites go only to crew not yet invited.
- Inbox: the queue order (complaints first, then newest; noise apart) is applied by the server.
- Kit: `voiceEdited` and `hexOf` rules on write.

## Phases

1. **Server core.** Package, env, `createApp(deps)`, auth (Supabase JWT, plus a development
   provider that refuses to start in production), brand access by `members`, errors, the schema
   and its first migration, brands, posts and jobs, ideas, shoots, and the calendar read model.
   Tests for every rule above that phase covers.
2. **The rest of the domain.** Share links and guest comments (with a rate limit), inbox, brand
   kit and voice versions, connections (the UI's keys; Meta, Pinterest and TikTok read through
   `packages/connect`'s API), media upload, the send path with a `Publisher` port and a job
   ticker. The only publisher shipped is a simulated one; real platform publishing waits on app
   review (accounts doc).
3. **Seed.** A script exports the demo's static data to JSON from `web-next` (where the `@` alias
   resolves) and a server script loads it, so a fresh database looks like the demo.
4. **Client wiring.** An API client, a sign-in page (Supabase password grant over plain fetch),
   and each store loading from the server and writing through when `NEXT_PUBLIC_API_URL` is set.
   A failed write shows a short message and reloads that store from the server. The demo's
   `dayN` days map to dates in October 2026 at this boundary; rebuilding the UI on real dates is
   its own project.
5. **Deploy files.** Dockerfile, `fly.toml` for the existing app `brandfactory` in `sin`, and
   `.env.example`. Deploying, and running the migration on the Supabase database, wait for the
   owner.

## Not in scope (flagged)

- Real publishing to Meta, TikTok and Pinterest (app review), Lark and Google Drive providers,
  inbox ingestion from the platforms, AI (suggestions, reply drafts, caption drafts), insights
  data. Each has a port or a seeded table so the UI works; none calls a vendor.
- Server-made posters, server-read video durations and server-side crops (need ffmpeg).
- Live updates between two open browsers (the archive's WebSocket bus). Stores reload on focus.

## Verification

- The gate on every commit, with the new package in `typecheck`, `lint` and `test`.
- Route tests with `app.request()` on PGlite for every rule listed above.
- A local run: server on PGlite with the seed, `web-next` with `NEXT_PUBLIC_API_URL`, and a
  Playwright pass that plans an idea, moves a post, reloads and sees the change kept.

## Decisions made while building

- **Calendar events stay static data in the demo.** City events and holidays are the same for
  every user and nobody edits them (the archive's "not every fact needs a table" rule), so they
  have no table. Shoots are the only calendar layer the server holds.
- **The job runner is off on a real database.** Only the simulated publisher exists, and it marks
  every job live; posted is final, so in a deployment it would mark posts as out that never went
  out. Jobs wait as `scheduled` until a real publisher lands. Locally (PGlite) the runner runs.
- **Drizzle's migration record lives in `brandbase_drizzle`**, not its default `drizzle` schema,
  where the archive keeps its own record in the same database.
- **Phases 1–3 were reviewed twice** (one Sonnet reviewer each). Fixes from review: row locks on
  every read-then-write, advisory locks for one story a day and for shoot creates, idempotent
  creates that survive two requests at once, the idempotency key read after the brand-scoped post
  lock, Lark invites claimed before they are sent, inbox replies that refuse a second reply, and
  every deployment-only check keyed on `DATABASE_URL` as well as `NODE_ENV`. The races were then
  checked against a real Postgres 16 in Docker (two stories on one day, one id created twice, a
  double send, a double plan, a mark racing a move, two runners): each came out as designed.
