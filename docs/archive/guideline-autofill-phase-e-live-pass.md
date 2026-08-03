# Guideline auto-fill, Phase E — verification, the live pass, and what it found

**Status:** shipped as **1.19.0**, 2026-08-03. Executes Phase E of
[`docs/executing/guideline-section-autofill.md`](../executing/guideline-section-autofill.md).
Follows [Phase C](guideline-autofill-phase-c-table-service-route.md) and
[Phase D](guideline-autofill-phase-d-web-half.md).

**The pass was not a formality — it found a ship-blocker.** Phase E was
budgeted at +0 tests; it ships a prompt change, a service change and +4 tests,
because the vendor obeyed an instruction perfectly and the result was still
wrong.

---

## The environment the last six releases said did not exist

Every completion note since 1.13.x closed with *"still no live pass (no
Docker, no `.env`)"*. Both are present: Docker is running and `.env` carries a
working `PERPLEXITY_API_KEY`. So this pass did what those could not.

- `docker compose -f docker/compose.yaml up -d`, then
  `pnpm -F @brandfactory/db db:migrate` — **migration 0008 applied against
  real Postgres**, table and index verified by `\d section_autofill_events`.
- `pnpm test` with `DATABASE_URL` set: **1299 passed, 0 skipped**, 126 files.
  The live-Postgres suites that have skipped since they were written all ran,
  including this feature's own `autofill.live.test.ts` — the `numeric(12,6)`
  round-trip at cents scale, the rolling-24h arithmetic, the `source='search'`
  filter, and the brand cascade.

One wrinkle worth recording: a pre-existing dev server already held **:3001**,
so the pass ran its own server on **:3002** rather than killing a process it
did not start. The browser half necessarily went through the user's own :3001
server, which `tsx watch` had hot-reloaded to the same code.

## The finding — an honest refusal wearing the wrong shape

Phase C's `no-material` tests asserted `content: ''`. **`sonar-pro` never
returns that.** Asked for a `Franchise fee schedule` a Singapore F&B group
does not have, it followed the prompt's *"say so plainly and stop"* exactly
and wrote 600 characters:

> "I cannot find any information on the Ebb & Flow Group website … that
> defines a franchise model, franchise fees, royalty structure … Because no
> franchise-related details are provided by the brand itself, there is not
> enough grounded information to write a … section without inventing or
> extrapolating terms."

That is the right judgement and a completely useless artefact for a TipTap
row. Being non-empty, it classified as `ok`, and the client was one click from
pasting the model's apology into the brand's guidelines, flipping
`createdBy` to `'agent'`, and toasting *"drafted from 10 sources"*.

The instruction was inherited from the deep prompt, where it is correct — a
paragraph explaining that a site gave too little is a useful thing for a human
to read in a report. Reused per-section, it produces prose where the caller
needs a signal.

**The fix**, mirroring how `shapeSectionFromReport` already reaches the same
outcome (it instructs an *empty* `markdown`, which a JSON schema makes a
compliant answer — a chat completion has no such affordance, so one is
defined):

- `SECTION_NO_MATERIAL_SENTINEL = 'NO_MATERIAL'`, exported beside the prompt
  that demands it, with the live transcript in its doc comment.
- The rule now reads *"reply with exactly NO_MATERIAL and nothing else — no
  explanation, no apology"*. The "nothing else" half is what keeps a refusal
  from arriving wrapped in an apology.
- `isNoMaterial` in the service (the port's stated division of labour:
  adapters return content verbatim, the service makes the domain judgement).
  Whole-body match, **normalised on both sides** — the sentinel contains an
  underscore and `_` is markdown emphasis, so a one-sided strip compares
  `NOMATERIAL` against `NO_MATERIAL`. That mismatch is exactly what the first
  version of this helper shipped, and what its own tests caught within a
  minute. Not a substring search: a real `Values` section may legitimately say
  "no material waste", and a loose match would delete it.

+4 tests: the prompt demands the sentinel and no longer says "say so plainly"
(adapter), and the service reads the bare sentinel, reads it through
`**NO_MATERIAL.**`, and leaves a real section mentioning those words alone.

**Re-validated live**: the same label now returns
`{"outcome":"no-material","source":"search","draft":null}` in 2.6s — faster,
because the model returns a token instead of composing an essay. And a real
section still works after the prompt change: `Values & positioning` came back
at **1,168 characters — under the 1,200 target for the first time**, no
markers, no hex.

## What the live pass measured

Five real searches, **$0.044820** total, every row on the ledger.

| check | result |
| --- | --- |
| Path S `Voice & tone` | 8.0s, $0.010570, 1,336 chars, 9 sources **all on the brand's own domain**, quoting *"uncompromising quality through unconventional ways"* — the same phrase A0's pinned run found |
| Path S `Values & positioning` (post-fix) | 4.6s, $0.009670, 1,168 chars |
| `no-material` | prose (pre-fix) → sentinel (post-fix), $0.008200 + $0.006490 — **both recorded**, because the vendor billed both |
| per-day cap | `429 RESEARCH_LIMIT`, vendor **not** called, ledger unchanged |
| no website | `400` with the Casa Vostra message, no vendor call |
| blank label | `400`, no vendor call |
| `RESEARCH_PROVIDER=none`, no report | `501 RESEARCH_NOT_ENABLED` |
| `RESEARCH_PROVIDER=none`, **with** report | **not** 501 — Path R attempted, which is the independence decision 4 rests on |
| ledger row | `sonar-pro`, `$0.010570` at six decimals, 9 sources, author recorded |

**The browser loop, end to end:** the `+`/quick-add chip creates a labelled
empty row → the sparkle appears above the trash → click → spinner replaces the
sparkle → text lands in the TipTap editor **with its markdown italics intact**
→ toast *"Voice & tone drafted from 9 sources — review and save."* → the
sparkle disappears (the row is no longer empty) → nothing is saved → Save →
`created_by = agent` in `guideline_sections`. Decision 6 verified through the
real write path, not a fake.

## Optics, observed rather than theorised

- **The sparkle** sits above the trash in a right-hand column, same size and
  muted tone; the pair reads as row actions and the sparkle does not dominate.
- **A side effect worth naming:** on rows that show a sparkle, the delete
  button now sits ~28px lower than on rows that do not, because the two share
  a flex column. Muscle memory for delete is therefore row-dependent. Minor,
  unresolved, and the alternative (reserving the slot always) has its own
  cost.
- **1.18.0's citation chips**, finally seen against the real 48,607-character
  report: legible, clearly distinct from body text, sitting just above the
  baseline. A three-chip run takes noticeable horizontal space and there is a
  visible gap before the first — acceptable, not a defect. The `10px` /
  `align-[0.25em]` tuning holds.
- **1.18.0's bubble width stays unobserved.** The only local run predates
  migration 0007, so it has no thread for the report to render in.

## Caveats

- **Path R has never produced a draft.** `OPENROUTER_API_KEY` in `.env` is a
  placeholder (`sk-or-v1-pla…`; `GET /api/v1/key` → 401), so every
  `generateObject` call fails. Routing is proven — the request reaches
  `shapeSectionFromReport` and dies at the vendor — but no report-derived
  section has ever been seen, and `no-material` / `invalid-shape` on that path
  are unexercised live. **This is the headline gap in 1.19.0.**
- **An LLM failure on Path R surfaces as a bare `500 INTERNAL`**, so the
  editor's toast reads *"Internal Server Error"*. Honest (it is a server
  misconfiguration) and useless to the person reading it. The server log
  carries the real cause. A typed error with an actionable message is the
  obvious follow-up and was left out of this pass deliberately, being an error
  -semantics decision rather than a fix.
- **The sentinel is validated on one vendor, one model, four labels.** A model
  that pads the sentinel with a sentence still classifies as `ok`. The
  normalisation tolerates emphasis and trailing punctuation and nothing more.
- **`no-material` is unreachable on Path R live** for the same key reason.
- **A test brand remains in the dev database** —
  `Ebb & Flow Group (Phase E Path S)`,
  `49247390-91bd-4fc7-ab05-e3c8a3974d9e`, holding one saved agent-written
  section and 5 ledger rows. Left deliberately as the pass's evidence; delete
  with `DELETE FROM brands WHERE id = '49247390-91bd-4fc7-ab05-e3c8a3974d9e';`
  (events and sections cascade).
- **`PERPLEXITY_API_KEY` is still the temporary key**, to be rotated before
  production — and it is now the only working vendor credential in `.env`.
- `packages/web/src/lib/calendar.test.ts` fails `format:check`. It belongs to
  the parallel social-calendar stream, was mid-flight in another session, and
  was deliberately not touched.

## Files

Changed in this phase: `packages/adapters/research/src/prompt.ts` (sentinel +
the rule), `factory.test.ts` (+2), `packages/server/src/research/autofill.ts`
(`isNoMaterial`), `autofill.test.ts` (+3), `docs/changelog.md` (1.19.0).

**The feature ships.** Path R's live verification is owed the moment a working
`OPENROUTER_API_KEY` exists — it is one section fill and one screenshot.
