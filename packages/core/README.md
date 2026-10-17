# @brandfactory/core

The generic backend: one door, `POST /ops/{pack}/{op}`, for every pack's moves. It knows no
business words; everything app-specific is pack data in `packs/<name>/`. The design is in
`docs/executing/packs-core-proposal.md`; what was built, phase by phase, is in
`docs/completions/packs-core-phases-1-to-7.md`.

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

A pack's tests are `packs/<name>/tests/*.json`; the format is at the top of `src/runner.ts`.
