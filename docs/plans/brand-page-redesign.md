# Redesign the Brand page: brand hub → mini-apps → threads

## Context

Today `packages/web/src/routes/brands.$brandId.tsx` (433 lines) renders the brand
page as **a giant inline guidelines CRUD editor with a thin, empty "Projects"
strip on top**. The implicit message is "you're here to edit brand settings" —
but the vision (`docs/vision.md`) says the brand page should be where you *do*
creative work, with guidelines as the ambient background context every surface
inherits.

The target model (from the user) is a three-level hierarchy:

**Brand → mini-app → thread**

- **Brand page = a hub.** Guidelines become an ambient, demoted **brand context
  bar** (collapsible to an icon-only rail). The main real estate is a grid of
  **mini-app tiles**.
- **Mini-app = a category workspace** (Copywriting, Visual identity, Social
  calendar, Open canvas). Opening one shows **all past threads of that kind** for
  the brand, so you can resume an old one or start a new one.
- **Thread = the v0-style split screen** (chat left, canvas right) where the
  agent's creative suggestions land in the **canvas**, and chat is just the
  steering conversation.

**Key finding — most of this already exists.** Two Explore passes confirmed:

1. **Standardized projects already work end-to-end.** `shared`
   (`CreateStandardizedProjectInputSchema`, discriminated `CreateProjectInput`),
   `server` (`POST /brands/:brandId/projects` branches on `kind` and persists
   `templateId`), and `db` (`projects.template_id` column + migration + mappers)
   all handle it. `ProjectSummary` already carries `kind` + `templateId` on the
   wire, and `useBrandProjects` already receives them — the web just ignores
   them. **No template registry exists**, so `'copywriting'` is a magic string we
   choose. The *only* web-layer gap is `useCreateProject` hardcoding
   `kind: 'freeform'`.
2. **The thread already behaves as described.** `applyAgentEvent`
   (`packages/web/src/realtime/applyAgentEvent.ts`) is the hard routing seam:
   `message` events → chat (`ChatPane`), `canvas-op`/`pin-op` events → canvas
   (`CanvasPane`). Canvas ops come from the agent calling `add_canvas_block`, and
   the system prompt (`packages/agent/src/prompts/system-prompt.ts`) already
   instructs the model to route ideas into the canvas tool, not chat prose. So
   the existing `/projects/$projectId` route **is** the thread.

**Therefore this pass is entirely in `packages/web`** — no `shared`/`server`/`db`
changes. We add two UI layers (hub + mini-app) on top of working machinery and
reuse `/projects/$projectId` unchanged as the thread.

**Scope for this pass:** ship **Copywriting** as the first live mini-app + an
**Open canvas** (freeform) mini-app that houses ad-hoc/legacy threads; Visual
identity and Social calendar appear as tiles marked "Soon" (they're one registry
line away from live, but bespoke UIs like a real calendar are follow-ups).

## What exists that we reuse (do not rebuild)

- **Thread surface:** `routes/projects.$projectId.tsx` (SplitScreen + ChatPane +
  CanvasPane) — unchanged. Agent→canvas routing via `applyAgentEvent` — unchanged.
- **Create:** `useCreateProject(brandId, workspaceId)` in
  `packages/web/src/api/queries/projects.ts` — generalize to pass an optional
  `templateId` (see below). Hono RPC client is already typed for the standardized
  branch.
- **List:** `useBrandProjects(brandId)` → `ProjectSummary[]` (already carries
  `kind` + `templateId`) — filter client-side per mini-app.
- **Cards:** `ProjectCard.tsx` for threads; established tile pattern
  `group relative flex flex-col rounded-lg border bg-card p-4 shadow-sm
  transition-colors hover:bg-accent` for mini-app tiles.
- **Brand data / guidelines:** `useBrand`, `useUpdateBrandGuidelines`,
  `BrandGuidelineSection { id, label, body: ProseMirrorDoc, priority, ... }`,
  `SUGGESTED_SECTIONS`, `GuidelineMeter.tsx`.
- **Identity header:** `EntityMenu`, `RenameDialog`, `DeleteBrandDialog` — kept.
- **UI primitives** (`components/ui/`): `Button`, `Card`, `Dialog`, `Input`,
  `Label`, `DropdownMenu`. No Tabs/Collapsible/Accordion/Sheet/Tooltip — the
  context-bar collapse and icon rail are hand-rolled (consistent with
  `SplitScreen.tsx` / the cards, all hand-rolled).
- **Icons:** `lucide-react`. **Accent budget:** brand green only on
  `bg-primary`/focus/links; tiles + chips use neutral `bg-card` + `hover:bg-accent`.

## Design

### A. Mini-app registry — `components/brand/miniApps.ts` (new)

Tiny declarative table so tiles, routing, filtering, and create all stay DRY:

```ts
type MiniApp = {
  id: string                 // 'copywriting' | 'visual' | 'social' | 'freeform'
  title: string
  description: string
  icon: LucideIcon
  create: { kind: 'freeform' } | { kind: 'standardized'; templateId: string }
  match: (p: ProjectSummary) => boolean   // which threads belong here
  enabled: boolean           // false → tile shows "Soon", route shows stub
}
```

Entries: **copywriting** (`PenLine`, standardized/`'copywriting'`, enabled),
**visual** (`Palette`, standardized/`'visual'`, `enabled: false`), **social**
(`CalendarDays`, standardized/`'social'`, `enabled: false`), **freeform**
(`Sparkles`, freeform, matches `kind==='freeform'`, enabled — the natural home
for ad-hoc + pre-existing threads).

### B. Brand page rewrite — `routes/brands.$brandId.tsx`

Thin orchestrator, keeping the `flex-1 overflow-auto p-6` container:

1. **Identity header** (slimmed): name, description, `EntityMenu` (rename/delete
   dialogs kept verbatim).
2. **Brand context bar** — see C.
3. **Workspace** section: heading + a grid
   (`grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3`) of **mini-app
   tiles** from the registry. Each tile = icon + title + description + a thread
   count (derived from `useBrandProjects` filtered by `match`); enabled tiles
   `<Link>` to the mini-app route, disabled tiles show a muted "Soon" pill and
   don't navigate.

Loading/error states preserved. Replaces today's flat "Projects" list — threads
now live one level down, inside mini-apps.

### C. Brand context bar — `components/brand/BrandContextBar.tsx` (new)

The demoted guidelines, horizontal, directly under the header.

- Header row: "Brand context" label + `GuidelineMeter` + collapse toggle
  (chevron) + an **"Edit"** button.
- **Expanded:** a horizontal, wrapping row of section chips (icon + label).
  Clicking a chip reveals that section's body in a read-only panel below the bar
  (TipTap `useEditor` with `editable: false` + `EditorContent`, reusing
  `defaultExtensions` from `editor/proseMirrorSchema`).
- **Collapsed:** the same row condensed to **icon-only** buttons (labels hidden,
  native `title=` for the name). Clicking still expands the read panel.
- Icon map — `components/brand/guidelineIcons.ts` (new): Target audience→`Users`,
  Voice & tone→`MessageCircle`, Values & positioning→`Compass`, Visual
  guidelines→`Palette`, Messaging frameworks→`MessageSquareText`, fallback
  `FileText`.
- Empty state: slim "Add brand context" prompt that opens the editor dialog.
- **Editing** stays full-powered but off the main canvas: the existing
  `BrandEditorForm` + `SectionRow` (drag reorder, quick-add, `Cmd-S`,
  `useUpdateBrandGuidelines`) move **verbatim** into
  `components/brand/BrandGuidelinesEditor.tsx`, wrapped in
  `components/brand/EditGuidelinesDialog.tsx` (uses `Dialog`), opened by the
  bar's "Edit" button. One save path, no behaviour change. (Inline per-section
  editing is a deliberate follow-up.)

### D. Mini-app route — `routes/brands.$brandId.apps.$appId.tsx` (new)

URL `/brands/$brandId/apps/$appId`. Resolves the registry entry by `appId`.

- Breadcrumb trail: Brand › <mini-app title> (via `useBreadcrumbTrail`).
- Header: title + description + **"New thread"** button.
- Thread grid: `useBrandProjects(brandId)` filtered by `app.match`, rendered with
  `ProjectCard`. Empty state invites "Start your first <title> thread."
- **New thread** → create a project via the generalized hook using `app.create`
  (Copywriting → `{ kind:'standardized', templateId:'copywriting' }`; Open canvas
  → `{ kind:'freeform' }`), then navigate to `/projects/$projectId` (the existing
  thread canvas). Reuse a small name dialog (like `NewProjectDialog`) so the user
  names the thread on creation.
- Disabled mini-app (`enabled:false`): render a brief "Coming soon" stub instead
  of the thread list.
- Register the route in the route tree next to where `brandEditorRoute` is added
  (locate the file that calls `rootRoute.addChildren`).

### E. Generalize project creation — `api/queries/projects.ts`

Change `useCreateProject`'s mutate variable from `string` to
`{ name: string; templateId?: string }` and build the `json` body as freeform
when `templateId` is absent, standardized when present. Update the one existing
caller `NewProjectDialog.tsx` (`.mutate(name)` → `.mutate({ name })`) and its test
`NewProjectDialog.test.tsx` accordingly. (Alternative: keep `useCreateProject`
untouched and add a sibling `useCreateThread` — decide during impl; the object
signature is cleaner and has a single caller.)

## Files

- **Rewrite:** `routes/brands.$brandId.tsx`
- **New:** `routes/brands.$brandId.apps.$appId.tsx` (+ register in the route tree)
- **New:** `components/brand/miniApps.ts`
- **New:** `components/brand/BrandContextBar.tsx`
- **New:** `components/brand/guidelineIcons.ts`
- **New:** `components/brand/BrandGuidelinesEditor.tsx` (extracted, verbatim logic)
- **New:** `components/brand/EditGuidelinesDialog.tsx`
- **Edit:** `api/queries/projects.ts` (generalize create), `NewProjectDialog.tsx`
  (+ its test) for the new mutate signature
- **Reused unchanged:** `projects.$projectId.tsx` (thread), `applyAgentEvent`,
  `ChatPane`, `CanvasPane`, `ProjectCard`, `EntityMenu`, `RenameDialog`,
  `DeleteBrandDialog`, `GuidelineMeter`, all `ui/` primitives.

No `shared` / `server` / `db` / `agent` changes.

## Verification

- `pnpm -F @brandfactory/web typecheck` / `lint` / `build` — clean
- `pnpm -F @brandfactory/web test` — existing suite green (update
  `NewProjectDialog.test.tsx` for the new mutate signature; add light coverage for
  the context-bar collapse toggle and a mini-app tile's thread-count/enabled
  logic)
- **Manual (dev app, open a brand):**
  1. Context bar shows section chips; collapse toggle → icon-only rail and back;
     clicking a chip/icon expands its content read-only; "Edit" opens the dialog
     and add/reorder/quick-add/`Cmd-S` still save.
  2. Workspace shows mini-app tiles with correct thread counts; "Soon" tiles are
     inert; Copywriting + Open canvas navigate to their mini-app.
  3. Mini-app lists only its threads; "New thread" creates a project (Copywriting
     tagged `templateId:'copywriting'`) and lands on the split-screen thread.
  4. In a copywriting thread, ask the agent for taglines → suggestions appear as
     **canvas blocks**, conversation stays in chat (confirms the existing seam;
     if ideas leak into chat, note it — prompt-tightening is a follow-up, not
     plumbing).
  5. Dark mode + accent budget: tiles/chips neutral hover, green only on primary
     CTA/focus.
- Optional visual pass via `frontend:apply-mission-systems-ci` once laid out.

## Explicit follow-ups (not this pass)

- Bespoke **Social calendar** UI (calendar view, drag-drop scheduling) — flip its
  registry `enabled` and build the custom surface.
- Per-mini-app **agent tuning** (copywriting- vs visual-specific system prompt /
  starter blocks) — the agent runs with generic brand context for now.
- Optional: a shared `TEMPLATE_ID` constant + DB CHECK constraint instead of the
  `'copywriting'` magic string; a server-side thread filter for efficiency.
- Optional inline per-section editing in the context bar.
