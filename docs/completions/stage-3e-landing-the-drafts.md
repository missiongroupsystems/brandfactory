# Stage 3E — landing the drafts

**Status:** shipped, 2026-07-29. Executes Stage 3E of
[`docs/executing/brand-hub-implementation.md`](../executing/brand-hub-implementation.md),
on top of [3D](stage-3d-the-shaping-pass.md).

**No migration, no route, no server change.** The drafts 3D produces finally
reach a human: written straight into an empty brand with an Undo, or offered to
a curated one in the review sheet 1.8.0 built from fixtures.

Test baseline: **779** → **818**. **+39**, zero skipped with a `DATABASE_URL`.

**It ran end to end against the real hub, real Postgres and a real browser —
without calling the vendor.** See *The live pass* below, which changed the code
twice.

---

## Two paths off one condition, and *when* it is asked is the design

```
drafts land
  ├─ brand has no sections   → write them, toast, Undo        (E1)
  ├─ brand has sections      → open the review sheet          (E2)
  └─ sections not known yet   → open the review sheet
```

The condition is evaluated **when the drafts land, not at submission**. A deep
run takes 3–15 minutes, which is ample time to start typing a Voice section by
hand — so a brand that was empty when you clicked *Research this brand* need not
be empty when the report comes back, and writing over what you typed in the
interval is the worst thing this feature could do. That is the phase's
load-bearing test, and it does not need a rendered page to state.

The third row is the one that is easy to miss. `sections === undefined` is a
brand whose guidelines we do **not know** — pending, or a failed query — and it
is not an empty brand. The difference between the two is a destructive write, so
the unknown case takes the path that *asks*.

## The arrival is a transition, not a state

`useResearchArrival` remembers the id of a job it saw `IN_PROGRESS`, and only
that job can arrive. **A hub that mounts on an already-complete run has
witnessed nothing** — it renders the rail's `N drafts ready — Review` row and
waits to be clicked.

The alternative is worse than it first looks: keying off status alone means
opening a brand page days after a run silently rewrites its guidelines, in
response to nothing the user just did. Three properties, all tested:

- **once per job** — the query polls every 5 seconds and re-renders on every
  answer; the arrival is a moment, not a status
- **again for a new run** — the id is the key, which is what makes E2's sheet
  open by itself on the re-run it exists for
- **only `COMPLETED` with drafts** — `FAILED`, `NO_FINDINGS` and a completed run
  whose shaping pass produced nothing each have a rail row that says so, and
  none of them has anything to land

## Undo is a full-list write of `[]`, which is why it is guarded

E1's toast carries an Undo that writes the empty list back through the **same
single writer**. That is correct exactly while the list is still the sections
research just added, and a total wipe one save later — so `sectionsUnchanged`
compares ids **and** `updatedAt`, in order, against what was written. Ids alone
would miss a body edit, which is the likeliest thing to happen in the seconds a
toast is on screen.

An Undo firing against an edited brand is the accident decision 8 exists to
prevent. It is checked, not raced, and both halves have tests.

## `createdBy: 'agent'`, and the asymmetry that was nearly shipped

Stage 1B made the enum value expressible and shipped ahead of this phase so that
the first thing to write it would not have its answer rewritten on the user's
next save. **This is that first producer** — and it writes on *both* paths.

The plan names `'agent'` for E1 only. Marking E2's accepted drafts `'user'`
would mean the same five drafts record a different author depending on whether
the brand they landed in happened to be empty, which is not a fact about the
drafts. `StagedSection` therefore carries an optional `createdBy`, and the 1.5.0
capture gesture — which passes none — stays `'user'` exactly as its test has
said since Phase G: *you curated it, the agent did not write it here*.

## The staged channel widens, and the coupling is the good kind

`staged` goes from one `CapturePayload` to an ordered list of
`{ label, payload, createdBy }`. One behavioural change in `BrandGuidelinesEditor`
and two **pure type pass-throughs** in `EditGuidelinesDialog` and
`BrandContextPane` — widening the editor without widening both forwarders does
not compile, which is how the typecheck found every call site for us.

**The StrictMode guard is now per item, and had to be.** 1.5.0 kept one payload
here and compared the prop against the last one consumed; with a list that is
insufficient in one direction — staging `[A]` and then `[A, B]` is a different
array, and a list-level check appends `A` twice. A `WeakSet` of the items
already taken answers exactly the question being asked, including for the
StrictMode replay that reaches production as a double paste nobody can reproduce
in a build.

## The live pass, which cost nothing and changed the code twice

The vendor was never called. A `COMPLETED` job row with hand-written drafts was
inserted directly, which is precisely what 3D's shaping pass would have produced
from a real report — so the **entire** client half ran against the real route,
the real `PATCH /brands/:id/guidelines` and real Postgres for **$0.00**.

```
E2  rail row  “3 drafts ready — Review”  →  sheet, 3 drafts, sources on each card
    Accept selected (3)                  →  editor: 5 rows, 2 existing + 3 staged
    Save guidelines                      →  user, user, agent, agent, agent
E1  rail row  “Researching…”             ←  watcher armed, job still in flight
    job flipped to COMPLETED in the DB   →  “3 sections added from 12 sources”
    Undo                                 →  0 sections
```

**The first time this application has ever written `createdBy: 'agent'`.** No
console errors, both themes, and the dev database was left exactly as found — 3
brands, `Acme Coffee` at 3 sections, 0 research-job rows.

### What looking at it found

**Accepting drafts could look like it had done nothing.** New sections are
appended and the dialog opens at the top, so on a brand with six sections the
three accepted drafts landed entirely below the fold. Every test passed —
*the row exists* and *you can see the row* are not the same claim. Fixed by
scrolling the first accepted draft into view.

**`block: 'nearest'` was the wrong minimum.** Measured on that six-section
brand, it did the least that satisfies "in view": it parked the new row's
**label** on the bottom edge with the body still cut off, which reads as an
empty field rather than as three drafts that just landed. `'start'` puts the
first accepted draft at the top, so what you accepted is what you are looking
at. Both the finding and the correction are in the comment.

### And one thing that was *not* a bug

The first screenshots showed the review sheet and the edit dialog stacked on top
of each other. Re-shot with the transitions settled: exactly one dialog is
mounted. Animation, not a defect — worth stating because a live pass that
reports its own capture artefacts is worse than no live pass.

## A pre-existing test bug this pass had to fix to be able to claim anything

The full suite failed on `listBrandSummariesByWorkspace` expecting 3 sections
and finding 2 — nothing to do with 3E, which touches no server or db code.

`packages/db/vitest.config.ts` has carried `fileParallelism: false` since 0.9.1
with a comment explaining that the live-DB files must not race each other.
**`fileParallelism` is a root-level option: set in a project config it is
silently ignored.** So `guidelines.live.test.ts` — which deletes and re-inserts
the seeded brand's sections — has been running concurrently with the two files
that assert exact counts on those rows, and `pnpm test` passed or failed on
worker timing. Every "0 skipped, all green" in 3B, 3C and 3D was luck.

Fixed with `pool: 'forks'` + `poolOptions: { forks: { singleFork: true } }`,
which is the same intent expressed where vitest reads it. Verified by running
the db project three times in a row before and after.

## Verification

```
pnpm typecheck                          10/10 workspaces
pnpm lint / format:check                clean
DATABASE_URL=… pnpm test                818 passed | 0 skipped
pnpm --filter @brandfactory/web build   ok · grep -c demo dist → 0
```

| file | Δ | what it pins |
| --- | --- | --- |
| `web/src/components/brand/useDraftLanding.test.tsx` | +19 | the arrival as a transition · nothing for an already-finished job · once per poll · again for a re-run · nothing for failed / no-findings / shaped-nothing · **the boundary: a brand with one section takes E2 and writes nothing** · an unknown section list asks rather than acts · E1's payload, its author and its toast · singular counts · a failed write not falling through to the sheet · Undo writing `[]` · Undo refusing after an add and after an edit · staging in order and clearing |
| `web/src/components/brand/researchDrafts.test.ts` | +13 | the headless parse · marks the editor has surviving · the plain-text fallback · labels and priorities · `'agent'` on both paths, and that they agree · `sectionsUnchanged` for add, delete, edit and reorder |
| `web/src/components/brand/BrandGuidelinesEditor.test.tsx` | +7 | one named row per draft, in order · drafts saved `'agent'` beside the user's own `'user'` · provenance surviving a rename · **the per-item guard: `[A]` then `[A, B]` stages `A` once** · a list staged once under StrictMode · an empty list doing nothing · the first accepted draft scrolled into view |
| `web/src/routes/projects.$projectId.test.tsx` | +0 | the two existing capture tests now also pin that the click path stages **exactly one** item |

## Caveats

- **The rail still says `3 drafts ready — Review` after E1 has populated.** True
  — the drafts are still on the job and the sheet still opens — but it invites
  adding them a second time. There is no route to mark a job reviewed, and 3E
  does not add one.
- **Nothing has run against a real report.** The drafts in the live pass were
  hand-written to the shape 3D emits. 3D itself has still never run against a
  real model (its `OPENROUTER_API_KEY` is a placeholder), so the *content* of a
  real draft — its length, its labels, whether it obeys
  `DRAFT_TARGET_MAX_CHARS` — remains unobserved. 3G.
- **E1 fires only for a job this tab watched in flight.** Deliberate, and the
  cost is that starting a run and closing the tab means coming back to the
  Review row rather than to a populated brand. The quieter failure was judged
  worse than the quieter success.
- **Undo has no undo.** It writes `[]`, and if the guard passes there is nothing
  to recover from a mis-click beyond re-running research.
- **The review sheet still selects everything on arrival** and accepts up to
  whatever the model produced; nothing caps how many sections one gesture can
  add.
- **`clearStaged` is wired to the editor's consume callback, not to the dialog
  closing.** Closing the dialog before the effect runs would leave the drafts
  staged for the next open — not reachable today, because the editor consumes on
  mount.

**Untouched:** every package except `web`, `BrandContextRail`, the review
sheet's own component (it got real drafts, not a new prop), and
`docs/changelog.md` — Stage 3 ships as 1.11.0 at 3G.

**Next in the plan:** 3F — the report joins the conversation, as the first
`assistant` message of a newly created brand-context thread named for the run.
