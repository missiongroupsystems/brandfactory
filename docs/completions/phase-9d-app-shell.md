# Phase 9D — App shell

**Status:** done  
**Plan:** [phase-9-navigation-redesign.md](../executing/phase-9-navigation-redesign.md) (Phase D)  
**Depends on:** [phase-9c-server-routes.md](./phase-9c-server-routes.md)  
**Package:** `@brandfactory/web`

## Goal

Replace the double workspace representation (nav picker + full-page grid) with
a single workspace-scoped shell: wordmark → active home, dropdown switcher,
breadcrumb tail for brand/project, smart `/` landing, and first-run only on
`/workspaces`.

## What shipped

| Task | Where | Notes |
| --- | --- | --- |
| D1 | `components/ui/dropdown-menu.tsx`, `alert-dialog.tsx` | shadcn-style primitives; deps `@radix-ui/react-dropdown-menu`, `@radix-ui/react-alert-dialog`. Alert dialog unused until Phase F. |
| D2 | `lib/workspace-context.ts` | `resolveActiveWorkspaceId` (pure) + `useActiveWorkspaceId` (route → brand → project → storage if still in list). |
| D3 | `components/WorkspaceSwitcher.tsx` | DropdownMenu: checked current, New workspace…, Workspace settings. Writes `setLastWorkspaceId` + navigates. |
| D4 | `components/NewWorkspaceDialog.tsx` | Lifted from the old workspaces index; controlled `open` for the switcher + optional trigger for first-run. |
| D5 | `components/Breadcrumbs.tsx` | Provider + `useBreadcrumbTrail` + header renderer. Back-links removed from workspace home, brand editor, settings. Project route populates brand+project tail. |
| D6 | `routes/index.tsx` + `lib/workspace-resolve.ts` | Loader: ensure workspaces → last-if-valid → oldest `createdAt` → else `/workspaces`. |
| D7 | `routes/workspaces.index.tsx` | Redirect when any workspace exists; otherwise onboarding copy + Create workspace. Card grid deleted. |
| D8 | `routes/__root.tsx` | Wordmark → active workspace (or first-run path); header = wordmark \| switcher \| breadcrumbs \| theme. |

### Related wiring

- Login success (local + supabase) and already-authed `/login` redirect go to
  `/` so D6 resolution runs, not the old blind `/workspaces` grid.
- Settings entry point is the switcher (page-level Settings link removed with
  the back-links).

## Design notes

### Active workspace resolution

```
route wsId
  → brand.workspaceId (from useBrand)
  → project.brand.workspaceId (from useProjectDetail)
  → getLastWorkspaceId() only if that id is still in listWorkspaces result
  → null
```

Storage is **never** preferred over the route, fixing the picker-vs-page drift
called out in the plan. Auth-gated: `useWorkspaces({ enabled: !!token })` so
the login shell does not hit the API.

Landing (`resolveLandingWorkspaceId`) additionally falls through to the oldest
workspace by `createdAt` when storage is empty/stale — only used by `/` and
`/workspaces` loaders, not by the live switcher label.

### Breadcrumbs are brand/project only

Workspace name stays in the switcher. Routes call `useBreadcrumbTrail({ brand,
project? })`; cleanup on unmount clears the tail so workspace home shows no
crumbs.

### First-run vs home

`/workspaces` is no longer a second home. If the user has any workspace, the
loader redirects into one. Zero workspaces → short explanation of workspace vs
brand + primary Create action (same `NewWorkspaceDialog` as the switcher).

## Tests (+9 web)

| File | Cases |
| --- | --- |
| `lib/workspace-context.test.ts` | route wins; storage fallback; stale storage discarded; empty list → null |
| `components/WorkspaceSwitcher.test.tsx` | list + checked current; navigate + persist on select |
| `components/Breadcrumbs.test.tsx` | empty; brand-only; brand+project with link |

Also fixed pre-existing `theme.test.ts` localStorage breakage (in-memory
`Storage` shim; avoid `vi.stubGlobal` for matchMedia so unstub doesn't leave
a broken localStorage). Dev dep: `@testing-library/user-event`.

Web package: **65** tests (was 56). Monorepo: **251** passed + 1 skipped.

## Verification

```
pnpm typecheck                          ✔  9/9
pnpm lint                               ✔  clean
pnpm format:check                       ✔  clean
pnpm test                               ✔  251 passed + 1 skipped
pnpm -F @brandfactory/web build         ✔
```

## Follow-ups

- **E** — Workspace home (brands + recent work) and brand hub (projects +
  guidelines); consume `BrandSummary` / workspace projects endpoint;
  `NewProjectDialog`.
- **F** — Entity menus using the alert-dialog primitive already landed in D1.
