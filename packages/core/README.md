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

A pack's tests are `packs/<name>/tests/*.json`; the format is at the top of `src/runner.ts`.
