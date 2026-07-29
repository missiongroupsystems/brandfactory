# Brand page redesign — brand hub → mini-apps → threads

Status: **Phases A–G done; H automated only** — the manual dev-app pass has not
been run. Per-phase write-ups in
[`docs/completions/brand-hub-mini-apps-phase-{a…h}.md`](../completions/); start
with [Phase H](../completions/brand-hub-mini-apps-phase-h.md) for the
verification state and what remains unverified. Source sketch:
[`docs/plans/brand-page-redesign.md`](../plans/brand-page-redesign.md).

Two corrections to the phase plan below, made during execution: the mini-app
**route registration moved from F into E** (a typed `Link` cannot compile before
its route is registered), and **`BreadcrumbTrail` gained a `leaf` slot** in F for
a category that has no entity id.

## Goal

Turn `packages/web/src/routes/brands.$brandId.tsx` from a giant inline
guidelines-CRUD editor with a thin empty "Projects" strip into a **hub** that
matches the three-level model from `docs/vision.md`:

**Brand → mini-app → thread**

- **Brand page = a hub.** Guidelines demote into an ambient, collapsible **brand
  context bar**. The main real estate becomes a grid of **mini-app tiles**.
- **Mini-app = a category workspace** (Copywriting, Visual identity, Social
  calendar, Open canvas). Opening one lists all past threads of that kind and
  offers "New thread".
- **Thread = the existing v0 split-screen** at `/projects/$projectId` — unchanged.

## Scope

This pass is **entirely in `packages/web`**. No `shared` / `server` / `db` /
`agent` changes. The standardized-project machinery already works end-to-end
across those packages (verified below); the only web-layer gap is
`useCreateProject` hardcoding `kind: 'freeform'`.

**Ship live:** **Copywriting** (standardized, `templateId: 'copywriting'`) and
**Open canvas** (freeform — the home for ad-hoc and pre-existing threads).
**Ship as "Soon" tiles:** **Visual identity** and **Social calendar** (one
registry line from live; bespoke UIs are follow-ups).

## Non-goals (explicit follow-ups)

- Bespoke Social-calendar UI (calendar view, drag-drop scheduling).
- Per-mini-app agent tuning (category-specific system prompt / starter blocks).
  The agent runs with generic brand context for now.
- Inline per-section editing in the context bar (editing stays in a dialog).
- A shared `TEMPLATE_ID` constant + DB CHECK constraint, or a server-side thread
  filter. Client-side filtering and the `'copywriting'` magic string are fine
  for this pass.

---

## Facts verified against the codebase (2026-07-23)

These are load-bearing; each was confirmed by reading the file, not assumed.

- **`useCreateProject`** (`api/queries/projects.ts:21`) takes `name: string` and
  posts `{ kind: 'freeform', name }`. Its single caller is `NewProjectDialog`.
- **`NewProjectDialog`** (`components/project/NewProjectDialog.tsx:69`) calls
  `mutation.mutate(name.trim(), …)` and navigates to `/projects/$projectId` on
  success. Its test (`NewProjectDialog.test.tsx:57`) asserts
  `toHaveBeenCalledWith('Campaign', …)` and types the mutate arg as
  `_name: string` (lines 46, 67).
- **`ProjectSummary`** (`shared/src/project/summary.ts`) = `ProjectSchema`
  (a `kind`-discriminated union; `StandardizedProjectSchema` carries
  `templateId: string`) **intersected** with `{ brandName, lastActivityAt }`.
  So `useBrandProjects(brandId)` results already carry `kind` **and**
  `templateId` — the web just ignores them. **Consequence:** `templateId` is
  only present on the `kind === 'standardized'` branch, so `match` predicates
  must narrow on `kind` first (TS will not see `templateId` on a raw
  `ProjectSummary`).
- **Server create branch** exists: `POST /:brandId/projects` validates against
  `CreateProjectInputSchema` (discriminated union of freeform + standardized) and
  persists `templateId`. No web change needed server-side.
- **Route registration** happens in `packages/web/src/router.tsx:12`
  (`rootRoute.addChildren([...])`) — **not** inside a route file. The new
  mini-app route is added to that array and its import line.
- **Guidelines editor logic** (`SectionRow` + `BrandEditorForm`, TipTap + dnd-kit
  + `Cmd-S` + quick-add + `useUpdateBrandGuidelines`) lives **inline** in
  `brands.$brandId.tsx:56-289`. It is self-contained and moves verbatim.
- **No Tabs / Collapsible / Accordion / Sheet / Tooltip primitive** in
  `components/ui/`. Collapse and the icon rail are hand-rolled (consistent with
  `SplitScreen.tsx` and the cards). Available: `Button`, `Card`, `Dialog`,
  `Input`, `Label`, `DropdownMenu`.
- **Accent budget:** brand green only on `bg-primary` / focus / links. Tiles and
  chips use neutral `bg-card` + `hover:bg-accent`.

---

## Phases

Ordered so each phase is independently type-checkable and the app stays green
between phases. Recommended commit boundary after each phase.

### Phase A — Generalize project creation

Foundation the mini-app route depends on. Small, isolated, fully testable.

**A1.** `api/queries/projects.ts` — change `useCreateProject`'s `mutationFn`
variable from `name: string` to `{ name: string; templateId?: string }`. Build
the `json` body:
- `templateId` absent → `{ kind: 'freeform', name }` (unchanged behaviour).
- `templateId` present → `{ kind: 'standardized', name, templateId }`.

Keep the same `onSuccess` invalidations (brand projects, workspace projects,
workspace brands). Update the leading doc comment (drop "Freeform-only for
Phase 9").

**A2.** `components/project/NewProjectDialog.tsx:69` — change
`mutation.mutate(name.trim(), …)` to `mutation.mutate({ name: name.trim() }, …)`.
No other change (this dialog stays freeform; the mini-app route supplies
`templateId` through the same hook).

**A3.** `components/project/NewProjectDialog.test.tsx` — update the mock
signatures and the assertion:
- lines 46, 67: `(_name: string, opts …)` → `(_arg: { name: string }, opts …)`.
- line 57: `toHaveBeenCalledWith('Campaign', …)` →
  `toHaveBeenCalledWith({ name: 'Campaign' }, …)`.

**Gate:** `pnpm -F @brandfactory/web typecheck` + `test` green.

---

### Phase B — Registry + icon maps (pure data, no UI)

**B1.** `components/brand/guidelineIcons.ts` (new) — map section label →
`LucideIcon` with a fallback:
- Target audience → `Users`
- Voice & tone → `MessageCircle`
- Values & positioning → `Compass`
- Visual guidelines → `Palette`
- Messaging frameworks → `MessageSquareText`
- fallback → `FileText`

Export a `iconForSection(label: string): LucideIcon` helper. Match against
`SUGGESTED_SECTIONS` labels; keep the lookup case-insensitive and tolerant of
custom labels (fallback covers them).

**B2.** `components/brand/miniApps.ts` (new) — the declarative table:

```ts
type MiniApp = {
  id: 'copywriting' | 'visual' | 'social' | 'freeform'
  title: string
  description: string
  icon: LucideIcon
  create: { kind: 'freeform' } | { kind: 'standardized'; templateId: string }
  match: (p: ProjectSummary) => boolean   // which threads belong here
  enabled: boolean                        // false → "Soon" tile + stub route
}

export const MINI_APPS: MiniApp[]
export function miniAppById(id: string): MiniApp | undefined
```

Entries:
- **copywriting** — `PenLine`, `create: { kind:'standardized', templateId:'copywriting' }`,
  `match: p => p.kind === 'standardized' && p.templateId === 'copywriting'`,
  `enabled: true`.
- **visual** — `Palette`, standardized/`'visual'`, matching predicate,
  `enabled: false`.
- **social** — `CalendarDays`, standardized/`'social'`, matching predicate,
  `enabled: false`.
- **freeform** — `Sparkles`, `create: { kind:'freeform' }`,
  `match: p => p.kind === 'freeform'`, `enabled: true`. (Open canvas — the home
  for ad-hoc and every pre-existing thread.)

Note the discriminated-union narrowing in each `match` (`p.kind === …` before
touching `p.templateId`) — required for both correctness and TS.

**Gate:** `typecheck` green (no consumers yet).

---

### Phase C — Extract the guidelines editor verbatim

De-risks Phase E by moving working code before rewriting its host, so the rewrite
is pure orchestration.

**C1.** `components/brand/BrandGuidelinesEditor.tsx` (new) — move
`LocalSection`, `EMPTY_DOC`, `toLocal`, `blankSection`, `SectionRow`, and
`BrandEditorForm` out of `brands.$brandId.tsx` **verbatim**. Export
`BrandGuidelinesEditor({ brand }: { brand: BrandWithSections })` (rename of
`BrandEditorForm`, same body). Preserve the `key={brand.id}` remount idiom at the
call site. No logic change — drag reorder, quick-add, `Cmd-S`,
`useUpdateBrandGuidelines`, toasts all move as-is.

**C2.** `components/brand/EditGuidelinesDialog.tsx` (new) — wrap
`BrandGuidelinesEditor` in the `Dialog` primitive. Props:
`{ brand, open, onOpenChange }`. Title "Edit brand context". Render
`<BrandGuidelinesEditor key={brand.id} brand={brand} />` in the content. The
editor already owns its own Save button and `Cmd-S`; the dialog just frames it
(a bottom "Done"/close is enough — do not duplicate the save path).

**Gate:** `typecheck` green. (`brands.$brandId.tsx` still imports the old inline
copy until Phase E; either leave the inline copy for now and delete it in E, or
switch the import here — cleanest is to delete inline in E so the file compiles
throughout. If you extract in C, temporarily import the new module into
`brands.$brandId.tsx` to keep it green.)

---

### Phase D — Brand context bar

**D1.** `components/brand/BrandContextBar.tsx` (new). Props:
`{ brand: BrandWithSections; onEdit: () => void }`.

- **Header row:** "Brand context" label + `GuidelineMeter` + collapse toggle
  (chevron, hand-rolled `useState`) + an **"Edit"** button (`variant="outline"`,
  calls `onEdit`).
- **Expanded:** horizontal wrapping row of section **chips** (icon via
  `iconForSection` + label). Clicking a chip selects it and reveals its body
  below the bar in a **read-only** panel: `useEditor({ extensions:
  defaultExtensions, editable: false, content: section.body })` + `EditorContent`.
  Toggling selection off hides the panel.
- **Collapsed:** the same chips condensed to **icon-only** buttons (label hidden,
  native `title={label}`). Clicking still expands the read panel.
- **Empty state** (no sections): slim "Add brand context" prompt that calls
  `onEdit`.
- **Accent budget:** chips are neutral (`bg-card` / `hover:bg-accent`), no green.

Reuse `defaultExtensions` from `@/editor/proseMirrorSchema`. One read-only editor
instance for the selected section is enough (re-key on selected id so it
refreshes content).

**Gate:** `typecheck` green (still no host until Phase E — can be spot-rendered in
a test).

---

### Phase E — Rewrite the brand page as a hub

**E1.** `routes/brands.$brandId.tsx` — replace `BrandHubPage`'s body (keep the
`flex-1 overflow-auto p-6` container, the `brandEditorRoute` export, `beforeLoad`
auth guard, and `useBreadcrumbTrail`). New layout:

1. **Identity header** (slimmed) — name, description, `EntityMenu`
   (rename/delete). `RenameDialog` + `DeleteBrandDialog` kept **verbatim**,
   including the `projectCount` null-handling comment.
2. **Brand context bar** — `<BrandContextBar brand={brand} onEdit={() =>
   setEditOpen(true)} />` + `<EditGuidelinesDialog brand={brand} open={editOpen}
   onOpenChange={setEditOpen} />`.
3. **Workspace section** — heading "Workspace" + a grid
   (`grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3`) of **mini-app
   tiles** from `MINI_APPS`. Each tile: icon + title + description + a **thread
   count** derived from `useBrandProjects(brandId)` filtered by `app.match`.
   - `enabled` tile → `<Link to="/brands/$brandId/apps/$appId" params={{ brandId,
     appId: app.id }}>` using the established tile class (`group relative flex
     flex-col rounded-lg border bg-card p-4 shadow-sm transition-colors
     hover:bg-accent`).
   - disabled tile → same look, muted "Soon" pill, `aria-disabled`, no navigation.

Delete the old inline `Projects` list and inline guidelines section. Delete the
extracted editor code from this file (now in `components/brand/`). Preserve
loading/error states for both `useBrand` and `useBrandProjects`.

`NewProjectDialog` is no longer used on the brand page (threads are created inside
mini-apps). Leave the component in place — it may still be used elsewhere; grep
before removing (it is imported here today at line 45 — drop that import).

**Gate:** `typecheck` + `lint` + existing `test` green.

---

### Phase F — Mini-app route

**F1.** `routes/brands.$brandId.apps.$appId.tsx` (new). URL
`/brands/$brandId/apps/$appId`.

- Define `miniAppRoute = createRoute({ getParentRoute: () => rootRoute, path:
  '/brands/$brandId/apps/$appId', beforeLoad: auth-guard (copy from
  brandEditorRoute), component: MiniAppPage })`.
- `MiniAppPage`: read `{ brandId, appId }` via `miniAppRoute.useParams()`.
  Resolve `miniAppById(appId)`; if unknown → a simple "Unknown mini-app" state.
- `useBreadcrumbTrail` — Brand › `<app.title>` (needs `useBrand(brandId)` for the
  brand name; follow the trail shape `useBreadcrumbTrail` expects — check its
  signature).
- **Header:** `app.title` + `app.description` + a **"New thread"** button.
- **Disabled app** (`enabled === false`): render a brief "Coming soon" stub
  instead of the list + button.
- **Thread grid:** `useBrandProjects(brandId)` filtered by `app.match`, rendered
  with `ProjectCard` (props: `id, name, kind, brandId, workspaceId,
  lastActivityAt, showBrandName={false}` — `workspaceId` from `useBrand`). Empty
  state: "Start your first `<app.title>` thread."
- **New thread flow:** a small name dialog (model on `NewProjectDialog`, or reuse
  it if the generalized hook makes that clean). On submit call
  `useCreateProject(brandId, workspaceId).mutate({ name, ...(app.create.kind ===
  'standardized' ? { templateId: app.create.templateId } : {}) }, { onSuccess:
  project => navigate({ to: '/projects/$projectId', params: { projectId:
  project.id } }) })`. Copywriting → tagged `templateId: 'copywriting'`; Open
  canvas → freeform.

**F2.** `router.tsx` — import `miniAppRoute` and add it to the
`rootRoute.addChildren([...])` array (next to `brandEditorRoute`).

**Gate:** `typecheck` + `lint` + `build` green.

---

### Phase G — Tests

New/updated coverage (Vitest + Testing Library, matching existing patterns):

- **A3** already updated `NewProjectDialog.test.tsx`.
- **`BrandContextBar`** — collapse toggle switches chips between labelled and
  icon-only; clicking a chip reveals the read-only body; "Edit" fires `onEdit`;
  empty state shows the add prompt.
- **`miniApps`** — `match` predicates: a `standardized/copywriting` summary
  matches copywriting only; a `freeform` summary matches freeform only; a
  `standardized/visual` summary matches visual only. Thread-count derivation from
  a mixed `ProjectSummary[]`.
- **Mini-app tile / route** — enabled tile links; disabled tile is inert and
  shows "Soon"; disabled route renders the stub. (Light — assert the branch, not
  full navigation.)

**Gate:** `pnpm -F @brandfactory/web test` green.

---

### Phase H — Verification

Automated:
```
pnpm -F @brandfactory/web typecheck
pnpm -F @brandfactory/web lint
pnpm -F @brandfactory/web test
pnpm -F @brandfactory/web build
```

Manual (dev app, open a brand):
1. Context bar shows section chips; collapse → icon-only rail and back; clicking
   a chip/icon expands its content read-only; "Edit" opens the dialog and
   add / reorder / quick-add / `Cmd-S` still save.
2. Workspace shows the four mini-app tiles with correct thread counts; "Soon"
   tiles are inert; Copywriting + Open canvas navigate to their mini-app route.
3. Mini-app lists only its own threads; "New thread" creates a project
   (Copywriting tagged `templateId: 'copywriting'`, verify via the persisted
   `kind`/`templateId`) and lands on the split-screen thread.
4. In a copywriting thread, ask for taglines → suggestions land as **canvas
   blocks**, conversation stays in chat (confirms the existing
   `applyAgentEvent` seam; if ideas leak into chat, note it — prompt-tightening
   is a follow-up, not plumbing).
5. Dark mode + accent budget: tiles/chips neutral hover, green only on primary
   CTA / focus / links.

Optional: visual pass via the `frontend:apply-mission-systems-ci` skill once the
layout is in.

---

## File-change summary

| Action | Path |
| --- | --- |
| Rewrite | `routes/brands.$brandId.tsx` |
| New | `routes/brands.$brandId.apps.$appId.tsx` |
| New | `components/brand/miniApps.ts` |
| New | `components/brand/guidelineIcons.ts` |
| New | `components/brand/BrandContextBar.tsx` |
| New | `components/brand/BrandGuidelinesEditor.tsx` (extracted verbatim) |
| New | `components/brand/EditGuidelinesDialog.tsx` |
| Edit | `api/queries/projects.ts` (generalize `useCreateProject`) |
| Edit | `components/project/NewProjectDialog.tsx` (+ `.test.tsx`) |
| Edit | `router.tsx` (register mini-app route) |
| New tests | `BrandContextBar.test.tsx`, `miniApps.test.ts`, mini-app route/tile |
| Reused unchanged | `projects.$projectId.tsx`, `applyAgentEvent`, `ChatPane`, `CanvasPane`, `ProjectCard`, `EntityMenu`, `RenameDialog`, `DeleteBrandDialog`, `GuidelineMeter`, all `ui/` primitives |

No `shared` / `server` / `db` / `agent` changes.
