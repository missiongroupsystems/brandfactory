# Stage 3A — B0, the live spike

**Status:** run, 2026-07-29. Executes Stage 3A of
[`docs/executing/brand-hub-implementation.md`](../executing/brand-hub-implementation.md),
which is `brand-research-onboarding.md`'s **B0**.

**No repo code, by design** — one key, one real brand, one real report, in a
script outside the repo. What lands in `packages/` is two captured response
bodies and their README. Test count is unchanged at **688**.

The four questions it exists to answer, answered:

| # | question | answer |
| --- | --- | --- |
| 1 | Does `POST /v1/async/sonar` still exist? | **Yes.** Live, not merely documented |
| 2 | What does a real run cost? | **$0.377**, and the vendor reports it |
| 3 | Wall clock? | **4.0 minutes** |
| 4 | A real response body? | Two, committed as fixtures |

---

## 1 — the endpoint, against the API rather than the docs

```
GET  /v1/async/sonar        200   (free — auth and endpoint in one probe)
POST /v1/async/sonar        200   status CREATED, id returned immediately
GET  /v1/async/sonar/:id    200   IN_PROGRESS ×14, then COMPLETED
```

Every field the locked document recorded from the docs is present in the live
bodies — `id`, `model`, `created_at`, `started_at`, `completed_at`, `failed_at`,
`error_message`, `status`, `response` — and the status enum is exactly
`CREATED | IN_PROGRESS | COMPLETED | FAILED`. **3B does not need re-cutting**,
which was the branch this phase existed to take early.

**But the successor now has a name, and that is new since the lock.** The
migration guide is explicit: *"Sonar's async API maps to Agent API background
runs: submit with `background: true` and poll the response by id"* — `POST
/v1/agent`, polled at `GET /v1/agent/{id}`, with `sonar-deep-research` mapping to
a **`high` preset** rather than a model name, and a different status vocabulary
(`queued | in_progress | completed | failed | cancelled | incomplete`). The Agent
API went GA in February 2026; the deprecation banner is dated this month. **No
sunset date is published** for the endpoint we are building on.

That is the port's whole justification, restated with a destination: when the old
line goes, the swap is one file, and the spike script already has the successor
path behind `--agent` so the replacement can be measured before it is needed.

## 2 — cost, and the half of it that is not tokens

```
input        139 tokens        $0.0003
output    12,817 tokens        $0.1025
citation   2,933 tokens        $0.0059
reasoning 26,112 tokens        $0.0783
search        38 queries       $0.1900      ← 50% of the bill
                              ────────
                               $0.3770
```

**Decision 10 stands: Quick mode stays cut.** It was cut on an estimate of "tens
of cents" and the measurement is thirty-eight cents — the estimate was right, so
the decision it supported does not move.

Two things the breakdown changes, though:

- **Half the cost is search, not generation.** A cheaper mode would therefore not
  be "a smaller model"; it would be *fewer searches*. If Quick ever returns, the
  lever is `search` configuration, and `model` alone would buy very little.
- **The vendor reports its own cost, per job, in `usage.cost`** — and it agrees
  with the published rate card to five decimal places ($0.37702 computed, and
  the same figure returned). So **decision 12's daily budget guard can bill
  actuals rather than estimates**, which is a materially better guard than the
  one the locked document specified, and it costs nothing to build that way. It
  is a `numeric` column on the job row and a sum, not an inference.

## 3 — wall clock, and what it sets

**4.0 minutes**, at the fast end of the documented 3–15. The job reported
`IN_PROGRESS` within 20 seconds and stayed there for fourteen polls.

- Decision 6's **5-second client poll** is comfortable — 48 polls over a 4-minute
  job against a React Query `refetchInterval` is nothing.
- **The ticker's period should be 30–60 seconds**, not 5. It is a reconciliation
  loop for browsers that closed, not the thing the open browser is watching, and
  a job whose floor is minutes does not repay a faster sweep.
- The 3E premise holds and is worth restating because it is now measured: four
  minutes is **ample time to start typing a Voice section by hand**, which is
  exactly why the emptiness gate is evaluated when the drafts land rather than
  when the job starts.

## 4 — the response body, and the finding with teeth

Both bodies are committed under
[`packages/adapters/research/fixtures/`](../../packages/adapters/research/fixtures/README.md):
the `CREATED` submission and the `COMPLETED` terminal read — the two states the
port has to parse, captured rather than imagined.

**The report is 67,780 characters.** All five `SUGGESTED_SECTIONS` headings came
back, in the order asked for, plus an unrequested `Conclusion`:

```
## Voice & tone              16,130 chars     ### ×5
## Target audience           11,924           ### ×4
## Values & positioning      14,507           ### ×5
## Visual guidelines          7,972           ### ×4
## Messaging frameworks      11,143           ### ×4
## Conclusion                 4,332           (not requested)
```

**This is a 3D finding, and it is the one worth carrying forward.** Decision 5
says the shaping stage "converts the report into draft sections", and the naive
reading of that — one `##` becomes one section — produces a **16,000-character
Voice & tone** in a rail row designed for a paragraph. 3D's job is therefore
**compression, not partition**, and its prompt has to say so. The 23 `###`
subsections are the raw material for that, not the output.

Two smaller ones:

- **~17,000 tokens of input to the shaping model.** 3D runs on the *workspace's*
  configured model via `resolveLLMSettings`, so this is a real per-run cost on
  the user's own key, on top of the $0.377, and a real context-window
  requirement. Neither was costed at lock time.
- **The extra `Conclusion` heading proves the prompt is a suggestion.** 3D must
  key on `SUGGESTED_SECTIONS` labels and drop what does not match, rather than
  trusting the heading set it asked for.

### Grounding, since confabulation is on the risk table

19 citations, **8 of them the brand's own domain** (`/`, `/concepts`, `/about-us`,
`/press`, two long-form posts, a careers page, a concept page), the rest trade
press, Glassdoor and company-data sites for the same company. The report
researched the brand *at the URL it was given*, not a same-named other. The hard
URL gate plus per-draft citations look adequate on this evidence — one brand is
not a sample, but the failure mode did not appear where it was most likely to.

**And `Visual guidelines` did the honest thing.** Its first subsection is
*"Limited explicit information and methodological approach"* — the model said the
site gave it little to go on rather than inventing a palette. **Zero hex values
appear anywhere in the report**, so 3D's "do not write hex into Visual
guidelines" instruction is prophylactic rather than corrective, at least here.

---

## Verification

```
GET /v1/async/sonar          200      free probe, no spend
one job, one brand           $0.377   4.0 min, COMPLETED
fixtures                     2 files, 80 KB, verbatim
pnpm test                    688 passed (unchanged — no repo code)
```

The spike script lives outside the repo, in the session scratchpad, because
nothing in `packages/` should be able to spend money. It takes `--name`/`--url`,
probes before it submits, and has the Agent API path behind `--agent`.

## Caveats

- **One brand, one run.** Cost and duration are a sample of one. A brand with a
  larger site could search more, and search is half the bill.
- **`PERPLEXITY_API_KEY` is in `.env` and nowhere else** — not in `EnvSchema`,
  not in `.env.example`, which is why the drift guard is quiet: it runs
  schema → example, not env → schema. 3B adds all five research keys in one
  commit, and the guard starts working for us then.
- **The key in use is a temporary one**, to be rotated before production.
- **The Agent API path is written but unmeasured.** `--agent` has never been run,
  so the successor's cost, duration and body shape are unknown. Worth one run
  before the old line is withdrawn rather than after.
- **Nothing was built on any of this yet.** 3A is a measurement; 3B is the first
  line of adapter code, and this is the plan's named decision point for whether
  it gets written at all.
