# Brand Context Capture: a recorded brand conversation you promote from by hand

## Context

Today the only way to build a brand's **Brand Context** (its guideline sections)
is manual entry: open `EditGuidelinesDialog` → `BrandGuidelinesEditor`, type a
section's label + rich-text body into a TipTap list, save. It's a form. It
assumes you already know the answer and just need to record it.

That's the wrong assumption for the hardest part of branding — *figuring out what
the brand actually is*. The vision (`docs/vision.md:28`) says brands "arrive fully
defined" or "start as rough ideas, where most of the guidelines are blank or
tentative," and that the guidelines layer "can be filled in gradually as the
brand takes shape — **often by promoting ideas directly out of projects**." We
have the "record it" path. We're missing the "help me think it through" path, and
we have never built the promotion gesture the vision names.

**The feature:** a **brand-level conversation** that is fully recorded — every
message from both sides, persisted, revisitable, exactly like the ChatGPT web app
— sitting next to the live brand context. You talk the brand out. When something
in the transcript is *right*, you **grab it and drop it into Brand Context**
yourself. Yours or the agent's, whole message or highlighted excerpt.

The agent never writes. It talks; **you** curate.

### What this replaces, and why

An earlier draft of this plan (`brand-context-interview.md`, superseded by this
file) had the agent propose structured guideline sections through a tool call,
gated behind an approve/decline card with a before/after diff. Everything about
it was downstream of one decision: *the agent authors the section*.

Dropping that decision deletes the entire apparatus — the `propose_guideline`
tool, a new `AgentEvent` union member, a client-held ephemeral transcript, a
two-phase propose→apply round trip, a per-brand concurrency guard, a diff
renderer, a markdown→ProseMirror converter, and a second caller of a destructive
DB write. It also deletes **both hazards** that draft was organized around (see
"The two hazards are gone" below).

What's left is the part that was always the point: a conversation with brand
context loaded, and a way to make a good line canonical.

### Decisions locked in with the user

- **The agent proposes nothing and writes nothing.** No tool, no gate, no diff.
- **The conversation is persisted**, not ephemeral — threads and messages, both
  roles, revisitable later. (The prior draft's ephemerality existed only to make
  the confirm gate cheap; with no gate, there's no reason not to record.)
- **Capture is a manual gesture**: grab-and-drop a message into a block that
  becomes part of Brand Context.
- **Both roles are capturable** — your own messages as much as the agent's. Often
  the sharpest articulation of a brand is the founder's own offhand sentence.
- **Capture works from any thread, not just the brand conversation** — a tagline
  that lands in a Copywriting thread should reach canon without a detour. This is
  the vision's "promoting ideas directly out of projects," and it costs nothing
  extra once the gesture exists.

## What already exists (verified — do not rebuild)

The "proper chat interface, incl. on the backend" is **already built**. It is
project-scoped, and in this repo a **thread *is* a project** (the 1.4.0 mini-app
model: brand → category tile → threads carrying a `templateId`).

| Piece | Where | State |
| --- | --- | --- |
| Message table | `agent_messages(id, project_id, role, content, user_id, created_at)`, `packages/db/src/schema/agent_messages.ts` | ships; indexed on `(project_id, created_at)` |
| Read history | `listAgentMessages`, `GET /projects/:id/messages` (`routes/messages.ts`) | ships |
| Write + stream | `POST /projects/:id/agent` — SSE via `streamResponseToSse`, **persists both roles** | ships |
| History in the UI | `ProjectDetail.recentMessages` (`routes/projects.ts:103-117`), rendered by `ChatPane` with markdown bubbles | ships |
| Thread list / create | mini-app pages, `NewProjectDialog`, `useCreateProject({ name, templateId? })` | ships (1.4.0 Phase A) |
| Brand context in the prompt | `buildSystemPrompt` renders sections into every turn | ships |

Two consequences worth stating explicitly:

- **Nothing new is needed for conversations.** No table, no migration, no route.
  The chat backend the pivot asks for is the one 0.7.x/1.4.0 already shipped.
- **A promotion is live on the very next turn, for free.** `routes/agent.ts:80`
  calls `listSectionsByBrand` fresh on *every* turn, so a section you capture
  mid-conversation is in the system prompt of the next message with zero wiring.

Also reused unchanged: `ProjectDetail.brand` is already a full
`BrandWithSections` (`packages/shared/src/project/detail.ts:15`), so the split
screen can render the live guidelines with **no API change at all**;
`BrandGuidelinesEditor` holds every section in local state and saves the complete
list through the one existing `PATCH /brands/:id/guidelines` caller;
`defaultExtensions` (`StarterKit`, headings restricted to h1–h3) is the node
vocabulary; `SplitScreen`, `TopBar`, `useAgentChat`, `iconForSection`,
`GuidelineMeter`, `BrandContextBar`, `EditGuidelinesDialog`.

## The mechanism: the editor stays the only writer

This is the load-bearing idea of the whole plan.

A chat message is **markdown text** (`agent_messages.content` is `text`). A
guideline body is a **`ProseMirrorDoc`**. Something has to bridge them — and the
previous draft put that bridge on the server, which is what made it expensive.

Put the bridge in the drop instead:

1. The message bubble already renders its markdown to HTML via `ReactMarkdown`.
2. On drag start, the bubble writes that rendered HTML into `dataTransfer` as
   **`text/html`** (with the raw text as a `text/plain` fallback).
3. The drop target is a **TipTap editor instance**. ProseMirror parses dropped
   HTML *through the editor's own schema* — so headings, lists, bold and italic
   arrive as real nodes, and anything outside `defaultExtensions` (an h4, a
   table) is coerced or dropped **by the schema itself**, not by a converter we'd
   have to write and keep honest.
4. Saving is the existing editor save: full local list → `PATCH
   /brands/:id/guidelines`.

So capture never leaves the client, and **the editor remains the sole writer of
ProseMirror docs and the sole caller of the guidelines write.**

### The two hazards are gone

The previous draft was built around two hazards. Both were consequences of
writing sections from outside the editor, and both evaporate:

1. **`updateBrandGuidelines` is destructive.** It deletes every section id absent
   from the payload (the 1.4.0 I3 fix). Its docstring's safety argument
   (`packages/db/src/queries/brands.ts:193-199`) is literally *"The sole caller is
   `PATCH /brands/:id/guidelines`, which forwards the editor's full list."* The
   old plan added a second caller and needed a read-merge-write helper
   (`applyGuidelineUpsert`) plus an amended docstring to stay safe. **This plan
   adds no caller.** The sentence stays true, unamended, and the anti-wipe
   invariant needs no new test.
2. **Nothing converts prose to a ProseMirror doc.** `ProseMirrorDoc = JsonValue`
   with the comment "ProseMirror-validity is enforced by the editor, not the wire
   contract" (`packages/shared/src/json.ts:22-25`) — an invariant that holds
   *because the editor is the only writer*. The old plan's Phase A built a
   `markdownToProseMirror` pair and put it on the critical path, accepting a lossy
   round trip. **This plan writes no converter**; the drop is parsed by the
   editor, so the invariant is preserved rather than worked around.

Net: `packages/shared`, `packages/db`, and `packages/server` are **untouched**,
except for one optional prompt tweak in `packages/agent` (Phase F, cuttable).

## Design

Delivered as phases, each keeping the repo green at its boundary — house style,
matching `docs/plans/brand-page-redesign.md`. Per the repo convention, each phase
lands with its own file in `docs/completions/`.

### Phase A — the conversation surface, hung off the context bar (not a tile)

**Brand context is not a mini-app.** The Workspace grid advertises *categories of
creative work* — Copywriting, Visual identity, Social calendar, Open canvas. The
brand conversation is not a fifth one of those; it is the thing every one of them
reads from. Putting it in the grid would frame it as a peer and tell a first-time
user to start with Copywriting, which is exactly the "re-explain the brand every
time" failure the vision opens with.

So it hangs off the **brand context bar**, next to the guidelines it feeds:

- A **chat icon button** in `BrandContextBar.tsx` beside "Edit" (`:115`) —
  editing and talking are the two ways to build context, and they belong
  together.
- A second CTA on the **empty state** (`:89`, currently just "Add brand
  context") — "…or **talk it through**". This is the intended first-run path for
  a brand that starts as a rough idea.

**Underneath, a conversation is still a project** with `templateId:
'brand-context'` — that is what buys persistence, history, thread list, rename
and delete for free. Only the *presentation* changes: no tile, no grid slot.

That split has one consequence that must not be missed. `isOrphanThread`
(`miniApps.ts:73`) treats any thread whose `templateId` no registry row matches
as orphaned, and the hub renders those under an **"Other threads" catch-all**
(the 1.4.0 J4 fix). A brand-context thread that the registry doesn't know would
land there — reachable, but filed under "we don't know what this is."

So the registry stays the **single source of truth for template classification**,
and gains a presentation flag rather than losing the row:

```
id: 'context' | title: 'Brand context' | icon: MessagesSquare
create: { kind: 'standardized', templateId: 'brand-context' }
match:  (p) => p.kind === 'standardized' && p.templateId === 'brand-context'
enabled: true
surface: 'hidden'          // ← new field; every existing row is 'tile'
```

The hub grid filters on `surface === 'tile'`; `isOrphanThread` keeps consulting
every row. Classification and display stay one list, which is what prevents this
bug class rather than re-introducing it under a new name. Update the registry's
header comment — it currently defines a mini-app as "a category workspace on the
brand hub," which a hidden row contradicts.

`match` narrows on `p.kind` **before** touching `templateId`, per the registry's
own comment (it exists only on the standardized union member).

**Where past conversations live:** the icon opens `/brands/$brandId/context` — a
list of this brand's conversations plus "New conversation." It is the mini-app
page's shape at a path that isn't under `/apps/`, since it isn't one. Resist
having the icon silently create or resume a thread: implicit creation on a nav
click leaves stray empty threads, and "resume the most recent" is wrong the first
time you want a fresh line of thinking.

### Phase B — the brand-context thread surface

`packages/web/src/routes/projects.$projectId.tsx` currently hardcodes
`right={<CanvasPane .../>}`. Branch it: when the project is
`kind === 'standardized' && templateId === 'brand-context'`, render the **live
guidelines editor** on the right instead of the canvas.

- Left: `ChatPane` — unchanged, already persisted, already brand-aware.
- Right: `BrandGuidelinesEditor` fed by `data.brand` (already a
  `BrandWithSections`). Keep its own Save button and `Cmd-S`; do not duplicate
  the save path (the same reason `EditGuidelinesDialog` doesn't).

This is the vision's split-screen workspace with **guidelines as the canvas** —
and it is what makes drag-and-drop possible at all, since you cannot drop into a
target you cannot see.

Note the canvas still exists for these threads server-side (every project gets
one at creation); we simply don't render it. Cheaper and less risky than making
canvas creation conditional, and it keeps the thread convertible later.

### Phase C — drag a message into Brand Context

The gesture, in `ChatPane`'s `MessageBubble`:

- `draggable`, with `onDragStart` writing `text/html` (the rendered bubble's
  `innerHTML`) and `text/plain` (`message.content`).
- A visible **grab handle** on hover — discoverability; a bubble that happens to
  be draggable is a feature nobody finds. The handle carries the drag, so text
  selection inside the bubble still works (Phase D depends on that).
- Works for **both roles** — the same component renders both, so this is free,
  but the handle must not be styled as an agent-only affordance.

In `BrandGuidelinesEditor`:

- Each `SectionRow`'s editor is already a drop target by virtue of being TipTap;
  add a visible **drop affordance** (highlighted border on `dragover`) so it
  reads as one. **Keep ProseMirror's native insert-at-the-drop-position
  behaviour** — content lands where the cursor is, not appended at the end. Do
  not override it; precision is the point, and fighting PM's drop handling buys
  nothing. (A section *header* that always appends is a possible convenience
  later; it is not part of this pass.)
- A **"+ Drop here for a new section"** target below the list: dropping there
  appends a `blankSection()` and inserts the content, so capturing a brand-new
  aspect doesn't require creating an empty section first.
- Dropped content lands **unsaved**, in local state, exactly like typing. You
  edit the label, trim the body, then Save. Capture is a *draft* gesture, which
  is what makes it safe to be one-handed.

Also a **keyboard/click path**: a "Send to Brand Context" item on each bubble, so
capture isn't drag-only (accessibility, and trackpad drags across a split screen
are miserable). It targets the same insert points.

### Phase D — excerpt capture

Whole-message capture over-captures: agent replies are chatty and the good line
is usually one sentence.

- On text selection inside a bubble, show a small floating **"Add to Brand
  Context"** affordance.
- The selection carries the same two `dataTransfer` flavors, so it reuses the
  Phase C insert path verbatim — `text/html` from the selection's fragment,
  `text/plain` from its string.
- Native selection-drag already produces `text/html` in most browsers; the
  floating affordance is the reliable path and the drag is the bonus.

Cuttable if it fights the browser: Phase C alone is shippable. Everything after
this line is additive.

### Phase E — capture from any thread

The gesture lives on `MessageBubble`, so it already exists in Copywriting and
Open canvas threads. What those threads lack is a **visible drop target** — their
right pane is the canvas.

The path there: "Send to Brand Context" opens `EditGuidelinesDialog` (already a
dialog over any route) with the content **pre-inserted** into a new section, or
into a section you pick. Same editor, same save, same sole-writer invariant.

This is the vision's "promoting ideas directly out of projects," and it is ~a
prop and a dialog.

### Phase F — a brand-context persona (optional, cuttable)

`buildSystemPrompt` is brand-scoped with no per-template variation (1.4.0
deferred per-mini-app agent tuning). A brand-context thread wants a different
tilt: **interview to develop thinking** — one sharp question at a time, probe
("who is this really for?", "what would you never say?"), reflect back a crisp
articulation when an aspect settles rather than dumping options.

Smallest honest version: `buildSystemPrompt(brand, { templateId })` appends a
persona paragraph for `'brand-context'`, default unchanged. The agent still
writes nothing — a persona is not a capability.

Worth stating: **the agent phrasing well is what makes capture worth doing.** If
its replies are three paragraphs of hedging, there is nothing crisp to grab. This
phase is optional to *ship* but it is what makes the feature feel good.

### Phase G — tests

- **registry:** the new `match` narrows correctly; the partition invariant over a
  mixed fixture still holds (existing `miniApps.test.ts` pattern); a
  `brand-context` thread **is not an orphan** *and* **does not render a tile** —
  the two halves of the `surface: 'hidden'` split, and the pair most likely to
  drift apart later.
- **drop position:** content lands at the drop position, not appended — a
  regression test for the behaviour we chose not to override.
- **route branch:** a `brand-context` project renders the guidelines editor and
  not the canvas; every other kind is unchanged.
- **capture:** `onDragStart` sets both `dataTransfer` flavors for both roles;
  dropping appends to the target section's local state and to a new section on
  the new-section target; **a drop does not save** (no mutation fires until Save)
  — the invariant that keeps capture one-handed.
- **cross-thread:** "Send to Brand Context" from a Copywriting thread opens the
  dialog with the content staged.
- **agent** (if Phase F ships): `templateId: 'brand-context'` changes the system
  prompt; absent/other template leaves it byte-identical.
- Mutation-check per house habit: break the `text/html` flavor and confirm the
  drop degrades to plain text rather than silently capturing nothing.

No new db/server/shared tests — those layers don't change.

### Phase H — verification / live pass

Repo-root gates (`pnpm typecheck` / `lint` / `format:check` / `test` / `build`),
then a live browser pass — this one **needs a configured LLM provider**
(`OPENROUTER_API_KEY`); 1.4.0 closed with that same claim unexercised, so it is
the standing gap this pass should finally close.

1. Start a Brand context thread; talk for a few turns; **close it and reopen it**
   — the full transcript is still there (the persistence claim).
2. Drag an **agent** message into an existing section; drag one of **your own**
   into the new-section target. Both land as editable content.
3. Formatting survives: a bulleted agent reply drops as a real list, not one
   paragraph of asterisks.
4. Nothing is written until Save; navigating away discards, as with any edit.
5. After saving, the **next agent turn reflects the captured context** (free via
   `routes/agent.ts:80`) — the loop closing is the whole point.
6. Capture from a Copywriting thread reaches the same place.
7. Sibling sections survive every save (the destructive-write regression, still
   worth eyeballing even though no new caller exists).
8. The hub shows **no Brand context tile**, and the conversation does **not**
   appear under "Other threads" — both halves of the `surface: 'hidden'` split,
   confirmed against a real thread.
9. Both themes; accent budget respected (the bar and rail stay neutral).

## Files

**New**
- `packages/web/src/components/project/MessageCapture.tsx` — the drag handle, the
  selection affordance (D), the "Send to Brand Context" action
- `packages/web/src/routes/brands.$brandId.context.tsx` — the conversation list

**Edit**
- `packages/web/src/components/brand/miniApps.ts` (+ the hidden `context` row,
  `surface` field, amended header comment)
- `packages/web/src/routes/brands.$brandId.tsx` (grid filters `surface === 'tile'`)
- `packages/web/src/components/brand/BrandContextBar.tsx` (two entry points)
- `packages/web/src/components/brand/BrandGuidelinesEditor.tsx` (drop targets,
  new-section drop, an imperative "insert this content" path)
- `packages/web/src/components/project/ChatPane.tsx` (draggable bubbles)
- `packages/web/src/routes/projects.$projectId.tsx` (right-pane branch)
- `packages/agent/src/prompts/system-prompt.ts` (Phase F only)

**Untouched:** `packages/shared`, `packages/db`, `packages/server`.
**No migration. No new tables. No new routes.**

## Non-goals (explicit, this pass)

- **No agent-authored sections.** The agent proposes nothing and writes nothing.
  If that reverses later, the superseded interview draft is in git history.
- **No auto-capture / suggestion of what to capture.** Not even a "this looks
  quotable" hint — it re-introduces the model's judgment into the one place this
  design deliberately removed it.
- **No canvas → Brand Context capture.** Messages only, this pass. Canvas blocks
  are the obvious next surface and the insert path generalizes.
- **No per-section provenance** ("captured from thread X, 12 Mar"). Attractive,
  but `guideline_sections` has no column for it and this plan touches no
  migration. `createdBy: 'agent'` stays unused by this feature — every section
  here is user-authored, because you moved it by hand.
- **No delete-via-chat, and no undo beyond the editor's own unsaved state.**
- **No server-side template filtering** of threads; client-side filter, per the
  1.4.0 non-goal.

## Resolved with the user

1. **No "captured" marker on the bubble.** The drop moves *content* into an
   editor where it is then trimmed, merged and relabelled — no id links a message
   to a section, and creating one means a migration this plan deliberately
   avoids. A marker could therefore only ever mean "you once dragged this," and
   would go stale the first time the section is rewritten. Double-capture costs
   two seconds of deleting duplicate text; a lying marker costs trust.

2. **Drop lands at the cursor.** ProseMirror's native behaviour stands, un-overridden
   (see Phase C).

3. **Not a mini-app tile** — an icon on the brand context bar instead (see
   Phase A). The registry row survives for classification only, `surface:
   'hidden'`.

## Still open

- **Phase F persona** is marked optional. It is the one thing that decides
  whether the agent produces crisp capturable lines or three paragraphs of
  hedging, so "optional" may be the wrong label once the surface is real. Decide
  after Phase C is walkable.
