# Guideline auto-fill, Phase B — the single-section shaper and its server seam

**Status:** shipped, 2026-08-03. Executes Phase B of
[`docs/executing/guideline-section-autofill.md`](../executing/guideline-section-autofill.md).
Follows [Phase A](guideline-autofill-phase-a-spike-and-adapter.md), same
posture: **no migration, no route, no UI, and nothing calls it yet.** Path R
now exists as a function; its first caller is Phase C's service.

Test baseline: **1092 → 1105 (+13)**, measured on the working tree that also
carries the parallel social-calendar stream (its Phase 1 has landed more tests
since Phase A's count was taken, which is why the baseline moved without this
plan doing anything). Nothing in this phase touches that stream's files —
`packages/shared` and `packages/db` were not modified.

---

## `shapeSectionFromReport` — the 3D function, narrowed to one label

`packages/agent/src/research/shapeSection.ts`. `generateObject` against a
**one-section** schema `{ markdown, sourceUrls[] }`, system prompt built by
`buildSectionShapePrompt`, the stored report as the prompt — the same
JSON-Schema-plus-local-reparse arrangement as `shape.ts`, for the same
`ai` 4.0.20 / zod 4 reason.

What is deliberately different from the batch shaper:

- **The label is input, not model output.** The draft echoes the label the
  caller sent — the row the user clicked — so the batch shaper's clamping
  drama does not exist here. Phase C's service trims and clamps before calling.
- **`markdown` has no `min(1)`.** An empty string is the schema's honest
  answer for "the report has nothing solid on this label" — the per-section
  form of *omit rather than invent*. Refusing it at the schema would leave the
  model no compliant way to say so and turn honesty into `invalid-shape`.
- **The outcome vocabulary is decision 7's**: `ok | no-material |
  invalid-shape`, returned as `{ draft | null, outcome, reportChars }`.
  Empty-by-instruction, whitespace-only, and markers-only all collapse to
  `no-material` after post-processing — one outcome, because the client has
  one honest toast for it. `invalid-shape` stays what it is in the batch pass:
  a fact about the configured writing model, not about the brand.

## Post-processing factored, not copied

- **`resolveCitedSources(urls, citations)`** — the invented-URL drop — moved
  out of `shapeResearchIntoSections`'s body into an exported helper in
  `shape.ts`, now used by both shapers. Behaviour unchanged; the batch
  shaper's existing tests pass untouched, which is the point of factoring
  rather than copying.
- **`stripCitationMarkers(markdown)`** — new, in `shapeSection.ts` and on the
  agent's index. The deep report's `[n]` markers become 1.18.0's citation
  chips; a TipTap row has no such renderer, so decision 10 excludes them by
  prompt *and* strips them here. The regex spares `[3](url)` links via a
  lookahead; a bare numeric bracket in legitimate prose is eaten — the plan's
  named, accepted risk. **Exported for Phase C**, whose Path S applies the
  same rule to the section search's output; the batch shaper deliberately does
  *not* strip (its drafts have carried markers since 3D, and changing that is
  not this plan).

## The prompt — the batch rules, section-sized

`buildSectionShapePrompt`: brand and the one label; the `SUGGESTED_SECTIONS`
description **when the caller supplies it** (same contract as
`buildSectionSearchPrompt` — the caller resolves the match, this function
renders the line iff present); the empty-rather-than-invent rule stated as
*answer with an empty `markdown`*; the `DRAFT_TARGET_MAX_CHARS` target;
quote-the-brand; cite-only-from-this-list over the report's citations
(`- (none)` when the report cited nothing); no colour values; no `[n]`
markers; the existing-labels line iff non-empty.

## The server seam — `createSectionShaper`, beside its sibling

`packages/server/src/research/shape.ts` gains `ShapeSectionFn`,
`SHAPE_SECTION_TIMEOUT_MS = 60_000`, and `createSectionShaper` — same
`ResearchShaperDeps`, same call-time `resolveLLMSettings` (the workspace's
model, resolved when the writing happens), same thrown anomaly on a vanished
brand. Sixty seconds, not the batch pass's three minutes: one section, not
seven, and a user watching a spinner — the same allowance the section
*search* grants the vendor, for the same reason.

**One deliberate deviation from the plan's letter:** the plan has the seam
"injected into `createApp` as an optional dep" in this phase. `createApp` is
untouched — the dep's only consumer is Phase C's `autofillSection` service,
which does not exist yet, so an optional dep today would be resolved and
handed to nothing. The injection lands in Phase C with the service, exactly as
`shapeResearch`'s did with its consumer. Recorded here so Phase C's checklist
picks it up.

## Where the +13 went

| file | Δ | what it pins |
| --- | --- | --- |
| `shapeSection.test.ts` — shaper | +7 | draft carries the input label, both body halves, resolved source · invented URL dropped, cited one kept · markers stripped from html and text, links untouched · empty body → `no-material`, null draft · markers-only body → `no-material` · out-of-schema answer → `invalid-shape` · the report rides as the prompt |
| `shapeSection.test.ts` — `stripCitationMarkers` | +2 | runs and lone markers removed with their carrying space · `[3](url)` links and `[TBD]` untouched |
| `shapeSection.test.ts` — prompt | +4 | brand + the one section named · empty-answer rule, `DRAFT_TARGET_MAX_CHARS`, no-colours, no-markers · citable URLs listed, `- (none)` fallback · description and existing-labels lines render iff supplied |

Plan estimated +8–10; the strip helper's own two and the fifth prompt case
are the overage, all cheap.

## Verification

```
pnpm typecheck                    clean (all workspaces)
pnpm lint / format:check          clean
pnpm test                         1105 passed | 49 skipped (social WIP in tree)
pnpm -F @brandfactory/web build   clean
```

## Caveats

- **Nothing calls `shapeSectionFromReport` or `createSectionShaper` yet.**
  First caller is Phase C's service; first contact with a real model is Phase
  E's live pass. The tests drive a fake `doGenerate`, same as `shape.test.ts`.
- **`createApp` injection deferred to Phase C** — see above; a plan-letter
  deviation, recorded as a decision.
- **The marker strip is a string pass** over output the prompt already
  forbids markers in — belt and braces, and a legitimate `[3]` in prose would
  be eaten. Plan-accepted, confined to drafts the user is about to review.
- **Migration 0008 is still unclaimed in `packages/db/drizzle/`.** This phase
  ships none (as planned), but Phase C claims 0008 for
  `section_autofill_events` while the parallel social-calendar plan's Phase 2
  gate reserves the same number pending an explicit decision. Whichever
  stream generates first takes 0008; the other doc must be updated — do not
  generate blind.

**Untouched:** `packages/shared`, `packages/db`, `packages/adapters`, every
route, `packages/web`, `docs/changelog.md` — the feature ships as 1.19.0 at
Phase E.

**Next in the plan:** Phase C — migration 0008 (`section_autofill_events`),
the `autofillSection` service (path selection, the 3C guard order, the
per-day cap counting only Path S), and `POST /brands/:id/guidelines/autofill`.
