# Brand context capture — Phase H: verification (deferred to production)

Status: **not done — deliberately skipped.** Eighth and final phase of
[`docs/executing/brand-context-capture.md`](../executing/brand-context-capture.md).
Follows [A](brand-context-capture-phase-a.md),
[B](brand-context-capture-phase-b.md), [C](brand-context-capture-phase-c.md),
[D](brand-context-capture-phase-d.md), [E](brand-context-capture-phase-e.md),
[F](brand-context-capture-phase-f.md) and [G](brand-context-capture-phase-g.md).

This file exists because the plan requires it: *"if the key is unavailable, say
so plainly in the completion doc and list exactly which steps went unverified —
do not mark the phase done."* The key **was** available. The pass was skipped by
an explicit decision to verify in production instead, taken on 2026-07-28. The
requirement to name the unverified steps is unchanged either way, and that list
is the substance of this document.

**No code changed in this phase.** Test count stays at **400**.

## The decision

Phases A–G are feature-complete and unit-covered. What H owned was the part no
unit test can reach: a real browser, a real drag, a real model, real Postgres.
Rather than run that walk locally first, the release ships and the walk happens
against production.

The decision is defensible on one specific ground, and it is worth stating
precisely so nobody later mistakes it for a general licence:

> This pass touches **no migration, no new table, no schema change, no new API
> route, and no second caller of the destructive guidelines write**.
> `packages/db` and `packages/shared` are untouched. The blast radius is
> confined to render-time behaviour and one withheld tool set, so rollback is
> redeploying the previous image — there is no data state to unwind.

That ground would **not** hold for a pass containing a migration. Do not cite
this file as precedent for one.

## What is actually verified, and by what

Everything below ran green on the release commit:

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | 9/9 workspaces |
| `pnpm lint` | clean |
| `pnpm format:check` | clean |
| `pnpm build` | all packages |
| `pnpm test` (local) | 390 passed, **10 skipped** |

The 10 skips are the live-Postgres suites; Docker was not running locally.
**CI closes that gap on push** — `.github/workflows/ci.yml` runs `pnpm test`
against a Postgres 16 sidecar with `DATABASE_URL` set, so the suites that skip
locally execute there. That is the *no-skips* half of H's gate, and it is met by
the CI run on this commit rather than by a local run.

**It is not met before the deploy.** `deploy-backend.yml` triggers on
`push: main` with no `needs:` dependency on the verify job, so `fly deploy` and
the test suite start concurrently. A red CI does not hold the release. Whoever
watches this push should watch the CI run too, and be ready to roll back on a
failure rather than assume the deploy was gated on it.

## Unverified — the walk that still owes us

Ordered as the plan ordered it. Nothing here is known-broken; all of it is
**unobserved**. Items 3, 4, 6, 7 and 12 are the ones that cannot be inferred
from any test in the suite.

1. **Persistence.** A conversation survives a tab close and reopen with its full
   transcript.
2. **Drag, both roles.** An agent message into an existing section; a user
   message into the new-section target.
3. **Position** — content lands at the ProseMirror cursor rather than appending.
   Correction 5 states outright that jsdom can never express this.
4. **Formatting survives.** A bulleted reply drops as a real list; an `h4` or a
   table is coerced by the schema rather than crashing it.
5. **Nothing is written until Save.** Navigating away with a staged drop
   discards it.
6. **The loop closes.** After saving a captured section, the *next agent turn
   reflects it*. The plan's own words: *"if only one step is verified, make it
   this one."* It is the entire point of the feature and it has never been
   observed end to end.
7. **No phantom canvas.** F1 withholds the tools, but that is proven only
   against the in-memory fake. Whether a real brand-context thread leaves an
   orphaned `canvas_blocks` row in real Postgres is unobserved. This is the
   correctness defect F existed to fix, and it is the one item here that is
   checkable by query rather than by eye:

   ```sql
   -- expect zero rows for a brand-context thread
   SELECT b.* FROM canvas_blocks b
     JOIN canvases c ON c.id = b.canvas_id
     JOIN projects p ON p.id = c.project_id
    WHERE p.template_id = 'brand-context';
   ```

8. **Cross-thread.** Capture from a Copywriting thread reaches the same place.
9. **Siblings survive** every save — the 1.4.0 I3 destructive-write class.
10. **Both halves of the hidden split.** No Brand context tile on the hub, and
    the conversation does not fall into "Other threads".
11. **`/brands/$brandId/apps/context`** redirects instead of rendering a second
    surface (Correction 2).
12. **Cache coherence.** Save guidelines inside a thread, trigger a window-focus
    refetch, confirm sections do not revert (Correction 4). The failure mode is
    silent and delayed, which is exactly why it was written down.
13. **Both themes**, accent budget respected, zero console errors.

Carried forward from the A–G write-ups, also unobserved:

- `clearData` taking effect on a native selection drag (D3).
- The floating affordance's placement — collision at the top of the pane, and
  whether any transformed ancestor breaks `position: fixed`. `SplitScreen` was
  read and has none, but that is reasoning, not looking.
- Whether the dialog opens scrolled to the capture (E).
- Mobile long-press selection — named in D's cut criterion, no touch device in
  the pass.
- Whether a real model actually interviews and phrases crisply under F2's
  persona. F3 is blunt that this is what makes capture worth doing: if replies
  are three paragraphs of hedging, there is nothing crisp to grab. **This is a
  prompt-quality question that no test can answer** and it is now a production
  observation.
- Gutter layout: whether `opacity-0` + `group-hover` reads as discoverable
  rather than hidden.

## Rollback

No migration ran, so rollback is image-only:

```
fly releases --app brandfactory        # find the prior release
fly deploy --image <previous-image>    # or: fly releases rollback
```

The web app rolls back through Vercel's deployment history. No data cleanup is
required for any item on the unverified list except **7**, where the remedy for
a phantom block is deleting the orphaned rows the query above finds.

## Next

Walk the thirteen steps against production and record the result here, replacing
this section. Until that happens the feature ships **unobserved**, and this
document — not the plan's status header — is the honest description of its
state.

Two standing items are unaffected by this decision and remain open from 1.4.0:
the repo-wide `TEMPLATE_ID` constant plus DB `CHECK` (the id is now duplicated
in a third place, `packages/agent/src/templates.ts`, which raises the price of
continuing to defer it), and bespoke Social-calendar UI.
