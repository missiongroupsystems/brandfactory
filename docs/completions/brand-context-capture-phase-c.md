# Brand context capture — Phase C: drag a message into brand context

Status: **done**. Third phase of
[`docs/executing/brand-context-capture.md`](../executing/brand-context-capture.md).
Follows [Phase A](brand-context-capture-phase-a.md) and
[Phase B](brand-context-capture-phase-b.md).

## Goal

The gesture. A brand-context thread is now walkable end-to-end: talk to the
agent on the left, grab any message — yours or its — and put it into a guideline
section on the right.

This is the shippable core. D and E are additive; this is the natural cut line.

**358 → 375 tests (+17).**

## The mechanism, restated because everything here depends on it

A chat message is markdown text. A guideline body is a `ProseMirrorDoc`. The
bridge is **the drop itself**: the bubble writes rendered HTML into
`dataTransfer`, and a TipTap editor parses it through its own schema. Headings,
lists, bold and italic arrive as real nodes; an `h4` or a table is coerced or
dropped **by the schema**, not by a converter we would have to write and keep
honest.

So: no markdown→ProseMirror converter exists anywhere in this phase, the editor
remains the sole author of ProseMirror docs, and `updateBrandGuidelines` still
has exactly one caller.

## What shipped

### C1 — `components/project/MessageCapture.tsx` (new)

Four exports, so `ChatPane` stays a chat component and the editor stays an
editor:

- **`buildCaptureTransfer(message, renderedEl)` → `{ html?, text }`** — pure,
  no DOM writes, directly testable. Assistant → both flavors (its bubble is real
  HTML from `ReactMarkdown`). User → **`text` only**, per Correction 3: a user
  bubble is escaped plain text whose newlines are CSS (`whitespace-pre-wrap`),
  so parsing its `innerHTML` would collapse a multi-line message into one run-on
  paragraph. ProseMirror splits plain text on newlines natively, so this is
  strictly better than hand-building `<p>` tags — and it writes no HTML
  anywhere, which is what keeps the no-converter invariant clean.
- **`hasCaptureData` / `readCaptureTransfer`** — the read side, so drop handlers
  don't each re-derive the wire format.
- **`MessageCapture`** — a drag grip and a click action, in the gutter beside
  the bubble. Both real `<button>`s, revealed on `group-hover` /
  `group-focus-within`.

The **grip** carries the drag, not the bubble, so text selection inside the
bubble still works — Phase D depends on that. Rendered for **both roles**, and
not styled as an agent-only affordance: the sharpest articulation of a brand is
often the founder's own offhand sentence.

### C2 — `ChatPane`

`MessageBubble` puts a ref on its rendered content div (not the bubble — padding
and background are chrome, not content) and renders the controls in the gutter,
outside the `max-w-[85%]` bubble so they never reflow its text. Left of a user
bubble, right of an assistant one.

### C3 — drop targets in `BrandGuidelinesEditor`

- **Existing sections** are already drop targets by virtue of containing a
  contenteditable, so the row adds **styling only** — a primary border on
  `dragover`, cleared via a `relatedTarget` containment check rather than on
  every `dragleave` (which also fires when the pointer crosses into a child).
  It never calls `preventDefault` on the drop: that would take the event away
  from ProseMirror and land content at the end instead of at the cursor.
  Precision is the whole point.
- **A new-section target** below the list. This one is *not* already a drop
  target, so it opts in by preventing `dragover`. Dropping appends a
  `blankSection()` and stages the payload onto it, so capturing a brand-new
  aspect doesn't mean creating an empty section first and then aiming at it.
- **The insert path.** `SectionRow` gained `pendingInsert?: CapturePayload`; on
  mount or change it calls `editor.commands.insertContent(html ?? text)` and
  clears via a callback. `insertContent` fires the existing `onUpdate`, which is
  what gets the new body into local state. Phase E reuses this verbatim.
- **Nothing saves.** A drop mutates local state exactly like typing. You name
  the section, trim the body, then Save. That is what makes capture safe to be
  one-handed, and there is a test pinning it.

### C4 — the click path

A "Send to brand context" button on every bubble, targeting the same insert
points. Drag-only is not keyboard-reachable and trackpad drags across a split
screen are miserable.

The hand-off between panes is route-level state in `projects.$projectId.tsx`:
`ChatPane` gets `onCapture`, `BrandContextPane` gets `staged` +
`onStagedConsumed`, and `BrandGuidelinesEditor` appends a blank section and
stages the payload onto it. That is deliberately the **same `staged` prop shape
Phase E will thread through `EditGuidelinesDialog`** — one path, not two.

The staging effect keys on **payload identity**, not truthiness: the app runs
under `StrictMode`, which double-invokes effects in dev, and this effect appends
a section. A naive check would stage every capture twice in development only —
the worst kind of bug to find late.

### C5 — dnd-kit coexistence (the check the plan asked for, with a real answer)

The plan flagged a plausible conflict between the editor's dnd-kit section
reordering and HTML5 drag-and-drop capture. **It does not exist**, and the
reason is checkable rather than hopeful — verified against
`@dnd-kit/core` source, not assumed:

- dnd-kit's `useSortable().attributes` is exactly `{ role, tabIndex,
  aria-disabled, aria-pressed, aria-roledescription, aria-describedby }`. It
  never sets `draggable`, so its grip is not an HTML5 drag source and ours is
  the only one on the page.
- Its `PointerSensor` activator is `onPointerDown`. HTML5 drag events
  (`dragover`/`drop`) do not produce `pointerdown` on the element being dragged
  *over*, so dragging a message across a `SectionRow` cannot start a sort.
- The one place a `pointerdown` does precede a drag is on our own capture grip —
  which lives in `ChatPane`, outside the `DndContext` entirely.

`activationConstraint: { distance: 8 }` is untouched; nothing in this phase
attaches pointer listeners to a section row. Recorded either way, as the plan
asked: a plausible-sounding conflict that turns out not to exist is worth
writing down so nobody re-derives it.

### Tests (+17)

| File | Δ | What |
| --- | --- | --- |
| `components/project/MessageCapture.test.tsx` (new) | +8 | `buildCaptureTransfer` for both roles and for an unmounted element; `hasCaptureData` / `readCaptureTransfer`; `dragStart` writes the right flavors and `effectAllowed`; the click path hands up the same payload |
| `components/brand/BrandGuidelinesEditor.test.tsx` (new) | +6 | a drop appends exactly one section and inserts the content; **no mutation until Save**; degrades to plain text with no html; ignores an empty drag; the `staged` prop path; staged-only-once under `StrictMode` |
| `components/project/ChatPane.test.tsx` (new) | +3 | capture on every message when a target exists; none when it doesn't; the clicked message reaches `onCapture` with the right per-role payload |

jsdom has no `DataTransfer` constructor, so the drag tests hand-roll a
`{ setData, getData, types }` stub and pass it to `fireEvent`.

Mutation checks:

- Give user messages the html flavor too (Correction 3 reversed) → **4 failures**
  across three files. Restored.
- Drop the `?? pendingInsert.text` fallback on insert → the degrade-to-plain-text
  case fails, i.e. an html-less drag would capture nothing. Restored.
- Replace the staged identity guard with a truthiness check → **initially passed**,
  because the test wasn't rendering under `StrictMode`. Fixed the test to wrap in
  `<StrictMode>`, re-ran the mutation, and it now fails correctly. Recorded
  because the first version of that test was worthless and looked fine.

## Deviations from the plan

1. **Capture affordances are gated on a capture target existing.** The plan has
   C1's handle on every bubble in every thread, with C4's action "opening the
   dialog (Phase E)" outside a brand-context thread. But E is a later phase, so
   taken literally that ships a button that does nothing in Copywriting and Open
   canvas threads for the length of two phases — and a drag with no visible drop
   target besides. `ChatPane.onCapture` is therefore optional, and the controls
   render only when it is supplied. **Phase E turns them on everywhere by
   supplying a dialog-backed target — a prop, not a redesign.** (This is the
   forward dependency flagged before Phase A started.)
2. **Two affordances, not one.** The plan describes the handle and mentions C4's
   action as "a dropdown or inline button". Both are small icon buttons in the
   same gutter cluster, which keeps one visual home for "this message can go
   somewhere" rather than splitting it across a hover handle and a menu.
3. **`hasCaptureData` / `readCaptureTransfer` were added** beyond the plan's
   `buildCaptureTransfer`. Two drop handlers need the read side, and having them
   each call `getData` twice with their own emptiness rule is how the two ends of
   a wire format drift apart.

## Verification

```
pnpm typecheck      9/9 workspaces
pnpm lint           clean
pnpm format:check   clean
pnpm test           365 passed | 10 skipped (375)
pnpm build          all packages ok
```

**What is genuinely not verified.** This phase has more of it than A or B, and
it is concentrated in exactly the part that matters most:

- **That a real drag lands at the ProseMirror cursor** rather than appending.
  Correction 5: jsdom has no layout and no real `DragEvent`, so `posAtCoords`
  cannot run — a unit test here would be testing our own mock. Phase H, step 3.
- **That a contenteditable accepts our synthetic drag at all.** Reasoned yes
  (native contenteditable drop handling, `text/plain` present, `effectAllowed:
  'copy'`), but not observed. If this turns out to need coaxing, the
  new-section target still works and the fallback is a section-header drop that
  appends.
- **That the SectionRow hover styling doesn't swallow the drop.** The code is
  careful not to `preventDefault`, but "careful" is not "checked" — and no unit
  test can falsify it in jsdom.
- **Gutter layout.** The controls' placement, and whether `opacity-0` +
  `group-hover` reads as discoverable rather than hidden, is unlooked-at.

The 10 skips remain the live-Postgres suites (no Docker daemon, no root `.env`).
Phase C touches no `db`, `server`, `shared` or `agent` code.

**The B↔F gap is still open** and this phase widens its consequences: a
brand-context thread is now a place people will actually work, and the agent can
still write to a canvas nobody renders. F1 closes it.

## Files touched

| Action | Path | What |
| --- | --- | --- |
| New | `packages/web/src/components/project/MessageCapture.tsx` | payload builders, drag grip, click action |
| New | `packages/web/src/components/project/MessageCapture.test.tsx` | +8 |
| Edit | `packages/web/src/components/project/ChatPane.tsx` | `onCapture` prop, content ref, gutter controls |
| New | `packages/web/src/components/project/ChatPane.test.tsx` | +3 |
| Edit | `packages/web/src/components/brand/BrandGuidelinesEditor.tsx` | drop affordance, new-section target, `pendingInsert`, `staged` |
| New | `packages/web/src/components/brand/BrandGuidelinesEditor.test.tsx` | +6 |
| Edit | `packages/web/src/components/brand/BrandContextPane.tsx` | `staged` passthrough |
| Edit | `packages/web/src/routes/projects.$projectId.tsx` | click-path state between the panes |

**Untouched:** `packages/shared`, `packages/db`, `packages/server`,
`packages/agent`. No migration, no new tables, no new API routes, still one
caller of `updateBrandGuidelines`.

## Next

**Phase D — excerpt capture (cuttable).** Whole-message capture over-captures;
agent replies are chatty and the good line is usually one sentence. D reuses C3's
insert path verbatim — if it doesn't, the shapes have diverged and one of them is
wrong. Cut it if selection tracking fights the browser, and record why.

Everything from here is additive. If the pass has to stop, it stops cleanly here.
