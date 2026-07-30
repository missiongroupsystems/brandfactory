# Stage 3D — the shaping pass

**Status:** shipped, 2026-07-29. Executes Stage 3D of
[`docs/executing/brand-hub-implementation.md`](../executing/brand-hub-implementation.md),
on top of [3C](stage-3c-the-job.md).

**No migration, no route.** Stage 2 of a research run: the report becomes draft
sections, on **the workspace's own configured model** rather than on the search
vendor that found it.

Test baseline: **757** → **779**. **+22** (14 agent, 3 server, and 5 that came
with the markdown converter), zero skipped with a `DATABASE_URL`.

**It has not run against a real model.** The dev `OPENROUTER_API_KEY` is a
placeholder and OpenRouter rejects it — see Caveats, which is also where the
evidence that the wiring is otherwise correct lives.

---

## The requirement 3A produced

The live report came back at **67,780 characters** across five `##` sections, the
smallest of which was 7,972. The obvious reading of *"convert the report into
draft sections"* — one `##` per draft — therefore produces a **16,000-character
Voice & tone** in a rail row built for a paragraph.

So this is a **compression pass, not a partition**, and both the prompt and the
constant say so:

```
DRAFT_TARGET_MAX_CHARS = 1200      "a section is 3–6 sentences, under 1200 characters"
```

Not enforced by truncation — a sentence cut in half is worse than a long one —
but stated as a number, because "keep it short" without one is exactly how a
16,000-character section happens.

## Two rules are enforced in code, not asked for in the prompt

A prompt is a request; `shape.ts` is a boundary.

- **Sources are resolved against the report's own citations, by URL.** A model
  that invents a plausible URL is the confabulation the whole citation design
  exists to catch, and a `Map` lookup catches it. A section whose every URL was
  dropped **still lands** — citations are provenance for a human reviewer, not a
  gate on the text.
- **A section with an empty body is dropped.** A label with nothing under it is
  a row in the review sheet that wastes the reviewer's only decision.

And one that shows up as a return value rather than a throw: **a model that
answers with the wrong shape yields zero drafts**, because a failed shaping pass
is not a failed research run.

## Where it sits in the lifecycle, and what it may not decide

Shaping happens **inside the same write that completes the job**, so there is no
window where the rail says *"5 drafts ready"* and the review sheet is empty.

Two refusals around it, both protecting something already paid for:

- **Shaping cannot fail the run.** If it throws, the job still completes, the
  report is still on the row, and the drafts are `[]`. A report that cost $0.377
  is not discarded because the writing model was down.
- **Shaping cannot produce `NO_FINDINGS`.** That stays decided by the report's
  length alone (3C's `NO_FINDINGS_MAX_CHARS`). Letting "the shaper returned
  nothing" mean "nothing was found" would let a broken model masquerade as an
  honest empty result — and those two need telling apart, because one is the
  brand's website and the other is our configuration.

`shape` is an **optional function** on the service rather than an LLM provider,
which is what lets the whole lifecycle be tested without a model — and absent, it
degrades to exactly what 3C shipped.

## A deliberately tiny markdown converter

`ResearchDraft` carries `{ html, text }` — the pair `CapturePayload` has defined
since 1.5.0 — so the model's markdown has to become both.

**Not a markdown library**, and the reason is the destination: the HTML is never
rendered as HTML. It goes into a drag payload and is parsed by **TipTap's own
schema**, which drops anything it has no node for. So the converter emits the
four constructs the editor actually has — paragraph, bullet list, bold, link —
and a general converter would only widen what a model's output can put on a page.
This is the same reasoning that has kept `proseMirrorSchema.ts` untouched across
the whole plan.

It still escapes, and that is not theatre: `text` is rendered directly by the
review sheet, and a link is restricted to `http`/`https` for the same reason as
every other externally-sourced URL in this repo — except here the "user" is a
language model.

## Verification

```
pnpm typecheck                          10/10 workspaces
pnpm lint / format:check                clean
DATABASE_URL=… pnpm test                779 passed | 0 skipped
```

| file | Δ | what it pins |
| --- | --- | --- |
| `agent/src/research/shape.test.ts` | +11 | drafts carry both body halves · an invented URL dropped · a section with no surviving source still lands · empty bodies dropped · omit-everything returns `[]` · a wrong-shaped answer returns `[]` · the report is what gets shaped · the prompt carries the labels, the omit rule, the character target, the no-colours rule and the citable URLs |
| `agent/src/research/markdown.test.ts` | +8 | paragraphs, one list not three, marks kept in HTML and stripped in text, headings downgraded, HTML escaped both ways, `javascript:` not linkified, blank lines dropped |
| `server/src/routes/research.test.ts` | +3 | drafts land in the same write that completes the job · a throwing shaper still completes the run · an empty shaping pass is **not** `NO_FINDINGS` |

## Caveats

- **The shaping pass has never run against a real model, and the reason is a
  placeholder key.** `OPENROUTER_API_KEY` in the dev `.env` is literally
  `sk-or-v1-place…`, and OpenRouter answers `401 User not found`. **The same key
  backs agent chat**, so that path is equally unverified in this environment.
  Supply a real key (or point `LLM_PROVIDER` at a provider you have one for) and
  the run is a one-liner: the script is in the session scratchpad and shapes
  3A's captured 67,780-character report, costing OpenRouter credit and no
  Perplexity spend.
- **What the failed attempt did prove.** The request reached OpenRouter with a
  well-formed body — the rejection came back carrying our JSON schema — so
  `z.toJSONSchema()` + the SDK's `jsonSchema()` produce something both the AI SDK
  and the vendor accept. That was the risky part of this file (the installed `ai`
  4.0.20 expects a zod **3** schema and this repo is on zod 4.3.6), and it is the
  reason the schema is passed that way rather than directly.
- **`DRAFT_TARGET_MAX_CHARS` is asked for, not enforced.** Nothing truncates, and
  no test can prove a real model obeys it — only a live run can, and the script
  above measures exactly that.
- **The 67,780-character report is ~17,000 tokens of input** on the user's own
  model, per run, on top of the $0.377 the finder costs. Neither number was
  costed at lock time and the second one lands on a different bill.
- **Nothing consumes the drafts yet.** They are stored on the job and shown by
  nothing: the review sheet and the auto-populate path are 3E.

**Untouched:** `packages/db` (no migration — `drafts` has been a column since
3C), `packages/web`, every route's shape, and `docs/changelog.md` — Stage 3 ships
as 1.11.0 at 3G.

**Next in the plan:** 3E — landing the drafts. Two paths off one condition
evaluated **when the drafts land**: auto-populate an empty brand with an Undo, or
open the review sheet on a curated one.
