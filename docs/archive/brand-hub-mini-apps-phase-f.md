# Brand hub mini-apps — Phase F: Mini-app route

Status: **done**. Sixth phase of the brand-page redesign tracked in
[`docs/executing/brand-hub-mini-apps.md`](../executing/brand-hub-mini-apps.md).
Builds on [Phase A](./brand-hub-mini-apps-phase-a.md) …
[Phase E](./brand-hub-mini-apps-phase-e.md).

## Goal

Close the loop **brand → mini-app → thread**. Phase E gave the hub tiles that
link to `/brands/$brandId/apps/$appId`; this phase makes that page real — it
lists the threads belonging to its category and creates new ones tagged with the
mini-app's `templateId`, which is the first time the standardized-project path
Phase A unlocked is actually exercised from the UI.

## What changed

### F1 — `packages/web/src/routes/brands.$brandId.apps.$appId.tsx` (filled in)

The route definition (path, `beforeLoad` auth guard) landed in Phase E and is
untouched. The component body is new:

- **Params + resolution.** `{ brandId, appId }` from `miniAppRoute.useParams()`,
  `miniAppById(appId)`; an unresolved id renders an "Unknown mini-app" state
  naming the bad id.
- **Breadcrumbs.** Brand › `app.title` (see the `leaf` slot below).
- **Header.** The registry icon + `app.title` + `app.description`, with a
  **New thread** button on the right for enabled apps.
- **Disabled apps** (`enabled === false`) render a dashed "Coming soon" panel
  pointing at Open canvas, and no thread list or create button. The tile is
  already inert on the hub; this covers someone typing the URL.
- **Thread grid.** `useBrandProjects(brandId)` filtered by `app.match`, rendered
  as `ProjectCard`s (`workspaceId` from `useBrand`, `showBrandName={false}` —
  the brand is implied by the page). Loading, error and empty states are each
  distinct.
- **Create.** `NewProjectDialog` with the mini-app's `templateId`, so
  Copywriting persists `kind: 'standardized', templateId: 'copywriting'` and Open
  canvas stays freeform. Navigation to `/projects/$projectId` on success already
  lived in that dialog.

### F2 — `packages/web/src/router.tsx`

Already done in Phase E (registration had to move forward for the hub's typed
`Link` to compile). No change this phase.

## Two upstream gaps the plan assumed away

Both were called out by the plan as "check the signature" — checking showed
neither seam existed yet.

### The breadcrumb trail had no non-project leaf

`BreadcrumbTrail` was `{ brand?, project? }`. A mini-app is a **category, not an
entity** — it has no id to link to — so nothing fit. The `project` slot renders
identically (plain text after a linked brand), and would have worked by
accident, but it types the mini-app id as a project id: the first future change
that links the project crumb would emit a broken `/projects/copywriting` link.

Added an explicit `leaf?: { name: string }` instead — six lines across the type,
the effect's dependency list, and a `tail = project?.name ?? leaf?.name` in the
renderer. `project` still wins when both are set, since a project is always the
deeper crumb. Existing `Breadcrumbs` tests pass unchanged.

### `NewProjectDialog` couldn't pass a `templateId`

Phase E left it consumer-less and deferred its fate here. Rather than duplicate
~50 lines of dialog, it was generalized with two optional props:

- `templateId?: string` — spread into the mutate arg only when defined, so the
  freeform call site still sends exactly `{ name }` (the Phase A test asserting
  `toHaveBeenCalledWith({ name: 'Campaign' }, …)` passes untouched).
- `title?: string`, default `'New project'` — mini-apps say "thread", and the
  existing `trigger` prop already covered the button label.

This gives the component a purpose again and keeps one create path in the app
rather than two that drift.

## Why this shape

**Client-side filtering, as the plan's non-goals specify.** `projects.filter(app.match)`
runs on the per-brand thread list rather than adding a server-side `templateId`
query param. A brand's thread count is small; the seam can move server-side when
that stops being true. The reason is in a comment so it reads as a decision, not
an oversight.

**Every state is distinct.** Loading, error, empty and populated are four
separate branches — an empty grid and a failed fetch must not look the same.
The empty copy names the category ("Start your first copywriting thread") and
mentions that brand context is already loaded, which is the actual reason to
start a thread here instead of in a generic AI tool.

**`brand &&` guards the grid.** `ProjectCard` needs `workspaceId`, which only
`useBrand` supplies. Threads and brand resolve independently, so the grid waits
for both rather than rendering cards with an empty workspace id (which would
silently break rename/delete's cache invalidation).

**Hooks stay unconditional.** The unknown-app branch returns during render,
after every hook has run — so an unknown `appId` can't change hook order.

## Verification

```
pnpm -F @brandfactory/web typecheck   clean
pnpm -F @brandfactory/web lint        clean
pnpm -F @brandfactory/web test        86 passed (19 files)  [unchanged]
pnpm -F @brandfactory/web build       ok
prettier --check (changed files)      clean
```

Phase F's gate (typecheck + lint + build) is met. Test count is unchanged, and
notably the two components I widened — `Breadcrumbs` (3 tests) and
`NewProjectDialog` (3 tests) — pass without edits, which is the evidence that
both changes are additive. The mini-app tile/route tests are Phase G.

## Files touched

| Action | Path |
| --- | --- |
| Fill in | `packages/web/src/routes/brands.$brandId.apps.$appId.tsx` |
| Edit | `packages/web/src/components/Breadcrumbs.tsx` (add `leaf` slot) |
| Edit | `packages/web/src/components/project/NewProjectDialog.tsx` (`templateId`, `title`) |

No `shared` / `server` / `db` / `agent` changes.

## Next

Phase G — tests: `miniApps` `match` predicates and thread-count derivation over a
mixed `ProjectSummary[]`, plus the mini-app tile/route branches (enabled tile
links, disabled tile is inert and shows "Soon", disabled route renders the stub).
`BrandContextBar`'s tests already landed in Phase D. Worth adding there: a case
asserting `templateId` reaches the mutation, since that path is now live and only
covered by typecheck.
