# Brand context capture — implementation plan

Status: **Phases A–G done; H skipped by decision** (332 → 400 tests;
[A](../completions/brand-context-capture-phase-a.md),
[B](../completions/brand-context-capture-phase-b.md),
[C](../completions/brand-context-capture-phase-c.md),
[D](../completions/brand-context-capture-phase-d.md),
[E](../completions/brand-context-capture-phase-e.md),
[F](../completions/brand-context-capture-phase-f.md),
[G](../completions/brand-context-capture-phase-g.md),
[H](../completions/brand-context-capture-phase-h.md)) — **feature-complete and
unit-covered; shipped without the live pass.** The feature is walkable end-to-end
in a brand-context thread, which was the planned cut line; it captures excerpts
as well as whole messages, and from any thread. **D was not cut**: its named risk
(the affordance clearing its own selection) is real and is handled by preventing
the mousedown default. **G ran as a reconciliation**, not a writing phase — A, B,
E and F had already paid sixteen of its seventeen items; the seventeenth (11)
was hiding a StrictMode double-insert, now fixed.

**H did not run.** On 2026-07-28 the live pass was deliberately deferred to
production and the release shipped without it. The no-skips test gate is met by
CI (Postgres 16 sidecar) rather than locally; the thirteen-step browser walk is
**unobserved**, including the one step the plan called the whole point — that the
next agent turn reflects a captured section. The full unverified list, the ground
on which the decision was defensible (no migration, no schema change, so rollback
is image-only), and the rollback procedure are in
[Phase H](../completions/brand-context-capture-phase-h.md). That file, not this
header, is the honest description of the feature's verified state.
The **gap between B and F is closed**: a brand-context thread renders no canvas,
and since F1 the agent is given no tools to write to the one it has server-side.
Source sketch:
[`docs/plans/brand-context-capture.md`](../plans/brand-context-capture.md).
Per-phase write-ups land in [`docs/completions/`](../completions/) as
`brand-context-capture-phase-{a…h}.md`, one file per phase (repo convention).

## Goal

Give a brand a **recorded conversation** you can think out loud in, sitting next
to the live brand context, and a **manual gesture** that promotes any message —
yours or the agent's — into a guideline section.

The agent never writes. It talks; you curate.

## The load-bearing mechanism

A chat message is markdown text (`agent_messages.content` is `text`). A
guideline body is a `ProseMirrorDoc`. The bridge is **the drop itself**: the
bubble writes rendered HTML into `dataTransfer`, and a TipTap editor parses it
through its own schema. Nothing outside the editor ever authors a ProseMirror
doc, so `packages/shared`'s "ProseMirror-validity is enforced by the editor, not
the wire contract" invariant (`packages/shared/src/json.ts:22-25`) survives
untouched, and `updateBrandGuidelines` gains no second caller.

**Everything else in this plan is downstream of that one idea.** If a task ever
seems to want a markdown→ProseMirror converter, it is the wrong task.

---

## Facts verified against the codebase (2026-07-27)

Each was confirmed by reading the file. They are load-bearing — most of the
corrections below fall out of them.

**Chat & persistence (nothing to build)**

- `POST /projects/:id/agent` persists the **user** turn before streaming
  (`packages/server/src/routes/agent.ts:88-93`) and the **assistant** turn in
  `onClose` (`:143-150`). Both roles are already durable.
- `routes/agent.ts:81` calls `deps.db.listSectionsByBrand(brand.id)` fresh on
  **every** turn. A section captured mid-conversation is in the next turn's
  system prompt with zero wiring. This is the loop closing, for free.
- `useAgentChat` writes streamed messages into `projectKeys.detail(projectId)`
  via `applyAgentEvent` (`packages/web/src/agent/useAgentChat.ts:113`), so a
  just-streamed reply is in `data.recentMessages` and draggable immediately.

**Types**

- `ProjectDetailSchema` is `z.intersection(ProjectSchema, {…})`
  (`packages/shared/src/project/detail.ts:8`), and `ProjectSchema` is the
  `kind`-discriminated union. So `data.kind === 'standardized' && data.templateId
  === 'brand-context'` narrows correctly in the route — **no API change**.
- `ProjectDetail.brand` is a full `BrandWithSections`, so the right pane can
  render the live guidelines editor with no extra fetch.
- `MiniApp.id` is a **closed union**, `'copywriting' | 'visual' | 'social' |
  'freeform'` (`miniApps.ts:14`). Adding a row means widening it.

**Rendering**

- **User bubbles are not markdown-rendered.** `ChatPane.tsx:109` renders
  `<div className="whitespace-pre-wrap">{message.content}</div>`; only the
  assistant branch (`:111-113`) goes through `ReactMarkdown`. See Correction 3.
- `defaultExtensions` is `StarterKit` with headings restricted to h1–h3
  (`packages/web/src/editor/proseMirrorSchema.ts:7-11`) — the node vocabulary a
  drop is coerced into.

**Caches**

- `useUpdateBrandGuidelines.onSuccess` writes **only**
  `brandKeys.detail(brandId)` (`api/queries/brands.ts:41-45`). It does not touch
  `projectKeys.detail`. See Correction 4.
- `api/queries/projects.ts:10` imports `brandKeys` from `brands.ts`. A reverse
  import would be a cycle.

**Agent**

- `buildSystemPrompt(brand)` takes **one argument** and always appends a
  "Canvas awareness" block instructing the model to call `add_canvas_block`
  (`packages/agent/src/prompts/system-prompt.ts:44-51`).
- `streamResponse` always builds canvas tools (`packages/agent/src/stream.ts:56`)
  and its input has no `templateId` (`:22-32`). See **Correction 6** — this is
  the one finding that changes the shape of the plan.

**Tests that will break** (inventory, so no one is surprised)

- `miniApps.test.ts` → `thread-count derivation › counts each mini-app tile`
  asserts an exact 4-key object (`{copywriting: 2, visual: 1, social: 0,
  freeform: 2}`). Adding the `context` row requires a `context: 0` key.
- `miniApps.test.ts` → `a freeform thread never matches a standardized mini-app`
  loops `MINI_APPS`; the new row is standardized, so it is covered automatically
  and should stay passing without edits (a useful signal that `match` narrows on
  `kind` first).
- No other existing test enumerates `MINI_APPS` by length.

---

## Corrections to the source plan

Made during grounding. Each is a place the sketch was under-specified or, in one
case, materially wrong.

### 1. `MiniApp.id` widening

`'context'` joins the union. Mechanical, but it is the compile error the first
task will hit.

### 2. `/brands/$brandId/apps/context` is reachable today

`miniAppById` (`miniApps.ts:64`) resolves by id with no surface check, and
`miniAppRoute` renders whatever it returns. Once the row exists, that URL renders
a "Brand context" mini-app page — a **second, unintended surface** for the
conversation list, and exactly the "it's a peer tile after all" framing Phase A
exists to prevent.

Fix: export a derived `TILE_APPS = MINI_APPS.filter(a => a.surface === 'tile')`.
The hub grid maps `TILE_APPS`; `miniAppRoute` redirects a non-tile app to
`/brands/$brandId/context`. Classification stays one list; display is a derived
view of it.

### 3. `text/html` from a user bubble would silently lose line breaks

The plan says the bubble writes "the rendered bubble's `innerHTML`". For an
assistant bubble that is real HTML from `ReactMarkdown`. For a **user** bubble it
is escaped plain text whose newlines are rendered by CSS (`whitespace-pre-wrap`)
— HTML parsing collapses them, so a multi-line user message would drop as one
run-on paragraph.

Fix: **user messages set `text/plain` only.** ProseMirror splits plain text into
paragraphs on newlines natively. Assistant messages set both flavors. This is
strictly better than the alternative (hand-building `<p>` tags), because it
writes no HTML anywhere — the no-converter invariant stays clean.

### 4. Saving guidelines from inside a thread leaves the project cache stale

New in Phase B: the guidelines editor now lives on the project route, fed by
`ProjectDetail.brand`. `useUpdateBrandGuidelines` only repoints
`brandKeys.detail`, so after a save `projectKeys.detail(projectId).brand.sections`
still holds the pre-save list. The visible editor is fine (it reseeds from the
mutation response), but any refetch of the project detail — React Query's default
window-focus refetch will do it — resurfaces stale sections beside a correct
editor. Exactly the 1.4.0 **I1** bug class, one layer out.

Fix: `useUpdateBrandGuidelines.onSuccess` also patches every cached project
detail belonging to this brand, via `setQueriesData` on a `['projects']` key
predicate. **Do not import `projectKeys` into `brands.ts`** — `projects.ts`
already imports `brandKeys`, so that is an import cycle. Use the literal key
prefix with a comment saying why.

### 5. "Content lands at the drop position" is not testable in jsdom

ProseMirror's drop handling needs `posAtCoords`, real layout, and a real
`DragEvent` — none of which jsdom provides. A unit test asserting drop position
would either be testing our own mock or be quietly disabled.

Honest split:

- **Unit-testable:** the `dataTransfer` contract on drag start, the insert path
  (`editor.commands.insertContentAt`), local-state mutation on a new-section
  capture, and *no mutation fires until Save*.
- **Live pass only (H):** that a real drag lands at the cursor rather than
  appending.

Stated here so the Phase G write-up does not have to claim more than it verified.
jsdom also has **no `DataTransfer` constructor** — tests hand-roll a
`{ setData, getData, types }` stub and pass it to `fireEvent.dragStart`.

### 6. Phase F is not optional, and it is not server-free

**This is the finding that changes the plan.**

`streamResponse` builds canvas tools unconditionally (`stream.ts:56`) and the
system prompt tells the model to use them (`system-prompt.ts:44-51`). A
brand-context thread renders the **guidelines editor** on the right, not the
canvas. So if the agent calls `add_canvas_block` in a brand-context thread, the
block is persisted, broadcast on the realtime bus, and **rendered nowhere** —
work that silently vanishes. That is a correctness defect, not a missing persona.

Two consequences:

- Phase F is **promoted from "optional, cuttable" to required**, and reframed:
  its job is first to *stop the agent reaching for a canvas that isn't there*,
  and second to give it an interview tilt.
- `templateId` has to reach `streamResponse`, which means **one line in
  `packages/server/src/routes/agent.ts`**. The sketch's "`packages/server` is
  untouched" claim therefore does not survive. `packages/shared` and
  `packages/db` still are — no migration, no new table, no new route, no second
  caller of the destructive write. The load-bearing invariant is intact; only the
  "web-only" framing was too strong.

Alternative considered and rejected: render the canvas *and* the editor in a
brand-context thread. It contradicts Phase B's whole point and makes the right
pane a tab strip.

---

## Phases

Each phase leaves the repo green (`pnpm typecheck` + `pnpm test`) at its
boundary, and lands its own `docs/completions/` file.

### Phase A — registry row + conversation surface

Make the brand conversation exist as a classified-but-hidden thread type, and
give it two entry points on the brand context bar.

**A1 — registry.** `packages/web/src/components/brand/miniApps.ts`

- Widen `MiniApp['id']` with `'context'`.
- Add `surface: 'tile' | 'hidden'` to the `MiniApp` type. Every existing row
  gets `surface: 'tile'` explicitly (no default — a default is how the two halves
  drift apart).
- Add the row:
  ```ts
  {
    id: 'context',
    title: 'Brand context',
    description: 'Talk the brand out. Capture what lands.',
    icon: MessagesSquare,
    create: { kind: 'standardized', templateId: 'brand-context' },
    match: (p) => p.kind === 'standardized' && p.templateId === 'brand-context',
    enabled: true,
    surface: 'hidden',
  }
  ```
  `match` narrows on `p.kind` **before** touching `templateId` — required for
  both correctness and TypeScript (`templateId` exists only on the standardized
  union member).
- Export `export const TILE_APPS = MINI_APPS.filter((a) => a.surface === 'tile')`.
- Amend the header comment: a mini-app is no longer necessarily "a category
  workspace on the brand hub". State the split — the registry is the single
  source of truth for **classification**, `surface` decides **display**, and
  `isOrphanThread` deliberately consults every row so a hidden thread is never
  filed under "we don't know what this is".

**A2 — hub grid.** `packages/web/src/routes/brands.$brandId.tsx:78` maps
`TILE_APPS` instead of `MINI_APPS`. The orphan catch-all (`:42`) keeps calling
`isOrphanThread`, unchanged.

**A3 — close the `/apps/context` hole** (Correction 2).
`brands.$brandId.apps.$appId.tsx`: after `miniAppById`, if the app resolves but
`app.surface !== 'tile'`, `redirect` to `/brands/$brandId/context`. Keep the
existing unknown-app branch for a genuinely unregistered id.

**A4 — conversation list route.** New
`packages/web/src/routes/brands.$brandId.context.tsx`, modelled on the mini-app
page (`brands.$brandId.apps.$appId.tsx`) but at a path that is not under
`/apps/`:

- `useBrand` + `useBrandProjects`; collapse both into one
  `listPending` / `listError` pair — the 1.4.0 **I2** lesson, do not re-introduce
  a page that renders blank on a failed brand query.
- Filter threads with the `context` row's `match`.
- `NewProjectDialog` with `templateId="brand-context"`, `title="New
  conversation"`, trigger label "New conversation".
- Breadcrumb: `{ brand, leaf: { name: 'Brand context' } }` — the `leaf` slot,
  same as a mini-app; a conversation list has no entity id of its own.
- Empty state that reads as an invitation, not an error.

**A5 — register the route.** `packages/web/src/router.tsx` — import
`brandContextRoute` and add it to `rootRoute.addChildren([...])`. **Do this in
the same commit as A4**, not later: TanStack Router types `Link` against the
registered tree, so A6's typed `<Link to="/brands/$brandId/context">` cannot
compile until the route is registered. (This is precisely the correction 1.4.0
had to make mid-execution between its phases E and F.)

**A6 — two entry points.** `packages/web/src/components/brand/BrandContextBar.tsx`

- A chat icon button beside "Edit" (`:115`) linking to
  `/brands/$brandId/context`. Requires a new `brandId` prop — read it off
  `brand.id`, which the component already has. Neutral styling: the bar is
  ambient context, the accent budget is not spent here.
- On the empty state (`:89`), a second CTA — "…or talk it through" — next to
  "Add brand context". This is the intended first-run path for a brand that
  starts as a rough idea.

**A7 — fix the count test** (`miniApps.test.ts`, `thread-count derivation`): add
`context: 0` to the expected object. Add a case asserting `TILE_APPS` excludes
`context` **and** `isOrphanThread(brandContextThread) === false` — the two halves
of the `surface: 'hidden'` split, in one test, because they are the pair most
likely to drift.

**Green at boundary:** conversations can be created and listed; the hub shows no
new tile; nothing is draggable yet.

---

### Phase B — the brand-context thread surface

Put the guidelines where you can drop into them.

**B1 — branch the right pane.** `packages/web/src/routes/projects.$projectId.tsx:48`

```ts
const isBrandContext = data.kind === 'standardized' && data.templateId === 'brand-context'
```

`right={isBrandContext ? <BrandContextPane brand={data.brand} /> : <CanvasPane …/>}`.
Left pane (`ChatPane`) is unchanged in every case.

Extract the literal `'brand-context'` into a single exported constant in
`miniApps.ts` (e.g. `BRAND_CONTEXT_TEMPLATE_ID`) and use it in both the registry
row and here, so the magic string exists once. (Not the repo-wide shared
`TEMPLATE_ID` map — that stays a deferred follow-up from 1.4.0.)

**B2 — `BrandContextPane`.** A thin wrapper, colocated in
`components/brand/BrandContextPane.tsx`:

- Header strip matching `CanvasPane`'s (`border-b p-3 text-sm font-medium`),
  labelled "Brand context".
- `<div className="flex-1 overflow-y-auto p-4">` around
  `<BrandGuidelinesEditor key={brand.id} brand={brand} />`. The `key` preserves
  the remount-on-brand-switch idiom the editor's local-state seeding depends on
  — the same reason `EditGuidelinesDialog` carries it.
- **Do not** add a second Save button or a second `Cmd-S` handler. The editor
  owns both. Duplicating the save path is the mistake `EditGuidelinesDialog`
  already declined to make.

**B3 — cache coherence** (Correction 4). In
`packages/web/src/api/queries/brands.ts`, extend
`useUpdateBrandGuidelines.onSuccess` to also patch cached project details for
this brand:

```ts
// Literal key prefix, not `projectKeys` — projects.ts already imports
// brandKeys, so importing back would be a cycle.
queryClient.setQueriesData<ProjectDetail>({ queryKey: ['projects'] }, (old) =>
  old && old.brand.id === brandId ? { ...old, brand: { ...old.brand, sections } } : old,
)
```

Guard the predicate against non-detail `['projects', id, 'blocks' | 'messages']`
entries, whose shape is an array, not a `ProjectDetail`.

**B4 — layout sanity.** The editor was built for a dialog and a full-width page;
in a ~64% pane its section rows (grab handle + label + body + trash, `flex gap-3`)
must not overflow. Verify at the narrowest split (`MIN_LEFT_PCT = 25`, so the
right pane is at most 75% and at least 35% of the viewport).

**B5 — note, do not act.** The canvas still exists server-side for these threads
(every project gets one at creation). We simply don't render it. Cheaper than
making canvas creation conditional, and it keeps the thread convertible later.
Record this in the completion doc so it isn't rediscovered as a bug.

**Green at boundary:** a brand-context thread shows chat + live guidelines side
by side, both fully functional; no capture gesture yet.

---

### Phase C — drag a message into brand context

The gesture. This is the shippable core; D and E are additive.

**C1 — `MessageCapture.tsx`.** New,
`packages/web/src/components/project/MessageCapture.tsx`. Owns the capture
affordances so `ChatPane` stays a chat component:

- `buildCaptureTransfer(message, renderedEl)` — a small exported helper returning
  `{ html?: string; text: string }`:
  - assistant → `html = renderedEl.innerHTML`, `text = message.content`
  - user → `text = message.content` only, **no html** (Correction 3)
  It writes nothing to the DOM and is directly unit-testable.
- `<CaptureHandle>` — a visible grab handle, appearing on bubble hover/focus,
  `draggable`, whose `onDragStart` calls `setData('text/html', …)` (when present)
  and `setData('text/plain', …)`, and sets `effectAllowed = 'copy'`.
  - The **handle** carries the drag, not the bubble, so text selection inside
    the bubble still works — Phase D depends on this.
  - Rendered for **both roles**, and must not be styled as an agent-only
    affordance.
  - Keyboard-reachable (it is a real `<button>`); its click path is C4.

**C2 — wire into `ChatPane`.** `MessageBubble` (`ChatPane.tsx:96`) gains a ref on
its rendered content div and renders `<CaptureHandle>`. Bubbles stay
`max-w-[85%]`; the handle sits in the gutter so it never reflows the text.

**C3 — drop targets in `BrandGuidelinesEditor`.**

- **Existing sections:** each `SectionRow`'s TipTap editor is *already* a drop
  target. Add only a visible affordance — a highlighted border on `dragover`,
  cleared on `dragleave`/`drop` — so it reads as one. **Do not override
  ProseMirror's drop handling.** Content lands where the cursor is; precision is
  the point.
- **New section:** a `+ Drop here for a new section` target below the list.
  Dropping appends `blankSection()` and stages the dropped payload for insertion,
  so capturing a brand-new aspect doesn't require creating an empty section
  first.
- **Insert path.** `SectionRow` gains an optional `pendingInsert?: {html?, text}`
  prop; on mount (or when it changes) it calls
  `editor.commands.insertContent(html ?? text)` and then clears it via a
  callback. This is the imperative path Phase E reuses. Parsing happens inside a
  live editor instance — **no converter is written**.
- **Nothing saves.** Dropped content lands in local state, exactly like typing.
  You edit the label, trim the body, then Save. Capture is a *draft* gesture,
  which is what makes it safe to be one-handed.

**C4 — the non-drag path.** A "Send to brand context" action on each bubble
(dropdown or inline button), targeting the same insert points. Trackpad drags
across a split screen are miserable, and drag-only is not keyboard-reachable. In
a brand-context thread it inserts into the visible editor; in any other thread it
opens the dialog (Phase E).

**C5 — dnd-kit coexistence check.** The editor's section reordering uses dnd-kit
`PointerSensor` (pointer events); capture uses the **HTML5 drag-and-drop API**
(drag events). They are separate event streams and do not conflict — but verify
that dragging a message over a `SectionRow` does not start a dnd-kit sort, and
that dnd-kit's `activationConstraint: { distance: 8 }` still reorders normally.
Note the result either way; a plausible-sounding conflict that turns out not to
exist is worth recording.

**Green at boundary:** the feature is walkable end-to-end in a brand-context
thread. This is the natural cut line if the pass has to stop early.

---

### Phase D — excerpt capture (cuttable)

Whole-message capture over-captures: agent replies are chatty and the good line
is usually one sentence.

**D1** — On text selection inside a bubble, show a small floating "Add to brand
context" affordance anchored to the selection.

**D2** — It produces the same two flavors as C1 — `text/html` from the
selection's `Range.cloneContents()` serialized, `text/plain` from
`selection.toString()` — and reuses the C3 insert path **verbatim**. If it
doesn't reuse it verbatim, the shapes have diverged and one of them is wrong.

**D3** — Native selection-drag already yields `text/html` in most browsers, so
dragging a selection works as a bonus. The floating affordance is the reliable
path; do not fight the browser to make the drag primary.

**Cut criterion:** if selection tracking fights the browser (selection cleared by
the affordance's own focus, ranges spanning bubbles, mobile), cut D and ship C.
Record the reason.

---

### Phase E — capture from any thread

The gesture lives on `MessageBubble`, so it already exists in Copywriting and
Open canvas threads. What those threads lack is a visible drop target — their
right pane is the canvas.

**E1** — `EditGuidelinesDialog` gains `staged?: { html?: string; text: string }`,
threaded to `BrandGuidelinesEditor`.

**E2** — `BrandGuidelinesEditor` gains the same prop: when `staged` is present at
mount, append a `blankSection()` and hand it to that row as `pendingInsert` (the
C3 path). The user names the section and saves.

**E3** — In a non-brand-context thread, C4's "Send to brand context" opens the
dialog with the content staged. The project route already has `data.brand` as a
`BrandWithSections`, so the dialog needs no new fetch.

**E4** — Same editor, same save, same sole-writer invariant. If this phase ever
seems to need a second caller of `PATCH /brands/:id/guidelines`, stop — it
doesn't.

This is the vision's "promoting ideas directly out of projects"
(`docs/vision.md:28`), and it is about a prop and a dialog.

---

### Phase F — brand-context agent behaviour (**required** — see Correction 6)

Two jobs, in priority order. The first is a correctness fix.

**F1 — stop the agent reaching for a canvas that isn't rendered.**

- `StreamResponseInput` gains `templateId?: string`
  (`packages/agent/src/stream.ts:22`).
- In `run()`, when `templateId === 'brand-context'`, pass **no canvas tools** to
  `streamText` and **omit the canvas-context block** from the system string.
  Otherwise behaviour is byte-identical to today.
- `packages/server/src/routes/agent.ts` passes
  `templateId: project.kind === 'standardized' ? project.templateId : undefined`
  into `streamResponse` (~one line). This is the only server change in the pass.

**F2 — the interview persona.** `buildSystemPrompt(brand, opts?: { templateId?:
string })`. Default output stays **byte-identical** — pin that with a test. For
`'brand-context'`, replace the "Canvas awareness" block with a persona:

- interview to develop thinking, one sharp question at a time
- probe ("who is this really for?", "what would you never say?")
- reflect back a crisp articulation when an aspect settles, rather than dumping
  options
- explicitly: you have no canvas and no tools; you write nothing to the brand —
  the user captures what lands

**F3 — the honest framing.** The agent still writes nothing. A persona is not a
capability, and removing tools is the opposite of granting one. But note in the
completion doc: **the agent phrasing well is what makes capture worth doing.** If
its replies are three paragraphs of hedging, there is nothing crisp to grab.

---

### Phase G — tests

Target: **+25–35**, on top of 332. Mutation-check the load-bearing ones per house
habit (break the behaviour, confirm the test fails, restore).

**Registry / hub**
1. `context.match` claims only `standardized/brand-context`; partition invariant
   over the mixed fixture still holds (unregistered templates stay unclaimed).
2. A brand-context thread **is not an orphan** and **does not appear in
   `TILE_APPS`** — one test, both halves.
3. `thread-count derivation` updated for the `context: 0` key.
4. `miniAppRoute` redirects a `surface: 'hidden'` app id; an unregistered id
   still hits the unknown-app branch.

**Routes**
5. `brands.$brandId.context` renders its thread list, its empty state, and a
   **failed brand query** as an error — not a blank page (the 1.4.0 I2
   regression).
6. `projects.$projectId` renders `BrandContextPane` for a brand-context project
   and `CanvasPane` for every other kind (freeform, and standardized under
   another template).

**Capture**
7. `buildCaptureTransfer`: assistant → both flavors; **user → `text/plain` only**
   (Correction 3). Pure function, no DOM.
8. `onDragStart` calls `setData` with what `buildCaptureTransfer` returned, for
   both roles. jsdom has no `DataTransfer` — hand-roll a
   `{ setData, getData, types }` stub and pass it to `fireEvent.dragStart`.
9. Dropping on the new-section target appends exactly one section to local state
   and stages the payload on it.
10. **A drop fires no mutation.** The invariant that keeps capture one-handed:
    assert `useUpdateBrandGuidelines`'s mutate is never called until Save.
11. `pendingInsert` reaches `editor.commands.insertContent` and is cleared after.
12. Mutation-check: strip the `text/html` flavor and confirm the drop **degrades
    to plain text** rather than silently capturing nothing.

**Cross-thread**
13. "Send to brand context" from a Copywriting thread opens
    `EditGuidelinesDialog` with the content staged into a new section.

**Cache**
14. `useUpdateBrandGuidelines` patches a cached `ProjectDetail` whose
    `brand.id` matches, and leaves other brands' details alone.

**Agent**
15. `buildSystemPrompt(brand)` with no options is **byte-identical** to today —
    a snapshot-style equality, so F2 cannot regress every other thread.
16. `templateId: 'brand-context'` swaps the canvas block for the persona.
17. `streamResponse` passes **no tools** for `'brand-context'` and the full tool
    set otherwise.

**Explicitly not unit-tested** (Correction 5): that a real drag lands at the
cursor rather than appending. jsdom cannot express it; it moves to H.

No new `db` / `server` / `shared` tests — `db` and `shared` don't change, and the
server change is a single pass-through argument covered by 17.

---

### Phase H — verification and live pass

Repo-root gates first: `pnpm typecheck` / `pnpm lint` / `pnpm format:check` /
`pnpm test` (with `DATABASE_URL` set — **no skips**) / `pnpm build`.

Then a live browser pass. This one **needs a configured LLM provider**
(`OPENROUTER_API_KEY`). 1.4.0 closed with the agent path unexercised and named it
the standing gap; **this pass closes it.** If the key is unavailable, say so
plainly in the completion doc and list exactly which steps went unverified —
do not mark the phase done.

Walk, in order:

1. **Persistence.** Start a Brand context conversation from the context bar.
   Talk for a few turns. Close the tab, reopen — the full transcript is there.
2. **Drag, both roles.** An **agent** message into an existing section; one of
   **your own** into the new-section target. Both land as editable content.
3. **Position** (Correction 5's live-only claim). Content lands at the cursor,
   not appended at the end.
4. **Formatting survives.** A bulleted agent reply drops as a real list, not one
   paragraph of asterisks. An `h4` or a table is coerced by the schema, not
   crashed on.
5. **Nothing is written until Save.** Navigate away with a staged drop — it
   discards, like any unsaved edit.
6. **The loop closes.** After saving, the **next agent turn reflects the captured
   context** (free via `routes/agent.ts:81`). This is the whole point of the
   feature; if only one step is verified, make it this one.
7. **No phantom canvas.** In a brand-context thread the agent never announces
   adding a block, and no orphaned canvas block appears in the DB for that
   project (Correction 6 / F1).
8. **Cross-thread.** Capture from a Copywriting thread reaches the same place.
9. **Siblings survive.** Other sections are intact after every save — the
   destructive-write regression, still worth eyeballing even though no new caller
   exists.
10. **Both halves of the hidden split.** The hub shows **no Brand context tile**,
    and the conversation does **not** appear under "Other threads".
11. **`/brands/$brandId/apps/context`** redirects rather than rendering a second
    surface (Correction 2).
12. **Cache coherence.** Save guidelines inside a thread, switch tabs and back
    (triggering a refetch) — the sections do not revert (Correction 4).
13. **Both themes**, accent budget respected (bar and rail stay neutral), zero
    console errors.

---

## Files

**New**
| Path | Phase |
| --- | --- |
| `packages/web/src/components/project/MessageCapture.tsx` | C (+ D) |
| `packages/web/src/components/brand/BrandContextPane.tsx` | B |
| `packages/web/src/routes/brands.$brandId.context.tsx` | A |
| tests alongside each | G |

**Edit**
| Path | Phase | What |
| --- | --- | --- |
| `components/brand/miniApps.ts` | A, B | `context` row, `surface`, `TILE_APPS`, `BRAND_CONTEXT_TEMPLATE_ID`, header comment |
| `routes/brands.$brandId.tsx` | A | grid maps `TILE_APPS` |
| `routes/brands.$brandId.apps.$appId.tsx` | A | redirect hidden apps |
| `router.tsx` | A | register the context route |
| `components/brand/BrandContextBar.tsx` | A | two entry points, `brandId` prop |
| `routes/projects.$projectId.tsx` | B | right-pane branch |
| `api/queries/brands.ts` | B | project-detail cache patch |
| `components/brand/BrandGuidelinesEditor.tsx` | C, E | drop affordance, new-section target, `pendingInsert`, `staged` |
| `components/brand/EditGuidelinesDialog.tsx` | E | `staged` passthrough |
| `components/project/ChatPane.tsx` | C | capture handle on bubbles |
| `packages/agent/src/stream.ts` | F | `templateId`, conditional tools/context |
| `packages/agent/src/prompts/system-prompt.ts` | F | `opts.templateId` persona |
| `packages/server/src/routes/agent.ts` | F | pass `templateId` (one line) |
| `components/brand/miniApps.test.ts` | A | `context: 0`, split assertions |

**Untouched:** `packages/shared`, `packages/db`.
**No migration. No new tables. No new API routes. No second caller of
`updateBrandGuidelines`.**

---

## Non-goals (this pass)

Carried from the source plan, unchanged.

- **No agent-authored sections.** The agent proposes nothing and writes nothing.
  If that ever reverses, the superseded interview draft is in git history.
- **No auto-capture or "this looks quotable" hinting** — it re-introduces the
  model's judgment into the one place this design deliberately removed it.
- **No canvas → brand context capture.** Messages only. Canvas blocks are the
  obvious next surface and the insert path generalizes.
- **No per-section provenance** ("captured from thread X"). `guideline_sections`
  has no column for it and this plan touches no migration. `createdBy: 'agent'`
  stays unused here — every section is user-authored, because you moved it by
  hand.
- **No "captured" marker on the bubble.** No id links a message to a section, so
  a marker could only ever mean "you once dragged this" and would go stale the
  first time the section is rewritten. Double-capture costs two seconds; a lying
  marker costs trust.
- **No delete-via-chat, and no undo** beyond the editor's own unsaved state.
- **No server-side template filtering** of threads — client-side, per the 1.4.0
  non-goal.
- **No repo-wide `TEMPLATE_ID` constant or DB `CHECK`.** Still deferred; B1's
  single web-side constant is the interim, `isOrphanThread` remains the net.

---

## Risks

| Risk | Where | Mitigation |
| --- | --- | --- |
| Agent writes invisible canvas blocks in a brand-context thread | F1 | Promoted F to required; H7 verifies against the DB |
| ProseMirror drop fights the visible affordance (`dragover` styling swallowing the event) | C3 | Style only; never `preventDefault` the drop on the editor itself |
| Multi-line user message drops as one paragraph | C1 | `text/plain` only for user role (Correction 3) |
| Guidelines revert after a refetch inside a thread | B3 | Project-detail cache patch; H12 verifies |
| A second brand-context surface at `/apps/context` | A3 | `TILE_APPS` + redirect; G4 + H11 |
| dnd-kit sort and HTML5 drag interfering | C5 | Explicit check, result recorded either way |
| Live pass deferred again for want of a provider key | H | Blocking: mark the phase incomplete and name the unverified steps rather than claiming green |

---

## Open questions

1. **Does the conversation list deserve its own breadcrumb identity**, or should
   `/brands/$brandId/context` be a modal over the hub? Planned as a route (A4)
   because conversations are durable, linkable, and renameable. Revisit only if
   the route feels like a detour in the live pass.
2. **Should a captured section default its label** from the first heading in the
   dropped content, or stay blank? Planned blank — guessing a label is the
   model's judgment creeping back in through a side door, and the user is already
   in the editor. Cheap to change after C is walkable.
