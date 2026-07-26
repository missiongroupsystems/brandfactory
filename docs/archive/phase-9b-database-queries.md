# Phase 9B — Database queries

**Status:** done  
**Plan:** [phase-9-navigation-redesign.md](../executing/phase-9-navigation-redesign.md) (Phase B)  
**Depends on:** [phase-9a-shared-contracts.md](./phase-9a-shared-contracts.md)  
**Package:** `@brandfactory/db`

## Goal

Query helpers that power the workspace-home brand grid and recent-work strip,
plus rename/delete helpers for Phase F, and a richer dev seed so a fresh
`db:seed` actually exercises multi-brand + activity signal.

## What shipped

| Task | Where | Notes |
| --- | --- | --- |
| B1 | `queries/brands.ts` → `listBrandSummariesByWorkspace` | Left-join counts for sections + projects; `::int` + `.mapWith(Number)`; ordered by `brands.created_at`. |
| B2 | `queries/projects.ts` → `listRecentProjectsByWorkspace` | D1 `lastActivityAt` via correlated subqueries + `greatest()`; ordered desc; `limit` required. |
| B3 | `queries/projects.ts` → `updateProject`, `deleteProject` | Phase F. Return `Project \| null` (missing id → null). |
| B4 | `queries/brands.ts` → `updateBrand`, `deleteBrand` | Phase F. Partial name/description patch; cascade left to FKs. |
| B5 | `queries/workspaces.ts` → `updateWorkspace` | Phase F. Rename only. |
| B6 | `packages/db/src/index.ts` | Already `export *` from each query module — new helpers free. |
| B7 | `seed.ts` + `seed.test.ts` | Second brand, second project (+ canvas), two agent messages; expanded row-count assertions. |

### Mappers

| Helper | File | Why |
| --- | --- | --- |
| `rowToBrandSummary` | `mappers.ts` | Spreads `rowToBrand` + attaches counts. |
| `rowToProjectSummary` | `mappers.ts` | Spreads `rowToProject` + `brandName` + normalized `lastActivityAt`. |
| `toIsoTimestamp` | `mappers.ts` (private) | Coerces `Date \| string` → ISO string for raw-SQL timestamp expressions. |

Unit tests added in `mappers.test.ts` (+2): counts pass through; `Date` activity timestamps become ISO strings.

## Implementation notes

### Brand summaries — drizzle select, not a free-standing raw execute

The plan's SQL is the logical query. Implementation uses drizzle's
`select` / `leftJoin` / `groupBy` with `sql\`count(distinct …)::int\``
fragments so column names stay camelCase through the mapper and we do not
hand-parse `db.execute` row bags.

```ts
sectionCount: sql<number>`count(distinct ${guidelineSections.id})::int`.mapWith(Number)
projectCount: sql<number>`count(distinct ${projects.id})::int`.mapWith(Number)
```

`groupBy(brands.id)` is enough under Postgres (primary-key functional
dependency covers the other brand columns).

### Recent projects — correlated subqueries, not joins

Joining `agent_messages` / `canvas_events` would fan out the result set
before aggregation. Correlated `max()` subqueries keep one row per project
and match the plan SQL. `coalesce(…, p.updated_at)` is explicit even though
`greatest()` ignores nulls — intent survives a future edit.

`orderBy(desc(lastActivityAt))` repeats the expression in ORDER BY rather
than aliasing; Postgres is fine with either.

### Timestamp coercion

Drizzle `mode: 'string'` columns return ISO strings. Correlated
`max(created_at)` / `greatest(...)` expressions are unbound from that
mode, so node-pg may return `Date`. `rowToProjectSummary` normalizes both.

### Mutations return `T | null`

Consistent with "not found" rather than throwing. Routes (Phase C/F) turn
null into 404. Deletes rely on FK `onDelete: 'cascade'` already defined in
the schema (brands → projects → canvases / messages / events).

### Seed expansion (B7)

| Id suffix | Entity |
| --- | --- |
| `…0001`–`…0005` | Unchanged: user, workspace, Acme brand, first project + canvas |
| `…0006` | Brand 2 — "Northwind Studio" (no sections → zero-state meter) |
| `…0007` | Project 2 under brand 2 — "Launch naming" |
| `…0008` | Canvas for project 2 (product invariant; not named in the plan but required for a bootable project) |
| `…0009` / `…0010` | User + assistant `agent_messages` under project 2 |

`SeedResult` gained `brand2Id` and `project2Id`. All inserts still use
`onConflictDoNothing({ target: <table>.id })` so the printed dev token and
ids stay stable across reruns.

**Why project 2 lives on brand 2:** the workspace-home Recent work strip must
surface activity across brands — the property `listProjectsByBrand` cannot
provide. Putting both projects on Acme would not exercise B2's join path.

## Verification

```
pnpm typecheck                          ✔  9/9 workspaces
pnpm lint                               ✔  clean
pnpm format:check                       ✔  clean
pnpm -F @brandfactory/db test           ✔  15 passed + 1 skipped (seed live-DB)
```

Seed test remains `describe.skipIf(!process.env.DATABASE_URL)` — CI with the
Postgres service container runs it; local contributors without Postgres still
pass at 15 + 1 skipped.

## Follow-ups

- **C** — widen `GET /workspaces/:id/brands`, add
  `GET /workspaces/:id/projects`, wire helpers into `Db` / fakes, +10 route
  tests (counts, ordering, limit, authz).
- **F** — HTTP surface for update/delete helpers.
