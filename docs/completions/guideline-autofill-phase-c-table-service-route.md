# Guideline auto-fill, Phase C — the table, the service, the route

**Status:** shipped, 2026-08-03. Executes Phase C of
[`docs/executing/guideline-section-autofill.md`](../executing/guideline-section-autofill.md).
Follows [Phase A](guideline-autofill-phase-a-spike-and-adapter.md) and
[Phase B](guideline-autofill-phase-b-section-shaper.md).

**The feature now exists on the wire and still has no UI.**
`POST /brands/:id/guidelines/autofill` takes a label and returns a draft (or
an honest reason there is none); nothing in `packages/web` calls it until
Phase D. Migration **0008** ships here — which resolves the number both
in-flight plans were circling (see "The 0008 gate" below).

Test baseline: **1105 → 1124 (+19 passed, +4 skipped)**, on the working tree
that still carries the parallel social-calendar stream. The 19 are the
service/route suite; the 4 are live-Postgres tests that join the existing 49
skips on a tree with no `DATABASE_URL`.

---

## Migration 0008 — `section_autofill_events`, and the gate it closes

`packages/db/src/schema/section_autofill_events.ts`, generated as
`drizzle/0008_sour_mister_sinister.sql`. The plan's columns verbatim: `id`,
`brand_id` (fk, cascade), `label`, `source` (`'report' | 'search'`, free text
by the `provider` column's no-enum reasoning), `model`, `cost_usd
numeric(12,6)` nullable, `sources jsonb`, `created_by`, `created_at`; one
index on `(brand_id, created_at desc)`.

**The 0008 gate:** the social-calendar plan's Phase 2 reserved the same
number, with the user's decision recorded as *wait — autofill keeps its
claim*. This phase takes it, and both social-calendar docs are updated in the
same change (`social-calendar-implementation.md` preflight + gate paragraph,
`social-calendar.md` §1) to say the base condition is met and their migration
generates as **0009**.

Queries in `packages/db/src/queries/autofill.ts`:

- **`recordSectionAutofill`** — append-only insert, `numeric` cost stringified
  on the way in and parsed at the one boundary that knows the scale, like the
  job row's.
- **`countSectionAutofillsTodayForWorkspace`** — the
  `countResearchJobsTodayForWorkspace` shape: rolling 24 hours in SQL, joined
  through `brands` to the workspace, **and filtered to `source = 'search'`** —
  the cap protects vendor money, and a report-fill consuming a search's budget
  would ration the free path to protect the paid one.

`autofill.live.test.ts` (+4, skipped without a DB) pins what only real
Postgres can: the cents-scale numeric round-trip (0.011193 — a section search
is *all* decimals), null-cost-stays-null, the interval arithmetic **and** the
source filter (a backdated search rolls out of the window; a report fill never
counts), and the brand cascade.

## The wire types — `packages/shared/src/brand/autofill.ts`

`AutofillSectionInputSchema` is `{ label: z.string() }` with **no min/max on
purpose**: the service trims, rejects blank, and clamps to
`GUIDELINE_LABEL_MAX_CHARS` — clamped, never validated-and-rejected, per that
constant's own doc comment. `AutofillSectionResultSchema` is
`{ outcome: 'ok' | 'no-material' | 'invalid-shape', source: 'report' |
'search', draft: ResearchDraftSchema.nullable() }` — decision 7's vocabulary
riding the wire, `draft` present iff `ok`, and the draft the exact
`ResearchDraft` shape so Phase D lands it through the row's existing insert
channel.

## The service — `autofillSection`, every guard above the money line

`packages/server/src/research/autofill.ts`. In order:

1. **Trim, reject blank (`ValidationError`), clamp.** The draft echoes the
   clamped label.
2. The `SUGGESTED_SECTIONS` description is resolved here (case-insensitive
   label match) — both prompt builders render the line iff supplied, and the
   caller owns the match, the Phase A/B contract. `existingLabels` comes from
   `listSectionsByBrand`, **excluding the requested label itself** — a row
   saved empty before the click must not be told its own label is already
   covered.
3. **Path selection, latest-report-wins (decision 4):** `getLatestResearchJob`
   → `COMPLETED` with a report ⇒ **Path R**, the section shaper over the
   stored report. `NO_FINDINGS` deliberately falls through to Path S — its
   "report" is the finder's apology, and re-reading it would manufacture
   `no-material` out of a search that might succeed today. No
   reconcile-on-read: an `IN_PROGRESS` job simply is not a report yet, and
   Path S serves the click.
4. **Path S guards, the 3C order:** provider ≠ `none` (501,
   `ResearchNotEnabledError` reused) → `websiteUrl` present (`ValidationError`
   — the Casa Vostra rule, which works harder here: no 68k-char report for a
   human to notice the wrong company in) → per-day cap (429,
   `ResearchLimitError` reused). Then `searchSection`,
   `stripCitationMarkers`, `markdownToDraftBody`.

**Ledger semantics, decided here and written down:**

- **Path S records unconditionally** (after a successful vendor call), even on
  `no-material`: the vendor billed the work either way, and a cap that only
  counts successes lets a broken flow spend all afternoon — the
  `countResearchJobsTodayForWorkspace` reasoning, kept.
- **Path R records only on `ok`**: nothing landed on `no-material` /
  `invalid-shape` and no vendor money moved, so there is nothing for a spend
  ledger or a provenance trail to remember. `costUsd` is `null` — the user's
  own LLM tokens, unknown, never zero.
- **No in-flight index, no double-click arbiter** — the plan's explicit
  decision, restated in the service comment: a double-send costs cents; the
  client disables the button (Phase D) and the cap is the backstop.

**One addition to Phase B's seam:** `ShapeSectionFn` now resolves to
`ShapeSectionResult & { model: string }`, and `createSectionShaper` returns
`settings.llmModel` alongside the result. The event row records *which model
wrote the draft* — the same reason `brand_research_jobs.model` exists — and
the seam is the only place that knows, because it is where the workspace
settings are resolved. Nothing else about the Phase B contract changed.

## The route — `POST /brands/:id/guidelines/autofill`

In `routes/brands.ts` (a guidelines concern; the research router stays about
jobs), on a widened `BrandRoutesDeps` — `createBrandsRouter` now takes
`research`, `env` (the three autofill keys) and `shapeSection` beside
`db`/`storage`; `createWorkspaceBrandsRouter` keeps the narrow `BrandsDeps`.
The handler is thin: `requireBrandAccess`, then the service with facts off the
brand row — the same nothing-for-a-client-to-tamper-with posture as
`POST /brands/:id/research`, one label wider.

The literal `autofill` sits where no sibling parameterises, and
`app.test.ts`'s RegExpRouter-compiles assertion covers it for free, as the
plan predicted.

**The Phase B deferral lands:** `createApp` gains the optional `shapeSection`
dep, defaulting to `createSectionShaper({ db, llm, env })` — composed at the
mount exactly as `shapeResearch` is, and `createTestApp` forwards it so route
tests drive a fake.

## Fakes, mirrored

`createFakeDb` grows both methods: append-only `recordSectionAutofill` and a
count that filters `source === 'search'` and joins brand → workspace — a fake
that counted everything would let a test pass against a cap the real SQL does
not enforce. `FakeDbState` gains `sectionAutofillEvents`, which is also what
the route tests read to assert the ledger.

## Where the +19 went

`packages/server/src/research/autofill.test.ts`, real app over the fake db. A
finished deep run is **planted on the row directly** rather than driven
through the research lifecycle — path selection reads exactly one fact off it,
and the lifecycle has its own suite.

| block | Δ | what it pins |
| --- | --- | --- |
| Path S | +7 | the draft on the wire and the request off the brand row (name, URL, `sonar-pro`) · description present for a suggested label, absent for a custom one · `existingLabels` excludes the row being filled · `[n]` markers stripped · the ledger row (model, cost, sources, author) · empty search = `no-material` on the wire **and still on the ledger** · a 200-char label clamped to 120, echoed clamped |
| guards | +5 | blank label 400 before anything runs · 501 with no provider and no report · no-website 400 before spending · cap 429 with the vendor called exactly once · foreign user 403 at the workspace boundary |
| Path R | +7 | report read, vendor never called · works with `RESEARCH_PROVIDER=none` (the report is already paid for) · ledger row carries the writing model and a null cost · report fills don't consume the search budget (sibling brand still gets its one search) · `no-material` on the wire, ledger skipped · `invalid-shape` as a 200 fact, not a 5xx · `NO_FINDINGS` falls through to search |

Plan estimated +14–18; the overage is the `NO_FINDINGS` fall-through and the
clamp echo, both cheap.

## Verification

```
pnpm typecheck                    clean (all workspaces)
pnpm lint / format:check          clean
pnpm test                         1124 passed | 53 skipped (social WIP in tree)
pnpm -F @brandfactory/web build   clean
```

## Caveats

- **No UI calls the route yet** — Phase D builds the sparkle button, the
  mutation, and the three-mount threading. First contact between this code and
  a real vendor or model is Phase E's live pass.
- **The migration has not run against a real database** (no Docker, no
  `.env`). The live suite covers the table the day one exists; Phase E's pass
  runs it for real.
- **A `searchSection` that throws records nothing**, though the vendor may
  have billed partial work. The deep run closes this by inserting the row
  before the call; here nothing exists to insert into until the response
  arrives, and the exposure is cents. Accepted, and noted here so it is a
  decision.
- **`invalid-shape` is a 200 with no ledger row and no log line.** The batch
  pass logs it because its outcome would otherwise vanish into a silent empty
  review sheet; here the outcome rides the wire and the client owns the toast.
  If real use shows operators need the signal server-side, a logger dep is a
  two-line add.
- **Path selection does not reconcile.** A job that finished at the vendor but
  has not been reconciled yet reads as `IN_PROGRESS` and the click takes Path
  S — cents spent on a search a 5-second poll would have made free. Rare
  (the hub is usually polling the same brand), self-healing, accepted.
- **`PERPLEXITY_API_KEY` is still the temporary key** in `.env`, to be rotated
  before production.

**Untouched:** `packages/adapters`, `packages/agent`, `packages/web`,
`docs/changelog.md` — the feature ships as 1.19.0 at Phase E.

**Next in the plan:** Phase D — the web half: `useAutofillSection`, the
sparkle on empty labelled rows, the `_key`-addressable insert channel with its
StrictMode guard, the `createdBy` flip, and `canAutofill` wiring on all three
mounts.
