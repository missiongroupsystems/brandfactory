# Stage 3G — verification, the live pass, and the demolition

**Status:** shipped, 2026-07-30. Executes Stage 3G of
[`docs/executing/brand-hub-implementation.md`](../executing/brand-hub-implementation.md),
on top of [3F](stage-3f-the-report-joins-the-conversation.md). **Ships as 1.11.0.**

**A real vendor call was made.** One run, authorised explicitly, on the same
target 3A spiked: **$0.4157, 48,607 characters, 17 citations, 5.2 minutes.**

Test total: **887**, and the demolition **removed 18** (the mockup's own) while
adding none. Typecheck 10/10, lint and format clean.

---

## The paid pass, and what it actually proved

Clicked in the UI rather than curled, so the client path was under test too.

```
[0s]    click “Research this brand”      rail → “Researching… started 1 second ago”
                                          (instant: 3C writes the response into the cache)
[310s]  COMPLETED · 17 sources · 0 drafts (the client’s own 5-second poll, no reload)
row     48,607 chars · 17 citations · cost_usd 0.415660 · 5.2 min wall clock
thread  “Brand research — Ebb & Flow Group, 30 Jul 2026”
```

**The URL gate did its job.** The report is about the company at the URL it was
given — its actual sub-brands, its actual market — which is the failure mode
decision 4 exists to prevent, checked against a real report rather than reasoned
about.

### The numbers moved, and the plan's cost figure was a sample of one

| | 3A | 3G |
| --- | --- | --- |
| cost | $0.377 | **$0.4157** |
| report | 67,780 chars | 48,607 chars |
| citations | 19 | 17 |
| wall clock | 4.0 min | **5.2 min** |

**10% more expensive and 30% longer** on the same target, two days apart. 3A said
"cost and duration are a sample of one"; this is the second sample, and it says
the first was not a ceiling. Nothing depends on the exact figure — the daily cap
is a job count — but *"a run costs $0.377"* should be read as *"a run costs
around $0.40, and varies"*.

### Shaping failed on a real run, exactly as 3D said it would

`OPENROUTER_API_KEY` in this environment is the placeholder 3D documented, and
the shaper threw **`Unauthorized`**. Probed directly against the stored report to
be sure of the cause rather than inferring it from the empty result.

**So 3D's refusal is now verified against a real, paid report**: the throw was
swallowed, the run still reached `COMPLETED`, and all 48,607 characters are on
the row. A $0.42 report was not discarded because the writing model was
unreachable — which is the whole point of that `try`.

**And therefore E1 and E2 were not exercised live.** No drafts means no arrival,
no auto-populate, no Undo, no review sheet. That was the accepted trade when this
pass was authorised; those paths remain verified against fabricated
(shape-accurate) drafts in 3E's own live pass, on real Postgres.

## 3F, on a real report

| | |
| --- | --- |
| thread created and named | `Brand research — Ebb & Flow Group, 30 Jul 2026` |
| renders | **0.2s**, no console errors, 48,925 characters of page text |
| capture | 48,607 chars → a section in **3.1s** |
| the 3F label guard | fired on the real body: **0 PATCHes**, actionable toast |
| saved | 200, a **53,984-character** ProseMirror document |

The label guard is worth singling out. It was found in 3F against a 4,000-character
stand-in; the case it exists for is exactly this one — a 48,607-character capture
that nobody is going to name before hitting Save — and before the fix that was a
toast reading `Bad Request` with every other edit in the payload discarded.

## The one real finding, and it points at a follow-up already named

**A `COMPLETED` run with zero drafts is indistinguishable in the rail from a
brand nobody has researched.** The row falls back to `Research this brand`,
inviting a second $0.42 run for a report that is already sitting in a thread.

Not fixed here, because the fix is not in the rail: the wire says nothing about
3F's thread, so the rail has nothing to offer. `threadId` on
`ResearchJobSummary` — named as the obvious follow-up in 3F — is what would let
this row say *Read the report* instead of *Research this brand*. Recorded, not
built, and now with a real run behind the argument.

## Two things that looked like bugs and were mine

Reported here because a live pass that quietly launders its own artefacts is
worth less than one that does not.

- **The rail appeared to have no buttons at all** after the run, and **the report
  thread appeared not to render within 20 seconds.** Both were observed while
  `tsx watch` and Vite HMR were reloading the page under the test — because I was
  editing source files *during* the run. Re-checked in a quiet environment: the
  rail is correct and the thread renders in 0.2s.
- **My own `pkill -f vite` took the user's dev server down with it**, because
  `scripts/dev.sh` exits when either child dies. Restored, and the process
  situation is why the shaping failure has no log line I can show: the server
  that served the run was a supervisor from the previous day whose stdout is not
  captured anywhere I can read.

## `RESEARCH_PROVIDER=none` — the property the callback gate was built for

Booted on its own port, against the same database:

```
boot                          clean · no warning about a missing key
GET  /brands/:id/research     { "enabled": false, "job": null }
POST /brands/:id/research     501
rail                          zero research affordances
```

The rails were compared button-for-button: identical, minus one row. Not a
disabled row, not a row that fails when clicked — **absent**. A self-hoster with
no key gets the 1.7.0 hub, and `Talk it through` sits alone in the footer with no
orphaned divider.

## The migration path, including the one that broke v7 and v8

0005 had never been through the release migrator. Both migrators, from empty, on
throwaway databases, then re-run to prove idempotency:

```
scripts/migrate.mjs (release)   12 tables · idempotent
drizzle-kit migrate (dev)       12 tables · idempotent
```

0005's structures were **read back off the fresh database** rather than assumed —
the `ON DELETE cascade`, the five-member enum, and the partial index with its
`WHERE (status = 'IN_PROGRESS'::research_job_status)` intact. Both scratch
databases were dropped.

## The demolition

```
deleted   packages/web/src/demo/          (the fixtures, the bar, the dialog)
deleted   the mockup route file
deleted   the import.meta.env.DEV ternary · both /* @__PURE__ */ annotations
deleted   the `as unknown as typeof appRoutes` cast the gate needed
```

Both checks the plan asked for, run rather than assumed:

```
grep -rn "src/demo" packages/web/src                    → 0
pnpm --filter @brandfactory/web build; grep -c demo …    → 0
```

The router comment now *describes* the deleted paths instead of spelling them,
which is what keeps that first grep a signal rather than a match on its own
documentation.

**Four comments were lying and are fixed.** `VisualIdentityPage`,
`AssetLibraryView`, `BrandHubView` and the hub route all described the mockup in
the present tense; `BrandHubView`'s also still claimed `logoSrc` and `research`
were unfed, three stages after they stopped being. And one test asserted a
`tileHref` of `/demo/brand/assets` — a route that no longer exists — now an
arbitrary path, which is all that test was ever about.

**1.8.0's invariant is now formally closed.** Every prop the mockup added is fed
by the real route; the half that carries the weight — *every affordance renders
nothing when its prop is absent* — is unchanged, and `RESEARCH_PROVIDER=none` is
its newest instance.

## The inherited debts, discharged

**1.6.0's brand switcher has now been seen.** It had never been screenshotted:
1.8.0's demo route had no auth, so both pills returned `null`. Both render, the
pill truncates at 224px with an ellipsis, and the identity band truncates a
90-character brand name at the container edge with the monogram still derived.

**The menu at 32 brands scrolls** — `max-h-80` was already there, and it is why
the list does not run off the viewport.

**And the horizontal twin was missing.** Measured against a 90-character brand
name, the switcher menu opened **670px wide** — most of the page, with all 32
short names rattling in rows sized for the one long one. The items have said
`truncate` since 1.6.0, but a dropdown with no maximum grows to fit its widest
child, so the ellipsis never engaged. `max-w-80` plus `min-w-0` on the row (a
truncating child of a flex row cannot shrink without it) takes it to **320px**,
re-measured. `WorkspaceSwitcher` has the identical construct and the identical
defect, and gets the same ceiling.

## Verification

```
pnpm typecheck                          10/10 workspaces
pnpm lint / format:check                clean
DATABASE_URL=… pnpm test                887 passed | 0 skipped  (100 files)
pnpm --filter @brandfactory/web build   ok · grep -c demo dist → 0
both migrators, from empty              12 tables · idempotent
```

887 is stable across three consecutive runs and equals the sum of the per-project
runs (web 409, server 258, db 66, shared 54, agent 43, adapters 57). Intermediate
totals quoted earlier in this session were taken while several dev servers were
thrashing and are superseded by this figure.

**No tests were added by this stage** — a verification pass that grows the suite
has changed behaviour — except the two the 3F label fix required, which landed in
3F. The demolition removed the mockup's 18.

## Caveats

- **E1 and E2 have never run against a real model**, and a real report has never
  been shaped. Supply a working LLM key and it is one click; the gap is a
  credential, not code.
- **`DRAFT_TARGET_MAX_CHARS` is still only asked for.** No real model has been
  measured against it.
- **The Perplexity key in this environment is temporary** and must be rotated
  before production. Two real runs have now been billed to it.
- **One brand, two runs, one target.** Everything known about cost and duration
  comes from `ebbflowgroup.com`.
- **The paid run's artefacts are kept**, in a `3G Live Pass` workspace of their
  own so the workspace-scoped live tests stay green: the brand, the 48,607-char
  report, its thread, and the section captured out of it.
- **The rail cannot mention the report** — see the finding above.
- **`CANCELLED` still has no producer**, the ticker is still single-instance, and
  nothing sets asset `alt` text. All three are recorded elsewhere and unchanged.

**Next:** nothing in this plan. Stage 3 is complete and the changelog entry for
**1.11.0** is written.
