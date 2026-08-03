# Guideline auto-fill, post-review hardening — the gaps a live pass could not reach

**Status:** shipped into **1.19.0**, 2026-08-03. Follows
[Phase E](guideline-autofill-phase-e-live-pass.md), which closed the plan in
[`docs/executing/guideline-section-autofill.md`](../executing/guideline-section-autofill.md).

Not a phase. A review of all five phases against the question *is this 9/10 and
safe to push*, and then the fixes it produced. The answer to the first half was
yes with three exceptions; this is the record of the exceptions.

Test baseline: **22 → 29** in `research/autofill.test.ts` (+7). Nothing else in
the tree changed count.

---

## What the review found, and what it did not

The design survived scrutiny. Three things worth stating, because a review that
only lists faults misrepresents what it read:

- **The client gate and the server branch are provably the same predicate.**
  `canAutofillSections` reads `hasReportToRead(job)`, which is
  `status === 'COMPLETED'`; `service.ts:383` only assigns `COMPLETED` when the
  report clears `NO_FINDINGS_MAX_CHARS`. So there is no state in which the
  sparkle renders for a request the server would refuse — the gate is not two
  rules that happen to agree today.
- **No double-spend path through the client.** `queryClient` sets `retry` under
  `defaultOptions.queries` only, so mutations keep TanStack's `retry: 0`. A 502
  from a vendor cannot become two vendor calls.
- **The generated html cannot carry script.** `markdownToDraftBody` escapes
  before it interpolates and restricts links to `http(s)`, and the only consumer
  is TipTap's schema parser, which drops what it does not recognise.

Three findings needed code. All three share a shape: **they are unreachable in
the environment Phase E ran in**, which is why a live pass that found a genuine
ship-blocker walked past them.

---

## 1. The prose-refusal reader now runs on Path R

Phase E's finding was that `sonar-pro`, asked for a section a brand has no
material for, obeys the honesty rule *in prose* — 600 characters of apology,
non-empty, classified `ok`, one click from the brand's guidelines. The fix was
`SECTION_NO_MATERIAL_SENTINEL` plus `isNoMaterial`, and it was applied to the
path the pass could exercise. **Path R shipped guarded only by
`!text.trim()`.**

The reasoning behind that asymmetry was real and is written down in
`shapeSection.ts`: a JSON schema gives the batch model a compliant way to say
nothing — answer with an empty `markdown` — where a chat completion has no such
affordance, which is precisely why one had to be invented for Path S. A real
difference, and not a guarantee. A writing model that answers *"The report does
not cover Visual guidelines."* is in-schema, non-empty, and exactly the artefact
the sentinel exists to catch.

What made this worth fixing rather than watching is the caveat Phase E closed
on: **Path R has never produced a draft against a real model**, so the shape of
its output is known only from a fake `doGenerate`. The one path whose failure
mode is unobserved was also the one without the reader for it.

`autofillSection` now applies `isNoMaterial` to a Path R draft before returning
it, downgrading `ok` to `no-material` and logging at `warn` — the model refused
in prose rather than in schema, which is a fact about the configured model worth
finding in a log. It is a string compare on text already in hand, and the
substring trap the helper was written to avoid (`"no material waste"` in a real
`Values` section) is covered by a test on this path too.

Deliberately *not* done: moving the check into `shapeSectionFromReport`. The
port's division of labour holds here as it does for the adapter — the shaper
reports what the model produced, the service makes the domain judgement — and
`@brandfactory/agent` has no business importing a sentinel the search vendor's
prompt defines.

## 2. Upstream failures are `502 AUTOFILL_UPSTREAM`

Auto-fill is **the first synchronous outbound call in this repo**. Every prior
vendor call happens inside the ticker's sweep, where a failure lands on a job
row and the rail renders it; `ResearchProviderError` therefore never needed an
HTTP mapping, and it does not have one. So it fell through `onError` to
`{ code: 'INTERNAL', message: 'Internal Server Error' }` — which the editor
toasts verbatim.

Phase E recorded this for Path R's dead `OPENROUTER_API_KEY` and called a typed
error the obvious follow-up. The review's addition is that it was never
Path-R-specific: a vendor 429, a 5xx, or a 60-second timeout on Path S all
landed in the same place, and unlike a missing key those are ordinary weather,
not misconfiguration.

`AutofillUpstreamError` (502, `AUTOFILL_UPSTREAM`) now wraps both calls with a
message the reader can act on:

| what happened | what the toast says |
| --- | --- |
| vendor 429 | "The research provider is rate-limiting us right now. Wait a minute and try again." |
| vendor 5xx, network, timeout | "The research provider could not be reached. Try again in a moment." |
| Path R model failure | "The workspace's writing model could not draft this section. Check the model settings and its API key, then try again." |

Two things about this that are decisions rather than details:

- **The cause is logged, never returned.** `onError` logs only what it does
  *not* recognise, so promoting these to `HttpError` would have quietly traded a
  useless toast for a silent server. The service logs at the throw site with the
  brand id, the label and the vendor's status, through the **request-scoped**
  logger (`c.var.log`) so the line carries a request id. The vendor's own words
  — which may quote a key or a prompt — stay out of the response, and a test
  asserts that.
- **502, not 500.** The distinction is the one a person acts on: something
  upstream of us failed, so trying again is reasonable. A 500 says the opposite.

## 3. A failed ledger write no longer discards a paid draft

`recordSectionAutofill` runs *after* the work. On Path S that means the vendor
has been billed and the text is in memory, and a throwing insert took the whole
request down with it — the user pays again for the section they already bought,
and the second attempt writes the ledger row the first one failed to.

The ledger exists to account for spend and to feed the per-day cap. Neither is
worth more than the thing spent on. A `record` helper now logs the failure at
`error` — with the cost, so the row can be reconstructed from the log — and
returns the draft.

The cost is a cap that under-counts by exactly the rows that failed to land.
That is the safe direction to be wrong in *only* because the alternative is
double-billing, and it is stated here so it reads as a trade rather than an
oversight.

## 4. The 401 that was never asserted

The guard describe block covered blank label, 501, the URL gate, the cap and
403 cross-workspace — every refusal except the unauthenticated one. The auth
middleware is mounted on `/brands/*` and exercised by other suites, so this was
never a hole in the behaviour; it was a hole in what this route's own file
claims. Added, with the vendor fake asserting it was not called.

## 5. `failNextSectionAutofillRecord` — the fake's only failure switch

`createFakeDb` had no way to make a query fail, by design: a fake that can fail
arbitrarily tests the harness, not the app. This one earns the exception and the
comment says why — the autofill ledger is written after a paid vendor call, so
"the insert failed" is the single db error in this codebase whose *handling*
decides whether a user loses something they were billed for. Every other query
in the fake fails a request that has cost nothing.

One-shot: it clears itself when it fires, so a test cannot leave the fake poisoned
for whatever runs next.

## Two documentation corrections

- **The changelog had no 1.19.0 entry.** Phase E's own Files list claims
  `docs/changelog.md (1.19.0)` among its changes; the file topped out at 1.18.1
  and was unmodified in git. The feature was documented as shipped in five
  completion records and recorded nowhere a reader of the changelog would look.
  Written now, from those records plus this one.
- **Plan decision 8 misattributed the 501 backstop.** It credited the noop
  provider's `ResearchNotConfiguredError`, which is not an `HttpError` and would
  surface as a bare 500 — and which is unreachable regardless, because
  `EnvSchema`'s `superRefine` requires a key whenever a provider is selected and
  the service checks `RESEARCH_PROVIDER` before touching the provider at all.
  The 501 is real; it comes from the service's own check. Corrected in place
  with a dated note rather than silently, because the reasoning is load-bearing
  for the availability convention.

## Verification

```
pnpm typecheck                    clean (all 10 packages)
pnpm lint / format:check          clean
pnpm vitest run packages/server packages/agent packages/adapters
                packages/shared packages/db      521 passed | 64 skipped
pnpm vitest run <the web surfaces this feature touches>   66 passed
pnpm -F @brandfactory/web build   clean
```

`research/autofill.test.ts`: **22 → 29 (+7)** — the Path R prose refusal and its
"no material waste" twin, a vendor 502 with the status kept out of the body, the
429's distinct advice, a Path R model failure pointing at the settings, a paid
draft surviving a failed ledger write, and the 401.

**A full `pnpm test` is currently red on three `MiniAppTile` cases**, and none of
them belong to this work: a parallel session flipped the `social` mini-app row to
`enabled: true` (social-calendar Phase 7) while this review was running, and that
row's Soon-tile assertions have not caught up yet. Every suite this stream owns
is green; the two streams share no files.

## What this did not fix, and why

- **Path R's live verification.** Still owed, still one section fill and one
  screenshot, still blocked on a working `OPENROUTER_API_KEY`. The guard added
  above narrows the blast radius of it being unobserved; it does not substitute
  for observing it.
- **`PERPLEXITY_API_KEY` rotation.** A deployment task, not a code one, and the
  standing precondition of shipping this feature.
- **The cap's read-then-act window.** Two concurrent clicks can both pass
  `countSectionAutofillsTodayForWorkspace` and both spend. At ~$0.01 with a
  client-side single-flight guard in front of it, an advisory lock costs more
  than the overshoot. Phase C wrote this down as a decision; it stays one.
- **The sparkle/trash vertical offset.** A row that shows a sparkle puts its
  delete button ~28px lower than one that does not, so muscle memory for delete
  is row-dependent. Reserving the slot always has its own cost; unresolved, and
  a layout question rather than a correctness one.
- **Moving the plan out of `docs/executing/`.** The brand-hub precedent says
  archive a finished plan, and all five phases are done — but the plan is still
  the reference for the one open item (Path R live), and five completion records
  plus the social-calendar plan link into it by relative path. The move is
  cheap churn against live links; it waits for Path R.

## Files

`packages/server/src/research/autofill.ts` — `AutofillUpstreamError`, the
`record` helper, the Path R refusal reader, both upstream calls wrapped and
logged. `packages/server/src/routes/brands.ts` — `c.var.log` into the service
deps. `packages/server/src/test-helpers.ts` —
`failNextSectionAutofillRecord`. `packages/server/src/research/autofill.test.ts`
— +7. `docs/changelog.md` — the missing 1.19.0 entry.
`docs/executing/guideline-section-autofill.md` — decision 8's correction.
