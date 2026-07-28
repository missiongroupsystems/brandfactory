# Brand context capture — Phase D: excerpt capture

Status: **done** (not cut). Fourth phase of
[`docs/executing/brand-context-capture.md`](../executing/brand-context-capture.md).
Follows [Phase A](brand-context-capture-phase-a.md),
[Phase B](brand-context-capture-phase-b.md) and
[Phase C](brand-context-capture-phase-c.md).

## Goal

Whole-message capture over-captures. Agent replies are chatty and the good line
is usually one sentence, so capturing the whole reply means capturing three
paragraphs of hedging around it and trimming them by hand in the editor.

Select the sentence, capture the sentence.

**375 → 387 tests (+12).**

## The rule this phase kept

D reuses Phase C's insert path **verbatim**. The plan says that if it doesn't,
the two payload shapes have diverged and one of them is wrong — so nothing below
touches `BrandGuidelinesEditor`, `BrandContextPane`, or the route. An excerpt is
a `CapturePayload` like any other; the only thing D changes is where one comes
from. `MessageCapture.tsx` grew a section; no other file gained a concept.

## What shipped

### D1 — the selection is tracked, not the click

`useSelectionCapture(containerRef, enabled)` listens on `selectionchange` and
reports a selection when it is capturable: non-collapsed, and lying inside a
**single** message bubble within the chat's scroll container.

The single-bubble test is one line, and it is the whole reason no
anchor/focus comparison is needed:

```ts
const host = captureHostOf(range.commonAncestorContainer)
```

`commonAncestorContainer` climbs out of the bubble the instant a selection spans
two of them, so the same check rejects cross-bubble selections *and* selections
outside the chat entirely — the two cases the plan named as reasons D might have
to be cut. Bubbles are marked with `data-capture-role`, whose name has one owner
(`CAPTURE_ROLE_ATTR` + `captureRoleProps`), because it is written in `ChatPane`
and read back in the hook.

The affordance is one instance per pane, not one per bubble: a text selection is
a document-level singleton. It is `position: fixed`, anchored above the
selection rect, and it hides when the selection is scrolled out of the pane —
otherwise it floats over the chat header, since fixed positioning knows nothing
about the scroll container it is logically attached to.

### D2 — the same two flavors, at excerpt scale

`buildSelectionCapture(range, role)` mirrors `buildCaptureTransfer` exactly:

- **assistant** → `html` from `range.cloneContents()` serialized, `text` from
  `range.toString()`. Selecting across a paragraph and a list yields the list
  items as real nodes, so the drop target's schema still does all the parsing.
- **user** → `text` only. **Correction 3 applies unchanged at this scale**, and
  for the same reason: a user bubble is escaped plain text whose newlines are
  CSS, so a multi-line excerpt parsed as HTML collapses into one run.
- empty or whitespace-only → `null`, so callers have one "nothing here" answer
  rather than several.

Still no markdown→ProseMirror converter anywhere, and `updateBrandGuidelines`
still has exactly one caller.

### D3 — the native selection drag, minus one hazard

Dragging a selection is free: the browser already writes both flavors, the
existing drop targets already accept them, and the C1 grip carries its drag from
the gutter, so selecting inside a bubble was never blocked. Per the plan, the
floating affordance is the reliable path and nothing here fights the browser to
make the drag primary.

One thing *was* worth a handler. Inside a **user** bubble the UA's own
`text/html` flavor is pre-wrapped plain text — exactly the newline collapse
Correction 3 exists to prevent, sneaking back in through the one path we didn't
author. `restrictSelectionDragToText` clears that flavor on `dragstart` and
leaves `text/plain`. Assistant bubbles are untouched; their native html is the
flavor we want.

Best-effort by contract: the drag data store is writable during `dragstart`, but
if a browser declines the `clearData` we are no worse off than not having tried.
Unverified in a real browser — see below.

### D4 — the cut criterion, and why it didn't bite

The plan's cut criterion was selection tracking fighting the browser, with
"selection cleared by the affordance's own focus" named first. It is real, and
**jsdom reproduced it during this phase** rather than leaving it theoretical:

A test that cleared the selection and then clicked the button found the button
already gone. jsdom fires `selectionchange` as a queued task, so `await
userEvent.click(...)` yields, the event lands, the hook clears its state and
React unmounts the affordance *before the click can be delivered*. That is not a
jsdom artifact — it is the production failure mode, on production timing. A
mousedown that collapses the selection destroys the button it was aimed at.

`onMouseDown={(e) => e.preventDefault()}` is therefore **load-bearing, not
polish**, and the code comment now says so; it was written the other way round
first. The payload is still snapshotted at selection time, which is worth
keeping — the button cannot hand up something other than the words it was raised
over — but on its own the snapshot saves nothing, because a lost selection takes
the button with it.

**Result: D ships.** No fight materialized on the two remaining risks either —
`commonAncestorContainer` handles cross-bubble ranges in a line, and the
affordance is never a focus target during selection. Mobile long-press is
untested (no touch device in this pass) and is named below.

### Tests (+12)

| File | Δ | What |
| --- | --- | --- |
| `MessageCapture.test.tsx` | +5 | `buildSelectionCapture`: an assistant excerpt keeps its markup and drops what wasn't selected; a user excerpt is text-only; empty/whitespace → null. `restrictSelectionDragToText`: clears html and writes plain text; no-ops on an empty selection |
| `ChatPane.test.tsx` | +7 | affordance offers the assistant excerpt actually selected, and a user excerpt as text-only; nothing for a cross-bubble selection, one outside any bubble, one scrolled out of the pane, or a thread with no capture target; mousedown default prevented; capture clears the selection |

jsdom has no layout, so `Range#getBoundingClientRect` does not exist and every
element measures 0×0. Both are stubbed in `beforeEach` and restored after, since
the scroll-out-of-view guard needs two coherent rectangles to compare. Selections
are made programmatically and `selectionchange` is dispatched **synchronously** —
jsdom does fire it, but as a queued task, which would otherwise force every
assertion to await a tick.

Mutation checks, all five confirmed failing then restored:

| Mutation | Result |
| --- | --- |
| user selections get the html flavor too (Correction 3 reversed) | 2 failures |
| host resolved from `startContainer`, not `commonAncestorContainer` | 1 (the cross-bubble case) |
| no `preventDefault` on the affordance's mousedown | 1 |
| native selection drag keeps the UA `text/html` | 1 |
| no scroll-out-of-view guard | 1 — **added after the check found none** |

The last one is the point of doing this: the guard was written, shipped and
apparently fine, and **no test touched it**. It has one now.

## Deviations from the plan

1. **D3 gained code.** The plan treats the native selection drag as a pure bonus
   ("do not fight the browser"). Left alone it would have carried the exact
   defect Correction 3 documents, so the user-bubble flavor is overridden. Three
   lines in a `dragstart`, not a fight.
2. **The scroll-out-of-view guard is not in the plan at all.** A viewport-fixed
   affordance over a scrolling list needs it, and the alternative — a floating
   button pinned over the chat header — would have been found in the Phase H
   walk instead.
3. **`enabled` is derived, not cleared.** The hook first cleared its state in an
   effect when disabled; `react-hooks/set-state-in-effect` rejected it, correctly.
   `capture: enabled ? capture : null` is both lint-clean and more honest — with
   no listeners attached, whatever the state last held is stale by definition.
4. **The affordance is gated on `onCapture` like C's**, so it stays absent in
   Copywriting and Open canvas threads until Phase E supplies a target. Same
   reasoning as Phase C's deviation 1, same one-prop reversal.

## One process note, since it cost real work

The mutation-check script reverted its mutations with `git checkout -- <file>`
on a file carrying **uncommitted phase work**, which discarded the entire Phase D
implementation mid-run. Three of the five checks then "passed" against a file
that no longer had the feature in it, which is a result that looks like a result.
Rewritten to restore from a scratchpad copy, and the checks were re-run from
scratch against the final code. Recorded because the failure mode is silent: the
mutation reports stayed green-ish and only the missing code gave it away.

## Verification

```
pnpm typecheck      9/9 workspaces
pnpm lint           clean
pnpm format:check   clean
pnpm test           377 passed | 10 skipped (387)
pnpm build          all packages ok
```

**Not verified**, and concentrated in the same place as Phase C's gaps — the
browser:

- **`clearData('text/html')` actually taking effect** during a native selection
  drag (D3). Specified as writable during `dragstart`; not observed. The fallback
  if a browser declines is today's behaviour, not a regression.
- **Where a dropped excerpt lands** — still Correction 5's territory, still
  Phase H step 3.
- **The floating affordance's placement**: whether it reads as attached to the
  selection, whether it collides with the bubble above at the top of the pane,
  and whether any transformed ancestor breaks `position: fixed` (`SplitScreen`
  was read and has none, but that is reasoning, not looking).
- **Mobile long-press selection.** Named in the plan's cut criterion and not
  exercised; no touch device in this pass.

The 10 skips are unchanged — the live-Postgres suites (no Docker daemon, no root
`.env`). Phase D touches no `db`, `server`, `shared` or `agent` code.

**The B↔F gap remains open**, as after Phase C: a brand-context thread renders no
canvas, but the agent can still write to one. F1 closes it.

## Files touched

| Action | Path | What |
| --- | --- | --- |
| Edit | `packages/web/src/components/project/MessageCapture.tsx` | `buildSelectionCapture`, `useSelectionCapture`, `SelectionCaptureButton`, `restrictSelectionDragToText`, `CAPTURE_ROLE_ATTR` |
| Edit | `packages/web/src/components/project/MessageCapture.test.tsx` | +5 |
| Edit | `packages/web/src/components/project/ChatPane.tsx` | role attributes on bubble content, the pane's one affordance, user-bubble drag override |
| Edit | `packages/web/src/components/project/ChatPane.test.tsx` | +7 |

**Untouched:** `packages/shared`, `packages/db`, `packages/server`,
`packages/agent`, and every Phase C file that owns the insert path —
`BrandGuidelinesEditor`, `BrandContextPane`, `projects.$projectId`. No migration,
no new tables, no new API routes, still one caller of `updateBrandGuidelines`.

## Next

**Phase E — capture from any thread.** The gesture already exists on every
bubble in every thread; what Copywriting and Open canvas lack is a visible place
for it to land. E threads `staged` through `EditGuidelinesDialog` to
`BrandGuidelinesEditor` — deliberately the same prop shape the click path already
uses, so it is a prop and a dialog, not a second path. Both capture sources, whole
message and excerpt, arrive there unchanged.
