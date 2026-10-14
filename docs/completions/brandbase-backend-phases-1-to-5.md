# BrandBase backend: phases 1 to 5

Built 13 Oct 2026 on `feat/brandbase-backend`, from the plan beside this file
(`brandbase-backend-plan.md`) and the handoff in `docs/executing/brandbase-backend-handoff.md`.
Nothing is deployed and no migration has run on the Supabase database; both wait for the owner.

## Phase 1: the server core

`packages/server`: Hono with `createApp(deps)`, Drizzle on PGlite (tests, local) and Postgres
(deployment), every table in the `brandbase` schema and the migration record in
`brandbase_drizzle`, so the archive's tables and its own migration record in the same database are
never touched. Supabase JWT sign-in by JWKS; a dev sign-in (token = user id) that refuses to start
on a real database. Brand access: an admin reaches every brand, a member the brands they hold a
`members` row for; anything else answers 404.

Posts with one job per account and a stage derived from the jobs (decision 5); a stage set by hand
is kept apart and refused as Scheduled without an account (decision 3); posted is final on every
write (decision 2). Ideas own their calendar day, so a tile is found by id, not hook. Plan, unplan,
place and landing day mirror the demo's rules on brand-local dates (decision 8). Shoots with
pruning of empty planned shoots, shooting order, crew rows with ids and Lark invites only to people
not yet invited. Client-made ids (decision 1): a create sent twice makes one record.

## Phase 2: the rest of the domain

Share links by unguessable token with the access setting checked on the server and guest comments
under a rate limit; inbox with the queue order, replies kept with their sender, send-to and clear
noise; brand kit with voice versions numbered under `UNIQUE(brand, n)`; connections; media upload
by signed URL with a stable signed address that survives a reload; send with the composer's
blockers in its order and an idempotency key; a job runner that claims jobs atomically and fails a
job cut off mid-upload instead of sending it twice.

## Phase 3: the seed

`pnpm -F @brandfactory/server db:seed` loads the demo's data (read straight from
`packages/web-next/src/data`) into an empty database: brands, posts, posted stories as posts of
their own, ideas (a calendar tile with no idea gets one, as `ideaOfTile` would), shoots and crew,
inbox, kit, files, voice versions, connections, guest comments.

## Phase 4: the demo on the API

Off unless `NEXT_PUBLIC_API_URL` is set, so the Vercel demo and its tests are unchanged. With it on:
a sign-in page (Supabase password grant over fetch, or a dev id), every page waits for the brands
to load, every store loads from `GET /brands/:id/state` and writes each change through one ordered
queue. A refused change shows its reason and that brand reloads, after the changes still queued
land. The composer keeps its whole draft with the post and sends through the server, so a post is
posted only once each account's job says so. Dropped files, the logo and brand files upload to
storage. The guest share page opens by token. The demo's `dayN` days convert to dates at this
boundary (`src/lib/remote-days.ts`); since 2.13.0 every day is its date (see
`brandbase-go-live-gaps-phases-1-to-3.md`).

## Phase 5: deploy files

`packages/server/Dockerfile` (Node 22: supabase-js needs its native WebSocket; pnpm pinned with npm
because Node 22.12's corepack carries an outdated signing key), `fly.toml` for the existing app
`brandfactory` in `sin` with the migration as the release command, `.dockerignore`, and
`.env.example` files for the server and the web app.

## Reviews

Three single-reviewer passes (Sonnet): phase 1, phase 2 (with a look at phase 1's fixes), and the
client wiring. The fixes of the last two were checked by tests and by rerunning the browser flows,
not by another review. What the reviews changed, in short: row locks on every read-then-write and advisory locks for one story a
day and for shoot creates; creates that survive two requests at once; the idempotency key read
after the brand-scoped post lock (it let one brand replay another's post); invites claimed before
they are sent; a second inbox reply refused, not dropped; every deployment-only check keyed on
`DATABASE_URL` as well as `NODE_ENV`; the job runner off in a deployment, since only the simulated
publisher exists; the client's ideas found by id instead of hook; reloads that wait for the queue;
a posted post's media never sent; the guest preview opened apart from the team's tab.

## Verification

- Gate: typecheck, lint, format, all tests, `next build` (see the changelog for the count).
- The races, against a real Postgres 16 in Docker: two stories on one day, one id created twice, a
  double send, a double plan, a mark racing a move, two invites, two job runners. Each came out as
  designed (one wins, the other is refused or replays).
- The production image, built and run against Postgres 16: the release migration applies (twice,
  safely, beside an archive-style `drizzle` record it leaves alone), the server boots, `/health`
  answers, a bad token is refused, the job runner stays off. This run found the Node 20 WebSocket
  failure above.
- The whole stack in a browser (Playwright): sign-in; the calendar from the server; a composer post
  with an uploaded photo, scheduled with one job per account and its whole draft kept; an inbox
  reply that stays answered after a reload; a drag that stays moved after a reload; a share link a
  guest opens with no sign-in, comments on, and the team sees; planning an idea from its page and
  taking it back to its day; a connection switched off that stays off; a stale drag of a post
  another tab marked posted, refused with its reason and put back.

## Not built (flagged)

- Real publishing (Meta, TikTok, Pinterest wait on app review), Lark invites and replies, Google
  Drive, inbox ingestion, AI drafts and suggestions, insights data. Each has a port, a seeded table
  or the demo's static data. The inbox shows the demo's messages; what the team does with them is
  stored.
- `packages/connect` is not wired to the `connections` table: the connect sheet sets a status, no
  OAuth runs.
- Guest editing of a brief: the server route exists (`PATCH /share/:token/brief`), the page does
  not, so with the API on "Can edit" is not offered (decision 6).
- The composer shows its done screen before the server answers; a refused send shows a message and
  the calendar reloads, but the composer stays on its done screen.
- Moodboard sources other than Pinterest, pasted references and story ideas in the story row live
  in the browser only. Calendar dates outside the demo's month are kept but not drawn (fixed in
  2.13.0).
- An uploaded SVG is served as a download from the local disk store (it could carry script), so an
  SVG logo shows only on Supabase Storage.
- Server-made posters, video durations and crops (need ffmpeg). Live updates between two open
  browsers: a tab reloads when it comes back into view.

## To go live (the owner's steps)

1. Create the private Storage bucket `brandbase` in the Supabase project.
2. Set the secrets listed in `fly.toml` with `fly secrets set`.
3. Add the team's accounts to `brandbase.users` (the `id` is each person's Supabase user id) and
   their brands to `brandbase.members`, or make them `admin`.
4. Deploy with `fly deploy` (the release command runs the migration), then seed an empty database
   once if the demo's data is wanted.
5. Set `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` on
   the Vercel project to switch the app from the demo to the API.
