# Research fixtures — captured from a real run, never hand-written

These files are **verbatim response bodies** from Perplexity's API: the first
two recorded by 3A's live spike on **2026-07-29**, the third by guideline
auto-fill's Phase A spike on **2026-08-03**. They are what
`PerplexityResearchProvider` is tested against, and the reason both plans put a
paid live spike before a line of adapter code.

| file                            | what it is                                                       | the port method it exercises |
| ------------------------------- | ---------------------------------------------------------------- | ---------------------------- |
| `deep-research-submit.json`     | the `POST /v1/async/sonar` response, `status: CREATED`           | `start()`                    |
| `deep-research-completed.json`  | the terminal `GET /v1/async/sonar/:id` body, `status: COMPLETED` | `poll()`                     |
| `section-search-completed.json` | a `POST /chat/completions` body, `sonar-pro`, one section        | `searchSection()`            |

The deep run: `sonar-deep-research`, one real brand with a real website,
**4.0 minutes wall clock**, **$0.377**. The numbers and what they decide are in
[`docs/archive/stage-3a-live-spike.md`](../../../../docs/archive/stage-3a-live-spike.md).

The section run: `sonar-pro`, the same brand, one "Voice & tone" section,
**7.1 seconds**, **$0.011**, 11 sources — every one of them the brand's own
domain, because the request pinned `search_domain_filter` to it. The same
prompt without the pin retrieved 19 generic "brand voice examples" articles and
wrote a confident, cited section about a same-named other company; the filter
is therefore load-bearing, not an optimisation. See the Phase A completion note
under `docs/completions/`.

**Do not edit these by hand.** A fixture that has been tidied is no longer
evidence of what the vendor sends — and the two facts most worth preserving are
easy to "clean" away: `usage.cost` is reported **by the vendor** (so the daily
budget guard can bill actuals rather than estimates), and the report's markdown
is 67,780 characters deep in `## `/`### ` nesting, which is the shape 3D has to
compress rather than merely split.

To capture a newer one, re-run the spike — it is outside the repo on purpose,
because nothing in `packages/` should be able to spend money.
