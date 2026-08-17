# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Communication: Simplified Technical English

Write all messages to the user in Simplified Technical English (ASD-STE100
style). Write your thinking in the same style.

Obey these rules:

- Write short sentences. Use a maximum of 20 words in an instruction. Use a
  maximum of 25 words in a description.
- Give one instruction in one sentence.
- Use the active voice. Name the agent of each action.
- Use the simple present, the simple past or the simple future tense.
- Use one word for one meaning. Do not change the word for the same thing.
- Do not use idioms, metaphors, jokes or slang.
- Do not use an `-ing` form as a noun if a simple noun exists.
- Keep the articles `a`, `an` and `the`. Do not delete words that make the
  sense clear.
- Put a sequence of steps in a numbered list. Put a set of items in a bullet
  list.
- Start an instruction with the verb.
- Write a warning or a caution before the step that it applies to.

This rule applies to chat messages and to thinking. It does not apply to the
prose in `docs/`, which keeps its present style. Ask the user before you change
that scope.

## Commands

Run the full gate before you report that work is complete. The changelog
records the result of this gate for each release.

```bash
pnpm typecheck                         # tsc --noEmit in all 11 packages
pnpm lint                              # eslint, whole repo
pnpm format:check                      # prettier
pnpm test                              # vitest, all packages
pnpm -F @brandfactory/web build        # tsc --noEmit && vite build
pnpm -F @brandfactory/web-next build   # next build
```

`lint` and `format:check` at the root **skip `packages/web-next`** on purpose —
it lints itself with `eslint-config-next` and keeps upstream's formatting. Its
gate is `pnpm -F @brandfactory/web-next lint && … typecheck && … build`.

Run one test file, one project or one test name:

```bash
pnpm vitest run packages/web/src/lib/calendar.test.ts
pnpm vitest run --project @brandfactory/web       # project name = package name
pnpm vitest run -t "renders the season band"      # match the test title
pnpm -F @brandfactory/web test:watch              # watch mode
```

Start the development stack:

```bash
docker compose -f docker/compose.yaml up -d   # Postgres on :5432
pnpm -F @brandfactory/db db:migrate
pnpm -F @brandfactory/db db:seed              # prints the dev login token
pnpm dev                                      # server :3001 + web :5173
```

`pnpm dev` runs `scripts/dev.sh`. Vite proxies `/api`, `/rt` and `/blobs` to
the server, so the browser sees one origin and needs no CORS setup.

Work with the database:

```bash
pnpm -F @brandfactory/db db:generate   # write a new SQL file to drizzle/
pnpm -F @brandfactory/db db:migrate
pnpm -F @brandfactory/db db:studio
```

## Architecture

BrandFactory is a self-hosted Brand Operating System. A Brand is the single
source of truth. Each creative surface receives the brand context
automatically. Read `docs/vision.md` for the product and `docs/architecture.md`
for the blueprint.

The repository is a pnpm workspaces monorepo with a flat `packages/*` layout:
`web`, `server`, `shared`, `db`, `agent` and `adapters` (five ports: auth,
storage, realtime, llm, research).

These points need more than one file to understand.

### The client and the server share one type

`packages/web/src/api/client.ts` builds the client with `hc<AppType>` from
`hono/client`. `AppType` comes from `@brandfactory/server`, which infers it
from the chained `.route()` calls in `packages/server/src/app.ts`. A change to
a route signature therefore appears as a type error in the web package. Run
`pnpm typecheck` to find contract drift. Do not write a second copy of a route
path or a response shape in the web package.

### Every dependency enters through `createApp(deps)`

`packages/server/src/app.ts` exports `createApp(deps)`. It receives the
database, the logger and all five adapters as parameters. Tests build an app
with fakes and never touch a real vendor. `packages/server/src/main.ts` calls
`buildAdapters(env)` at boot; `adapters.ts` is the one file that reads the env
and selects an implementation. **Do not name a vendor in domain code.**

Middleware is mounted per path prefix, not globally. `/blobs`, `/health` and
`/rt` stay outside the authentication gate on purpose: the signed URL is the
capability for a blob, and `/rt` ends at the WebSocket upgrade.

### Authorization follows the aggregate chain

`packages/server/src/authz.ts` holds the only access rules:
`requireProjectAccess` calls `requireBrandAccess`, which calls
`requireWorkspaceAccess`, which compares `workspace.ownerUserId` to the user.
Each route calls the helper for its aggregate. It throws `NotFoundError` or
`ForbiddenError`, and `middleware/error.ts` maps the error to the response.

### The mini-app registry is the extension point

`packages/web/src/components/brand/miniApps.ts` is a declarative list. A
mini-app is a category of threads. Each row has a `create` field (freeform or a
standardized template), a `match` predicate that classifies an existing
`ProjectSummary`, and a `surface` field that names the group it renders in.

One list holds both classification and display. This prevents a thread type
that a surface presents but no rule classifies. Add a row for each template id
that the product creates. `match` must narrow on `p.kind` first, because
`templateId` exists only on the `standardized` branch of the union.

A `to` field returns TanStack Router `LinkProps`, not a string, so the compiler
checks each path against the route tree.

### One server instance only

The realtime bus is `native-ws` and holds its subscribers in the process. Two
instances break the fan-out without an error. Scale the machine, not the count
of instances. A cross-instance adapter must land first.

## Testing

`vitest.workspace.ts` lists one config per package. The root `vitest.config.ts`
stays empty on purpose: `test.projects` in the root config dropped the
per-package `environment` and `alias`, and the workspace form keeps them.

- The `web` and `web-next` projects use `jsdom`, globals, a `src/test-setup.ts`
  and the `@` alias. Every other project uses `node`.
- `web-next` tests auth and workspace resolution and **not the screens**: most
  of that package is still borrowed Operations Hub UI, and the logic worth
  asserting there is the part a browser pass cannot see.
- Files named `*.live.test.ts` in `packages/db` need a real database. They skip
  when `DATABASE_URL` is absent. They are most of the skipped count that the
  changelog reports.
- The `db` project runs with `pool: 'forks'` and `singleFork: true`, because
  the live tests share seeded rows and race each other in parallel.

## Conventions

- **One document per phase.** Each implementation phase gets its own file in
  `docs/completions/`. Never put two phases in one file. Move the files of a
  finished feature to `docs/archive/`.
- **Plan before build.** A proposal and an implementation plan go into
  `docs/executing/` before the code.
- **Changelog.** Add a one-line entry to the index at the top of
  `docs/changelog.md`, then the full entry below. State the migration number,
  or state `No migration`. State the test count.
- **Migrations** are numbered SQL files in `packages/db/drizzle/`. Generate
  them; do not hand-number them.
- **Not every fact needs a table.** `packages/web/src/lib/key-dates/` holds 92
  curated dates as static data. The data is the same for each brand, no user
  edits it, and it never crosses the wire, so it has no schema and no route.
  Apply the same test to new data.
- **A user preference is not a column.** See `sidebar-prefs.ts` and
  `key-dates-prefs.ts` for the precedent.
- **Native or integrate.** Build a small native version if the function is core
  to the brand context. Integrate an external tool if the domain needs
  specialist depth.
- `.env.example` has a drift guard: `packages/server/src/env.example.test.ts`
  fails if the env schema widens and the example does not follow.
