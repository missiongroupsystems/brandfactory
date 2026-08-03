# Guideline auto-fill, Phase D — the sparkle, the insert, the three mounts

**Status:** shipped, 2026-08-03. Executes Phase D of
[`docs/executing/guideline-section-autofill.md`](../executing/guideline-section-autofill.md).
Follows [Phase C](guideline-autofill-phase-c-table-service-route.md).

**The feature is now clickable.** Every empty, labelled guideline row grows a
`Sparkles` button on all three surfaces the plan names; the draft lands in the
row's TipTap editor un-saved, and the ordinary **Save guidelines** commits it.
What remains is Phase E: the live pass and the 1.19.0 changelog entry.

Test baseline: the web package goes **573 → 592 (+19)**; the whole tree reads
**1146 passed | 64 skipped**, but that number is shared — the parallel
social-calendar stream was landing its own phases in the same working tree
while this one shipped, so only the web delta is attributable here. Nothing in
this phase touches that stream's files.

---

## The mutation — `useAutofillSection`, deliberately inert

`api/queries/brands.ts`. A plain `useMutation` around
`POST /brands/:id/guidelines/autofill` with **no cache write** — the server
persists nothing, the draft's destination is the row's local editor state, and
writing anything into the query cache would claim a save that has not
happened. Failure wording lives at the call site (the editor's toast), which
is also where the outcome vocabulary becomes words.

## The gate — `canAutofillSections`, stated once

Decision 8's availability rule was about to be written three times, once per
route, so it is a pure exported function in `api/queries/research.ts` instead:
`hasReportToRead(state?.job) || Boolean(state?.enabled && websiteUrl)`. Four
unit tests pin the edges — a report opens the gate even with research off
(Path R is the user's own tokens); the search path needs provider **and**
website (the Casa Vostra rule, enforced client-side so the button never
renders for a request the server would refuse); `NO_FINDINGS`/`FAILED` are not
reports; an unanswered query is closed.

## The editor — one new prop, one new producer for an existing channel

`BrandGuidelinesEditor` gains `onAutofill?: (label) =>
Promise<AutofillSectionResult>` — **absent prop = no button**, the rail's
`onStartResearch` convention. Each `SectionRow` renders the sparkle when three
facts hold: the prop exists, the label is non-blank, and the body passes
`isEmptyDoc` (strictly: only content-free paragraphs — decision 5's
empty-rows-only, with delete-the-body as the escape hatch).

The plan's "insert channel widened to be addressable by `_key`" turned out to
be **already true**: `pendingInserts` has been keyed by `_key` since 1.5.0 —
what was new was a second *producer* aiming at an existing row instead of a
freshly appended one. So the fill is: stage `{html, text}` under the row's
key, flip that row's `createdBy` to `'agent'` (decision 6 — the same
authorship fact `draftsToSections` records; later edits do not flip it back),
and let the row's own effect insert it. `insertedRef` keys on payload identity
and the result is a fresh object, so the StrictMode double-invoke guard is
inherited rather than re-learned — and re-pinned by a new test anyway.

Per-row pending (`autofillKey`): the filling row shows a `Loader2` spinner,
every other sparkle disables — one in-flight at a time, which is the client
half of the double-click guard (the per-day cap is the server's backstop).
Toasts by outcome: `ok` → *"{label} drafted from N sources — review and
save."*; `no-material` → source-aware honesty (*"The research doesn't cover
{label}."* vs *"The search found nothing solid…"*); `invalid-shape` → an error
about the writing model; a rejected promise → the server's own message via
`AppError`. Nothing auto-saves, ever.

## The forwarders and the mounts

`EditGuidelinesDialog` and `BrandContextPane` forward `onAutofill` as pure
type pass-throughs, typed off `BrandGuidelinesEditorProps['onAutofill']` — the
3E coupling pattern, so widening the editor without both forwarders does not
compile.

| mount | research query | wiring |
| --- | --- | --- |
| `brands.$brandId` (hub dialog) | already polled | `canAutofillSections(research, brand.websiteUrl)` gates the callback |
| `brands.$brandId.context` (page dialog) | **new** `useBrandResearch` call | same gate; one request per visit for almost every brand — the poll interval is a function of job status and self-stops |
| `projects.$projectId` (thread pane) | **new**, gated | `useBrandResearch(isBrandContext ? brand.id : '')` — an empty id disables the query, so ordinary threads never poll; `isBrandContext` moved above the early returns because hooks now hang off it |

All three pass `(label) => autofillSection.mutateAsync(label)` or nothing —
the callback is the gate, everywhere.

## Where the +19 went

| file | Δ | what it pins |
| --- | --- | --- |
| `BrandGuidelinesEditor.test.tsx` | +8 | no prop → no sparkle · sparkle only on empty-and-labelled (not the filled row, not the nameless one) · insert + provenance flip + no self-save + success toast + sparkle gone after fill · all sparkles disabled while one fills, re-enabled after · `no-material` toasts honestly, row stays fillable · a 429's own message surfaces and the sparkle survives for retry · exactly one insertion under StrictMode · the dialog forwarder delivers the prop |
| `BrandContextPane.test.tsx` | +1 | the pane forwarder delivers the prop |
| `projects.$projectId.test.tsx` | +4 | pane gets auto-fill with a report (even research-off) · with provider+website · nothing when no path could serve it · ordinary threads never poll research (the disabled `''` query) |
| `brands.$brandId.context.test.tsx` | +2 | dialog gets auto-fill when the search path is open · nothing when no path could |
| `api/queries/research.test.ts` | +4 | `canAutofillSections`' four edges (above) |

Plan estimated +16–22. The existing route-test files needed their mocks
widened for the routes' new imports (`useAutofillSection`, `useBrandResearch`)
— done with `importOriginal` so `canAutofillSections` stays the real rule
under test, not a re-implementation.

## Verification

```
pnpm typecheck                    clean (all workspaces)
pnpm lint / format:check          clean
pnpm test                         1146 passed | 64 skipped (shared tree — social stream mid-flight)
pnpm -F @brandfactory/web build   clean
```

## Caveats

- **Still no live pass.** The sparkle, spinner, and toasts are tuned in jsdom;
  their optics beside real rows — and the whole loop against a real vendor —
  are Phase E's job. The plan's Phase E script stands: Path R on Temper
  (suggested + custom label + a genuine `no-material`), Path S on a fresh
  brand (record cost + latency), `RESEARCH_PROVIDER=none` both ways, plus the
  1.18.0 unobserved list.
- **`useAutofillSection` has no dedicated hook test** — it is a two-line
  wrapper with no cache logic, and its behaviour is pinned through the editor
  (outcome handling) and route (wiring) suites. The plan's "mutation test"
  is satisfied by those plus the gate's unit tests; noted as a reading of the
  letter.
- **The sparkle disappears mid-flight if the user types into the row** (body
  stops being empty). The insert still lands when the promise resolves —
  appended to what they typed by `insertContent`. Harmless and arguably right
  (nothing is lost, nothing is saved), but unobserved in a real editor.
- **`title` copy on the button** promises "research when it exists, otherwise
  a targeted search" without knowing which path the server will take — that is
  the design (path selection is the server's, decision 4), but the wording is
  a candidate for the live pass's copy check.
- **The tree is shared with the social-calendar stream**, which was executing
  its Phases 2–3 while this shipped. Full-suite counts in this doc are
  point-in-time; the web-package delta is the attributable number.

**Untouched:** `packages/shared`, `packages/db`, `packages/server`,
`packages/adapters`, `packages/agent`, `docs/changelog.md` — the feature ships
as 1.19.0 at Phase E.

**Next in the plan:** Phase E — full verification, the live pass (Path R on a
brand with a report, Path S with cost/latency recorded, `none`-provider both
ways), the 1.18.0 unobserved list, and the changelog entry.
