# Brand hub mini-apps — Phase E: Rewrite the brand page as a hub

Status: **done**. Fifth phase of the brand-page redesign tracked in
[`docs/executing/brand-hub-mini-apps.md`](../executing/brand-hub-mini-apps.md).
Builds on [Phase A](./brand-hub-mini-apps-phase-a.md) …
[Phase D](./brand-hub-mini-apps-phase-d.md).

## Goal

Turn `routes/brands.$brandId.tsx` into the **hub** the redesign is named after.
Before: an identity header, a thin "Projects" strip, and a full-page guidelines
editor. After: identity header → ambient **brand context bar** → a **Workspace**
grid of mini-app tiles. Guidelines move behind an Edit button; threads move
behind their category.

Because Phases C and D moved the editor and built the context bar in advance,
this phase is what the plan promised — **pure orchestration**. No new component
logic was written here beyond the tile.

## What changed

### E1 — `packages/web/src/routes/brands.$brandId.tsx` (rewritten)

**Kept verbatim:** the `flex-1 overflow-auto p-6` container, the
`brandEditorRoute` export and its `beforeLoad` auth guard, `useBreadcrumbTrail`,
the identity header (name / description / `isError` line / `EntityMenu`), and
both `RenameDialog` and `DeleteBrandDialog` including the `projectCount`
null-handling comment. Header margin tightened `mb-8` → `mb-6` since the context
bar now carries its own `mb-8`.

**Replaced:**

- The `Guidelines` section and its `BrandGuidelinesEditor` call →
  `<BrandContextBar brand={brand} onEdit={() => setEditOpen(true)} />` plus
  `<EditGuidelinesDialog brand={brand} open={editOpen} onOpenChange={setEditOpen} />`.
  One new `editOpen` state; the bar itself stays stateless about the dialog.
- The `Projects` section (`NewProjectDialog` + `ProjectCard` list) → a
  **Workspace** heading over a `grid-cols-[repeat(auto-fill,minmax(220px,1fr))]`
  grid of `MINI_APPS` tiles.

**New local `MiniAppTile`** — icon + title + description + thread count, on the
established tile class (`group relative flex flex-col rounded-lg border bg-card
p-4 shadow-sm transition-colors`). Enabled tiles are a `<Link to=
"/brands/$brandId/apps/$appId">` with `hover:bg-accent`; disabled tiles are a
plain `div` with `aria-disabled`, `opacity-60`, no hover affordance, and a muted
**Soon** pill.

Imports dropped: `NewProjectDialog`, `ProjectCard`, `BrandGuidelinesEditor`.

### Registration pulled forward — `routes/brands.$brandId.apps.$appId.tsx` + `router.tsx`

See the note below. A minimal route (path + auth guard + a title/description
placeholder, plus the unknown-`appId` branch) was added and registered so the
tile's `Link` type-checks. Phase F fills in the body.

## The plan's phase boundary had a hole

Phase E's gate is "typecheck + lint + test green", but E is the phase that
introduces `<Link to="/brands/$brandId/apps/$appId">` while F is the phase that
registers that route. TanStack Router's `Link` is **typed against the registered
route tree** (`router.tsx` declares the `Register` module augmentation), so E
alone does not compile:

```
error TS2322: Type '"/brands/$brandId/apps/$appId"' is not assignable to type
'"." | "/" | "/workspaces" | … | "/projects/$projectId" | ".."'
error TS2353: 'brandId' does not exist in type 'ParamsReducerFn<…>'
```

The point of the phase split is a green commit at every boundary, so the fix is
to move **F2 plus a skeleton of F1** into E — ~40 lines — rather than either
merge the two phases or knowingly commit a broken typecheck. Phase F is now
"fill in the mini-app page" (breadcrumbs, thread grid, New-thread flow) against a
route definition that already exists; its `createRoute` call should be left
alone.

The placeholder is honest about itself in a header comment so nobody mistakes it
for a finished page.

## Why this shape

**Thread counts go silent when unknown.** `countsKnown` gates on
`!projectsPending && !projectsError && projects !== undefined`; when false each
tile gets `threadCount={null}` and renders no count rather than "0 threads" — the
same reasoning the `DeleteBrandDialog` `projectCount` comment already encodes for
the cascade warning. A load failure additionally surfaces one line
("Thread counts are unavailable") instead of the old full-width error, because
the grid itself is still perfectly usable without counts.

**Disabled tiles suppress a zero count** (`app.enabled || threadCount > 0`) — a
"Soon" tile that also says "0 threads" is noise. If threads somehow exist under a
not-yet-live template, the count still shows, so nothing is hidden.

**Tiles are `Link`s, not `button` + `navigate()`** — matching the reasoning
already written into `ProjectCard` / `BrandCard` (real anchors: middle-click,
cmd-click, and the status bar all work).

**Accent budget:** tiles are neutral `bg-card` + `hover:bg-accent`, the Soon pill
is `bg-surface-sunken`. No brand green anywhere on the hub — it stays on primary
CTAs, focus rings, and links elsewhere.

**A no-op loading state.** The empty `' '` count span holds a line of vertical
space so tiles don't reflow when counts arrive.

## `NewProjectDialog` is now consumer-less

Per the plan ("grep before removing"), it was grepped: `ProjectCard` is still
used by the workspace home (`workspaces.$wsId.index.tsx`), but `NewProjectDialog`
now has **no consumer** outside its own test. It is deliberately left in place —
Phase F's "New thread" flow either reuses it or is modelled on it, and its three
tests still pass and still guard the generalized Phase A hook signature. Deleting
it is Phase F's call, not this phase's.

## Verification

```
pnpm -F @brandfactory/web typecheck   clean
pnpm -F @brandfactory/web lint        clean
pnpm -F @brandfactory/web test        86 passed (19 files)  [unchanged]
pnpm -F @brandfactory/web build       ok
prettier --check (changed files)      clean
```

Phase E's gate is met. Test count is unchanged: no existing test rendered this
route, and the tile/route tests are Phase G's. Manual verification of the hub in
the dev app is Phase H.

## Files touched

| Action | Path |
| --- | --- |
| Rewrite | `packages/web/src/routes/brands.$brandId.tsx` |
| New | `packages/web/src/routes/brands.$brandId.apps.$appId.tsx` (placeholder; F fills it) |
| Edit | `packages/web/src/router.tsx` (register `miniAppRoute`) |

No `shared` / `server` / `db` / `agent` changes.

## Next

Phase F — flesh out the mini-app page: `useBreadcrumbTrail` (Brand ›
`app.title`), header with a **New thread** button, `useBrandProjects` filtered by
`app.match` rendered as `ProjectCard`s, a "Coming soon" branch for
`enabled === false`, and the create flow feeding `templateId` through the Phase A
hook. The route definition and registration are already done.
