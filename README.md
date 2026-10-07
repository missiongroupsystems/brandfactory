# brand base

Content scheduling, ideation and insights for restaurant marketing teams in Singapore. A
replacement for Brandwatch.

## What is here

| Path                | What it is                                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/web-next` | The brand base app (`@brandfactory/web-next`). Today a UI-only demo on static data: Schedule, Ideate, Insights. See its [README](packages/web-next/README.md). |
| `packages/connect`  | The account-connection service: links each brand's Meta, Pinterest and TikTok accounts by OAuth. See its [README](packages/connect/README.md).                 |
| `docs/`             | Plans, the changelog and reference notes.                                                                                                                      |

The demo folder is named `web-next` so the existing Vercel project, whose Root Directory is
`packages/web-next`, deploys it with no settings change.

## Run it

You need Node 20.11 or later.

```bash
corepack enable          # gives you the pnpm version the repo pins
pnpm install
pnpm dev                 # the demo on http://localhost:3002
```

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm -F @brandfactory/web-next build
```

## The old BrandFactory code

Until 7 October 2026 this repo held BrandFactory: a Hono server, a Drizzle/Postgres schema,
Supabase auth and storage, six adapters (including the Mission Events API), the Vite and Next
frontends and a Fly.io deploy. All of it is on the branch
[`archive/main-2026-10-07`](https://github.com/missiongroupsystems/brandfactory/tree/archive/main-2026-10-07).

**Start backend work there.** Before you create a new Fly app, Supabase project, database or
Events integration, read the archive and reuse what exists: the Fly app `brandfactory` (region
`sin`, `fly.toml` and `.github/workflows/deploy-backend.yml`), the Supabase project behind the
`SUPABASE_*` variables in its `.env.example`, the migrations in `packages/db/drizzle/`, and the
adapters in `packages/adapters/`. Copy a file over with
`git show origin/archive/main-2026-10-07:<path>`.

## Licence

MIT. See [LICENSE](LICENSE).
