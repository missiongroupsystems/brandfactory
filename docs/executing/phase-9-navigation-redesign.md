# Phase 9 — Navigation redesign: workspace home, brand hub, reachable projects

Status: **done**. Phases A–G shipped (see `docs/completions/phase-9{a…g}.md`),
followed by a review-remediation pass in
[phase-9h-review-remediation.md](../completions/phase-9h-review-remediation.md).
Supersedes the "Phase 9" sketch in the 0.8.0 README ("Playwright, adapter docs,
standardized templates") — those move to Phase 10.

## Goal

Turn the post-login experience from a chain of container grids into a workspace
home that shows actual work. Three things are wrong today and this phase fixes
all three:

1. **Workspaces are represented twice** — a picker in the top nav *and* a
   full-page grid at `/workspaces` — with no label on either explaining what a
   workspace is. The picker also reads `localStorage`, not the route, so it can
   display a different workspace than the page you're on.
2. **Projects are unreachable.** `useBrandProjects` exists in
   `packages/web/src/api/queries/brands.ts:44` and is never called. Nothing in
   the app links to `/projects/$projectId`. There is no "New project" affordance
   anywhere. The split-screen ideation canvas built across Phases 5–7 — the
   actual product — can only be opened by pasting a UUID into the URL bar.
3. **The landing page carries no signal.** Cards show a name and a creation
   date. Nothing tells you what you were working on or where to resume.

After this phase: log in → land in a workspace → see your brands with real
signal and your recent work across all of them → one click into a project
canvas. Workspace switching lives only in the nav.

## Non-goals

- Standardized project templates. `templateId` is a bare string in
  `packages/shared/src/project/create.ts:13` with no registry and no UI behind
  it. Project creation is **freeform-only** this phase.
- Multi-user / sharing / invites. Ownership stays `workspaces.ownerUserId`.
- Reworking the split-screen project surface itself (`SplitScreen`, `ChatPane`,
  `CanvasPane`). We are building the way *in*, not changing what's there.
- Rewriting the brand guidelines editor. It works, `Cmd-S` is wired, and the
  TipTap/dnd-kit section list is preserved as-is — only relocated.

---

## Decisions

Three questions were open going into this plan. All are now settled.

### D1 — Recent work sorts by true last activity

`projects.updatedAt` only moves when the project row itself changes (a rename).
Chatting with the agent or editing the canvas does not touch it, so ordering by
it would surface creation order wearing an "updated" label — a lie in the UI.

**Decision: compute `lastActivityAt` server-side** as the greatest of
`projects.updated_at`, the newest `agent_messages.created_at` for the project,
and the newest `canvas_events.created_at` for the project's canvas. Both source
tables are already indexed for it (`agent_messages_project_created_idx`,
`canvas_events_canvas_timeline_idx`).

Rejected alternatives: labelling the column "Created" (honest but useless — the
strip exists to help you resume); bumping `projects.updatedAt` on every canvas
and agent write (a write-path change touching Phase 5/6 code for a read-path
feature, and it would make the canvas hot-path contend on the projects row).

### D2 — Guideline completeness is a soft indicator, not a grade

Brand cards show a filled/empty dot row with `SUGGESTED_SECTIONS.length` as the
denominator (`packages/shared/src/brand/suggested-categories.ts`).

To keep this from reading as a report card against a prescribed checklist —
which would cut against the vision's "un-opinionated" principle — it renders in
muted foreground only, with **no** red/green/warning colour, no percentage, no
"incomplete" copy, and an accessible label of the form
`"3 of 7 guideline sections"`. A brand with zero sections is a legitimate
state (vision.md:28 — brands can start as rough ideas), and the empty row must
not look like an error.

**Known imprecision:** the count is of section *rows*, not sections with
non-empty bodies. A user can add a blank section and score a dot for it.
Counting filled ProseMirror bodies means either a jsonb text-length heuristic in
SQL or hydrating every section to count client-side; neither is worth it. Row
count is documented as the definition, not hidden.

### D3 — Rename and delete ship, workspace deletion does not

Currently nothing in the app can be renamed or deleted, and no server endpoints
exist for it. A landing page full of cards you can't correct or remove is the
same dead-end complaint in a different costume, so this is in scope:

| Resource | `PATCH` (rename) | `DELETE` |
| --- | --- | --- |
| Workspace | yes | **no** — deferred |
| Brand | yes (name + description) | yes |
| Project | yes | yes |

Workspace deletion cascades every brand, project, canvas, block and message the
user owns, with no undo and no export path yet. It is one misclick from total
data loss and it is not needed to fix navigation. Deferred until there is an
export story.

Brand deletion also cascades (projects → canvases → blocks), so it requires
**typed-name confirmation**. Project deletion is a plain confirm.

This lands as **Phase F**, deliberately sequenced last so it can be dropped
without blocking anything earlier.

---

## Target information architecture

### Routes

| Now | After |
| --- | --- |
| `/` → redirect `/workspaces` | `/` → resolve and redirect to a workspace (see below) |
| `/workspaces` — grid of workspace cards | **first-run only.** Renders the "create your first workspace" screen when the user has zero workspaces; otherwise redirects to one |
| `/workspaces/$wsId` — brand grid | **workspace home** — the landing page |
| `/workspaces/$wsId/settings` | unchanged; reached from the nav dropdown |
| `/brands/$brandId` — guidelines editor only | **brand hub** — identity + projects + guidelines |
| `/projects/$projectId` — split-screen, orphaned | unchanged, now reachable |

**Workspace resolution at `/`** (in order): the route we came from, else
`getLastWorkspaceId()` if it still exists in the user's workspace list, else the
first workspace by `createdAt`, else `/workspaces` (first-run). The
"still exists" check matters — `bf_last_workspace` currently outlives a deleted
or foreign workspace and would 404 the landing page.

### Header anatomy

```
┌─────────────────────────────────────────────────────────────────────┐
│ BrandFactory │ Mission Group ▾ │ Acme / Q3 campaign        [◐] [u] │
└─────────────────────────────────────────────────────────────────────┘
     ↑ home        ↑ workspace switcher    ↑ breadcrumb tail
```

- **Wordmark** links to the current workspace home, not the dead `/workspaces`.
- **Workspace switcher** — a `DropdownMenu`, not the bare `Select` it is today.
  Contents: every workspace with a check on the current one, separator,
  `New workspace…` (opens the existing dialog, lifted out of
  `workspaces.index.tsx`), `Workspace settings`. It derives "current" from the
  **route params**, falling back to `getLastWorkspaceId()` only on routes that
  have no workspace in scope.
- **Breadcrumb tail** — brand and project segments only (the workspace is
  already the switcher). Each route feeds it; the four hand-rolled `← Back`
  links in `workspaces.$wsId.index.tsx:135`, `brands.$brandId.tsx:286` and
  friends are deleted.

---

## Implementation phases

Phases are ordered so the app compiles and passes tests at every boundary.
A → B → C are backend-then-shell foundations; D and E are the two screens;
F and G are additive.

---

### Phase A — Shared contracts

New schemas in `packages/shared/src`, all exported from `index.ts` under the
existing section comments. No tests here — `packages/shared` has none by
convention; these schemas are exercised through the server route tests in
Phase B.

- [ ] **A1** `brand/summary.ts` — `BrandSummarySchema` = `BrandSchema` extended
      with `sectionCount: z.number().int().nonnegative()` and
      `projectCount: z.number().int().nonnegative()`. Export type `BrandSummary`.
- [ ] **A2** `project/summary.ts` — `ProjectSummarySchema` = `ProjectSchema`
      extended with `brandName: z.string()` and `lastActivityAt: z.string()`
      (ISO timestamp, same `mode: 'string'` convention as every other timestamp
      crossing the wire). Export type `ProjectSummary`.
- [ ] **A3** `brand/update.ts` — `UpdateBrandInputSchema`
      `{ name?: NonEmpty, description?: string | null }`, `.refine()` that at
      least one key is present. (Phase F.)
- [ ] **A4** `project/update.ts` — `UpdateProjectInputSchema` `{ name: NonEmpty }`.
      (Phase F.)
- [ ] **A5** `workspace/update.ts` — `UpdateWorkspaceInputSchema`
      `{ name: NonEmpty }`. (Phase F.)
- [ ] **A6** Wire all five into `packages/shared/src/index.ts`.

**Done when:** `pnpm -F @brandfactory/shared typecheck` is clean and the new
types import cleanly from `server` and `web`.

---

### Phase B — Database queries

New helpers in `packages/db/src/queries/`, following the existing module style
(exported async functions over the `db` singleton, typed against
`@brandfactory/shared`).

- [ ] **B1** `queries/brands.ts` → `listBrandSummariesByWorkspace(workspaceId)`.
      Left-joins `guideline_sections` and `projects` with grouped counts so one
      round-trip serves the whole brand grid. Ordered by `brands.created_at`.

      ```sql
      select b.*,
             count(distinct gs.id)::int as section_count,
             count(distinct p.id)::int  as project_count
        from brands b
        left join guideline_sections gs on gs.brand_id = b.id
        left join projects p            on p.brand_id  = b.id
       where b.workspace_id = $1
       group by b.id
       order by b.created_at
      ```

- [ ] **B2** `queries/projects.ts` → `listRecentProjectsByWorkspace(workspaceId, limit)`.
      Implements D1. Correlated subqueries rather than joins so the `greatest()`
      stays readable and neither activity table can fan out the result set.

      ```sql
      select p.*, b.name as brand_name,
             greatest(
               p.updated_at,
               coalesce((select max(am.created_at) from agent_messages am
                          where am.project_id = p.id), p.updated_at),
               coalesce((select max(ce.created_at) from canvas_events ce
                          join canvases c on c.id = ce.canvas_id
                         where c.project_id = p.id), p.updated_at)
             ) as last_activity_at
        from projects p
        join brands b on b.id = p.brand_id
       where b.workspace_id = $1
       order by last_activity_at desc
       limit $2
      ```

- [ ] **B3** `queries/projects.ts` → `updateProject(id, { name })`,
      `deleteProject(id)`. (Phase F.)
- [ ] **B4** `queries/brands.ts` → `updateBrand(id, { name?, description? })`,
      `deleteBrand(id)`. (Phase F.)
- [ ] **B5** `queries/workspaces.ts` → `updateWorkspace(id, { name })`. (Phase F.)
- [ ] **B6** Export all from `packages/db/src/index.ts`.

**Notes.** Both read queries need raw `sql` fragments; keep them in
`drizzle-orm`'s `sql` template with the mapper converting snake_case to the
shared type in `mappers.ts`, matching how existing rows are mapped. `::int` on
the counts matters — Postgres `count()` returns `bigint`, which `pg` hands back
as a **string**, and the zod schemas expect numbers.

**Done when:** `pnpm -F @brandfactory/db typecheck` clean. Query-level tests are
live-DB-gated in this package (`describe.skipIf(!process.env.DATABASE_URL)`),
so correctness is proven by the Phase B7 tests below plus the Phase C route
tests against fakes.

- [ ] **B7** Extend `packages/db/src/seed.ts` — the current seed creates one
      project and no agent messages, so the workspace home renders nearly empty
      against a fresh dev DB. Add a second brand, a second project, and two
      `agent_messages` rows under fixed UUIDs (`…-0006` onward), all with
      `onConflictDoNothing({ target: <table>.id })` so idempotency and the
      stable dev token are preserved. Update `seed.test.ts` row-count
      assertions.

---

### Phase C — Server routes

- [ ] **C1** `routes/brands.ts` — widen `GET /workspaces/:workspaceId/brands` to
      return `BrandSummary[]` via `listBrandSummariesByWorkspace`. Same
      precedent as the Phase-7 Step-0 `GET /projects/:id` → `ProjectDetail`
      widening: additive fields, existing consumers unaffected.
- [ ] **C2** `routes/projects.ts` — new
      `GET /workspaces/:workspaceId/projects?limit=` → `ProjectSummary[]`.
      Guarded by `requireWorkspaceAccess`. `limit` validated as
      `z.coerce.number().int().min(1).max(50).default(10)`. Mounted on the
      workspace-scoped router.
- [ ] **C3** Extend `packages/server/src/db.ts` `Db` interface + `buildDbDeps()`
      with every new helper, and `createFakeDbState` / the fake in
      `test-helpers.ts` with in-memory equivalents. The fakes must implement the
      real ordering and counting semantics — that is where the route tests get
      their teeth.
- [ ] **C4** `routes/workspaces.ts` — `PATCH /workspaces/:id`. (Phase F.)
- [ ] **C5** `routes/brands.ts` — `PATCH /brands/:id`, `DELETE /brands/:id`.
      (Phase F.)
- [ ] **C6** `routes/projects.ts` — `PATCH /projects/:id`, `DELETE /projects/:id`.
      (Phase F.)

**Tests** (`packages/server/src/routes/*.test.ts`, existing `createTestApp`
pattern) — target **+10** for C1–C3:

- `GET /workspaces/:id/brands` returns counts (brand with 2 sections + 1 project
  reports `2`/`1`); a brand with neither reports `0`/`0`.
- `GET /workspaces/:id/brands` 403s for a non-owner (regression guard on the
  widened route).
- `GET /workspaces/:id/projects` returns projects across *multiple* brands in
  the workspace — the property the per-brand endpoint cannot provide.
- ordering is by `lastActivityAt` descending, with a project whose only activity
  is an agent message sorting above a newer-but-idle project.
- `limit` caps the result set; invalid `limit` 400s.
- 403 for a non-owner; 404 for an unknown workspace.
- empty workspace returns `[]`, not 404.

---

### Phase D — App shell

- [ ] **D1** Add shadcn primitives: `components/ui/dropdown-menu.tsx` and
      `components/ui/alert-dialog.tsx` (the latter for Phase F). New deps:
      `@radix-ui/react-dropdown-menu`, `@radix-ui/react-alert-dialog`. No
      tooltip dep — the completeness dots use a plain `title` plus an
      `aria-label`.
- [ ] **D2** `src/lib/workspace-context.ts` — resolves the active workspace id
      from router state (`useParams` across the workspace/brand/project routes,
      with brand and project routes reading it out of their loaded entity), with
      `getLastWorkspaceId()` as the fallback. One hook, `useActiveWorkspaceId()`,
      so every consumer agrees.
- [ ] **D3** `components/WorkspaceSwitcher.tsx` — replaces `WorkspacePicker` in
      `routes/__root.tsx:16`. `DropdownMenu` with checked current workspace,
      `New workspace…`, `Workspace settings`. Writes `setLastWorkspaceId` on
      switch and navigates to `/workspaces/$wsId`.
- [ ] **D4** `components/NewWorkspaceDialog.tsx` — lift the dialog out of
      `routes/workspaces.index.tsx:23` verbatim so both the switcher and the
      first-run screen mount the same component.
- [ ] **D5** `components/Breadcrumbs.tsx` — renders the brand/project tail from
      a small typed context each route populates. Delete the ad-hoc back-links
      in `workspaces.$wsId.index.tsx`, `brands.$brandId.tsx` and
      `projects.$projectId.tsx`.
- [ ] **D6** `routes/index.tsx` — replace the blind
      `throw redirect({ to: '/workspaces' })` with the resolution order in
      *Workspace resolution at `/`* above. Requires a `loader` that fetches the
      workspace list (React Query cache, so it is free on subsequent visits).
- [ ] **D7** `routes/workspaces.index.tsx` — strip to the first-run screen:
      redirect to a workspace when one exists, otherwise render a proper
      onboarding panel (what a workspace is, what a brand is, one primary
      action). The card grid and `WorkspaceCard` are deleted.
- [ ] **D8** `routes/__root.tsx` — wordmark links to the active workspace;
      header composes switcher + breadcrumbs + theme toggle.

**Tests** — target **+8**: `useActiveWorkspaceId` resolution order (route wins
over storage; stale storage id not in the list is discarded; empty list yields
null), `WorkspaceSwitcher` renders the list with the current one checked and
navigates on select, `Breadcrumbs` renders brand-only and brand+project tails.

---

### Phase E — Workspace home and brand hub

- [ ] **E1** `api/queries/workspaces.ts` — retype `useWorkspaceBrands` to
      `BrandSummary[]`; add `useWorkspaceProjects(wsId, limit)` against the new
      C2 endpoint. Add `workspaceKeys.projects(wsId)`.
- [ ] **E2** `api/queries/projects.ts` — add `useCreateProject(brandId)`
      (`POST /brands/:brandId/projects`, freeform), invalidating
      `brandKeys.projects(brandId)` and `workspaceKeys.projects(wsId)`.
- [ ] **E3** `components/brand/BrandCard.tsx` — name, description,
      `GuidelineMeter`, project count, click-through to the hub.
- [ ] **E4** `components/brand/GuidelineMeter.tsx` — D2's dot row. Muted only,
      `aria-label="{n} of {total} guideline sections"`, zero-state renders all
      hollow with no error styling.
- [ ] **E5** `components/project/ProjectCard.tsx` — name, brand name (shown only
      in workspace-level contexts), relative last-activity, kind badge. One
      component serves both the recent-work strip and the brand hub grid.
- [ ] **E6** `lib/relative-time.ts` — `Intl.RelativeTimeFormat` wrapper
      ("2h ago", "yesterday"). No date library.
- [ ] **E7** `routes/workspaces.$wsId.index.tsx` — rebuilt as the workspace
      home: header (name, `+ Brand`), brands grid, **Recent work** strip.
      Empty states: no brands → onboarding copy plus the primary action; brands
      but no projects → "Open a brand to start a project."
- [ ] **E8** `routes/brands.$brandId.tsx` — becomes the brand hub. Identity
      header (name, description), then a **Projects** section (grid +
      `New project` dialog, freeform-only), then the existing guidelines editor
      moved below under its own heading. `BrandEditorForm` is relocated
      unchanged — including the `key={brand.id}` remount guard and the
      `Cmd-S` handler.
- [ ] **E9** `components/project/NewProjectDialog.tsx` — name field only;
      on success navigates straight into `/projects/$projectId`. The whole point
      of the phase: creating a project drops you on the canvas.

**Tests** — target **+12**: `GuidelineMeter` (filled/total rendering, zero
state, accessible label, count clamped when sections exceed the suggested
total), `ProjectCard` (brand name shown/hidden by context, relative time,
kind badge), `relative-time` (a few boundaries incl. future timestamps),
`NewProjectDialog` (disabled until named, navigates on success, error toast).

---

### Phase F — Rename and delete *(droppable)*

Implements D3. Backend tasks B3–B5 and C4–C6 land here alongside their UI.

- [ ] **F1** `EntityMenu` — a shared `DropdownMenu` (⋯) mounted on brand cards,
      project cards, and both hub headers. Items: `Rename`, `Delete`.
- [ ] **F2** `RenameDialog` — one dialog parameterised by resource. Brand
      variant also edits description.
- [ ] **F3** `DeleteBrandDialog` — `AlertDialog` requiring the brand name typed
      to confirm, with an explicit count of what cascades
      ("This deletes 4 projects and everything on their canvases").
- [ ] **F4** `DeleteProjectDialog` — plain `AlertDialog` confirm.
- [ ] **F5** Workspace rename from the switcher's `Workspace settings` page.
- [ ] **F6** Cache invalidation: brand mutations touch
      `workspaceKeys.brands` + `brandKeys.detail`; project mutations touch
      `brandKeys.projects` + `workspaceKeys.projects`. Deleting the entity you
      are currently viewing navigates up one level.

**Tests** — target **+10**: authz (403 non-owner) and 404 cases on all five new
endpoints, brand delete cascades projects, typed-name confirmation gates the
destructive button.

---

### Phase G — Mission Systems CI visual pass

Runs **last**, so it styles settled screens rather than moving targets.

- [ ] **G1** Invoke the `frontend:apply-mission-systems-ci` skill and follow its
      instructions — Satoshi, brand accent, semantic palette, type scale,
      density, and the bundled product-styleguide components.
- [ ] **G2** Apply across the new surfaces first (header, workspace home, brand
      hub, cards, dialogs), then the pre-existing ones (login, settings,
      split-screen) so the app is visually coherent end to end.
- [ ] **G3** Verify with the Playwright CLI against the skill's reference
      screenshots, per its instructions. Check both light and dark — the theme
      toggle from Phase-7 Step 14 must survive the palette change.
- [ ] **G4** Re-run the frontend component tests; class-name assertions in
      `BlockChrome.test.tsx` and friends may need updating.

---

## Verification

Run at every phase boundary, and all of it before calling the phase done:

```
pnpm typecheck                          # 9/9 workspaces
pnpm lint
pnpm format:check
pnpm test                               # 234 → ~274 expected
pnpm --filter @brandfactory/web build
```

Manual smoke against a seeded dev DB (`db:migrate` → `db:seed` → `pnpm dev`,
paste the printed dev token into `/login`):

1. Land after login without ever seeing a workspace grid.
2. Switch workspaces from the nav; the breadcrumb and page follow.
3. Recent work lists projects from more than one brand, newest activity first.
4. Create a brand → land on its hub → create a project → land on the canvas.
5. Send an agent message, go back to the workspace home, confirm that project
   has jumped to the top of Recent work (this is the D1 payoff and the one
   behaviour no unit test proves end to end).
6. Reload on a deep link (`/brands/:id`) — the switcher shows the right
   workspace, sourced from the route rather than storage.

## Estimated test growth

| Phase | Tests |
| --- | --- |
| B (seed) | +1 |
| C (routes) | +10 |
| D (shell) | +8 |
| E (screens) | +12 |
| F (rename/delete) | +10 |
| **Total** | **+41** → ~275 |

## Risks and watch-items

- **`bigint` counts.** `count()` comes back from `pg` as a string. Without
  `::int` the zod parse fails at the route boundary, not in the query — cast in
  SQL, and let a route test catch it.
- **`greatest()` with nulls.** `greatest()` in Postgres ignores nulls, but the
  `coalesce` fallbacks are kept explicit so the intent survives a future edit.
- **Widening `GET /workspaces/:id/brands` is a wire change.** Additive only, but
  `useWorkspaceBrands` is typed `Brand[]` today; retype in the same commit as
  C1 to avoid a window where the types lie.
- **Deleting the brand-grid page removes the only "New workspace" entry point.**
  D3 and D4 must land in the same commit as D7.
- **Phase G may churn component tests.** Keep class-name assertions out of new
  tests written in D–F; assert on roles, labels, and disabled state instead
  (the convention Phase-7 Step 15 already established).
