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
pnpm typecheck                         # tsc --noEmit in both packages
pnpm lint                              # eslint, whole repo
pnpm format:check                      # prettier
pnpm test                              # vitest, both packages
pnpm -F @brandfactory/web-next build   # next build of the demo
```

Run one test file or one test name:

```bash
pnpm vitest run packages/web-next/src/features/publish/model.test.ts
pnpm vitest run -t "puts a story in the story row"
```

`pnpm dev` starts the demo on :3002.

## Architecture

The repository is a pnpm workspaces monorepo with these packages:

- `packages/web-next` (`@brandfactory/web-next`) is brand base: a Next.js 16 app on static data,
  or on the core when `NEXT_PUBLIC_CORE_URL` is set (`src/lib/remote.ts`; each store loads from
  it and writes through it, and `src/lib/core-routes.ts` maps each route to a move). It imports no other package. Its publish rules live in
  `src/features/publish/model.ts`, and its per-brand state in
  `src/features/schedule/posts-store.tsx`. The folder keeps the name `web-next` because the
  Vercel project's Root Directory is `packages/web-next`; do not rename it without changing
  that setting.
- `packages/connect` (`@brandfactory/connect`) links each brand's social accounts (Meta,
  Pinterest, TikTok) by OAuth, with tokens encrypted per brand. It is separate from the demo and
  imports no other package (see its README).
- `packages/core` (`@brandfactory/core`) is BrandBase's backend: a generic
  core with one door, `POST /ops/{pack}/{op}`, that checks each call and runs a pack's move under
  row-level security. It holds no business words (`purity.test.ts`) and imports no other package.
  Its `Dockerfile` and the root `fly.toml` target the existing Fly app `brandfactory`.
- `packs/brandbase` (`@brandfactory/pack-brandbase`) is the BrandBase pack: data the core reads
  (manifest, migrations, moves, rules, tests); `packages/core/src/packs.test.ts` runs its
  `tests/*.json` through the core's test runner. It is a workspace package only for its demo
  scripts: `demo/seed.ts` loads web-next's data files into a migrated database, and
  `demo/web.sh` starts the core with that data on a local Postgres.
- `packages/bubbles` (`@brandfactory/bubbles`) is Bubbles, the agent people talk to: DeepSeek's
  harness runtime (the binary from the `deepseek-harness-runtime-bin` wheel, path in `DSH_BIN`)
  driven over stdio, with the model through a local gateway to OpenRouter and the tools from the
  core's `POST /mcp/{pack}`, as the person's agent (`POST /agents/session` on the core). It knows
  a pack by name only; `packs/brandbase/bubbles.md` is the pack's brief. Its tests use a fake
  runtime (`scripts/fake-runtime.mjs`). Plan: `docs/executing/bubbles-plan.md`.

### Packs on a core

BrandBase's backend is a pack on a generic core. Read
`docs/completions/packs-core-proposal.md`, `docs/completions/packs-core-plan.md` and
`docs/completions/packs-core-phases-1-to-8.md` before any work here.

### Backend work starts from the archive

The old BrandFactory code is on the branch `archive/main-2026-10-07`: the Hono server
(`createApp(deps)`), the Drizzle schema and migrations, Supabase auth and storage, six adapters
(auth, storage, realtime, llm, research, events), the Mission Events integration, and the Fly.io
deploy (app `brandfactory`, region `sin`).

Before you add a server, a database, auth or an Events client, read the archive and reuse what
fits. Do not create a new Fly app, Supabase project or database when one exists. Copy files with
`git show origin/archive/main-2026-10-07:<path>`, and read that branch's `CLAUDE.md` for the rules the
server followed (authorization chain, mount lists, one server instance).

Read `docs/executing/brandbase-backend-handoff.md` before you start: it lists what the demo's UI relies
on (rules, edge cases, the decisions to settle first and the riskiest items), with a code or test
citation for each.

## Testing

`vitest.workspace.ts` lists one config per package. The root `vitest.config.ts`
stays empty on purpose: `test.projects` in the root config dropped the
per-package `environment` and `alias`, and the workspace form keeps them.

- `web-next` uses `jsdom`, globals, `src/test-setup.ts` and the `@` alias.
- `connect`, `core` and `bubbles` use `node`.
- `core`'s `postgres.test.ts` runs only when `CORE_TEST_PG_URL` names a throwaway Postgres
  (see `packages/core/README.md`); PGlite ignores `statement_timeout` and runs one statement at a
  time.

## Conventions

- **One document per feature, covering every phase.** A feature gets one file in
  `docs/completions/`, named `<feature>-phases-<first>-to-<last>.md`, with one
  `##` section per phase.
- **The docs pipeline is three folders, in this order.** A proposal and an
  implementation plan go into `docs/executing/` before the code. The plan
  moves to `docs/completions/` beside its completion document once the code
  lands. Both move to `docs/archive/` only after production verification.
- **Changelog.** Add a one-line entry to the index at the top of
  `docs/changelog.md`, then the full entry below. State the test count.
