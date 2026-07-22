# Phase 9E — Workspace home and brand hub

**Status:** done  
**Plan:** [phase-9-navigation-redesign.md](../executing/phase-9-navigation-redesign.md) (Phase E)  
**Depends on:** [phase-9d-app-shell.md](./phase-9d-app-shell.md)  
**Package:** `@brandfactory/web`

## Goal

Make projects reachable and the landing page useful: workspace home shows brand
signal + recent work; brand page becomes a hub (projects first, guidelines
below); creating a project drops you on the canvas.

## What shipped

| Task | Where | Notes |
| --- | --- | --- |
| E1 | `api/queries/workspaces.ts` | `workspaceKeys.projects`, `useWorkspaceProjects(wsId, limit)` → `ProjectSummary[]` via C2. |
| E2 | `api/queries/projects.ts` | `useCreateProject(brandId, workspaceId)` freeform POST; invalidates brand projects, workspace projects, workspace brands (counts). |
| E3 | `components/brand/BrandCard.tsx` | Name, description, `GuidelineMeter`, project count; navigates to hub. |
| E4 | `components/brand/GuidelineMeter.tsx` | D2 muted dots; `aria-label` + `title`; zero = hollow; clamp fill at `SUGGESTED_SECTIONS.length`. |
| E5 | `components/project/ProjectCard.tsx` | Name, kind badge, relative activity; optional brand name for workspace strip. |
| E6 | `lib/relative-time.ts` | `Intl.RelativeTimeFormat` only; injectable `now`. |
| E7 | `routes/workspaces.$wsId.index.tsx` | Workspace home: header + `+ Brand`, brands grid, Recent work strip + empty states. |
| E8 | `routes/brands.$brandId.tsx` | Brand hub: identity → Projects (+ create) → Guidelines (`BrandEditorForm` unchanged, `key={brand.id}`, Cmd-S). |
| E9 | `components/project/NewProjectDialog.tsx` | Name only; success → `/projects/$projectId`. |

## Design notes

### Recent work vs brand projects

| Surface | Data | Brand name | Activity timestamp |
| --- | --- | --- | --- |
| Workspace Recent work | `useWorkspaceProjects` → `ProjectSummary` | shown (`showBrandName`) | `lastActivityAt` (D1) |
| Brand hub Projects | `useBrandProjects` → `Project[]` | hidden | `updatedAt` (no per-brand activity join yet) |

One `ProjectCard` covers both; brand hub uses `updatedAt` until a brand-scoped
summary endpoint exists (not required this phase).

### GuidelineMeter (D2)

- Denominator = `SUGGESTED_SECTIONS.length` (5 today).
- Filled dots = `min(sectionCount, total)`.
- Label always uses the real row count: `"10 of 5 guideline sections"` if over.
- Colours: `muted-foreground` only — no semantic red/green.

### Empty states (E7)

- No brands → dashed onboarding panel + primary Create (same dialog as header).
- Brands but no projects → “Open a brand to start a project.”
- No brands and no projects → softer Recent work copy under the brands empty state.

### Create project path

The product loop this phase unlocks:

1. Workspace home → brand card → hub  
2. New project → name → land on split-screen canvas  

Invalidation also refreshes brand card project counts on the home grid.

## Tests (+14 web)

| File | Cases |
| --- | --- |
| `GuidelineMeter.test.tsx` | label, zero hollow, fill first n, clamp over total |
| `ProjectCard.test.tsx` | brand shown/hidden, kind badge |
| `relative-time.test.ts` | minutes/hours, yesterday, future, invalid |
| `NewProjectDialog.test.tsx` | disabled until named, navigate on success, error toast |

Web: **79** tests. Monorepo: **265** passed + 1 skipped.

## Verification

```
pnpm typecheck                          ✔  9/9
pnpm lint                               ✔  clean
pnpm format:check                       ✔  clean
pnpm test                               ✔  265 passed + 1 skipped
pnpm -F @brandfactory/web build         ✔
```

## Follow-ups

- **F** — Rename/delete (EntityMenu, typed brand delete confirm) using alert-dialog from D1.
- **G** — Mission Systems CI visual pass on settled surfaces.
- Manual smoke (plan verification #5): agent message → project jumps to top of Recent work — unit tests cannot prove this end-to-end; needs seeded dev + live chat.
