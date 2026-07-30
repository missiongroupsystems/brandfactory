# Research observability, and the report that was not there

**Status:** complete, 2026-07-30. Written against `main` at **1.13.1**
(`c89b438`).

A review pass over everything 1.13.1 shipped, and the five findings it produced.
None of them are in the code 1.13.1 wrote — that code is sound and its tests
hold. Four of the five are one layer underneath it, in the parts of the research
lifecycle that release *depended on* and did not touch.

The headline is the first one, and it is not a bug in the ordinary sense. 1.13.1
was justified as the release that makes the next live run diagnosable. **On the
most likely failure path it was not**, and the completion notes closed with an
investigation plan that could not have worked.

---

## 1. A completed run with no drafts could not be explained

### What 1.13.1 concluded, and why it was not enough

The first watched production run (the brand *Temper*, `temper.sg`) reached
`COMPLETED` with zero drafts. 1.13.1 responded correctly at the surface — it
built the `finished` rail row, so the state stopped rendering as *nothing ever
happened* — and then said this about the cause:

> Why shaping produced nothing is **not** established. The candidates are a
> throw or a timeout in the writing model (`SHAPE_TIMEOUT_MS`, 3 min) — both
> logged as `research shaping failed`, just outside the retained log window.
> Catching it needs `fly logs -a brandfactory` streaming across the next run.

Both named candidates are real. The list is not exhaustive, and the gap is the
whole finding: **`research shaping failed` fires only from the `catch`**, and
shaping had *four* ways to return an empty list without throwing at all.

| Path | Where | Logged before this pass |
| --- | --- | --- |
| Model answered outside the schema (`safeParse` failed) | `agent/research/shape.ts` | **no** |
| Model returned a valid, empty section list | `agent/research/shape.ts` | **no** |
| Every section rejected here (empty body, blank label) | `agent/research/shape.ts` | **no** |
| Brand row missing at shaping time | `server/research/shape.ts` | **no** |
| Model threw, or timed out | anywhere | yes |

So the planned investigation — stream logs, watch for `research shaping failed`
— would have come back **clean** on four of five paths, and the reasonable
conclusion from a clean log is *shaping was not the problem*. That is the wrong
conclusion, drawn confidently, at $0.40 a run.

### The path that is most likely, and why

Production runs `LLM_PROVIDER=openrouter` with `LLM_MODEL=anthropic/claude-sonnet-4.6`
(`fly.toml`). `shapeResearchIntoSections` reaches that model through
`generateObject` with a JSON Schema derived from zod 4 — verified locally, it
emits `$schema` and a `default: []` keyword alongside `additionalProperties: false`.
Structured-output support on OpenRouter varies by underlying model, and a
provider that ignores `response_format` answers in prose. Prose parses to
nothing, which lands exactly on `!parsed.success → []`: a completed job, an empty
review sheet, and a silent log.

Worth stating plainly, because it changes what the next run is for: **the
shaping pass has never been observed to work against a real model.** 3G threw
`Unauthorized` on a placeholder key; the Temper run produced zero drafts; every
passing test uses a fake. Two live attempts, two failures to produce a draft.

### What changed

`shapeResearchIntoSections` now returns **why**, not just what:

```ts
export type ShapeOutcome = 'ok' | 'invalid-shape' | 'no-sections' | 'sections-dropped'

export interface ShapeResearchResult {
  drafts: ResearchDraft[]
  outcome: ShapeOutcome
  reportChars: number        // what the model was given
  sectionsReturned: number   // what it returned, before our own filtering
}
```

The three failures are named apart because they are genuinely different events
and want different responses:

- **`invalid-shape`** — the model did not answer in the schema. A fact about
  *our* configuration, and the only one nobody but us can fix.
- **`no-sections`** — the model answered correctly with an empty list. Rule 1 of
  the prompt is *omit rather than invent*, so this can be the honest answer about
  a thin website.
- **`sections-dropped`** — sections came back and this repo rejected every one.
  A bug or a prompt drift on our side, previously indistinguishable from the
  above because each per-section drop is deliberately silent.

`reconcileNow` logs it where the job id lives, with the level chosen by which
one it was:

```
error  research shaping produced no drafts  { jobId, outcome: 'invalid-shape', reportChars: 48607, sectionsReturned: 0, model }
warn   research shaping produced no drafts  { jobId, outcome: 'no-sections',   reportChars: 2143,  sectionsReturned: 0, model }
```

`model` rides along because `invalid-shape` is a question about the model, and
`brand_research_jobs.model` records what actually ran rather than what env says
now (3C's decision, still paying off).

**`sectionsReturned` is `0` on `invalid-shape` on purpose.** Nothing was returned
to count, and any other number would send an operator looking for sections the
model never produced.

### The fifth path, closed rather than named

`createResearchShaper` had `if (!brand) return []`. That is a genuine anomaly —
`brand_research_jobs.brand_id` cascades, so a job being reconciled whose brand
has vanished should not exist — and returning an empty list made it the fifth
silent way to finish a paid run with nothing. It now **throws**, which routes it
into the existing `catch` and the existing `research shaping failed` line. No new
vocabulary for a case that already had a home.

**Why an outcome and not a logger passed into `@brandfactory/agent`.** That
package has no logging dependency and should not acquire one for this: the job
id, the model and the retry context all live on the server, and a log line
without them is not actionable. The seam already existed (`ShapeResearchFn` is a
function precisely so the lifecycle can be tested without a model); widening its
return value keeps the reporting where the context is.

---

## 2. The finished-run row could promise a report that was not there

`hasReportToRead(job)` is `job?.status === 'COMPLETED'`, and 1.13.1 called that
*"a fact rather than a guess"* on the grounds that `COMPLETED` is the exact
condition `landReportInThread` runs under.

It is one swallowed failure short of a fact. `landReportInThread` **never
throws** — logged and returned `null` at `thread.ts:106`, correctly, because a
failed project insert must not fail a run already paid for — and the job is
`COMPLETED` before it runs. A failed insert, or a crash between
`finishResearchJob` and the landing, leaves a row that tells you a $0.40 run left
something to read and sends you to an empty list. That is the exact class of
claim the row was built to stop being made, one turn further on.

1.13.1 saw the shape of this (*"if that thread is absent… there is a third thing
to fix"*) and left it as an inference to check by hand.

### The check, and where it lives

The hub already holds the brand's project list — `useBrandProjects` feeds the
tiles — and `isBrandContextThread` already classifies it. With **zero**
brand-context threads on the brand, the report is definitively not where the row
would send you.

```
hasBrandContextThreads === false  →  Research finished       (plain text, no link)
                                     No conversation from this run is in Brand
                                     context — it either failed to land or has
                                     been deleted. Researching again produces a
                                     fresh report.
                                     🔍 Research again

otherwise                         →  Research finished — read the report  (unchanged)
```

Three decisions inside that:

- **Derived in `BrandHubView`, not passed as a second prop from the route.** The
  same rule the palette follows: two props would make *"the rail thinks the
  report landed but the tiles disagree"* representable.
- **`undefined` keeps the promise, against this repo's usual rule.** Everywhere
  else unknown renders nothing. Here the two mistakes are not symmetric:
  suppressing on a pending query flashes the row back to a bare entry point on
  every navigation, which is the 1.13.1 bug itself. A briefly optimistic link is
  the cheaper wrong.
- **The copy names both causes.** A landing that failed and a thread the user
  deleted are indistinguishable from the client, and guessing between them is the
  mistake `RESEARCH_REPORT_ROW_HINT` already refuses to make about drafts.

**No migration, deliberately — and the alternative is written down.** Persisting
the project id `landReportInThread` already returns and discards would make the
row a per-job fact *and* let it link straight to the thread instead of to a list.
It is one nullable column and it is the better answer. It is not this pass
because 1.13.1 rejected it for a stated reason (a list link works retroactively
for runs that have already happened; a column does not), and the cheap check
closes the falsifiable claim without reopening that decision. If a direct link is
wanted later, that is the shape it takes.

**Residual, stated rather than hidden:** a brand that has other brand-context
conversations but lost *this run's* thread still shows the report link. The check
is per-brand, not per-job. Closing that needs the column.

---

## 3. `researchTicker.stop()` did not wait for the sweep it claimed to

`main.ts` stops the ticker first at shutdown, with a comment saying why:

> Before the pool closes: a sweep mid-flight would query a dead pool.

`stop()` only cleared the interval. A sweep already inside
`deps.research.poll(...)` — which the adapter allows up to
`DEFAULT_REQUEST_TIMEOUT_MS`, 30 seconds — resumed after `pool.end()` and wrote
against a closed pool.

The lost write is the expensive part. It is `finishResearchJob` for a run that
had **completed and been billed**, so losing it strands a paid job `IN_PROGRESS`
until `abandonIfStale` closes it an hour later — which is precisely the
permanently-stuck state 1.11.2 added that ceiling to stop being permanent.

`stop()` is now `async` and awaits the sweep in flight. The internals changed
from a `running` boolean to holding the promise, because a flag cannot be
awaited.

**`tick()`'s behaviour is unchanged on purpose.** A refused tick still returns
immediately rather than joining the sweep in flight. Joining would make a "sweep
now" method block for as long as the vendor takes, and it deadlocks the existing
`does not overlap with itself` test, which drives both sides of the guard from
one function.

---

## 4. The meter kept gliding over a dead connection

1.13.1's own reasoning, applied to the one element it did not reach:

> A frozen clock is uninformative; a clock that keeps counting while the poll is
> failing reads as *live confirmation that the run is progressing*.

`researchUnreachable` replaced the pace line with a statement about the
connection. Beneath it, `ResearchPaceMeter` went on advancing smoothly, which is
the same claim in the one element a screen reader cannot correct for — it is
`aria-hidden` by design.

The bar now dims and steps instead of gliding when the poll is failing. **The
clock beside it keeps counting**, and that is consistent rather than an
oversight: elapsed-since-`startedAt` stays true whether or not this browser can
reach the server, which is exactly why 1.13.1 kept it. What a dead connection
cannot attest to is *work happening right now*, and a smoothly filling bar is the
only thing on the row making that claim.

---

## 5. The finished row was permanent chrome

`COMPLETED` is forever, so every brand ever researched carried two buttons and
two lines of instructional hint on its hub indefinitely:

> The full report is a conversation in Brand context. Read it there and capture
> what matters into the guidelines.

That is onboarding for one situation — a finished report and empty guidelines —
and noise in every other. It teaches a gesture on a brand whose sections prove
the user has already performed it.

The hint retires once `brand.sections.length > 0`. The row itself stays; only the
teaching goes. **The missing-report line from finding 2 is exempt** — it explains
an anomaly rather than teaching a gesture, so it shows regardless.

---

## Files

**Modified — server / agent:**
`packages/agent/src/research/shape.ts` (returns `ShapeResearchResult`) ·
`packages/agent/src/index.ts` (exports `ShapeResearchResult`, `ShapeOutcome`) ·
`packages/server/src/research/shape.ts` (`ShapeResearchFn` return type; missing
brand throws) · `packages/server/src/research/service.ts` (the outcome log) ·
`packages/server/src/research/ticker.ts` (`stop()` awaits) ·
`packages/server/src/main.ts` (`await researchTicker.stop()`)

**Modified — web:**
`packages/web/src/lib/research-copy.ts` (`RESEARCH_FINISHED_ROW_LABEL`,
`RESEARCH_REPORT_MISSING_HINT`) ·
`packages/web/src/components/brand/BrandContextRail.tsx` (the split finished row,
`hasBrandContextThreads`, `showReportHint`, the stalled meter) ·
`packages/web/src/components/brand/BrandHubView.tsx` (derives
`hasBrandContextThreads`)

**Modified — tests:**
`packages/server/src/test-helpers.ts` (`shaped()`, which derives its outcome the
way the real shaper does so a test cannot assert a combination production would
never produce) · `shape.test.ts` · `ticker.test.ts` · `research.test.ts` ·
`BrandContextRail.test.tsx` · `BrandHubView.test.tsx`

**Not changed, on purpose:** no migration · no route · no schema · no wire
change. The client-visible surface gains one derived prop and two strings.

---

## Verification

```
pnpm typecheck                    10/10 workspaces
pnpm lint / format:check          clean
pnpm test                         955 passed | 47 skipped (106 files)
```

936 → **955 (+19)**: agent **+4** (the outcome vocabulary, one test per member),
server **+6** (four for the log line's level and fields, two for `stop()`), web
**+9** (five for the split finished row, two for the hint retiring, one for the
stalled meter, three for `BrandHubView`'s derivation — one over, because the
missing-report line's exemption needed its own case).

Every pre-existing test passed unchanged. That is load-bearing for finding 2:
`hasBrandContextThreads` defaults to `undefined`, so the three 1.13.1 tests that
assert the report link still assert it, and the new behaviour is additive rather
than a change of default.

**The 47 skips are live-Postgres and were not run.** There is no Docker and no
`.env` on this machine either, so 1.11.2's warning stands unchanged: a plain
`pnpm test` skips them silently. Nothing in this pass touches `packages/db` or a
migration, so none of those files is reachable from it — but the standing hole in
the verification story is unchanged and is the largest one this repo has.

**No live pass.** The app cannot boot here. Everything above is reasoned against
the shipped code and covered by tests; none of it has been watched in a browser
or against a real model.

---

## What this does not settle

- **Why the Temper run produced no drafts is still unknown.** This pass makes the
  *next* one answerable; it does not answer the last one. The retained log window
  has closed and no new evidence was available.
- **`invalid-shape` is a hypothesis, not a finding.** The schema shape and the
  provider's structured-output behaviour make it the most likely branch, and it
  is now the one that logs loudest — but confirming it needs a real run with
  `fly logs -a brandfactory` streaming. **That is the next $0.40, and it should be
  spent watching the log rather than the UI.**
- **If `invalid-shape` is confirmed, the fix is not in this pass.** The
  candidates, cheapest first: drop `.default([])` from `sourceUrls` so the emitted
  schema carries no `default` keyword; pin the shaping call to a model with
  declared structured-output support independent of the workspace's chat model;
  or fall back to a text-mode call with a JSON parse when `generateObject` returns
  something unparseable. Each changes what a run costs or what it depends on, and
  each deserves its own decision.
- **The per-job report link** (finding 2's residual) — one nullable column,
  written up above rather than scheduled.
