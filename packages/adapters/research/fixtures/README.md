# Research fixtures — captured from a real run, never hand-written

Both files are **verbatim response bodies** from Perplexity's async API, recorded
by 3A's live spike on **2026-07-29**. They are what `PerplexityResearchProvider`
is tested against from 3B onward, and the reason the plan put a paid live spike
before a line of adapter code.

| file                           | what it is                                                       | the port method it exercises |
| ------------------------------ | ---------------------------------------------------------------- | ---------------------------- |
| `deep-research-submit.json`    | the `POST /v1/async/sonar` response, `status: CREATED`           | `start()`                    |
| `deep-research-completed.json` | the terminal `GET /v1/async/sonar/:id` body, `status: COMPLETED` | `poll()`                     |

The run: `sonar-deep-research`, one real brand with a real website, **4.0 minutes
wall clock**, **$0.377**. The numbers and what they decide are in
[`docs/completions/stage-3a-live-spike.md`](../../../../docs/completions/stage-3a-live-spike.md).

**Do not edit these by hand.** A fixture that has been tidied is no longer
evidence of what the vendor sends — and the two facts most worth preserving are
easy to "clean" away: `usage.cost` is reported **by the vendor** (so the daily
budget guard can bill actuals rather than estimates), and the report's markdown
is 67,780 characters deep in `## `/`### ` nesting, which is the shape 3D has to
compress rather than merely split.

To capture a newer one, re-run the spike — it is outside the repo on purpose,
because nothing in `packages/` should be able to spend money.
