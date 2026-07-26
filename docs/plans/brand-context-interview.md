# Brand Context Interview: a "chat-to-refine" agent that writes structured guidelines

## Context

Today the only way to build a brand's **Brand Context** (its guideline sections)
is manual entry: open `EditGuidelinesDialog` → `BrandGuidelinesEditor`, type a
section's label + rich-text body into a TipTap list, save. It's a form. It
assumes you already know the answer and just need to record it.

That's the wrong assumption for the hardest part of branding — *figuring out what
the brand actually is*. The vision (`docs/vision.md`) says brands "arrive fully
defined" or "start as rough ideas, where most of the guidelines are blank or
tentative," and that the guidelines layer "can be filled in gradually as the
brand takes shape — often by promoting ideas directly out of projects." We have
the "record it" path. We're missing the "help me think it through" path.

**The feature:** an **interview-style agent** attached to the Brand Context
section. You have an open-ended, Socratic conversation — the agent probes ("who
is this really for?", "what would you never say?"), you go back and forth, and
**as an aspect of the brand settles, the agent captures it as a properly
structured guideline section** and files it into the brand context. No form, no
transcription — the loose thinking becomes canonical context as a side effect of
the conversation.

### The mental model: Claude's memory system

The user's anchor for the behaviour is **how Claude's file-based memory works**,
and it maps cleanly:

| Memory system | Brand Context Interview |
| --- | --- |
| One memory file = one coherent fact | One guideline **section** = one coherent aspect (Voice, Audience, Values) |
| `name`/`description` frontmatter | Section **`label`** (the heading) |
| The model decides what's worth persisting — no per-fact approval | The agent captures when an aspect **settles**, not on every message |
| **Dedup:** "check for an existing file that already covers it — update that file rather than creating a duplicate" | **Update-in-place:** aspect already has a section → refine *that* section; new aspect → new section |
| Living store: memories get updated/deleted as understanding changes | Sections get **rewritten toward current thinking**, not appended to |
| Recall by relevance | *Already built* — guidelines flow into every project as context |

The **read half** of this loop already exists (guidelines are injected into every
agent turn as brand context). This feature adds the **write/consolidate half** to
a store that already has the read half.

### Decisions locked in with the user

- **Transparent auto-write, not a per-item approval gate.** The agent captures as
  consensus forms and *shows what it wrote* inline ("Captured under **Voice** — I
  merged it with what was there"); you stay in the loop by seeing and correcting,
  not by approving each item. (Model (a) from our discussion, per the memory
  analogy — not the "propose → click Approve" model (b).)
- **Update existing sections in place** (the dedup rule above), don't pile up
  duplicates. New aspect → new section.
- **Not reversible per-edit**, but keep **one round of backup**: snapshot the
  guidelines before an auto-write so a single bad capture can be restored.

## The model

A brand-scoped **interview** is a persistent conversation whose *output target is
the brand's guideline sections* rather than a project canvas. It reuses the
streaming-agent machinery we already have, but swaps three things:

1. **Scope:** brand, not project. (`/brands/:id/interview`, not
   `/projects/:id/agent`.)
2. **Write target:** guideline sections via `updateBrandGuidelines`, not canvas
   blocks via the `CanvasOpApplier`.
3. **Agent persona:** a Socratic brand strategist that interviews and consolidates,
   not a creative that dumps ideas onto a canvas.

Everything else — SSE plumbing, per-scope concurrency guard, LLM provider
injection, the React-Query-cache event dispatcher, the chat pane pattern — is
reused by analogy.

## What already exists that we reuse (do not rebuild)

From the seam map (`packages/agent`, `server`, `web`, `shared`, `db`):

- **Guideline write target.** `BrandGuidelineSection { id, brandId, label, body:
  ProseMirrorDoc, priority, createdBy: 'user'|'agent', createdAt, updatedAt }`
  (`packages/shared/src/brand/guideline-section.ts`) — **`createdBy: 'agent'` is
  already a valid value** in the schema, the `guideline_section_created_by`
  pgEnum, and the DB column. `updateBrandGuidelines(brandId, sections[])`
  (`packages/db/src/queries/brands.ts:201`) already accepts `createdBy` per
  section and already does the transactional, destructive full-desired-state
  write. `listSectionsByBrand` reads the current list.
- **Streaming agent shape.** `streamResponse(input): AsyncIterable<AgentEvent>`
  (`packages/agent/src/stream.ts`) — system prompt + messages + tools + an
  injected applier port + `llmProvider`/`llmSettings`, consuming AI-SDK
  `streamText().fullStream` and emitting typed `AgentEvent`s. The
  **`CanvasOpApplier` port** (`packages/agent/src/tools/applier.ts`) is the
  side-effect seam that keeps the agent package free of DB/realtime deps — we
  clone that pattern for guidelines.
- **SSE server plumbing.** `streamResponseToSse(...)`
  (`packages/server/src/agent/sse.ts`) frames events, keep-alive, `done`/`error`,
  `onClose`. The **concurrency guard** pattern
  (`packages/server/src/agent/concurrency.ts`, one turn per project via an
  in-process `Set`) generalizes to one interview turn per brand. LLM injection
  via `buildAdapters` (`packages/server/src/adapters.ts`) +
  `resolveLLMSettings(workspaceId, env, db)` (`packages/server/src/settings.ts`).
- **Web consumption.** `useAgentChat(projectId)`
  (`packages/web/src/agent/useAgentChat.ts`) — optimistic user append, `fetch` +
  Bearer, `SseFrameParser`, `AgentEventSchema.parse` → dispatcher. The dispatcher
  `applyAgentEvent(qc, id, event)`
  (`packages/web/src/realtime/applyAgentEvent.ts`) folds events into React Query
  caches. `ChatPane` (`packages/web/src/components/project/ChatPane.tsx`) —
  textarea, Cmd-Enter, streaming status, markdown bubbles.
- **Brand Context UI.** `BrandContextBar`
  (`packages/web/src/components/brand/BrandContextBar.tsx`), `EditGuidelinesDialog`,
  `BrandGuidelinesEditor`, `useBrand`/`useUpdateBrandGuidelines`
  (`packages/web/src/api/queries/brands.ts`), `iconForSection`, `GuidelineMeter`,
  the read-only `SectionReadPanel` TipTap pattern (`editable: false`).

## The one hazard that drives the whole server design

`updateBrandGuidelines` is **full-desired-state and destructive**: it deletes
every section id *not* present in the payload (the 1.4.0 I3 fix). An agent that
"adds a Voice section" by sending `[{ label: 'Voice', ... }]` would **silently
wipe Audience, Values, and everything else**.

Therefore the interview's guideline write **never originates a partial list**.
The server-side applier always:

1. Reads the brand's **current** sections (`listSectionsByBrand`), preserving
   each section's `id`, `priority`, and `createdBy`.
2. Applies the agent's single upsert onto that list (match an existing `id` →
   update it in place; no match → append a new `createdBy: 'agent'` section).
3. Writes the **complete merged list** back through `updateBrandGuidelines`.

Because the merge happens on the authoritative server-side list read at write
time — not on a snapshot the model saw earlier — a concurrent manual edit is the
only race, and it is bounded by the same per-brand guard used for turns.

## Design

Delivered as phases, each keeping the repo green at its boundary (matching the
house style of `docs/plans/brand-page-redesign.md`). Unlike that pass, this one
touches **every layer** (`shared` → `db` → `agent` → `server` → `web`).

### Phase A — shared types: interview events, tool I/O, persistence rows

`packages/shared`:

- **`brand/interview.ts`** (new):
  - `InterviewMessage` — reuse the existing `AgentMessage` shape (`kind:'message'`,
    role, content, id) so the chat pane renders unchanged. Persisted per brand.
  - `GuidelineOpEvent` — a new `AgentEvent` union member, `kind: 'guideline-op'`,
    carrying `{ action: 'insert' | 'update', section: BrandGuidelineSection }`.
    This is what tells the web "a section just changed — update the cache and show
    a 'Captured under X' note."
  - `UpsertGuidelineSectionInput` — the **tool argument** the model produces:
    `{ targetId?: SectionId, label: string(1..120), body: string }`. **`body` is
    plain text / lightweight markdown, not a ProseMirror doc** — LLMs author prose,
    not PM JSON; the server converts (see Phase C). `targetId` present = "refine
    this existing aspect"; absent = "new aspect."
- **`agent/events.ts`**: add `GuidelineOpEvent` to the `AgentEvent` union and
  `AgentEventSchema` so the existing web boundary parse accepts it.
- **`agent/api.ts`**: `PostInterviewBodySchema` = the same `{ message: { id?,
  content } }` shape as `PostAgentBodySchema`.

### Phase B — db: interview persistence + guideline snapshot + agent-authored merge

`packages/db`:

- **`interview_messages` table** (new schema file + migration): `id`, `brand_id →
  brands.id onDelete cascade`, `role`, `content text`, `created_at`. Mirrors
  `agent_messages` but brand-scoped. Query helpers: `appendInterviewMessage`,
  `listInterviewMessages(brandId, { limit })`.
- **`guideline_snapshots` table** (new): `brand_id → brands.id` **unique** (one
  snapshot per brand = the "one round of backup"), `sections jsonb` (the full
  prior `BrandGuidelineSection[]`), `taken_at`. Helpers: `saveGuidelineSnapshot`
  (upsert — overwrites the single row), `getGuidelineSnapshot(brandId)`.
- **`applyGuidelineUpsert(brandId, input, opts)`** helper (new, wraps the merge +
  snapshot in one transaction):
  1. `saveGuidelineSnapshot(brandId, currentSections)` — capture *before* mutating.
  2. Build the merged full list (match `targetId` → replace label/body, keep
     `priority`+`createdBy`; else append with `priority = max+1000`,
     `createdBy: 'agent'`).
  3. `updateBrandGuidelines(brandId, merged)` (existing helper, already accepts
     per-section `createdBy`).
  4. Return `{ action, section }` for the event.

  Snapshotting lives here so *every* guideline write that goes through the
  interview is recoverable; manual-editor saves are out of scope for snapshotting
  in v1 (see open questions).

### Phase C — agent package: the interview stream

`packages/agent`:

- **`GuidelineApplier` port** (`tools/guidelineApplier.ts`, new) — the guideline
  analog of `CanvasOpApplier`:
  `upsertSection(input: UpsertGuidelineSectionInput): Promise<GuidelineOpEvent>`.
  Keeps the agent package free of DB deps (the server supplies the impl).
- **`buildInterviewTools(applier, opts?)`** (`tools/interviewDefinitions.ts`,
  new): one tool `capture_guideline` (name TBD) whose `execute` calls
  `applier.upsertSection` and fires `onApplied(toolCallId, guidelineOpEvent)` —
  exactly the `buildCanvasTools` pattern.
- **Interview system prompt** (`prompts/interview-prompt.ts`, new): a Socratic
  brand strategist. Rules that encode the memory analogy:
  - Interview to *develop* thinking; ask one sharp question at a time; don't
    interrogate — converse.
  - The current brand context (existing sections, with their `id`s and a body
    summary) is injected so the model knows what already exists — this is what
    makes "update the existing Voice section" possible (it passes that section's
    `targetId`).
  - **Only** call `capture_guideline` when an aspect has genuinely settled, and
    **always tell the user in prose** what was captured and whether it created or
    refined a section.
  - Prefer refining an existing section (`targetId`) over creating a near-duplicate.
- **`streamInterview(input): AsyncIterable<AgentEvent>`** (`interview.ts`, new) —
  the guideline-scoped sibling of `streamResponse`. Same `streamText` core; input
  is `{ brand: BrandWithSections, messages, llmProvider, llmSettings, applier:
  GuidelineApplier, signal? }`; builds the interview system prompt + current-context
  block; emits `message` events for chat and `guideline-op` events for captures.
  (A parallel function rather than overloading `streamResponse`, which is welded
  to canvas blocks/shortlist.)

### Phase D — server: brand interview route + guideline applier

`packages/server`:

- **Brand concurrency guard**: generalize `createAgentConcurrencyGuard` to a
  keyed guard (or add a sibling instance keyed by `brandId`) so one interview turn
  runs per brand at a time; second concurrent turn → 409 `INTERVIEW_BUSY`.
- **`createGuidelineApplier(deps): GuidelineApplier`**
  (`agent/guidelineApplier.ts`, new) — server impl of the port. `upsertSection`:
  converts the tool's plaintext/markdown `body` → a minimal `ProseMirrorDoc`
  (reuse whatever text→PM helper the canvas path uses; otherwise a small
  paragraph-wrapping util), calls `db.applyGuidelineUpsert(brandId, input)`,
  returns the `GuidelineOpEvent`. Also publishes the event on the realtime bus
  (`brand:{id}` channel) so a second open tab's context bar updates live —
  mirroring how the canvas applier fans out.
- **`POST /brands/:id/interview`** (extend `routes/brands.ts` or a new
  `routes/interview.ts`): auth → `requireBrandAccess` → acquire brand slot (else
  409) → `resolveLLMSettings(workspaceId, ...)` → load `brand` (`getBrandById` +
  `listSectionsByBrand`) and `listInterviewMessages` → persist the user turn
  (`appendInterviewMessage`) → build `createGuidelineApplier` → `streamInterview`
  → `streamResponseToSse`. `onEvent` mirrors `message` to realtime + accumulates
  assistant text; `onClose` persists the assistant message and releases the slot.
  Structurally identical to `routes/agent.ts`.
- **`GET /brands/:id/interview/messages`**: return persisted `InterviewMessage[]`
  so the panel can resume a prior conversation.
- **`POST /brands/:id/guidelines/restore`**: read `getGuidelineSnapshot`, write it
  back via `updateBrandGuidelines`, return the restored `BrandWithSections`. This
  is the "one round of backup" recovery. 404 if no snapshot exists.

### Phase E — web: the interview surface + live guideline refresh

`packages/web`:

- **Extend the event dispatcher.** `applyAgentEvent` gains a `guideline-op` case:
  patch `brandKeys.detail(brandId)` cache — replace the section by id (`update`)
  or append it (`insert`) — so the **Brand Context bar updates live as the agent
  captures**, no refetch. (Dispatcher currently keys everything on `projectId`;
  either thread `brandId` through or add a small `applyBrandEvent` sibling — decide
  in impl. The natural choice is a sibling, since guideline-ops are brand-scoped.)
- **`useBrandInterview(brandId)`** (`agent/useBrandInterview.ts`, new): the
  `useAgentChat` twin. Optimistic user append into an interview-messages cache,
  `fetch POST /brands/:id/interview`, `SseFrameParser`, `AgentEventSchema.parse`,
  dispatch `message` → interview cache, `guideline-op` → brand cache + surface a
  "Captured under **{label}**" inline note in the transcript. 409 → "Another
  interview turn is running." Plus `useInterviewMessages(brandId)` query for
  resume.
- **`InterviewPanel`** (`components/brand/InterviewPanel.tsx`, new) — the surface,
  opened by a **"Refine with AI"** button added to `BrandContextBar`'s header row
  (next to "Edit"). A large dialog with a **split layout**:
  - **Left:** the chat (reuse `ChatPane`'s structure — transcript + textarea +
    Cmd-Enter + streaming status; `MessageBubble` renders markdown). Interleaves
    the "Captured under X" system notes.
  - **Right:** a **live read-only view of the current brand context** (section
    chips / bodies via the existing `SectionReadPanel` pattern) that **updates and
    briefly highlights** the section that was just captured — the v0
    "watch-the-artifact-build" feel, but the artifact is the brand context.
  - Footer affordance: **"Undo last capture → Restore previous"** (calls the
    restore route), enabled when a snapshot exists.
- **Empty-state hook-in.** `BrandContextBar`'s empty state ("Add brand context")
  gains a second CTA: "…or **talk it through**" → opens the interview. This is the
  intended first-run path for a brand that starts as a rough idea.

### Phase F — tests

- **db:** `applyGuidelineUpsert` — insert path (new agent section, `createdBy:
  'agent'`, others untouched), update path (`targetId` refines in place, preserves
  `priority`/`createdBy`, **others untouched** — the anti-wipe invariant),
  snapshot captured before mutation, restore round-trips. Live-Postgres file that
  restores seeded state in `afterAll` (house pattern from `guidelines.live.test.ts`).
- **agent:** `streamInterview` with a fake `GuidelineApplier` + a stub model:
  a settled aspect → a `guideline-op` event with the right `action`; chat text →
  `message` events; existing-section context → tool called with `targetId`.
- **server:** interview route happy path (SSE frames incl. `guideline-op`), the
  brand guard's 409, restore route (200 + 404-when-empty), and a **regression
  test that a capture does not delete sibling sections**.
- **web:** `useBrandInterview` dispatch (message → transcript, guideline-op →
  brand cache patched + note shown), `InterviewPanel` render + the live-highlight
  branch.
- Mutation-check per house habit: delete the merge's "read current list first"
  step and confirm the anti-wipe test fails.

### Phase G — verification / live pass

- Repo-root gates: `pnpm typecheck` / `lint` / `format:check` / `test` / `build`.
- **Live browser pass** (needs a configured LLM provider —
  `OPENROUTER_API_KEY` et al.; see open questions): open a brand → "Refine with
  AI" → hold a short interview → confirm (1) a settled aspect is captured as a new
  section with a "Captured under X" note and appears live in the right panel + the
  context bar behind the dialog; (2) revisiting the same aspect **refines the same
  section** (no duplicate, `createdBy: 'agent'` preserved); (3) sibling sections
  survive every capture; (4) "Restore previous" rolls back the last capture; (5)
  resume — reopen the panel, the transcript is still there; (6) both themes, accent
  budget respected.

## Files

**New**
- `packages/shared/src/brand/interview.ts`
- `packages/db/src/schema/interview_messages.ts`, `.../schema/guideline_snapshots.ts` (+ migration)
- `packages/db/src/queries/interview.ts` (messages, snapshot, `applyGuidelineUpsert`)
- `packages/agent/src/tools/guidelineApplier.ts`, `.../tools/interviewDefinitions.ts`, `.../prompts/interview-prompt.ts`, `.../interview.ts`
- `packages/server/src/agent/guidelineApplier.ts`, `.../routes/interview.ts` (or extend `routes/brands.ts`)
- `packages/web/src/agent/useBrandInterview.ts`, `.../components/brand/InterviewPanel.tsx`

**Edit**
- `packages/shared/src/agent/events.ts` (+ `GuidelineOpEvent`), `.../agent/api.ts` (+ `PostInterviewBodySchema`)
- `packages/db/src/queries/brands.ts` only if `applyGuidelineUpsert` lives beside `updateBrandGuidelines`; index exports
- `packages/server/src/agent/concurrency.ts` (keyed/brand guard), route registration, `app.ts` wiring
- `packages/web/src/realtime/applyAgentEvent.ts` (or new `applyBrandEvent.ts`), `.../api/queries/brands.ts` (interview + restore hooks), `.../components/brand/BrandContextBar.tsx` ("Refine with AI" button + empty-state CTA)

**Reused unchanged**
- `streamResponseToSse`, `SseFrameParser`, `resolveLLMSettings`, `buildAdapters`/LLM injection, `ChatPane`/`MessageBubble`, `SectionReadPanel`, `iconForSection`, `GuidelineMeter`, `updateBrandGuidelines` (called by the new merge helper).

## Non-goals (explicit, this pass)

- **No delete-via-interview.** The agent upserts (insert + refine); removing a
  section stays a manual-editor action. (Matches "update existing sections.")
- **No multi-step undo / history.** Exactly one snapshot per brand.
- **No per-aspect specialized agents.** One interview persona; it adapts.
- **No inline editing of a captured section from within the chat** — you correct
  by talking (it re-captures) or by opening the full editor.
- **No streaming of partial guideline bodies** — a capture lands atomically when
  the tool fires, not token-by-token.

---

## Open questions for review

1. **Interview surface — split-panel dialog vs. dedicated route?** I've proposed a
   large split-panel **dialog** (chat left, live brand-context right) opened from
   the context bar, because it keeps you anchored on the brand page and mirrors the
   v0 "watch-it-build" feel without a navigation. The alternative is a dedicated
   `/brands/$brandId/interview` **route** (more room, shareable URL, survives
   refresh natively). Dialog is my recommendation for v1; which do you want?

2. **Snapshot scope — interview writes only, or all guideline writes?** I scoped
   the single backup to **interview auto-writes** (the thing you were nervous
   about). Should a *manual* editor save also overwrite the snapshot, so "Restore
   previous" is a universal one-step undo for the guidelines — or keep manual edits
   out of the backup entirely?

3. **Does the interview conversation persist across sessions?** I assumed **yes**
   (an `interview_messages` table + a resume query), so reopening the panel
   continues where you left off — closest to a "memory" that accretes over time. If
   you'd rather it be **ephemeral** (fresh conversation each open, only the
   *captured sections* persist), we drop the table and the resume route and this
   gets noticeably smaller. Which fits how you imagine using it?

4. **How visible should "agent-authored" be?** Sections carry `createdBy`
   (`'user'` vs `'agent'`). Do you want captured sections visually marked (a subtle
   "drafted with AI" badge) so you can tell at a glance what came from an interview
   vs. what you wrote — or should the origin be invisible once it's in the context?

5. **LLM provider dependency.** The interview runs on the **same workspace LLM
   settings** as the canvas agent (`resolveLLMSettings` → provider + model), so it
   needs a configured provider key (`OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`,
   etc.) — the same key that the changelog notes was absent when the copywriting
   agent's canvas output went unexercised. Confirming that's fine: no separate
   "interview model" setting for v1, and the live verification (Phase G) is gated
   on a key being present.

6. **Capture aggressiveness.** The persona is tuned to capture only when an aspect
   "settles." That threshold is a prompt-tuning judgment — too eager and it writes
   half-baked sections; too shy and you have to prod it. Are you comfortable with me
   picking a sensible default and tuning it during the live pass, or do you want a
   say in the exact behaviour (e.g. "always ask 'want me to capture this?' first"
   — which would pull us back toward the confirm-gate model (b) we set aside)?
