# @brandfactory/core

The generic backend: one door, `POST /ops/{pack}/{op}`, for every pack's moves. It knows no
business words; everything app-specific is pack data in `packs/<name>/`. The design is in
`docs/completions/packs-core-proposal.md`; what was built, phase by phase, is in
`docs/completions/packs-core-phases-1-to-8.md`.

```bash
pnpm vitest run --project @brandfactory/core
# The tests PGlite cannot run (statement timeout, a real server's grants):
docker run -d --rm --name core-test-pg -p 54329:5432 -e POSTGRES_PASSWORD=pw postgres:16
CORE_TEST_PG_URL=postgres://postgres:pw@localhost:54329/postgres pnpm vitest run --project @brandfactory/core
```

Without Docker, the `embedded-postgres` npm package runs the same server from any folder outside
the repo. The runner leaves one template database per pack version on that server; use a
throwaway one.

The server and the command line:

```bash
pnpm -F @brandfactory/core start                      # PGlite in .data/core, or DATABASE_URL
pnpm -F @brandfactory/core core migrate ../../packs/brandbase
pnpm -F @brandfactory/core core publish ../../packs/brandbase
pnpm -F @brandfactory/core core test brandbase 1.0.0
pnpm -F @brandfactory/core core promote brandbase 1.0.0
```

`packs/brandbase/demo/hour-rule.sh` runs the whole cycle against one server.

Agents use `POST /mcp/{pack}` (MCP tools, one per move in their loadout). Effect moves send only
what a person approved with `POST /approve/{pack}/{op}`.

A move marked `"guest": {"capability": "<field>"}` is open with no sign-in at
`POST /guest/{pack}/{op}`. The input field it names (at least 32 characters) is the right: the move
runs with no person and with it as the call's capability (`claims.capability()`), so the pack's row rules decide what it
reaches. Guest calls are rate-limited per address and logged (the log keeps only the first 4 characters of the capability), and every guest move needs a case
with a wrong token.

A pack's tests are `packs/<name>/tests/*.json`; the format is at the top of `src/runner.ts`.

Files: a move marked `"upload": {"type": "<field>"}` gets a new key from the core as `:file`
(`<pack>/<uuid>.<ext>`; the client never names one) and answers `upload: {key, type}`; the core
turns that into a signed write URL and a stable address, `GET /files/<signature>/<key>`, which
sends the browser on to a short-lived storage URL. Storage never overwrites a key. Settings:
`FILES_SECRET` (32 characters or more; a fixed one locally), `PUBLIC_URL` (the core's address in
those links), `FILES_PROVIDER` (`disk`, under `FILES_DIR`, served by the core and refused in
production; or `supabase`, with `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and `FILES_BUCKET`).

**Saved plans.** `DATABASE_PREPARE=on` sends each move's and rule's SQL as a named statement, so
each connection plans it once; off (the default) sends it unnamed. The core refuses `on` with
Supabase's transaction pooler (port 6543), which keeps no statement between transactions: use the
direct port or the session pooler. A read sends its check, rules and move in one trip either way
(`inOneRead` in `src/run.ts`, core migration 0008).

**Agent sessions.** `POST /agents/session` with `{ name }` and a person's token answers a token
for the person's agent, `<person>/<name>` (made on first use, `agent_of` the person), valid for an
hour. Each session copies the person's loadouts to the agent; the core still checks both on every
call, and an agent can neither approve nor start an agent of its own. The token is signed with
`AGENT_SECRET` (32 characters or more; a fixed one locally) and is this core's only, never the
sign-in's. Bubbles (`packages/bubbles`) is the agent service that uses it.
