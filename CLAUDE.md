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

The repository is a pnpm workspaces monorepo with two packages:

- `packages/web-next` (`@brandfactory/web-next`) is brand base: a UI-only Next.js 16 demo with
  static data and no server. It imports no other package. Its publish rules live in
  `src/features/publish/model.ts`, and its per-brand state in
  `src/features/schedule/posts-store.tsx`. The folder keeps the name `web-next` because the
  Vercel project's Root Directory is `packages/web-next`; do not rename it without changing
  that setting.
- `packages/connect` (`@brandfactory/connect`) links each brand's social accounts (Meta,
  Pinterest, TikTok) by OAuth, with tokens encrypted per brand. It is separate from the demo and
  imports no other package (see its README).

### Backend work starts from the archive

The old BrandFactory code is on the branch `archive/main-2026-10-07`: the Hono server
(`createApp(deps)`), the Drizzle schema and migrations, Supabase auth and storage, six adapters
(auth, storage, realtime, llm, research, events), the Mission Events integration, and the Fly.io
deploy (app `brandfactory`, region `sin`).

Before you add a server, a database, auth or an Events client, read the archive and reuse what
fits. Do not create a new Fly app, Supabase project or database when one exists. Copy files with
`git show origin/archive/main-2026-10-07:<path>`, and read that branch's `CLAUDE.md` for the rules the
server followed (authorization chain, mount lists, one server instance).

## Testing

`vitest.workspace.ts` lists one config per package. The root `vitest.config.ts`
stays empty on purpose: `test.projects` in the root config dropped the
per-package `environment` and `alias`, and the workspace form keeps them.

- `web-next` uses `jsdom`, globals, `src/test-setup.ts` and the `@` alias.
- `connect` uses `node`.

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
