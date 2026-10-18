# Packs on a core: implementation plan for BrandBase

For the agent that builds it. Read `packs-core-proposal.md` first, then this file. Branch: `feat/packs-core`, cut from `feat/brandbase-backend` at `31b2098` so it keeps web-next's API client, the seed and the server's tests as source material. The traditional backend stays on `feat/brandbase-backend`, untouched.

## Ground rules

- Never touch the production database or the Supabase project's settings. Work against PGlite or a local Supabase stack (`supabase start`; Docker and the Supabase CLI are installed on this machine).
- Do not deploy. Do not create a Fly app. Where the core runs in production is an open decision (below).
- `packages/server` stays as the reference: read its rules, routes and tests; do not edit it. Delete it only in the last phase, and only when the owner says so.
- Follow `CLAUDE.md`: full gate before each commit (`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm -F @brandfactory/web-next build`), an adversarial review before each commit, one changelog entry per phase with the test count, the completion document `docs/completions/packs-core-phases-1-to-N.md`.
- Packages import no other package (repo convention). Copy what you reuse from `packages/server` (auth, the PGlite test helpers) into `packages/core`.
- Keep `packages/core` free of business words. Phase 1 adds the test that enforces it.
- In the last phase, move this plan and the proposal to `docs/completions/` beside the completion document.

## Layout

```
packages/core/            generic runtime: API, registry, executor, rules, log, scheduler, test runner, MCP
packs/brandbase/
  manifest.json           name, version, requires
  migrations/             the brandbase schema (copied from packages/server/drizzle, then new ones)
  ontology.json           what each table and field means, in plain words
  ops/<name>.json         one move each: input schema, sql, kind, pre, post
  rules/<name>.json       one rule each: expression, message
  tests/<name>.json       cases: fixture, caller, input, expected status or rule id
  plays/<name>.md         later phases
```

A pack directory is the source; publishing it writes a frozen version row into the registry.

## Phase 1: the core skeleton

Build `packages/core` (Hono, Node 22, Vitest, PGlite for tests):

1. **Registry schema** (`packs` schema, core migrations): `pack_versions` (pack, version, content JSON, content hash, published_at; rows never updated), `channels` (environment, pack, live version), `test_runs` (version hash, passed, results; written only by the runtime role), `loadouts` (principal, pack, allowed ops), `op_calls` (who, agent_of, pack, version, op, input, result, status, at), `principals` (user id, agent_of nullable). A trigger refuses a `channels` update unless a passing `test_runs` row exists whose `version_hash` equals the target version's `content_hash`, and the acting person is not an agent.
   - Three database roles: `pack_runtime` runs moves and has no privileges on the `packs` schema except SELECT on registry views; `pack_admin` is used only by `core publish`, `core test` and `core promote`, and is the only role with INSERT on `test_runs` and UPDATE on `channels`; and the migrator. REVOKE all on `packs` from `pack_runtime`, `authenticated` and `anon`.
   - `core promote` sets `app.actor` to the person's user id inside its transaction; the trigger looks that id up in `principals` and refuses if no row exists or `agent_of` is not null.
2. **The API** `POST /ops/:pack/:op` with the eight checks, in order, each a small function with its own test: authenticate (copy `packages/server/src/auth.ts`), resolve the live version, authorise (loadout; for an agent also its person's loadout), validate input (Ajv), pre-rules, execute, post-rules, log.
3. **Executor**: one transaction per call; `SET LOCAL ROLE` to a limited `pack_runtime` role and set the caller's claims, following Launchpad's pattern (`Launchpad/packages/server/src/middleware/rls.ts` and `db/rls-scope.ts`). The SQL is bound with named parameters.
   - The core sets the claims with `set_config(..., true)` inside the transaction, before `SET LOCAL ROLE`; `pack_runtime` may not call `set_config` itself.
   - The user id comes from the verified token only. Role (admin) and brand membership come from a database lookup in the same transaction (`users.role`, `members`), never from token claims or request input. RLS policies read these settings and `members`; the admin rule is a policy clause on the role setting.
4. **SQL check at publish time**: one statement, no forbidden keywords or functions (list in the proposal's security rules).
5. **Purity test**: fails if `packages/core/src` contains business words (start with: brand, post, story, caption, tiktok, instagram, invoice, shoot).

6. **Gate coverage**: add `packages/core/vitest.config.ts` (node environment) and list it in `vitest.workspace.ts`; confirm that `pnpm typecheck`, `pnpm lint` and `pnpm format:check` cover `packages/core` and `packs/**/*.json`; update the Architecture and Testing sections of `CLAUDE.md`.

Spike first, in this phase: confirm PGlite supports roles, `SET LOCAL ROLE` and forced RLS. If it does not, run the RLS and trigger tests against a local Supabase stack, mark them `describe.skipIf(!process.env.SUPABASE_DB_URL)`, state the skip count in the changelog and the completion document, and keep PGlite for the rest.

Acceptance:
- A toy pack (inside the core's tests, not BrandBase) with one read and one write move works end to end.
- A call with no token, a call to a move outside the loadout, and invalid input are refused at the right check, and each refusal is logged.
- Moving the pointer to a version with no passing run is refused by the database.

## Phase 2: the BrandBase pack, posts first

1. Copy only the `.sql` files of the `brandbase` migrations (not `meta/`) into `packs/brandbase/migrations/`; the core's migrate step applies them in filename order and records them in a `packs.migrations` table. Keep the schema name `brandbase` (`schema.ts:20`). Add: a partial unique index on `(brand_id, day) WHERE format = 'story'` (this also closes a race in today's `routes/send.ts:83-96`); row-level security policies keyed by brand membership (`members`), with admins per the current `authz.ts` rule.
2. **Rule language decision, at the start of the phase.** Spike a CEL library for JavaScript against four real rules: posted is final, not on a past day, no post before 07:00 in the brand's time zone, one story a day. Check how it does regex (JavaScript ports may not use RE2). If no CEL library is solid enough, write rules as SQL `EXISTS` checks instead. Record the choice in the completion document.
3. Six moves (David's slice): `post.list`, `post.create_draft`, `post.schedule`, `post.move`, `post.mark_posted`, `post.unplan`, plus `brand.state` (the read that web-next uses to load a brand; today `GET /brands/:id/state`).
4. Rules from `domain/posts.ts` and `domain/publish.ts`. The caption shaping in `publish.ts` uses Unicode emoji classes that SQL and RE2 lack: add generic text functions to the core's rule environment (for example strip emoji, count code points), not BrandBase code.
5. Tests: port the cases from `packages/server/src/routes/posts.test.ts` (19) and `send.test.ts` (12) into `packs/brandbase/tests/`, plus a two-at-once story test.

Acceptance:
- Every ported case passes through the core's test runner.
- Two stories moved onto one day at once: one wins.
- A member of one brand calling every move with another brand's ids gets not-found.

## Phase 3: publish, promote, roll back

1. `core publish packs/brandbase` freezes a version; `core test <version>` runs its tests and the platform tests on a throwaway database; `core promote <version>` moves the pointer. It takes a Supabase user token (from `core login`) and passes the verified user id as `app.actor`; a service key is refused.
2. Platform tests that every version runs: company isolation, no move as the system role, effect moves need approval, every rule has a refusal test.
3. **The demo:** change "no post before 07:00" to 08:00 in a new version, test, promote. The calendar and an agent both refuse 07:30. Publish a version with a failing test: promotion is refused. Move the pointer back: 07:30 works again. The core is not restarted or redeployed between the steps.

## Phase 4: agents

1. An MCP endpoint generated from the live version's moves (name, input schema, description).
2. Agent principals (`agent_of` a person). An agent's allowed moves are its loadout and its person's loadout, checked on every call.
3. Approvals: an `approvals` table bound to a hash of what goes out; effect moves refuse without a matching approval from a person; an edit voids it.

Acceptance: an agent can draft a version but not promote it; an agent cannot create an approval; revoking a person's move takes effect on their agent's next call.

## Phase 5: timed moves

1. `scheduled_calls` (move, input, run at, as whom) and a worker loop in the core. Port the claim from `packages/server/src/jobs.ts:32-67`: one `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)` to status `uploading`; a job in `uploading` with `updated_at` older than 15 minutes is set to `unknown_outcome` and never retried by the loop. New, each with a test: claim one job at a time, a heartbeat (touch `updated_at` while a call runs), and an alert to a person on `unknown_outcome`.
2. `post.publish_job` as an effect move per account, on a simulated connector (real publishing waits for the platform reviews).
3. Results reach the calendar within about a second (Supabase Realtime or server-sent events).

Acceptance: a job killed after the claim and before publishing sends nothing and ends `unknown_outcome`; a job killed after the simulated connector accepted ends `unknown_outcome`, is not retried by the loop, and an agent's retry is refused without a fresh approval.

## Phase 6: web-next on the core

1. Point web-next's post writes and the brand load at `/ops/...` (`src/lib/remote.ts` and the stores that call it). Keep the existing behaviour: optimistic moves, "Sending…", refusals keep the composer open.
2. Map the core's refusals (rule id, message) to the messages the screens show today.
3. Verify the UI with Playwright screenshots (project rule).
4. Then port the remaining route groups one at a time, each with its ported tests: ideas, shoots and crew, share links and comments, inbox, brand kit and voice, connections, media uploads (signed upload URLs), pasted links. Until a group is ported, its calls still go to `packages/server`.

## Phase 7: retire `packages/server` on this branch

Only when every route group runs on the core and the owner agrees.

## Open decisions (settle before or during the phase named)

1. Rule language, CEL or SQL checks (phase 2): spike decides; recommendation is CEL if a maintained library passes the four rules.
2. Where the registry lives: a `packs` schema in the same database (recommended for now).
3. Where the core runs in production: decided by the owner on 18 Oct 2026: the existing `brandfactory` Fly app for now; `launchpad-backend` stays the long-term option. Ask the owner before any deploy.
4. Who approves pack changes: a person for now; agent approval only once the tests and the learning loop are trusted (the owner leans towards agent approval later).

## Not in this plan

The learning loop, the pack tree and levels, scopes, plays, model routing, other apps' packs, real publishing, and LoRA.
