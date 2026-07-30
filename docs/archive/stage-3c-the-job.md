# Stage 3C — the job: table, routes, lifecycle

**Status:** shipped, 2026-07-29. Executes Stage 3C of
[`docs/executing/brand-hub-implementation.md`](../executing/brand-hub-implementation.md),
on top of [3B](stage-3b-research-port.md).

**Migration 0005** — one table, one enum, two indexes — plus three routes, an
in-process ticker, reconcile-on-read, and the hub's research row fed for real.
This is the phase where the code written in 3B first has something to run.

Test baseline: **720** → **757**. **+37** (23 server, 9 db-live, 5 web), zero
skipped with a `DATABASE_URL`.

---

## Everything expensive happens behind three guards and a gate

```
POST /brands/:id/research
  ├─ RESEARCH_PROVIDER=none?          501  — the feature is off, nothing is broken
  ├─ no website_url?                  400  — decision 4, the hard gate
  ├─ this brand already running?      409  — one active job per brand
  ├─ workspace at its active cap?     429
  ├─ workspace at its daily cap?      429  — decision 12, the money one
  ├─ INSERT … status IN_PROGRESS           ← recorded *before* submitted
  └─ provider.start()                      ← the only line that spends
```

**Every check is above the line that costs money**, because below it the money
is spent and all a check can do is hide the result. The order is not decorative
either: the URL gate is second because a deep pass over the bare string "Casa
Vostra" finds *a* Casa Vostra and writes a confident, cited, entirely wrong
profile — and the citations make it more convincing, not less.

**The row is written before the submission, and that is the deliberate
direction.** Submit-then-record loses the job entirely if the process dies
between the two — and it has already been paid for. Record-then-submit can leave
a row with no `externalId`, which the reconciler recognises and closes after a
two-minute grace. One failure mode is recoverable; the other is money on the
floor.

### The guards live in a service, not in the handler

`research/service.ts`, because **two callers need the same lifecycle**: the route
and the ticker. A guard written inside a handler is a guard the background sweep
does not have.

## What the table records that the wire does not

| column | why it is not on the wire |
| --- | --- |
| `report` | 3A's real one was **67,780 characters**, and the hub re-reads its summary every 5 seconds while a job runs. Shipping the report on that wire is a novel per poll to render one footer row |
| `provider`, `model` | recorded per job, not read from env at display time — a run that used `sonar-deep-research` last month must still say so after the operator switches models |
| `external_id` | a client with the vendor's job id is a client that can poll the vendor directly |
| `cost_usd` | `numeric(12,6)`, because money in a float is a rounding waiting to happen. **Nullable, and null means unknown — never zero** |
| `input` | the brand name and URL **as they were at submission**, so a rename mid-run does not make a report look like it researched the wrong company |

`cost_usd` is the column 3A earned: the vendor reports its own per-run cost, so
decision 12's guard has a ledger rather than an estimate behind it. Nothing bills
against it yet — the daily cap is a job count, which is what is enforceable
*before* a call — but the number is recorded from the first run onward.

## Terminal states are terminal, and that is a `WHERE`

```sql
UPDATE brand_research_jobs SET status = … WHERE id = $1 AND status = 'IN_PROGRESS'
```

The ticker and a reconcile-on-read hitting the same job is **the ordinary case**,
not a rare race. The `WHERE` is what makes it safe: the second finisher gets
`null` back and writes nothing, so a late poll cannot reopen a completed job's
`completedAt` and make a job that finished half an hour ago look like one that
just did. There is a live-DB test that runs both and checks which one stuck.

## Reconcile-on-read, because the ticker is not always there

The ticker sweeps every 30 seconds — a reconciler for the browser that closed,
not a progress bar, since 3A measured a real run at 4.0 minutes and the client
that actually cares polls its own summary every 5 seconds.

But a ticker only exists in a process that has been up the whole time. **A
restart mid-job leaves a row `IN_PROGRESS` with nobody watching it**, and the hub
would poll it forever. So every read reconciles first: reading the job is exactly
when someone cares about it.

Three refusals in the reconciler, all of the same shape — *do not throw away
something already paid for*:

- **A failed poll leaves the job alone.** It says nothing about a run that is
  very likely still going.
- **An unknown status is `running`.** The vendor's vocabulary is migrating (3A);
  inventing a terminal state for a word we have not seen would close a live job.
- **A `COMPLETED` run with no report is a failure**, because 3D would otherwise
  be handed an empty string to shape.

## `NO_FINDINGS` is ours to decide, and this is where

A completed run over a one-page holding site is a *success* to every finder
alive. The prompt tells it to "say so plainly and stop", so the honest output is
a short paragraph — and `NO_FINDINGS_MAX_CHARS = 500` is what turns that into a
distinct state rather than five sections of confabulated guidance.

**Provisional, deliberately, and the constant says so.** 3A's real report was
67,780 characters, so the gap between "found something" and "found nothing" is
three orders of magnitude wide and no honest report lands near the line. 3D gets
a better signal — *shaping produced zero sections* — at which point this becomes
the fallback rather than the rule.

## The gate the client reads

```
GET /brands/:id/research  →  { enabled: boolean, job: ResearchJobSummary | null }
```

An envelope rather than a bare job, because the hub needs two facts at once and
reads them in one place: *can this deployment research at all*, and *where did
this brand's last run get to*. `enabled` is what the route turns into the
**presence or absence of `onStartResearch`** — which is 1.8.0's callback gate,
finally connected to something real. A self-hoster with no key gets the research
row *absent*, not present and failing.

`job: null` is the ordinary state of nearly every brand, and it renders as
silence. **1.8.0's invariant has now retired its first half completely** — every
prop the mockup added is fed by the real route — and the half that carries the
weight is unchanged and still true.

**Polling stops on its own.** `refetchInterval` is a function of the cached
state, so a brand with no job in flight asks nothing. A fixed interval would have
every open hub tab re-asking a question with a permanent answer, forever.

## Verification

```
pnpm typecheck                          10/10 workspaces
pnpm lint / format:check                clean
DATABASE_URL=… pnpm test                757 passed | 0 skipped
db:migrate                              0005 applied to the dev database
```

| where | Δ | what it pins |
| --- | --- | --- |
| `server/src/routes/research.test.ts` | +15 | the happy start · the URL gate refusing **before** `start()` is called · one-per-brand · both caps, each with the outbound call counted · 501 on the shipped default · a refused submission failing the row and freeing the brand · the envelope's two shapes · reconcile-on-read completing, failing and `NO_FINDINGS`-ing · a poll error leaving the job alone · cross-brand isolation · 401 |
| `server/src/research/ticker.test.ts` | +8 | a job finished with nobody watching · one bad job not ending the sweep · the overlap guard · start/stop · the unsubmitted grace, both sides · two finishers racing · a no-op on a finished job |
| `db/src/research.live.test.ts` | +9 | the full life against real Postgres · `numeric` to six places · the terminal `WHERE` · brand-scoped reads · all three guards · the ticker's list · latest-of-two · drafts as jsonb · the FK cascade |
| `web/src/api/queries/research.test.ts` | +5 | polling only while in flight, and never for a brand with no job · the cache write on start |

### The live check, which cost nothing

The routes were exercised against the running dev server with the provider
**switched on but never called** — every one of these paths returns before the
outbound line:

```
RESEARCH_PROVIDER unset       GET  → { enabled: false, job: null }
RESEARCH_PROVIDER=perplexity  GET  → { enabled: true,  job: null }
brand with no website         POST → 400, and the toast says what to do about it
```

And the hub was screenshotted in both themes: **the research row renders in the
rail's footer, under `Talk it through`** — the first time the mockup's row has
appeared on a real brand, driven by a real query.

## Caveats

- **This code has still never called the vendor.** 3A did, from a scratch script;
  the adapter's own tests run against captured bodies; every check above stops
  before the outbound line. First real contact is a click that costs $0.377, and
  the natural place for it is 3G's live pass — or 3D, which needs a real report
  to shape.
- **`RESEARCH_PROVIDER=perplexity` is now set in the dev `.env`.** The research
  row is live on every brand in dev, and clicking it on a brand *with* a website
  spends real money. Set it back to `none` to switch the feature off.
- **The row is offered on a brand with no website**, where it can only refuse.
  The refusal is clear and it is the only place the rule gets taught — but a
  quieter alternative (hide the row, or point it at the rename dialog) is worth
  a look in 3G.
- **`CANCELLED` is in the enum and nothing produces it.** The vendor bills for
  work already done, so cancelling would only stop us reading a report we have
  already paid for. Recorded, not built.
- **The ticker is single-instance.** `native-ws` has pinned this server to one
  instance since 0.9.1, so nothing new is owed — but two instances would sweep
  the same rows, which is safe and wasteful. An advisory lock or a claim column
  is the fix; it is recorded, not scheduled.
- **No `NO_FINDINGS` has ever been observed from a real run.** The threshold is
  reasoned from one real report and tested with a fake one.
- **Drafts are always `[]`.** `setResearchJobDrafts` exists and has a live test;
  nothing calls it until 3D produces something to put there.

**Untouched:** `packages/agent`, `adapters/*` (3B's adapter is used, not
changed), `BrandContextRail` and every other component — the rail rendered the
five research states from props before this phase and still does, which is why
its tests did not move.

**Next in the plan:** 3D — the shaping pass, on the workspace's own configured
model, where 3A's finding about a 67,780-character report becomes a requirement:
**compression, not partition.**
