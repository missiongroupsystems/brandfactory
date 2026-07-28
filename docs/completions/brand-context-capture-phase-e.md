# Brand context capture — Phase E: capture from any thread

Status: **done**. Fifth phase of
[`docs/executing/brand-context-capture.md`](../executing/brand-context-capture.md).
Follows [Phase A](brand-context-capture-phase-a.md),
[Phase B](brand-context-capture-phase-b.md),
[Phase C](brand-context-capture-phase-c.md) and
[Phase D](brand-context-capture-phase-d.md).

## Goal

A sharp line about the brand does not wait for you to be in the right thread. It
usually turns up while you are writing ad copy.

The gesture already existed on every bubble in every thread; what Copywriting and
Open canvas lacked was somewhere for it to land — their right pane is the canvas.
E gives them the same editor behind a dialog.

**387 → 393 tests (+6).**

## The claim the plan made, and it held

> This is the vision's "promoting ideas directly out of projects", and it is
> about a prop and a dialog.

It was. `BrandGuidelinesEditor` already took `staged` (Phase C built E2 ahead of
time), and `EditGuidelinesDialog` was already controlled. The whole phase is a
passthrough, a route branch, and one gating decision that the plan didn't
anticipate.

No new fetch (`ProjectDetail.brand` is a full `BrandWithSections`), no second
insert path, and **still exactly one caller of `updateBrandGuidelines`** — E4's
standing instruction was "if this phase ever seems to need a second caller,
stop", and it never did.

## What shipped

### E1 — `EditGuidelinesDialog` gains `staged` / `onStagedConsumed`

Passed straight through to the editor. Deliberately the **same prop shape**
`BrandContextPane` hands it for the in-pane click path, so the two capture
destinations are one path rather than two that have to agree — the shape Phase C
chose in advance for exactly this.

### E3 — the route decides where the editor is

`projects.$projectId` keeps one `staged` state with two consumers:

```ts
const capture = (payload: CapturePayload) => {
  setStaged(payload)
  setCaptureDialogOpen(true)
}
```

In a brand-context thread the editor is already the right pane, so the payload
just goes to it and no dialog is rendered at all. Anywhere else the same payload
raises the dialog over the canvas. Radix unmounts dialog content when closed, so
the editor mounts on open, sees `staged`, appends its section and clears it
through the existing StrictMode-safe identity effect — untouched.

### E5 — the drag grip is now gated (not in the plan)

The plan describes E as turning the affordances on everywhere. Doing that
literally ships a **drag** grip in threads whose right pane is the canvas, and
that is worse than a gesture that does nothing: the drag carries `text/plain`,
the canvas is full of TipTap editors that accept exactly that, so a grip labelled
"Drag into brand context" would quietly drop the message **into the canvas**.
A closed dialog cannot be dragged into.

So `MessageCapture` gained `hasDropTarget`, true only where the editor is on
screen. What each thread offers now:

| | click action | selection affordance (D) | drag grip |
| --- | --- | --- | --- |
| Brand context | yes | yes | yes |
| Copywriting / Open canvas | yes | yes | **no** |

The click and selection paths are destination-agnostic, which is why they need no
gate — they hand a payload to the route and the route knows where the editor is.

### Tests (+6)

| File | Δ | What |
| --- | --- | --- |
| `projects.$projectId.test.tsx` | +4 | a capture from a canvas thread brings up the dialog with the content staged; a capture in a brand-context thread stages into the visible pane and opens **no** dialog; no dialog before anything is captured; `hasDropTarget` true only where the editor is on screen |
| `BrandGuidelinesEditor.test.tsx` | +1 | a payload arriving **through the dialog** lands in a new section and still fires no mutation |
| `ChatPane.test.tsx` | +1 | the click path is offered with no drop target, the drag grip is not |

The route's pane stubs were widened from bare markers to reveal the props the
route actually owns (`staged`, `hasDropTarget`) plus a button that fires a
capture. Markers stayed separate elements so the four pre-existing exact-match
assertions were not touched.

Mutation checks, all four confirmed failing then restored:

| Mutation | Result |
| --- | --- |
| dialog rendered even in a brand-context thread | 1 failure |
| dialog drops the `staged` passthrough | 1 |
| every thread claims a visible drop target | 1 |
| drag grip offered with no drop target | 1 |

## Deviations from the plan

1. **The drag grip is gated** (E5 above). The plan's "the gesture already exists
   in Copywriting and Open canvas threads" is true of the *click*; taking it as
   true of the drag would have routed captures into the canvas.
2. **Two guards collapsed into one, before the mutation checks ran.** The route
   first refused to open the dialog in a brand-context thread *and* refused to
   render one. Each masked the other: deleting either left every test green, so
   the property was pinned by nothing. `capture` now always sets the open flag
   and the render site is the single decision — which the first mutation check
   then failed correctly. Two guards for one property is not belt-and-braces, it
   is an untested property.
3. **`onCapture` stayed optional on `ChatPane`.** Every thread now supplies one,
   so it could have been made required, but `ChatPane` knows nothing about brands
   and the absent case documents that contract. Recorded because the alternative
   is a prop that can never be undefined in production.

## Verification

```
pnpm typecheck      9/9 workspaces
pnpm lint           clean
pnpm format:check   clean
pnpm test           383 passed | 10 skipped (393)
pnpm build          all packages ok
```

**Not verified** — all of it in the browser, and one item is new:

- **That the dialog is a good place to land.** It opens over the canvas with the
  editor scrolled to the top, and the new section is appended at the **bottom**
  of a brand with many sections. Whether the capture is visible without scrolling
  is unlooked-at, and if it isn't, the fix is a scroll-into-view on the staged
  row, not a redesign. Phase H should look.
- Everything still open from C and D: where a dropped excerpt lands relative to
  the cursor, `clearData` taking effect on a native selection drag, the floating
  affordance's placement, mobile long-press.

The 10 skips are unchanged — the live-Postgres suites (no Docker daemon, no root
`.env`). Phase E touches no `db`, `server`, `shared` or `agent` code.

**The B↔F gap is the last one open**: a brand-context thread renders no canvas,
but the agent can still write to one. F1 closes it, and F is the only remaining
phase with a correctness defect in it.

## Files touched

| Action | Path | What |
| --- | --- | --- |
| Edit | `packages/web/src/components/brand/EditGuidelinesDialog.tsx` | `staged` / `onStagedConsumed` passthrough |
| Edit | `packages/web/src/routes/projects.$projectId.tsx` | one capture handler, dialog for canvas threads, `hasDropTarget` |
| Edit | `packages/web/src/routes/projects.$projectId.test.tsx` | +4, stubs widened to reveal props |
| Edit | `packages/web/src/components/project/MessageCapture.tsx` | `hasDropTarget` gates the grip |
| Edit | `packages/web/src/components/project/MessageCapture.test.tsx` | harness opts into the grip |
| Edit | `packages/web/src/components/project/ChatPane.tsx` | `hasDropTarget` passthrough |
| Edit | `packages/web/src/components/project/ChatPane.test.tsx` | +1, stale "until Phase E" premise corrected |
| Edit | `packages/web/src/components/brand/BrandGuidelinesEditor.test.tsx` | +1 |

**Untouched:** `packages/shared`, `packages/db`, `packages/server`,
`packages/agent`, and `BrandGuidelinesEditor.tsx` itself — Phase C had already
built the receiving end. No migration, no new tables, no new API routes.

## Next

**Phase F — brand-context agent behaviour.** The first phase in this pass that is
a **correctness fix rather than a feature**, and the first to touch `agent` and
`server`. `streamResponse` builds canvas tools unconditionally and the system
prompt tells the model to use them, so an agent in a brand-context thread can
persist and broadcast canvas blocks that nothing renders. F1 threads `templateId`
through (~one line in `routes/agent.ts`) and withholds the tools; F2 gives the
thread its interview persona, with the default prompt pinned byte-identical so
every other thread is provably unaffected.
