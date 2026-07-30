# Research progress, and the run that finished into silence

Two bugs, reported one after the other from the same live run, against the
production deployment 1.13.0 lit up. Both are the same mistake in two places:
**a state the user was in that the rail had no drawing for.**

The trigger was a real research run on the brand *Temper* (`temper.sg`), started
from 1.13.0's create-dialog checkbox. First report: *"while researching, the UI
seems stuck here"*. Second, six minutes later: *"UI disappeared, looks like
research finished or died, but I can't see the research results anywhere"*.

Neither was a wrong guess. The first row was **literally frozen**, and the
second one was **gone**.

---

## 1. The clock was not slow, it was stopped

`BrandContextRail` rendered the in-flight row as:

```tsx
Researching… {`started ${formatRelativeTime(research.startedAt)}`}
```

`formatRelativeTime` defaults its `now` to `new Date()` **at render time**, so
the string is only as fresh as the last render. Nothing re-rendered that
component for the length of a run:

- `useBrandResearch` polls every `RESEARCH_POLL_MS` (5s) while `IN_PROGRESS`.
- React Query v5 has **structural sharing** on by default: a deep-equal response
  is returned as the *previous* object reference.
- React Query v5 has **tracked properties** on by default, and the consumer
  destructures `{ data }` alone — so `dataUpdatedAt` and `isFetching` changing
  do not re-render anything.
- An `IN_PROGRESS` summary is deeply identical on every poll. `status`,
  `startedAt`, `error: null`, `drafts: []`, `sourceCount: 0`. Nothing moves.

Same reference, no re-render, frozen string. `started 1 second ago` still read
*1 second ago* twelve minutes later. The one number on the screen was the one
thing lying, and a spinner beside a stale sentence is exactly what "stuck" looks
like.

**A poll is not a clock.** `lib/use-now.ts` is the tick, gated on `active` so a
hub with nothing running holds no timer.

### What replaced it

The vendor still reports nothing until it reports everything — `{ status:
'running' }` right up to completion — so there is still **no real progress to
show**, and inventing some was rejected in 1.13.0 for reasons that have not
changed. What is genuinely known is elapsed time, the measured window, and the
age at which the server gives up. All three are now stated:

| Pace | When | Second line |
| --- | --- | --- |
| `normal` | ≤ 15 min | *Usually 3–15 minutes. Draft guideline sections and a full report land on this brand when ready.* |
| `over` | > 15 min | *Longer than the usual 3–15 minutes. Still checking every few seconds — nothing is lost while it runs.* |
| `ceiling` | ≥ ½ `RESEARCH_JOB_MAX_MINUTES` | *Still no answer from the provider. This run closes on its own in about N minutes so you can try again.* |

Plus a hairline meter of elapsed-against-the-window, full and warning-tinted
once past it.

Three details worth keeping:

- **The meter is `aria-hidden`, with no `progressbar` role and no value.** A
  progress bar announces *proportion of work done*, and this is not that. A
  screen reader that read "62% complete" would be the fake meter 1.13.0 refused,
  delivered through a different channel.
- **The clock is outside the live region; the pace line is inside it.** The
  original `aria-live="polite"` wrapped the whole row, which was harmless when
  the row never changed. Over a ticking clock it would announce the elapsed time
  once per second for the length of the run. The pace line changes three or four
  times across a run and each of those is worth saying.
- **`ceilingWarningMinutes` is floored at the end of the quoted window.** Half of
  a short configured ceiling would otherwise land *before* the over-time state,
  so a deployment with `RESEARCH_JOB_MAX_MINUTES=20` would warn about an
  automatic close before admitting the run was late.

### The ceiling had to reach the client

`abandonIfStale` has closed stuck runs since 1.11.2 and **no surface has ever
mentioned it**, so minute 4 and minute 47 of a hung run were pixel-identical:
same spinner, same sentence, no indication anything would ever end it.
`RESEARCH_JOB_MAX_MINUTES` now rides the research envelope as `maxMinutes`,
beside `enabled` — deployment configuration, read by the same component in the
same breath.

It is **optional on the schema even though the server always sends it**, because
the client also *writes* that cache entry: `applyStartedJobToCache` seeds it from
the `POST` response, which carries the job and nothing about the deployment, and
a brand researched from the create dialog has no previous entry to inherit from.
Absent means *not yet known*, which renders as claiming no ceiling at all, and
the 5-second poll fills it in one tick later. A default would be a number the UI
states with confidence that nobody configured.

### A ticking clock over a dead connection

The one way this change could have made things worse. A frozen clock is
uninformative; a clock that keeps counting while the poll is failing reads as
*live confirmation that the run is progressing*. `researchUnreachable`
(React Query's `isError`, which already encodes "the last attempt failed" across
the retry policy) replaces the pace line with a statement about the connection —
and deliberately does **not** claim the run died. It is a row on a server with a
reconciling ticker; neither needs this browser.

---

## 2. A finished run that reported itself as never having happened

The second screenshot showed the rail back at `Research this brand`, with all
five guideline sections still empty. That is the fall-through branch, and three
states reached it:

- `research === null` — never researched
- `CANCELLED` — nothing produces it
- **`COMPLETED` with `drafts.length === 0`**

`FAILED` and `NO_FINDINGS` each have their own row and neither was on screen, so
the run **completed**. Shaping produced no drafts, and `reconcileResearchJob`
swallows that on purpose — *"a paid-for report is not lost because the second
stage failed"* — which is the right call on the server and became silence on the
client.

The branch's own comment said it was for *"a completed run whose drafts have
already been dealt with"*, which is 1.11.2's clear-drafts case. It silently also
caught **completed and never produced drafts in the first place**, a completely
different event and the one that had just cost $0.40. 3G hit exactly this against
a real 48,607-character report when shaping threw `Unauthorized`.

The report was never lost. `landReportInThread` has landed it as a brand-context
thread — `Brand research — Temper, 30 Jul 2026`, the whole report as the first
assistant message — since 3F. It just was not counted anywhere the hub looked:
brand-context threads are filtered out of the Copywriting and Open canvas tiles
by design, so the hub read `0 threads` everywhere and looked untouched.

`hasReportToRead` is the question the rail never asked. `COMPLETED` is the exact
condition the thread is created under, which makes it a fact rather than a guess.

```
finished  ▤  Research finished — read the report
             The full report is a conversation in Brand context. …
          🔍 Research again
```

Two decisions inside that row:

- **Re-run sits underneath the report rather than replacing it.** A finished run
  has two reasonable next moves and the old fall-through offered only the one
  that spends $0.40 again.
- **The copy says nothing about *why* `drafts` is empty.** Shaping produced
  nothing and drafts already accepted are indistinguishable on the wire, and
  guessing wrong in either direction is worse than the one sentence true in both.

Drafts, when there are any, still win the row — they are the urgent thing, and
the report stays reachable from Brand context either way.

**No migration.** Linking straight to the thread would mean persisting the
project id `landReportInThread` already returns and discards, and the list link
works retroactively for runs that have already happened — which a migration
would not have.

---

## Also fixed on the way through

- **The chip carries the clock.** `ResearchInFlightIndicator` said only
  `Researching…`. The point of surviving navigation is knowing where the run got
  to, and a bare spinner answers *that* something is running, not *whether it is
  going normally* — which is the question you leave the hub with. Pace copy stays
  on the hub; the tooltip stops promising the usual window once past it.
- **`RESEARCH_DURATION_RANGE` was a sentence.** Fine as copy beside a checkbox,
  useless the moment something had to answer *"is this late?"*. The numbers are
  primary now (`RESEARCH_DURATION_MIN_MINUTES` / `_MAX_MINUTES`) and the sentence
  is derived; parsing minutes back out of a string with an en-dash in it would
  have been a second source of truth in a file that already refuses two.
- **A fixture's fixed past date became behaviour.** `BrandContextRail.test.tsx`
  stamped every job `2026-07-29T09:00:00Z`, inert until a job's age meant
  something — the identical trap 1.11.2 recorded against the db test fake, in a
  different fixture. The in-flight test now stamps fresh and says why.

---

## Verification

```
pnpm typecheck                    10/10 workspaces
pnpm lint / format:check          clean
pnpm test                         936 passed | 47 skipped (106 files)
```

897 → **936 (+39)**: 17 for `research-progress`, 5 for `use-now`, 11 across the
rail's new clock and finished-run rows, 2 for the header chip, 2 for the cache
seed carrying `maxMinutes`, 1 for the route reporting the configured ceiling,
plus one extended parameterised case.

The 47 skips are live-Postgres. **They were not run**: there is no local Docker,
Postgres or `.env` in this environment, so 1.11.2's warning applies unchanged —
a plain `pnpm test` skips them silently and "zero failures" here says nothing
about the db package's live suite.

**No live pass.** The app cannot boot in this environment. Everything above is
reasoned against the shipped code and covered by tests; none of it has been
watched in a browser.

**One inference is still unconfirmed.** That the Temper run reached `COMPLETED`
with zero drafts is deduced from which row rendered — `FAILED` and `NO_FINDINGS`
have visible rows and neither appeared — plus Fly logs showing no 5-second
polling at either page load, which means the job was already terminal. It is
confirmed by opening **Talk it through** on that brand and finding
`Brand research — Temper, 30 Jul 2026`. If that thread is absent, the thread
insert failed (logged and swallowed at `thread.ts:106`) and there is a third
thing to fix.

Why shaping produced nothing is **not** established. The candidates are a throw
or a timeout in the writing model (`SHAPE_TIMEOUT_MS`, 3 min) — both logged as
`research shaping failed`, just outside the retained log window. Catching it
needs `fly logs -a brandfactory` streaming across the next run.
