# BrandBase MVP: implementer handoff

> **Archived 2026-10-06.** Superseded by a UI-only, no-backend MVP for a demo.
> Nothing here shipped: the branch was reset to `main`. The code (write gate,
> `packages/brandbase` shell, unfinished migration 0028) is on the local branch
> `archive/brandbase-mvp-v1`. See `README.md` in this folder.

Start here. Read this file in full at the start of every session, then the
**Progress** section at the bottom to find where you are.

## Session start checklist

1. `git branch --show-current` prints `feat/brandbase-mvp`.
2. `git rev-parse --abbrev-ref @{u}` prints `origin/feat/brandbase-mvp` (or
   nothing before the first push). If it prints `origin/main`, stop and run
   `git branch --unset-upstream`.
3. `git fetch origin` and `git merge origin/main` if main moved. Resolve
   conflicts; never rebase or force-push.
4. Read Progress below and the plan's next unticked task.

## What you are building

BrandBase is the internal marketing tool for Mission Group's 7 F&B brands
(Casa Vostra, Willow, Chin Mee Chin, Temper, Carlitos, Mission Group, Petra).
2–4 marketers use it. Five screens: **Home** (this week, what needs
attention), **Calendar** (all brands, post plans with production stages,
shoots, events, holidays), **Ideas** (references, Pinterest, competitor watch,
fill the gaps), **Creators** (influencers, campaigns, agency shortlists) and
**Brand** (structured guidelines that feed every AI call).

The marketing team ranked the calendar first. AI only builds on the team's own
ideas, never from scratch.

## Read in this order

1. This file.
2. `plan.md`: phases, tasks, done-criteria.
3. `DESIGN.md` and the screenshots in
   `mockups/`.
4. The repo `CLAUDE.md`: commands, architecture rules, conventions. They apply
   to this work.
5. Only for the publish worker's mechanics: the system design board in
   `architecture/`. **It shows the original fresh-repo design**
   (Vercel cron, `/api/w/:workspace`, `calendar_items` and similar tables, a
   daily events copy). Where it differs from the plan, the plan wins.

Background only: the plan doc (https://claude.ai/artifact/AKn5eh9rpYHthZeLRVoYZC)
and the mockup canvas (https://claude.ai/artifact/ScfBjnB496cVwdd7o8p357).

## Build approach (decided, do not reopen)

- **Same repo, same stack, same database.** Reuse the Hono server,
  `packages/db` (Drizzle, Supabase Postgres), `packages/shared`, the adapters
  and the existing login. Extend existing tables before adding new ones.
- **One new frontend: `packages/brandbase`** (`@brandfactory/brandbase`).
  Next.js 16 (App Router), Tailwind, shadcn. It calls the server through the
  typed `hc<AppType>` client and an `/api` rewrite to :3001, as `web-next` does
  (`packages/web-next/next.config.ts`, `src/lib/api/bf-client.ts`). Copy its sign-in
  pieces (Supabase and local providers); do not import its borrowed Operations
  Hub screens. It follows the root eslint and prettier config.
- **Leave `packages/web` and `packages/web-next` alone.** They keep serving
  production until BrandBase replaces each screen.
- **Colours stay as in the mockups for now.** Put every colour in one token file
  (CSS variables). Never hard-code a hex in a component.
- **Background jobs run in the server process.** Follow
  `packages/server/src/research/ticker.ts` (start/stop, awaited on shutdown in
  `main.ts`). Each job still claims work with a lease, because a deploy briefly
  runs two machines.

## Run locally

```bash
pnpm install
cp .env.example .env                           # first time; local defaults
docker compose -f docker/compose.yaml up -d    # Postgres :5432
set -a; . ./.env; set +a                       # the db scripts read DATABASE_URL from the shell
pnpm -F @brandfactory/db db:migrate
pnpm -F @brandfactory/db db:seed               # prints the dev sign-in token
pnpm dev                                       # server :3001, BrandBase :3002, old frontends
```

Local sign-in uses `AUTH_PROVIDER=local` in the root `.env` and
`NEXT_PUBLIC_AUTH_PROVIDER=local` for the frontend, with the token `db:seed`
prints (the seeded user id). `pnpm dev` starts BrandBase too.

## Keys and env

- **Server keys** (Meta, Pinterest, LLM, Slack) go in the root `.env`, which
  `packages/server/src/load-env.ts` reads. Not `.env.local`: the server ignores
  it.
- **Every new server key** must be added to the env schema and to
  `.env.example`, or `env.example.test.ts` fails.
- **Frontend public vars** go in `packages/brandbase/.env.local`.
- Both files are git-ignored. Ask the user for keys; never guess or commit them.

## How to work

- **Branch `feat/brandbase-mvp` only.** First push:
  `git push -u origin feat/brandbase-mvp`. Never push to `main`: a push to main
  deploys the server to Fly and runs migrations on production
  (`fly.toml` `release_command`, `.github/workflows/deploy-backend.yml`). Never
  run `fly deploy` or the deploy workflow by hand. Merging is the user's call.
- **No CI runs on branch pushes** (CI runs on pull requests and main only). Your
  local gate is the only check. Do not open a pull request without asking.
- **Phases in order, but never stall on people.** Each phase has **Built**
  criteria you can verify yourself and **Accepted** criteria that need the
  user. When Built passes, log the Accepted items in Progress as waiting and
  start the next phase. Phase 4 needs a recorded yes on the Brandwatch gate;
  without one, skip to phase 5.
- **Before every commit, run the `adv-review-loop` skill** on exactly what will
  be committed. Fix what it confirms, then commit. If the review cannot finish,
  say so in the commit body and in Progress.
- **Commit and push** (push is authorised for this branch only) after each
  significant, reviewed piece of work: a
  migration plus its routes, a finished screen, a finished job. Never
  force-push.
- **Migrations:** run `git merge origin/main` before generating one, since main
  adds migrations too. On a journal conflict, delete yours and regenerate.
- **Gate before calling Built done:** `pnpm typecheck`, `pnpm lint`,
  `pnpm format:check`, `pnpm test`, `pnpm -F @brandfactory/brandbase build`.
  Report skipped tests as skipped.
- **UI verification:** run the app and screenshot each screen you change with
  Playwright on localhost. Compare with the matching mockup PNG.
- **Repo conventions apply:** one changelog entry per phase on this branch, with
  migration number and test count; one completion doc,
  `phase-1-completion.md`, one section per phase;
  commit messages in the repo's existing style; no AI attribution.
- **Update the repo `CLAUDE.md`** when you add the package: gate commands,
  package count, testing notes.
- **Update Progress** at the end of every session and every phase.

## Safety rules

- **This repo is public.** Never commit personal data: no creator notes, rates,
  phone numbers or emails in seeds, fixtures, tests or docs. Use invented data.
  `seed.ts` already holds the Curly's KOL list; do not copy from it or add to it,
  and never rewrite git history yourself.
- **Production database:** never write to it or change its schema from your
  machine. Read-only checks go inside
  `BEGIN; SET TRANSACTION READ ONLY; ... ROLLBACK;` and you show the SQL first.
- **Behaviour changes that reach production on merge** (for example the write
  permission check in phase 1) get their own changelog line so the user sees
  them.
- **Ask before spending money** (paid APIs, new cloud resources).
- **Never publish to a real brand account** without the user's explicit
  go-ahead. Use a test account.

## Releasing (the user does this)

Each phase is usable by the team only after the user merges and deploys: the
new frontend needs its own Vercel project, the server needs BrandBase's origin
in `CORS_ALLOWED_ORIGINS` (or the `/api` rewrite), and Supabase needs the new
redirect URLs. When a phase's Built criteria pass, write the release steps it
needs into Progress for the user.

## Open items (track; do not block on them)

| Item | Owner | Affects |
| --- | --- | --- |
| Palette change | Pranav | Token file only |
| Font: mockups use Geist, `System.png` says Satoshi in production; the plan uses Geist | Pranav | Token file and layout only |
| Brandwatch go/no-go, and renewal date | Marketing, Dani | Phase 4 |
| Meta app setup, Page publishing authorisation, test accounts | Pranav | Phases 4 and 6 |
| Pinterest API app approval | Pranav | Phase 6 |
| Curly's KOL notes in the public repo | Phil | Nothing you build |
| Bubbles/MCP bridge shape | David | Keep every action a plain route |
| Nat and Dione's review of the calendar and post plan | Phil | Phase 3 Accepted |
| Brand ids inside workspace bodies (creator and vendor links, a request's or an outlet's brand) are not checked for write; should a viewer of a brand be able to file a request for it? (1.62.0 known limits) | Pranav | Phase 1 follow-up |

## Progress

Newest first. One entry per session or phase.

| Date | Phase | What landed | Verified | Next / waiting on |
| --- | --- | --- | --- | --- |
| 2026-10-06 | 1 | Built. Write gate (1.62.0), `packages/brandbase` with sign-in and shell, migration 0028 (1.63.0). Decisions in the completion doc | Gate with a local DB (3447 tests, 0 skipped); Playwright: sign-in, shell, 7 brands, ⌘K | Accepted: none. Release steps in the completion doc. Waiting: Meta setup (Pranav). Old guideline editor edits will stop flowing into BrandBase from phase 2. Next: phase 2 |
| 2026-10-06 | 0 | Handoff, plan, design notes, mockups and system design committed and pushed | Second adv review (Sonnet): no personal data or secrets; fixed the missing `social_accounts` table, agent paths, radii and the screenshot criterion | Phase 1 |
