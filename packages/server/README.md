# @brandfactory/server

The BrandBase API: Hono on Node, Drizzle on Postgres. The plan and its scope are in
`docs/executing/brandbase-backend-plan.md`; the rules it enforces come from
`docs/executing/brandbase-backend-handoff.md`.

## Run it locally

No database server is needed: without `DATABASE_URL` the API runs on PGlite (Postgres in
process) in `.data/pglite`, with dev sign-in (the bearer token is the user id) and files on disk.

```bash
SEED_ADMIN=admin@local pnpm -F @brandfactory/server db:seed   # the demo's data, once
PIN_NOW=2026-10-06T04:00:00Z pnpm -F @brandfactory/server dev # :3001; the demo's "today"
curl localhost:3001/brands -H 'authorization: Bearer admin@local'
```

## Rules that hold everywhere

- Every dependency enters through `createApp(deps)`; tests run every route with `app.request()`
  on a fresh PGlite database.
- Every table is in the Postgres schema `brandbase`, so the API shares the archive's Supabase
  database without touching its tables.
- A real database (`DATABASE_URL`) counts as a deployment: dev sign-in, disk storage, a pinned
  clock and the development signing secret are refused, and the job runner stays off until a
  real publisher exists.
- Migrations are generated (`pnpm -F @brandfactory/server db:generate`), never written by hand.
