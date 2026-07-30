# Stage 3 hardening — the review of the one stage nobody had reviewed

Not a phase of [the implementation plan](../executing/brand-hub-implementation.md).
A review pass asked for before production, against the shipped code rather than
against the notes that describe it.

**Why Stage 3 and not Stages 1–2.** 1.11.1 reviewed Stages 1 and 2 and fixed nine
findings. Stage 3 shipped as 1.11.0 on the same day and was reviewed by nobody —
its own completion notes are the only thing that has ever looked at it, and notes
written by the pass that wrote the code are not a review. Every finding below is
in Stage 3.

Six findings, all fixed. **887 → 921 tests (+34)**, one migration.

---

## The verdict first: this did not block the deploy

`fly.toml` sets no `RESEARCH_PROVIDER`, so it defaults to `none` and **Stage 3
ships dark**. Routes 501, the ticker never starts, the rail's row does not render.
Every finding here is behind that flag, which is why this is a pass that gates
*enabling research* rather than one that gates the release.

That is also the honest reading of the risk this pass removed: not "production was
broken" but "the first deployment to set `RESEARCH_PROVIDER=perplexity` would have
met all six of these at once, and two of them cost money per occurrence."

---

## What was found

| # | Finding | Where it bit |
|---|---|---|
| 1 | Drafts were never cleared, so the rail advertised them forever | The happy path, visibly |
| 2 | The shaping spend had no guard — N reconcilers, N paid LLM passes | The happy path, expensively |
| 3 | `IN_PROGRESS` had no ceiling; a stuck row disabled a workspace | Unrecoverable without a DB console |
| 4 | `label` was 200 at the producer and 120 at the consumer | One long label lost the whole batch |
| 5 | The one-job-per-brand guard was a check-then-act | Double-click bought two $0.40 runs |
| 6 | No timeout on any outbound call | One hung socket retired the ticker |

Findings 1, 2 and 5 are all the same underlying mistake in three places: **a rule
stated in a comment and enforced nowhere**, or enforced somewhere that cannot see
what it needs to see.

---

## 1 — The drafts were never cleared

`BrandContextRail`'s research row renders on `status === 'COMPLETED' &&
drafts.length > 0`. Nothing in the repo ever emptied `drafts`.

So after research populated an empty brand (E1), or after you accepted and saved
(E2), the rail went on saying **`5 drafts ready — Review`** forever. Clicking it
reopened the sheet with the same five; accepting again wrote a **second copy of
every section**.

The code knew. Two artefacts describe the missing piece:

```
BrandContextRail.tsx:417   // Everything else — no job, a cancelled one, or a
                           // completed run whose drafts have already been
                           // dealt with — is the entry point again.
                                        ↑ a state the code could not reach

queries/research.ts:247    /** 3E writes drafts onto an already-completed job;
                            *  nothing else may. */
                           export async function setResearchJobDrafts(…)
                                        ↑ wired into `Db`, faked in test-helpers,
                                          called by NOTHING
```

That second one is precisely the shape 1.11.1 found in `reorderAssets` —
"transactional and live-tested since 2A, reachable from **nothing**" — one stage
later and nobody looked.

### The fix, and the two decisions inside it

**`clearResearchJobDrafts(brandId, jobId)`**, narrowed from the general setter it
replaces. The only operation anyone needs is *forget*, and a general setter behind
a route would let a client write draft bodies attributed to `createdBy: 'agent'`
that no shaping pass produced. Scoped by brand like `getResearchJob`, and
restricted to `COMPLETED` so it cannot race `finishResearchJob`, which is the
write that *produces* the drafts.

**Clearing is an acceptable way to record "dealt with" only because drafts are
derived.** The report is the $0.40 artefact and it stays on the row, as does the
thread 3F made of it. Rebuilding drafts costs a shaping pass, not a vendor call.
If drafts were the paid artefact this would have needed a column and a migration
instead.

**"Landed" is not the same moment on the two paths**, and that is the load-bearing
part:

```
E1  populate onSuccess   → landed. The sections are written; the server said so.
E2  accept               → NOT landed. Staged into an editor the user may close.
E2  editor onSaved       → landed.
```

Clearing on *accept* would have been one line shorter and wrong: closing the
dialog without saving would have cost a $0.40 re-run to get the drafts back. So
`acceptDrafts` arms `pendingLandRef` and a successful guidelines save disarms it.
`onSaved` fires on **every** save — a save with nothing armed is somebody editing
their own sections, which has no bearing on a research run.

**Undo does not put the drafts back**, deliberately. Undo means *"I did not want
these"*, so re-advertising them would be arguing with the gesture.

`DELETE /brands/:id/research/:jobId/drafts`, no body, **idempotent** — the client
calls it after a save it has already been told succeeded, so a retry is the
ordinary way to arrive twice and failing it would put an error toast on a screen
where everything worked. A job that is not this brand's, or not finished, still
404s: those are wrong, not repeated.

---

## 2 — Nothing guarded the shaping spend

Stage 3's stated rule is that *every guard fires above the line that spends money*.
`finishResearchJob` arbitrates the **write**. Above the write sits a vendor poll
and a full `generateObject` pass over a report measured at 67,780 characters, and
nothing arbitrated that at all.

Not an edge case — **the ordinary path**, because the two watchers run at
different periods:

```
t+0s    vendor finishes
t+5s    client poll   → reconcile → poll vendor → SHAPE   (paid)
t+30s   ticker sweep  → row still IN_PROGRESS  → SHAPE    (paid, discarded)
t+60s   ticker sweep  → row still IN_PROGRESS  → SHAPE    (paid, discarded)
```

Every pass but one is thrown away by a `WHERE status = 'IN_PROGRESS'` that runs
*after* the model has been paid. `RESEARCH_MAX_JOBS_PER_DAY` bounds the $0.40
search and nothing bounded the inference stacked on top of it.

**The existing test suite contained the proof and was not reading it.**
`routes/research.test.ts:436`, "creates exactly one thread when two reconcilers
finish the same job", fires three concurrent reads and asserts one thread. There
were three shaping passes. The assertion that would have caught this is one line
long and nobody wrote it.

### The fix

An in-flight `Map<ResearchJobId, Promise<ResearchJob>>` in the service, keyed by
job, cleared on settle. Concurrent callers **share the promise** rather than one
of them losing a race — the same idiom `getFreshAuthToken` uses for token refresh
(1.5.1), and the same trade: in-process, so a restart mid-shape costs one repeated
pass rather than a wrong answer.

**The database guard was kept, not replaced.** In-process de-duplication is an
optimisation of spend; `finishResearchJob`'s `WHERE` is the correctness guarantee,
and if a deployment ever runs two instances past the single-instance invariant it
is the only thing standing between a brand and two copies of a 67,780-character
report. They are now two tests, because they are two properties.

---

## 3 — `IN_PROGRESS` had no ceiling

`UNSUBMITTED_GRACE_MS` closes a row that never got an `externalId`. **Nothing
closed a row that got one and then never finished.** A vendor that purges the job
(every poll 404s) or simply never leaves its running state left the row in flight
forever, and `reconcileResearchJob` logged a warning and returned it unchanged on
every sweep, indefinitely.

That row is not inert:

- `hasActiveResearchJob` permanently refuses to research that brand again
- it permanently occupies a slot in `RESEARCH_MAX_ACTIVE_PER_WORKSPACE`, **which
  defaults to 2**

So two stuck rows disabled research for an entire workspace. With no cancel route,
no `CANCELLED` producer and no admin surface, the only way out was a database
console.

`RESEARCH_JOB_MAX_MINUTES`, default **60** — four times the vendor's documented
15-minute ceiling, because being wrong about a slow run costs one re-run and being
stuck costs a DBA. Applied on both the "still running" answer and the "poll
failed" one, since a job whose polls have stopped answering is the case that
motivated it.

**`externalId` is deliberately left on the row.** The run may well have completed
and been billed, so the pointer to a recoverable report has to survive the row
being closed — and the message says what happened rather than claiming the
research failed.

### The `NaN` this turned up

`RESEARCH_JOB_MAX_MINUTES` reaches the comparison as `undefined * 60 * 1000` if it
is ever missing, and **`ageMs < NaN` is `false`** — so a missing value would not
disable the ceiling, it would abandon *every job on its first poll*. `loadEnv`
defaults it, so this cannot happen in a running server; it is guarded anyway,
because of which way it fails. It has its own test.

This was not theoretical. It is how the finding was found: four tests went red on
the first run because the test `env` fixtures had not been updated, and the
symptom was every job failing rather than the ceiling being off.

---

## 4 — One long label lost the whole batch

```
shape.ts / ResearchDraftSchema      label: z.string().min(1).max(200)
UpdateBrandGuidelinesSectionInput   label: z.string().min(1).max(120)
                                                              ↑ the destination
```

Nothing clamped in between. Because `PATCH /brands/:id/guidelines` takes the
brand's **complete** section list, one 130-character label from the writing model
returned `400` for the entire payload — **all five drafts lost to a toast**, not
just the long one.

Exactly the failure 3G already hit through `min(1)` ("a captured section is
nameless by design … so one capture 400'd the whole save"), one bound over. The
`min(1)` half got fixed in the client; the `max` half was never looked at.

`GUIDELINE_LABEL_MAX_CHARS` is now a named export in `shared`, used by all three
schemas. The producer **clamps rather than validates**, and that direction is the
decision:

- the model-facing `ShapedSectionSchema` carries **no** maximum, because
  `safeParse` is all-or-nothing and a bound there turns one over-long label into
  *zero drafts for the run*
- `shapeResearchIntoSections` trims and slices to the destination's cap, so the
  cost falls on the one label's tail
- the prompt states the number too, so clamping stays the fallback rather than the
  mechanism

A whitespace-only label is dropped, since the destination's `min(1)` would refuse
the batch for it.

---

## 5 — The one-job-per-brand guard was a check-then-act

```
hasActiveResearchJob()   ← SELECT
                         ← the window
createResearchJob()      ← INSERT
provider.start()         ← $0.40
```

`brand_research_jobs_in_flight_idx` was a plain index, so nothing settled the
race. Two clicks inside one round trip: neither request sees the other's row, both
pass, both submit, **~$0.80 for one brand**. The rail's button had no `disabled`
and `useStartResearch` only writes the cache `onSuccess`, so the window was wide
open in the UI as well.

Fixed on both sides, and the order matters — the index is the guard, the button is
what keeps an ordinary user from meeting it:

- **Migration 0006** makes the partial index `UNIQUE`. Partial on `IN_PROGRESS`,
  so a brand may have any number of finished runs and at most one in flight.
- `isInFlightUniqueViolation` turns `23505` on **that named constraint** back into
  the same 409 the non-racing path returns. Checked by name, not by code alone:
  any other unique violation reaching that line is a bug and must not be dressed
  up as "research already running".
- `researchStarting` disables the row — on **every** state that can start a run,
  not just the idle one, because `Try again` after a failure is reached with the
  old job still in the cache and invites a double click exactly as readily.

### The migration, and why it is 0006 and not an edit to 0005

**0005 has already been applied** — it is in the local dev database and 1.11.0
shipped it. Editing an applied migration is only safe if it never ran anywhere, so
this is a new file. That was the explicit instruction and it is also the only
correct answer available: nothing in this repo can prove what production's
`__drizzle_migrations` contains, and "probably not yet" is not a basis for editing
history.

**The generated SQL was not shippable as generated.** `drizzle-kit` emitted the
drop and the unique create. Against the data the fix exists to prevent — a brand
with two in-flight rows — `CREATE UNIQUE INDEX` **aborts, taking the release with
it**. Verified rather than assumed:

```
ERROR:  duplicate key value violates unique constraint
        "brand_research_jobs_in_flight_idx"
DETAIL:  Key (brand_id)=(3333…) already exists.
```

So the migration resolves the rows before it constrains them: keep the newest per
brand (the one `getLatestResearchJob` shows, so the one a user is watching), close
the losers as `FAILED`. **Closed, not deleted** — a row is the only record that
money was spent, `external_id` is the only pointer to a report that may exist at
the vendor, and the daily cap counts rows precisely so a billed run still counts.
Deleting them would hide a real charge.

Exercised against a seeded duplicate:

```
status      external_id   error
FAILED      ext-old       Closed by migration 0006: this brand had more than one…
IN_PROGRESS ext-new
```

---

## 6 — No timeout on any outbound call

Neither `perplexity.ts`'s `fetch` nor `generateObject` carried one.
`ShapeResearchInput.signal` had existed since 3D and nothing ever passed it.

The consequence is worse than a slow request, because of *where* these are
awaited. The ticker holds a `running` flag released in a `finally`; a `fetch` that
never settles means the `finally` never runs, so **every later sweep in the
process no-ops** — one unresponsive socket silently retiring the only thing that
finishes a job nobody is watching.

- `DEFAULT_REQUEST_TIMEOUT_MS = 30s` on both vendor calls. This is the *async*
  Sonar line: `start` submits and `poll` reads a status row, so neither waits for
  the 3–15 minutes of research and a call outstanding after 30s is a hung socket,
  not slow work.
- `SHAPE_TIMEOUT_MS = 3min` on the writing model. Generous because the input is
  genuinely ~17k tokens. Abandoning it costs a shaping pass, never the run —
  `reconcileResearchJob` already completes the job with zero drafts when shaping
  throws.

A timeout surfaces as `ResearchProviderError`, which the reconciler already treats
as *"we do not know"* — so a timed-out poll leaves the paid-for job alone rather
than marking it dead.

---

## Two things fixed in passing

**`packages/shared/src/index.ts` exported `./research/job` twice**, under two
copies of the same `// Brand research` comment. Harmless, deleted.

**`app.test.ts` now exists**, and asserts the app compiles to
`SmartRouter + RegExpRouter`. 1.11.1 lost an afternoon to a route shape that
silently downgraded the whole app to `TrieRouter`, and it was caught only because
an unrelated blob test happened to exercise the one route the downgrade breaks.
This states the property instead of relying on that luck — the new
`DELETE /:id/research/:jobId/drafts` is exactly the kind of spelling worth
guarding, and it was checked before being committed to rather than after.

**The test fake was lying about time.** `createFakeDb` stamped research jobs with
`NOW = '2026-04-19'`, a fixed date in the past, so every fixture job was born
~100 days stale. Harmless until a job's *age* became behaviour, at which point
every reconcile test would have asserted against a job the code is right to
abandon. Research jobs are now stamped with a real current timestamp; the two
tests that care about age pass `now` explicitly, which is what keeps them
deterministic.

---

## Verification

```
pnpm typecheck                                  10/10 workspaces clean
pnpm lint                                       0 errors, 0 warnings
pnpm format:check                               clean
DATABASE_URL=<live> pnpm test                   921 passed | 0 skipped (101 files)
pnpm --filter @brandfactory/web build           ok · "demo" in dist → 0
migration 0006, from empty                      applied; idempotent on re-run
migration 0006, against duplicate in-flight     older row closed, index created
migration 0006, WITHOUT its data step           fails, as predicted (23505)
```

887 → **921 (+34)**. Every new test states a property one of the six findings
violated, and three of them could only be written against real Postgres (the
partial unique index, its `WHERE`, and the two-brand case).

### The harness gap this pass also found

**A plain `pnpm test` silently skips all 41 live-DB tests** — with Postgres up and
`DATABASE_URL` in the root `.env`. The db package gates on
`process.env.DATABASE_URL` and nothing loads `.env` into the test process, so the
run reports `94 passed | 6 skipped` and reads as green.

Every "zero skipped" claim in the changelog is true **only with the variable
exported by hand**, which is how those passes were run. Left as-is here because
fixing it is a harness change with its own blast radius, but it is the single most
misleading thing in the repo's verification story and it should be next: either
load the root `.env` in the db vitest config, or make the live suites fail loudly
rather than skip when Postgres is reachable but unconfigured.

---

## Not done, and deliberately

Findings the review turned up and this pass did not take, because the ask was 1–6:

- **`PATCH /:id/assets`'s bare `catch {}`** maps any error — including a DB outage
  — to `404 ASSET_NOT_FOUND`.
- **`ResearchReviewSheet` keys by `d.label`**, both for `key=` and for its
  selection `Set`. Two drafts sharing a label — and the prompt *pushes* the model
  toward a fixed label list — toggle as one. Index-keying is the fix.
- **`researchThreadName` can exceed `ProjectSchema.name`'s 120 cap** on a long
  brand name. Inert today: the column is `text` and responses are not validated.
- **Vendor error bodies reach the rail verbatim** via `res.text().slice(0, 300)`.
- **`GET /blob-urls/:key/read-url` mints a signed read URL for any key** for any
  authenticated user, with no brand-ownership check. **Pre-existing since 0.7.1**,
  not Stage 3. Safe today on unguessable v4 UUIDs and single-owner workspaces —
  the same two assumptions 1.11.1 explicitly refused to rely on for the blob
  sweep, which is the argument for closing it before workspaces gain a second
  member.

Standing items from earlier passes, unchanged by this one:

- **The Supabase storage path has still never been exercised.** `fly.toml` runs
  `STORAGE_PROVIDER = "supabase"`; every Stage 2 live pass ran on `local-disk`,
  and `/blobs` mounts only for `local-disk`. One upload → render → brand-delete
  cycle with an SVG on a Supabase deploy is the smallest thing that closes it.
- **The agent still cannot read the brand's colours.** Named in the plan as "the
  obvious next pass".
- **Nothing bounds a brand's total storage.** `BLOB_MAX_BYTES` bounds one upload.
- **No live pass was run here.** Every finding is behind `RESEARCH_PROVIDER`,
  which is `none` in production, and exercising them end to end means paying for
  real runs. The first deployment that enables research should watch the rail
  through one full cycle — start, in flight, drafts ready, accept, save — and
  confirm the row goes quiet, which is finding 1's whole point and the one thing
  no test here can prove.
