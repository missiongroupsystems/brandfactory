# Phase 9F — Rename and delete

**Status:** done  
**Plan:** [phase-9-navigation-redesign.md](../executing/phase-9-navigation-redesign.md) (Phase F)  
**Depends on:** [phase-9e](./phase-9e-workspace-home-brand-hub.md) (UI), Phase B helpers already on `Db`  
**Packages:** `@brandfactory/server`, `@brandfactory/web`

## Goal

Cards and hubs are no longer dead-ends: rename and delete for brands and
projects, rename for workspaces. Brand delete is hard-gated with typed-name
confirmation and cascade copy. Workspace delete stays deferred (D3).

## What shipped

### Server (C4–C6)

| Method | Path | Helper |
| --- | --- | --- |
| `PATCH` | `/workspaces/:id` | `updateWorkspace` |
| `PATCH` | `/brands/:id` | `updateBrand` |
| `DELETE` | `/brands/:id` | `deleteBrand` (FK cascade) |
| `PATCH` | `/projects/:id` | `updateProject` |
| `DELETE` | `/projects/:id` | `deleteProject` |

All require ownership via existing `require*Access`. Missing rows after authz
→ `404` with the usual codes. Bodies validated with Phase A
`Update*InputSchema`s.

### Web mutations (F6)

| Hook | Invalidates / updates |
| --- | --- |
| `useUpdateWorkspace` | detail cache + `workspaceKeys.all` |
| `useUpdateBrand` / `useDeleteBrand` | brand detail; workspace brands (+ projects on delete) |
| `useUpdateProject` / `useDeleteProject` | project detail; brand + workspace project lists; brand counts on delete |

Deleting the entity you're viewing navigates up: brand hub → workspace home;
project canvas → brand hub.

### UI (F1–F5)

| Component | Role |
| --- | --- |
| `EntityMenu` | Shared ⋯ → Rename / Delete |
| `RenameDialog` | Workspace / brand / project; brand also edits description |
| `DeleteBrandDialog` | AlertDialog; type exact name; cascade count copy |
| `DeleteProjectDialog` | Plain AlertDialog confirm |

Mounted on: brand cards, project cards, brand hub header, project `TopBar`.
Workspace rename is an inline form on **Workspace settings** (F5) — reached
from the switcher.

Dialog form state remounts when open (keyed children) so fields re-seed without
`setState` in effects (lint rule).

## Tests

### Server (+7)

- `PATCH` workspace rename; 403 non-owner + 404 unknown  
- `PATCH` brand rename/clear description  
- `DELETE` brand cascades projects; second delete 404  
- `PATCH` brand 403 non-owner  
- `PATCH` project rename  
- `DELETE` project; 404 unknown; 403 non-owner  

Server package: **130** tests.

### Web (+1)

- `DeleteBrandDialog` — destructive button disabled until name matches; cascade
  copy; confirm fires  

Web package: **80** tests. Monorepo: **273** passed + 1 skipped.

## Verification

```
pnpm typecheck                          ✔  9/9
pnpm lint                               ✔  clean
pnpm format:check                       ✔  clean
pnpm test                               ✔  273 passed + 1 skipped
pnpm -F @brandfactory/web build         ✔
```

## Follow-ups

- **G** — Mission Systems CI visual pass on settled screens.
- Workspace **delete** still deferred (needs export story).
