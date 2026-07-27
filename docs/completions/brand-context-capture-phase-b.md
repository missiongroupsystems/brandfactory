# Brand context capture — Phase B: the brand-context thread surface

Status: **done**. Second phase of
[`docs/executing/brand-context-capture.md`](../executing/brand-context-capture.md).
Follows [Phase A](brand-context-capture-phase-a.md).

## Goal

Put the guidelines where you can drop into them: a brand-context thread renders
chat on the left and the **live guidelines editor** on the right, where every
other thread renders the canvas.

You cannot drop into a target you cannot see, so this phase is what makes Phase
C's capture gesture possible at all. No capture gesture exists yet — both panes
are just fully functional side by side.

**347 → 358 tests (+11).**

## What shipped

### B1 — right-pane branch (`routes/projects.$projectId.tsx`)

```ts
const isBrandContext =
  data.kind === 'standardized' && data.templateId === BRAND_CONTEXT_TEMPLATE_ID
```

`ProjectDetail` is `z.intersection(ProjectSchema, {…})` and `ProjectSchema` is
the `kind`-discriminated union, so this narrows with no cast and **no API
change** — as the plan predicted. Only the right pane branches; `ChatPane` is
byte-identical in every thread, which matters because Phase C's capture handles
go on message bubbles and are deliberately *not* brand-context-specific.

### B2 — `BrandContextPane` (`components/brand/BrandContextPane.tsx`, new)

A deliberately thin frame: a header strip matching `CanvasPane`'s (`border-b p-3
text-sm font-medium`, so the two right panes read as the same slot holding
different things), a scroll container, and `<BrandGuidelinesEditor
key={brand.id} brand={brand} />`.

`data.brand` is already a full `BrandWithSections`, so the pane needs no fetch of
its own. The `key` preserves the remount-on-brand-switch idiom the editor's
local-state seeding depends on — it reads `brand.sections` once, at mount.

**No second Save button and no second `Cmd-S`.** The editor owns both. Two
triggers over one destructive full-list write is how you get a wipe nobody can
trace, and `EditGuidelinesDialog` already declined the same call. There is a test
pinning this (below), because it is the kind of thing a later "the pane should
have its own footer" instinct quietly breaks.

### B3 — cache coherence (`api/queries/brands.ts`)

A brand's sections are now cached in **two** places: `brands/:id` (the hub's
context bar) and the `brand` embedded in each `ProjectDetail` (what the new right
pane renders from). `useUpdateBrandGuidelines` only repointed the first.

The visible editor would have looked correct either way — it reseeds from the
mutation response — right up until any refetch of the project detail put the
pre-save sections back beside it. React Query's default window-focus refetch does
exactly that. This is the 1.4.0 **I1** bug class one layer out, and it would have
been mystifying to debug: the editor is right, the data behind it is wrong, and
the trigger is switching browser tabs.

Both writes now live in an exported `applyGuidelinesToCache(queryClient, brandId,
sections)`; `onSuccess` is a single call to it.

The project half uses the literal key prefix `['projects']`, **not**
`projectKeys` — `projects.ts` already imports `brandKeys` from `brands.ts`, so
importing back would be an import cycle. That prefix also matches `['projects',
id, 'blocks' | 'messages' | 'shortlist']`, whose data is an *array*, so the
updater narrows through an `isProjectDetailOfBrand` type guard before spreading.
Without it, saving guidelines would replace a cached block list with an object.

### B4 — narrow-pane layout

Not just a check — there was a real defect to fix. `SectionRow`'s content column
is `flex-1` with no `min-w-0`, and a flex child defaults to `min-width: auto`,
i.e. its **min-content** width: here, the label `Input`'s intrinsic size plus any
unbreakable string in the body. The editor was built for a dialog (`sm:max-w-2xl`)
and a full-width page; it now also renders in a pane that can be 35% of the
viewport, where that default overflows rather than shrinks.

Added `min-w-0` to that column and `break-words` to the editor box. Both are the
standard fixes for the standard flexbox failure; neither changes the dialog or
page rendering.

### B5 — the canvas that is still there

These threads still get a canvas server-side — every project does, at creation —
we simply don't render it. Cheaper than making canvas creation conditional, and
it keeps a thread convertible later. Recorded here so it isn't rediscovered as a
bug.

This is also exactly why **Phase F is required, not optional**: `streamResponse`
builds canvas tools unconditionally and the system prompt tells the model to use
them, so today an agent in a brand-context thread can still write blocks into a
canvas nobody renders. That work would be persisted, broadcast, and invisible.
Phase B creates that window; Phase F closes it. Noted as a **known gap between
these two phases**, not a defect introduced here.

### Tests (+11)

| File | Δ | What |
| --- | --- | --- |
| `api/queries/brands.test.ts` (new) | +5 | applier repoints the brand detail; repoints a cached `ProjectDetail.brand` while leaving the rest of the detail alone; leaves another brand's detail untouched; does not corrupt the sibling array caches under the same prefix; no-ops on an empty cache |
| `routes/projects.$projectId.test.tsx` (new) | +4 | guidelines pane for brand-context; canvas for freeform; canvas for a standardized thread under another template; neither pane while loading or on error |
| `components/brand/BrandContextPane.test.tsx` (new) | +2 | frames the *live* editor (seeded label + body, not a read-only copy); adds no second save affordance |

Mutation checks:

- Delete the project-detail half of the applier → 1 failure. Restored.
- Narrow the route branch on `kind` alone → the "standardized under another
  template" case fails, i.e. every Copywriting thread would have lost its canvas.
  Restored.
- Remove the `Array.isArray` rejection from the type guard → **no failure**. See
  below.

## Deviations and findings

1. **`applyGuidelinesToCache` extracted rather than inlined.** The plan wrote the
   patch inline in `onSuccess`. Standalone, it matches the house `applyAgentEvent`
   pattern — a pure cache applier tested against a real `QueryClient` — so the
   cache contract is pinned without standing up a mutation, a fetch mock, and a
   provider. The hook is one line.
2. **B4 was a fix, not a check.** The plan said "verify at the narrowest split".
   The verification found a real overflow path, so `min-w-0` / `break-words` went
   in. Worth flagging because the visual proof is still owed: this is reasoned
   from the CSS box model, not observed in a browser. Phase H should look at it.
3. **The `Array.isArray` guard is redundant today.** Mutation-checking it proved
   the array caches are already excluded by the `brand.id === brandId` check —
   an array has no `.brand`. It is kept anyway, with a comment saying so: it is
   what keeps the updater honest if the brand check is ever loosened (e.g. to
   "patch every project detail"). Recorded rather than quietly left as
   apparently-tested code, because the tests do **not** in fact pin it.
4. **Test scope ran ahead again**, as in Phase A: G6 (route branch) and G14
   (cache patch) are now paid, plus the no-second-save guard. Phase G shrinks
   further; what remains there is almost entirely capture-gesture coverage.

## Verification

```
pnpm typecheck      9/9 workspaces
pnpm lint           clean
pnpm format:check   clean
pnpm test           348 passed | 10 skipped (358)
pnpm build          all packages ok
```

**Same two caveats as Phase A**, unchanged:

- The 10 skips are the live-Postgres suites (no Docker daemon, no root `.env`, so
  `DATABASE_URL` is unset). Phase B touches no `db` or `server` code. This pass
  does not claim "no skips"; Phase H owns that gate.
- **No live browser pass.** Three things in this phase are reasoned rather than
  observed, and Phase H should look at each: the narrow-pane layout (B4), the
  header strip actually matching `CanvasPane`'s by eye, and the window-focus
  refetch path in B3 — which is a real browser behaviour that a `QueryClient`
  unit test can only simulate.

## Files touched

| Action | Path | What |
| --- | --- | --- |
| New | `packages/web/src/components/brand/BrandContextPane.tsx` | right pane for a brand-context thread |
| New | `packages/web/src/components/brand/BrandContextPane.test.tsx` | +2 |
| Edit | `packages/web/src/routes/projects.$projectId.tsx` | right-pane branch |
| New | `packages/web/src/routes/projects.$projectId.test.tsx` | +4 |
| Edit | `packages/web/src/api/queries/brands.ts` | `applyGuidelinesToCache`, `isProjectDetailOfBrand` |
| New | `packages/web/src/api/queries/brands.test.ts` | +5 |
| Edit | `packages/web/src/components/brand/BrandGuidelinesEditor.tsx` | `min-w-0`, `break-words` |

**Untouched:** `packages/shared`, `packages/db`, `packages/server`,
`packages/agent`. No migration, no new tables, no new API routes, and still no
second caller of `updateBrandGuidelines`.

## Next

**Phase C** — the capture gesture: `buildCaptureTransfer` + a drag handle on
message bubbles (`text/plain` only for user messages, per Correction 3), drop
affordances on the guideline sections, a new-section drop target, and the
click-path alternative. That phase is the shippable core; the surface it drops
into now exists.
