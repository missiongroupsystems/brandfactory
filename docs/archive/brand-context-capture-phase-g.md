# Brand context capture — Phase G: tests (reconciliation)

Status: **done**. Seventh phase of
[`docs/executing/brand-context-capture.md`](../executing/brand-context-capture.md).
Follows [A](brand-context-capture-phase-a.md),
[B](brand-context-capture-phase-b.md), [C](brand-context-capture-phase-c.md),
[D](brand-context-capture-phase-d.md), [E](brand-context-capture-phase-e.md) and
[F](brand-context-capture-phase-f.md).

## What this phase actually was

G was planned as "write the tests" — target +25–35 on top of 332. It could not
run that way, because Phases A, B, E and F each wrote the coverage G had
scheduled for them (A and B recorded this at the time as "test scope ran ahead of
the plan"), and D and F added mutation-driven tests G never listed. By the time G
started the suite was already at **399**.

So G ran as a **reconciliation**: walk the plan's seventeen numbered items, prove
each is paid or write it, and say plainly which ones jsdom cannot express so they
move to H rather than quietly disappearing.

Sixteen were paid. **The seventeenth was hiding a real defect.**

**399 → 400 tests (+1), plus one bug fixed.**

## The ledger

| # | Item | Status |
| --- | --- | --- |
| 1 | `context.match` claims only `standardized/brand-context`; partition invariant holds; unregistered templates stay unclaimed | paid — A |
| 2 | a brand-context thread is not an orphan **and** not in `TILE_APPS` | paid — A (as two tests, not one) |
| 3 | thread-count derivation covers the `context` key | paid — A, as `context: 1` not the planned `0` (A's deviation 5: the shared fixture gained a real conversation, so the partition and orphan invariants cover it for free) |
| 4 | `miniAppRoute` redirects a hidden surface; an unregistered id still hits the unknown-app branch | paid — A |
| 5 | `brands.$brandId.context`: list, empty state, failed brand query | paid — A (+ a loading state) |
| 6 | `projects.$projectId` picks the right pane, including standardized-under-another-template | paid — B |
| 7 | `buildCaptureTransfer` both roles | paid — C |
| 8 | `onDragStart` writes what `buildCaptureTransfer` returned | paid — C |
| 9 | a drop appends exactly one section and stages the payload | paid — C |
| 10 | a drop fires **no mutation** until Save | paid — C |
| 11 | `pendingInsert` reaches `insertContent` **and is cleared after** | **half paid — see below** |
| 12 | degrades to plain text with no `text/html` | paid — C |
| 13 | capture from a Copywriting thread reaches the dialog, staged | paid — E (route + editor halves) |
| 14 | the guidelines save patches a cached `ProjectDetail` | paid — B |
| 15 | `buildSystemPrompt(brand)` byte-identical | paid — F (snapshot recorded from the pre-F build) |
| 16 | `brand-context` swaps the canvas block for the persona | paid — F |
| 17 | `streamResponse` withholds tools for `brand-context`, full set otherwise | paid — F |

Everything the plan listed as **"explicitly not unit-tested"** (Correction 5 —
that a real drag lands at the ProseMirror cursor rather than appending) is
unchanged and belongs to H.

## Item 11, and the bug under it

The plan asked for two things: that `pendingInsert` reaches
`editor.commands.insertContent`, and that it is **cleared after**. The first half
was paid three times over. The second was paid by nothing — and the reason it was
worth chasing rather than waving through is that *clearing has no observable
behaviour in the current UI*. `pendingInserts` is keyed by section `_key`, the
effect's deps don't change when the entry lingers, and no flow remounts a
`SectionRow` while a payload is pending. A stale entry is invisible.

So the honest question was not "is it cleared" but **"what is the clearing
protecting against"** — and that is StrictMode. The effect was:

```ts
useEffect(() => {
  if (!editor || !pendingInsert) return
  editor.commands.insertContent(pendingInsert.html ?? pendingInsert.text)
  onInsertConsumed(section._key)
}, [editor, pendingInsert, onInsertConsumed, section._key])
```

React StrictMode double-invokes effects in dev, and `onInsertConsumed` is a state
update that has **not landed** by the time the second invocation runs. The test
written to check this failed on the first run: `expected 2 to be 1`.

**Every captured message was pasted into its section twice in development.**

It survived five phases because the guard that *looks* like it covers this —
Phase C's `consumedStagedRef`, which pins "stages a given payload only once,
under StrictMode" — guards the **parent**, and counts **sections**. A section
appended twice and a body inserted twice are different bugs, and the existing
test asserted only the former. The C write-up even records getting this exact
lesson right one level up ("the first version of that test was worthless and
looked fine"), which is what made the gap findable: the pattern was named, so its
absence was conspicuous.

**Fix:** the same identity guard C used in the parent, applied to the insert
path.

```ts
const insertedRef = useRef<CapturePayload | null>(null)
if (!editor || !pendingInsert || insertedRef.current === pendingInsert) return
```

Per-row ref, so the same payload can still be inserted into a different section,
and each fresh capture is a new object.

**Scope:** dev-only. React does not double-invoke effects in production builds,
so no shipped build pasted twice — but every developer and every manual QA pass
since Phase C saw doubled text, which makes it exactly the kind of thing that
would have wasted the Phase H walk.

Mutation-checked: removing the identity clause fails the new test (`expected 2 to
be 1`). Both the click/`staged` path and the drop-onto-new-section path funnel
through this one effect, so one test covers both.

## Deviations from the plan

1. **G wrote one test, not twenty-five.** The target assumed A–F had left the
   coverage to G; they had not. Reporting the planned number would have meant
   padding the suite with duplicates of tests that already exist.
2. **The ledger is the deliverable.** A phase that mostly confirms other phases'
   work has to leave evidence it actually checked, hence the table above — with
   the two places reality differs from the plan (item 3's `context: 1`, item 2's
   two tests) called out rather than smoothed over.
3. **A defect was fixed inside a test phase.** G is scoped to tests, and
   `BrandGuidelinesEditor.tsx` is production code. Deferring it to a remediation
   phase would have meant knowingly leaving a double-paste in the tree while
   writing a document that says the insert path is covered.

## Verification

```
pnpm typecheck      9/9 workspaces
pnpm lint           clean
pnpm format:check   clean
pnpm test           390 passed | 10 skipped (400)
pnpm build          all packages ok
```

**Not verified** — unchanged from F, and all of it now belongs to H:

- that a real drag lands at the ProseMirror cursor rather than appending
  (Correction 5, never unit-testable);
- `clearData` taking effect on a native selection drag (D3);
- the floating affordance's placement, and whether the dialog opens scrolled to
  the capture (E);
- mobile long-press selection;
- that a real model interviews and phrases crisply under F2's persona;
- that no orphaned canvas block exists in **real** Postgres for a brand-context
  thread (F is proven against the in-memory fake).

The 10 skips are the live-Postgres suites. **The local live-DB run was skipped by
request** — Docker is not running in this checkout and the user declined to start
it — so this pass does **not** claim 1.4.0's "no skips". H owns that gate, and it
now owns it alone.

## Files touched

| Action | Path | What |
| --- | --- | --- |
| Edit | `packages/web/src/components/brand/BrandGuidelinesEditor.tsx` | insert path keyed on payload identity (the G11 fix) |
| Edit | `packages/web/src/components/brand/BrandGuidelinesEditor.test.tsx` | +1, the StrictMode double-insert case |

## Next

**Phase H — verification and live pass.** Everything in this pass is now
feature-complete and unit-covered; what is left is the part no unit test can
reach. H needs a running Postgres (`DATABASE_URL` exported, not merely present in
`.env`) for the no-skips gate, and an `OPENROUTER_API_KEY` — which **is** already
set in the repo-root `.env`, contrary to the "no root `.env`" caveat repeated in
the A/B/C write-ups. That caveat is stale and should not be copied forward again.

The plan is blunt about the standard: if the key is unavailable, name the
unverified steps and do not mark the phase done. The same should apply to the
Postgres gate.
