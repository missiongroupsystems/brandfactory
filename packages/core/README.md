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
