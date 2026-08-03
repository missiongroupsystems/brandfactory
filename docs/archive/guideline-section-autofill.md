# Guideline section auto-fill — proposal and implementation plan

**Status:** plan, **locked 2026-08-03**. Written against `main` at **1.18.0**
(test baseline *1051 passed | 49 skipped*; the skips are the live-Postgres
suites). The three questions the proposal ended on were delegated back and are
decided in place — see "The three questions, decided" at the end.

**The ask, verbatim from the screenshots that raised it:** in the brand-context
pane of a research thread, and equally behind the Overview page's Brand context
sections, every guideline section — Voice & tone and all the others — should be
**AI auto-populatable**. The text comes from research that already ran when it
exists, and from the Perplexity API when it does not. The user edits afterwards;
the point is that the section is *brainlessly, lazily populated* first.

This plan builds on (and reopens nothing from):

- [`docs/executing/brand-hub-implementation.md`](brand-hub-implementation.md) —
  shipped as 1.9.0–1.11.0. Its Stage 3 built the research pipeline this feature
  drinks from; its 3D/3E decisions (shaping on the workspace's own model, one
  client writer for guidelines) are load-bearing below.
- The 1.13.x hardening record (shape outcomes, spend guards, terminal-state
  arbiter) — every convention it established is reused, none is weakened.

---

## What is being built

One new affordance, in one component, reachable from every surface that already
mounts it.

**Each section row in the guidelines editor gains an "Auto-fill" action** — a
`Sparkles` icon button beside the delete control, shown when the row's label is
non-blank and its body is empty. Clicking it generates the section's text and
inserts it into that row's TipTap editor, ready to edit. Nothing is saved until
the user presses the same **Save guidelines** button they press today.

Because `BrandGuidelinesEditor` is the single implementation behind all three
mounts, one change covers every surface in the screenshots:

| Surface | Route/mount | How auto-fill is reached |
| --- | --- | --- |
| Research thread's Brand context pane | `projects.$projectId.tsx` → `BrandContextPane` | button on each row, directly |
| Overview page | `brands.$brandId.tsx` → `EditGuidelinesDialog` | rail's `Edit` or any unwritten `+` row opens the dialog; rows have the button |
| Brand context page | `brands.$brandId.context.tsx` → `EditGuidelinesDialog` | same |

The flow for the lazy path the ask describes: open the editor, click the
`Voice & tone` quick-add chip (blank row appears, labelled), click its sparkle,
watch the text arrive, save. Repeat per section, or not.

**Where the text comes from — decided per request, on the server:**

- **Path R — a completed research report exists.** The stored 68k-char report is
  the source. A single-section variant of the shaping pass runs on the
  **workspace's own configured model** (`resolveLLMSettings`) and extracts just
  the requested label. Costs the user's own LLM tokens (cents), returns in
  seconds, works even when `RESEARCH_PROVIDER=none` — the report is already paid
  for and sitting in the job row.
- **Path S — no report.** A **targeted Perplexity search** scoped to the one
  section: a synchronous `POST /chat/completions` call on a search-grounded
  model (`sonar-pro` by default), prompted to research the brand's site and
  write that section directly. Seconds to ~half a minute, single-digit cents —
  not a $0.38 deep-research run per click (see decision 2).

Either path returns a `{ label, html, text, sources }` draft — the exact
`ResearchDraft` shape 3D established — and the **client** puts it into the row.
The server never writes a section (decision 3).

---

## Decisions

**1. The affordance lives in the editor row, not the rail.** The rail's
unwritten rows already declined a second seeding channel into the editor "for
one click saved" (`BrandContextRail.tsx`, the `+` rows call `onEdit` and nothing
else) — that precedent stands. A `+` row opens the editor; the sparkle is
waiting inside. One component gains the feature; three surfaces receive it; the
rail's tests keep rendering from props alone.

**2. The no-research fallback is a targeted quick search, not a per-section
deep-research run.** Deep research is 3–15 minutes and ≈$0.40 *per run*; five
sections would be ~$2 and over an hour of waiting for a flow whose whole point
is "brainless and immediate". The existing full run — which already populates
*every* section via E1/E2 landing — remains one click away on the rail and is
the right tool when you want the whole brand profiled. The per-section button
wants a per-section-sized tool. `sonar-pro` is search-grounded and cited, which
is the property that matters; "deep" is a depth we already sell separately.
(This is the one place the plan reads the ask's letter loosely to honour its
intent — raised as a question, delegated, and **locked** as quick search; see
Q1 at the end.)

**3. The server returns a draft; it never writes `guideline_sections`.**
`PATCH /brands/:id/guidelines` is a destructive full-list write with exactly one
client writer (`useUpdateBrandGuidelines` → `applyGuidelinesToCache`, which
patches two cache locations). Every existing landing path — capture, E1
populate, E2 accept — funnels through it. A generate-and-save endpoint would be
the first second writer and would bypass the cache discipline. It also matches
the ask: *"I can then edit it ofc"* — the draft arrives in the row un-saved, the
user's Save is the commit.

**4. Path selection happens at request time, on the server, latest-report-wins.**
The client doesn't choose the source; it asks for a section. The service checks
`getLatestResearchJob` for a `COMPLETED` job with a report and takes Path R,
else Path S. Drafts already landed (and cleared via `DELETE …/drafts`) don't
matter — Path R re-extracts from the report, which also serves labels the
original shaping never produced (custom sections, e.g. "Menu philosophy").

**5. Empty-body rows only, in v1.** The button shows when the row's body is the
empty doc. Filling a non-empty row means choosing replace/append/merge semantics
and building an undo for a destructive client-side action — deferred (**locked**,
Q2 at the end). The lazy-populate use case is precisely the empty row.

**6. `createdBy` flips to `'agent'` on the filled row.** The enum value's
producers today are `draftsToSections`/`draftsToStaged`; this is the same
authorship fact. A user-created blank row that a machine fills was written by
the machine. Edits afterwards do not flip it back — same rule as everywhere.

**7. Honest outcomes, not empty strings.** The single-section shaper returns an
outcome discriminator like 3D's (`ok | no-material | invalid-shape`): a report
that says nothing about Visual guidelines yields `no-material` and the client
toasts *"The research doesn't cover {label}"* rather than inventing text —
the shaping prompt's "omit rather than invent" rule, kept per-section. Path S
gets the same rule against fabricating when search finds nothing usable.

**8. Availability follows the absent-and-explained convention.** The editor
gains an optional `onAutofill` prop; absent prop = no button, exactly like the
rail's `onStartResearch`. Routes compute availability from data they already
hold: `canAutofill = hasReportToRead(research.job) || (research.enabled &&
brand.websiteUrl)`. No report + no provider (or no URL — the 3C hard-URL-gate
reasoning applies to Path S identically) → the button never renders, and the
service's own `RESEARCH_PROVIDER === 'none'` check → 501 is the backstop for a
raced request.

*(Corrected 2026-08-03, post-Phase-E review: this clause originally credited the
backstop to the noop provider's `ResearchNotConfiguredError`. That error is not
an `HttpError`, so it would surface as a bare 500 — and it is unreachable
anyway, because `EnvSchema`'s `superRefine` requires a key whenever a provider
is selected and the service checks `RESEARCH_PROVIDER` before touching the
provider at all. The 501 is real; its source was misattributed.)*

**9. Spend accounting gets its own table, not a `kind` column on
`brand_research_jobs`.** That table's semantics are load-bearing in ways a
second row-kind would strain: the partial unique in-flight index, `hasActiveResearchJob`,
`getLatestResearchJob` feeding the rail's report row, `countResearchJobsTodayForWorkspace`.
Threading `WHERE kind='deep'` through every reader to avoid breaking them is
more surface than a new four-column event table. Migration 0008 adds
`section_autofill_events`; only Path S (vendor money) counts against its
per-day cap — Path R spends the user's own LLM tokens, which shaping and chat
already spend ungated.

**10. Citation markers are stripped from the section text; sources ride the
wire and land on the event row, not on the section.** Guideline sections store
`{label, body, priority, createdBy}` — no sources column, and E1/E2 landing
already drops draft sources at the same boundary. The draft's `sources` come
back in the response (shown transiently — "From N sources" in the success
toast), the body gets clean prose, and the same list is written to
`section_autofill_events.sources` for the audit trail (**locked**, Q3 at the
end). `[n]` markers are excluded by prompt and stripped by post-process,
because a TipTap body renders them as debris (the 1.18.0 lesson, from the
other direction).

---

## Facts verified against `main` at 1.18.0 (2026-08-03)

| Claim | Evidence |
| --- | --- |
| The port is two methods; `model` is request input | `packages/adapters/research/src/port.ts` — `ResearchProvider.start/poll`, `ResearchRequest.model` |
| The vendor adapter is raw `fetch`, injectable, fixture-tested | `packages/adapters/research/src/perplexity.ts`; fixtures under `packages/adapters/research/fixtures/` (real run: $0.377, 4.0 min, 19 citations) |
| `idempotency_key` is the job id; timeouts are `AbortSignal.timeout(30_000)` | same file — both calls are short (async line) |
| The shaping precedent: `generateObject` + `z.toJSONSchema` via `jsonSchema()` (zod 4 vs `ai` 4.0.20), re-validated locally, outcome discriminator | `packages/agent/src/research/shape.ts` — `shapeResearchIntoSections`, `ShapeOutcome` |
| Workspace model resolution + timeout live in a server seam | `packages/server/src/research/shape.ts` — `createResearchShaper`, `resolveLLMSettings`, `SHAPE_TIMEOUT_MS = 3 min` |
| `markdownToDraftBody(markdown)` → `{html, text}` | `packages/agent/src/research/markdown.ts` |
| `ResearchDraft = { label, html, text, sources[] }`; `hasReportToRead` predicate exists | `packages/shared/src/research/job.ts` |
| No generic non-streaming LLM helper exists; the one `generateObject` call in the repo is the shaper | repo-wide grep; `streamResponse` is conversation-coupled |
| `PATCH /brands/:id/guidelines` takes the complete list; omission deletes | `packages/db/src/queries/brands.ts:238` — `updateBrandGuidelines`, `notInArray(keptIds)` |
| One client writer, cache patched in two places | `useUpdateBrandGuidelines` + `applyGuidelinesToCache` (`packages/web/src/api/queries/brands.ts:64`) |
| The editor is the single implementation behind all three mounts | `BrandGuidelinesEditor.tsx`; mounts in `brands.$brandId.tsx`, `brands.$brandId.context.tsx`, `BrandContextPane.tsx` |
| Rows already have a one-shot insert channel with a StrictMode identity guard | `SectionRow`'s `pendingInsert` + `insertedRef`; today its only producer is `captureIntoNewSections` |
| `SUGGESTED_SECTIONS` `{label, description, exampleBody}` is shared by editor chips, rail rows, and the shape prompt | `packages/shared/src/brand/suggested-categories.ts` |
| Labels are clamped, never validated-and-rejected | `GUIDELINE_LABEL_MAX_CHARS = 120`, doc comment in `guideline-section.ts` |
| `createdBy: 'agent'` is on the wire with `.default('user')`; producers are `draftsToSections`/`draftsToStaged` | `update-guidelines.ts`; `packages/web/src/components/brand/researchDrafts.ts` |
| `GET /brands/:id/research` already tells the client `{enabled, maxMinutes, job}` | `packages/server/src/routes/research.ts` — `BrandResearchState` |
| Env is one zod object with a `.env.example` drift guard | `EnvSchema` + `env.example.test.ts` |
| Route tests run the real Hono app over `createFakeDb`; new `Db` methods must be mirrored there | `packages/server/src/test-helpers.ts` |
| Next migration is **0008** | `packages/db/drizzle/0005…0007` exist |

---

## Phase A — the live spike, the port method, the adapter (+10–14 tests)

**A0, before a line of repo code** (the 3A discipline): one scratch script, real
key, real brand. It answers: does `sonar-pro` on `POST /chat/completions`
(a) follow a "write this one section, ≤1200 chars, markdown, no citation
markers, no hex" instruction, (b) return `search_results`, (c) come back in
seconds not minutes, and (d) what does it cost. Capture the response verbatim
as `fixtures/section-search-completed.json`. If (a) fails badly, the fallback
shape is *search → workspace-LLM rewrite* (two hops), and Phase A is re-cut
before B — discovered in an afternoon, not after three phases.

Then:

- **Port**: `ResearchProvider` gains a third method,
  `searchSection(req: SectionSearchRequest): Promise<SectionSearchResult>` —
  `{ brandName, websiteUrl, label, description?, existingLabels[], model }` →
  `{ content, sources, usage }`. Same file, same 3-state philosophy: network
  errors throw, an empty completion is a result the service classifies, not an
  adapter guess.
- **Perplexity impl**: sync `POST /chat/completions`, `AbortSignal.timeout`
  (own constant, ~60s — sync means the user is watching a spinner), reuse
  `extractSources` verbatim (it already dedupes, rejects non-http(s), prefers
  `search_results`). Prompt builder in `src/prompt.ts` beside
  `buildResearchPrompt`, sharing its three load-bearing instructions (omit
  rather than guess; no hex; say-so-and-stop) plus: this exact section, target
  length, **no `[n]` markers in the text**.
- **Noop**: rejects with `ResearchNotConfiguredError`, same as the other two.
- **Env**: `RESEARCH_SECTION_MODEL` (default `sonar-pro`),
  `RESEARCH_SECTION_MAX_PER_DAY` (default `20`). Both into `.env.example` in
  the same commit — the drift guard fails the build otherwise, as designed.

Tests: fixture-driven adapter tests mirroring `perplexity.test.ts` (parse, source
extraction, timeout wiring, idempotent prompt content), noop rejection, env
refinement.

## Phase B — the single-section shaper (+8–10 tests)

`packages/agent/src/research/shapeSection.ts` —
`shapeSectionFromReport({ brandName, label, description?, existingLabels, report,
citations, llmProvider, llmSettings, signal? })`.

The 3D function, narrowed: `generateObject` against a **one-section** zod schema
`{ markdown, sources[] }` (the label is input, not model output — no clamping
drama, the client already owns it), system prompt derived from
`buildShapePrompt`'s rules with the section's `SUGGESTED_SECTIONS` description
interpolated when the label matches one, `existingLabels` supplied so the model
doesn't restate a neighbouring section's content. Same post-processing, factored
for reuse rather than copied: source URLs resolved against the report's citation
list (invented URLs dropped), `DRAFT_TARGET_MAX_CHARS` stated and measured,
`[n]`-marker strip. Returns `{ draft | null, outcome: 'ok' | 'no-material' |
'invalid-shape', reportChars }` — the 1.13.2 diagnosability rule, kept.

Server seam beside the existing one: `createSectionShaper` in
`packages/server/src/research/shape.ts` (or sibling file) — resolves the
workspace model at call time, applies its own `AbortSignal.timeout` (60s; one
section, not seven), injected into `createApp` as an optional dep so route tests
pass a fake, exactly like `shapeResearch`.

## Phase C — table, service, route (+14–18 tests)

**Migration 0008.** `section_autofill_events(id, brand_id fk cascade, label,
source text ('report'|'search'), model, cost_usd numeric(12,6) null,
sources jsonb, created_by, created_at)`. One index on
`(brand_id, created_at desc)`. Queries:
`recordSectionAutofill`, `countSectionAutofillsTodayForWorkspace` (rolling 24h,
the `countResearchJobsTodayForWorkspace` shape, **counting only
`source='search'`** — the cap protects vendor money and Path R spends none).
Mirrored into `createFakeDb`, or route tests silently diverge. A live test
follows `research.live.test.ts`'s reason for existing: the interval arithmetic,
the numeric round-trip, the cascade.

**Service** — `packages/server/src/research/autofill.ts`,
`autofillSection(deps, { brandId, workspaceId, label, userId })`:

1. Trim + clamp the label; reject blank (`ValidationError`).
2. `getLatestResearchJob` → `COMPLETED` with report ⇒ **Path R**: run the
   section shaper. `no-material` is a 200 with the outcome on the wire — the
   client owns the honest toast; it is not an error.
3. Else **Path S**, guards in the 3C order, all above the money line:
   provider ≠ `none` (501) → `websiteUrl` present (`ValidationError` — the
   Casa Vostra rule: a bare-name search writes a confident, cited, wrong
   section) → per-day cap (429, `ResearchLimitError` reused or a sibling).
   Then `searchSection`, `markdownToDraftBody`, record the event with the
   vendor-reported cost (nullable = unknown, never zero) and the source list.
4. Response either way: `{ outcome, source: 'report' | 'search', draft:
   { label, html, text, sources } | null }`.

A double-click double-spends cents, not dollars; the client disables the button
while pending, and the per-day cap is the backstop. No in-flight unique index
for this — that machinery earns its keep at $0.40 and 15 minutes, not $0.02 and
20 seconds. Written down here so it is a decision, not an oversight.

**Route** — `POST /brands/:id/guidelines/autofill` in `routes/brands.ts` (it is
a guidelines concern; the research router stays about jobs). Body
`{ label: string }` via zod; `requireBrandAccess`; the literal `autofill`
segment sits where no sibling parameterises — and `app.test.ts`'s
RegExpRouter-compiles assertion covers the addition for free.

Wire types in `packages/shared/src/brand/` (`AutofillSectionInputSchema`,
`AutofillSectionResultSchema` reusing `ResearchDraftSchema`'s draft shape).

Tests: the `routes/research.test.ts` pattern — a `seed()` helper, a fake
provider with `vi.fn()` `searchSection`, describe blocks per guard, path
selection (report present ⇒ no vendor call — assert the fake was *not* called),
`no-material` on the wire, cap arithmetic, event recording.

## Phase D — the web half (+16–22 tests)

- **Mutation**: `useAutofillSection(brandId)` in `api/queries/brands.ts` —
  plain `useMutation`, no cache write (nothing persisted; the row's local state
  is the destination). Failure toasts the server's message.
- **Editor**: `BrandGuidelinesEditor` takes optional
  `onAutofill?: (label: string) => Promise<AutofillSectionResult>`. Each
  `SectionRow` with a non-blank label and empty body renders the sparkle
  (`aria-label="Auto-fill {label} with AI"`, `title` explaining source will be
  research or web search). Click → per-row pending spinner (one in-flight at a
  time; the others' buttons disable) → on `ok`, insert via the row's existing
  one-shot insert channel — **widened to be addressable by `_key`**, its
  `insertedRef` identity guard preserved per payload (the 1.5.0 StrictMode
  lesson: extend the existing double-invoke test, don't re-learn it) — flip
  that row's `createdBy` to `'agent'`, toast `Voice & tone drafted from N
  sources — review and save.` On `no-material`, the honest toast. Nothing
  auto-saves.
- **Threading**: `EditGuidelinesDialog` and `BrandContextPane` forward the prop
  — pure type pass-throughs, the 3E coupling pattern (widening the editor
  without both forwarders won't compile).
- **Routes**: all three mounts compute `canAutofill` from queries they already
  run (`useBrandResearch` + `useBrand`) — `hasReportToRead(job) || (enabled &&
  brand.websiteUrl)` — and pass `onAutofill` only when true. The context-page
  route and `projects.$projectId.tsx` gain a `useBrandResearch(brandId)` call
  (5s poll self-stops when nothing is in flight; on the projects route, gate it
  on the pane actually being a brand-context pane).
- Editor remains presentational: no queries added to it; its tests drive the
  prop with a resolved/rejected promise and assert insertion, provenance flip,
  disabled states, absence when the prop is absent.

Tests across `BrandGuidelinesEditor.test.tsx` (button gating, insert, StrictMode,
`createdBy` flip, pending), route tests for prop wiring/gating, mutation test,
plus one on each forwarder's pass-through.

## Phase E — verification and the live pass (+0)

Not skippable — migration, new table, new route, an outbound paid vendor call.
Every clause of the 3G rule applies.

- `pnpm typecheck / lint / format:check / test / -F @brandfactory/web build`.
- Live, real key, real brand: **Path R** on Temper (a report exists — fill a
  suggested label and a custom label; watch `no-material` on something the
  report genuinely lacks), then **Path S** on a fresh brand with a URL and no
  research (watch cost + latency, record both in the completion note), then
  `RESEARCH_PROVIDER=none` on both a brand *with* a report (button present,
  Path R works) and without (button absent).
- The unobserved list from 1.18.0 (chip optics, bubble width) stays unobserved
  by this pass; don't let this live session close without checking them —
  they're one screenshot away.
- Changelog entry; ships as **1.19.0**.

---

## Files

New: `packages/adapters/research/src/{sectionSearch or in perplexity.ts}`,
`fixtures/section-search-completed.json`,
`packages/agent/src/research/shapeSection.ts` (+ test),
`packages/db/drizzle/0008_*.sql`, `packages/db/src/schema/section_autofill_events.ts`,
`packages/db/src/queries/autofill.ts` (+ live test),
`packages/server/src/research/autofill.ts` (+ test),
`packages/shared/src/brand/autofill.ts`.

Touched: `port.ts`, `noop.ts`, `factory.ts`, `prompt.ts` (adapter);
`packages/server/src/{env,adapters,db,app}.ts`, `routes/brands.ts`,
`research/shape.ts`, `test-helpers.ts`; `packages/web/src/api/queries/brands.ts`,
`components/brand/{BrandGuidelinesEditor,EditGuidelinesDialog,BrandContextPane}.tsx`,
`routes/{brands.$brandId,brands.$brandId.context,projects.$projectId}.tsx`;
`.env.example`.

## Non-goals

- **No auto-fill-all button.** One full research run already is that feature,
  with better economics and a review sheet.
- **No regenerate/replace on non-empty rows** (v1 — see question 2).
- **No streaming.** A ≤1200-char section behind a spinner does not earn SSE.
- **No sources persisted on sections**, no provenance badge in the UI (the
  `createdBy` value is written, not yet rendered — same as today).
- **No rail-level sparkle** on unwritten rows; the precedent declining a second
  seeding channel stands.
- **No cancel** for an in-flight autofill; it is seconds, and the vendor bills
  work done.

## Risks

- **`sonar-pro` may not follow the write-the-section format** (A0 exists to
  find out); the fallback is a two-hop search→rewrite, costed and decided in
  Phase A, not discovered in Phase D.
- **Sync vendor call in a request handler** — the 60s timeout bounds it, but a
  slow vendor day means a long spinner; acceptable for v1, noted as the thing
  SSE would fix if it ever matters.
- **The projects-route poll**: adding `useBrandResearch` to the thread pane
  must keep the existing "stops when not in flight" behaviour or every open
  thread polls forever; the gate is in the hook already, but the mount is new.
- **Marker stripping is a string pass** over model output we instructed not to
  produce markers — belt and braces, but a `[3]` inside legitimate prose (a
  price list, say) would be eaten. Confined to generated drafts the user is
  about to review; accepted.

## The three questions, decided

The proposal ended on three questions; they were delegated back
("can you decide on those?") and are locked here, 2026-08-03. Reopening any of
them is a plan change, not a drive-by.

**Q1 — the no-research fallback is the quick targeted search. Locked.** The ask
said "deep research"; what that buys — research-grounded, cited text rather
than model recall — is exactly what `sonar-pro` delivers per section in
seconds at ~$0.02. Per-section `sonar-deep-research` would be ~$0.40 and
3–15 minutes *per click*, which fails the ask's own framing ("brainlessly/
lazily populated") — nobody lazily waits a quarter of an hour per section.
The full deep run stays the whole-brand tool, one click away on the rail, and
its E1/E2 landing already populates every section at once. If a live A0 spike
shows `sonar-pro` output is materially worse than report-derived text, the
recourse is the two-hop search→rewrite fallback already named in Phase A —
not per-section deep research.

**Q2 — empty rows only in v1. Locked.** Regenerate-and-replace is a
destructive client-side overwrite that would need its own undo semantics and a
replace/append/merge decision; none of that serves the lazy-populate case,
which is by definition an empty row. A filled row keeps its content and shows
no button. The cheap escape hatch already exists: delete the body text, the
button reappears. Revisit only if real use produces the ask.

**Q3 — sections do not remember their sources; the event row does. Locked.**
A `sources` column on `guideline_sections` is not the cheap add it looks like:
the guidelines `PATCH` is a complete-list write, so sources would have to
round-trip through the wire schema, the editor's local state, and every save
path — or be silently wiped on the first ordinary edit. Instead the
append-only `section_autofill_events` row (0008) carries `sources jsonb`
alongside label, model and cost: the provenance is durably recorded, keyed by
brand and time, without touching the guidelines wire at all. A future "where
did this come from" affordance reads the event log; sections stay
`{label, body, priority, createdBy}`, consistent with E1/E2 landing, which has
dropped draft sources at the same boundary since 3E.
