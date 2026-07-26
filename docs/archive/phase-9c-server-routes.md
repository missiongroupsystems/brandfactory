# Phase 9C — Server routes

**Status:** done  
**Plan:** [phase-9-navigation-redesign.md](../executing/phase-9-navigation-redesign.md) (Phase C)  
**Depends on:** [phase-9a](./phase-9a-shared-contracts.md), [phase-9b](./phase-9b-database-queries.md)  
**Package:** `@brandfactory/server` (+ one web type retype)

## Goal

Expose the Phase B list queries over HTTP with authz, wire them through the
`Db` facade and in-memory fakes, and lock behaviour with route tests. Rename /
delete HTTP (C4–C6) stays Phase F.

## What shipped

| Task | Where | Notes |
| --- | --- | --- |
| C1 | `routes/brands.ts` | `GET /workspaces/:workspaceId/brands` → `listBrandSummariesByWorkspace` → `BrandSummary[]`. Additive fields only. |
| C2 | `routes/projects.ts` + `app.ts` | New `createWorkspaceProjectsRouter`: `GET /workspaces/:workspaceId/projects?limit=` → `ProjectSummary[]`. |
| C3 | `db.ts`, `test-helpers.ts` | All Phase B helpers on `Db` / `buildDbDeps` / fake (reads **and** Phase F mutations so the facade stays complete). |
| Wire types | `packages/web/.../workspaces.ts` | `useWorkspaceBrands` retyped to `BrandSummary[]` in the same change as C1 (plan risk). |

C4–C6 (PATCH/DELETE routes) deferred with Phase F as planned.

### C2 query contract

```ts
limit: z.coerce.number().int().min(1).max(50).default(10)
```

- Missing `limit` → 10.
- `limit=0` / `limit=51` / non-numeric → 400 `VALIDATION` via zod + `onError`.
- Authz: `requireWorkspaceAccess` → 403 non-owner, 404 unknown workspace.
- Empty workspace with no projects → `[]` (200), not 404.

Mounted under `/workspaces` next to brands/settings so the path is
workspace-scoped, not brand-scoped (the whole point of the strip).

### Fake semantics (C3)

`listBrandSummariesByWorkspace` and `listRecentProjectsByWorkspace` in
`createFakeDb` implement real counting and D1 ordering so route tests have
teeth:

- **Counts** — filter `state.sections` / `state.projects` by brand id.
- **Order brands** — `createdAt` ascending.
- **`lastActivityAt`** — `max(project.updatedAt, agent message times, canvas event times)`; sort desc; `slice(0, limit)`.
- **Mutations** — `update*` / `delete*` return `null` when missing; `deleteBrand` cascades projects via `deleteProject` (canvas, blocks, events, messages cleaned up).

## Tests (+7 net; all C1–C3 scenarios covered)

| File | Cases |
| --- | --- |
| `routes/brands.test.ts` | Counts 2/1 and 0/0 in one case; GET brands 403 non-owner. |
| `routes/projects.test.ts` | Multi-brand list; activity order (agent message beats newer idle); `limit` cap + invalid 400; 403 + 404; empty `[]`. |

Server package: **123** tests (was ~116). Combined cases keep the file readable
without dropping any scenario from the plan's checklist.

## Verification

```
pnpm typecheck                          ✔  9/9 workspaces
pnpm lint                               ✔  clean
pnpm format:check                       ✔  clean
pnpm -F @brandfactory/server test       ✔  123 passed
pnpm -F @brandfactory/db test           ✔  15 passed + 1 skipped
```

**Note:** full `pnpm test` currently fails 8 pre-existing
`packages/web/src/lib/theme.test.ts` cases (`localStorage.clear is not a
function` under the current jsdom). Untouched by this phase; server/db green.

## Follow-ups

- **D** — App shell (switcher, breadcrumbs, `/` resolution, first-run screen).
- **E** — Workspace home + brand hub consuming `BrandSummary` / new projects endpoint.
- **F** — PATCH/DELETE routes on top of the mutation helpers already on `Db`.
