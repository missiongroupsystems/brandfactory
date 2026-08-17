# Passport sync consumer, phase 5 — reconciliation, all three parts

**Status:** complete, 2026-08-17. Written against `main` at **1.35.0**
(2101 passed | 92 skipped before → **2122 passed | 92 skipped** after; +21 tests).

Executes phase 5 of
[`docs/executing/passport-sync-consumer-plan.md`](../executing/passport-sync-consumer-plan.md).

**No migration.** The nightly backstop exists, is scheduled, and was verified by
running it against the live Passport API — not by reading the code.

---

## What landed

| File | Change |
| --- | --- |
| `packages/server/src/passport/reconcile.ts` | **new** — the function **and** the scheduler |
| `packages/server/src/passport/reconcile.test.ts` | **new** — 15 tests |
| `packages/server/src/routes/passport-sync.ts` | + `POST /webhooks/passport/reconcile`, secret-guarded |
| `packages/server/src/routes/passport-sync.test.ts` | +4 tests for the endpoint's guard |
| `packages/server/src/app.test.ts` | +2 — the trigger is really mounted |
| `packages/server/src/main.ts` | starts the reconciler, and stops it before the pool closes |

## 1. All three parts, because two of them are useless alone

The named failure for this phase is writing the function and stopping: it passes its
own unit test, so the suite is green and the write-up says "nightly reconciliation
built" while nothing ever runs it, and the projection silently rots until somebody
notices months of missed deliveries.

| Part | Where | Why it is separate |
| --- | --- | --- |
| The **function** | `reconcile.ts` | Fetch `snapshot()`, re-apply through the receiver's own handlers |
| The **endpoint** | `POST /webhooks/passport/reconcile` | So the job can be **verified by triggering it** |
| The **schedule** | `main.ts` | The part that actually makes it happen |

## 2. Four rules that make it safe

- **Re-applied through the SAME handlers the receiver uses.** Not a second write
  path: a parallel implementation would drift from the version guard and the
  tombstone rules, and the drift would only show under replay. A test asserts the
  handler names it calls, in order.
- **Every org, no filter** (rule 9). Narrowing the snapshot would re-introduce the
  exact single-org bug reconciliation exists to heal, and would report permanent
  phantom drift on every other org.
- **It never deletes.** Asserted directly: no `remove*` handler is reachable from
  this path. The snapshot's `identity_links` are a per-org **subset** and never
  authoritative — and this app writes its *own* link rows at login, with subjects
  Passport does not know. A pruning reconciler deletes exactly the rows that make
  sessions resolve, and the app denies everyone the next morning.
- **An empty snapshot is never read as "delete everything".** With no active
  entitlement it returns eight empty collections whether or not anything is wrong.

### The empty-snapshot warning is the most valuable line in the file

"Reconciliation ran clean" over nothing is the most reassuring available wrong
conclusion, and right now it is this app's actual state. So an all-zero result sets
`empty: true` on the summary and logs, in those words, that this is what a missing
entitlement looks like and is **not** evidence the projection is correct.

Logging is **counts only, never rows** — the snapshot carries staff emails — and a
test asserts no email appears in the log output.

## 3. Six hours, not twenty-four, and the reason is this deployment

A 24-hour interval measured from boot is fragile here specifically: Fly restarts the
machine on every deploy, so on a repo that ships more than once a day the timer would
**never fire**. Six hours costs one extra API call per sweep and cannot be defeated by
an ordinary release cadence.

There is also a first sweep **60 seconds after boot**, which is the useful half: a
fresh environment, or one that was down long enough for deliveries to exhaust their
retries, converges without waiting for the first interval.

The scheduler follows the research ticker's shape exactly — `{ tick, start, stop }`
with `tick` exported so no test waits on a timer, the in-flight sweep held as a
promise rather than a boolean so `stop()` can await it, and `start()` idempotent.
Three properties beyond that:

- **Overlapping sweeps coalesce.** A manual trigger arriving mid-sweep cannot start a
  second snapshot read.
- **A failed sweep is logged, not thrown.** The receiver is the primary path and keeps
  working; taking the process down over a failed backstop would be worse. But it is
  logged loudly, because a reconciliation that never succeeds is otherwise invisible.
- **`stop()` awaits the sweep in flight**, and `main.ts` calls it before `pool.end()`
  — for the same reason the research ticker does: a sweep sitting inside a snapshot
  read would otherwise resume against a dead pool.

**Single-instance**, which adds no new constraint (`native-ws` realtime has pinned the
server to one machine since 0.9.1, which is why `fly.toml` sets
`min_machines_running = 1`). Two instances would both reconcile — safe, since every
write is version-guarded or insert-if-absent, but twice the API calls. **The day a
cross-instance realtime adapter lands, this timer needs moving**, and that is written
at the timer rather than only in the realtime module.

The reconciler starts **only when the API credentials exist**, because the function
throws without them and a sweep that always fails is noise rather than a backstop.

## 4. The endpoint refuses rather than running open

Guarded by `X-Reconcile-Secret`, compared with `timingSafeEqual` so it does not leak
the secret byte by byte. Two details worth noting:

- **A length mismatch is its own branch.** `timingSafeEqual` *throws* on unequal
  lengths, which would turn a wrong-length secret into a 500 instead of a 403 — and
  that difference is itself a length oracle. Tested explicitly with a one-character
  secret.
- **It refuses with 503 when `PASSPORT_RECONCILE_SECRET` is unset**, rather than
  running unauthenticated. That matters twice: an unconfigured scheduler must not be
  able to look like a working one, and an open reconciliation endpoint is a way to
  hammer Passport's API from outside.

A failed reconciliation surfaces as a **500**, not a clean pass. A scheduler seeing a
500 is the correct signal.

## 5. Verified by triggering it, against the live API

The plan says to `curl` the endpoint rather than read the code, because a `404` is the
tell and no test shows it. Booted the real server on the real `.env`:

```
{"msg":"passport placement read from registry","key":"marketingbase",
 "unitScopes":["entity","brand","outlet"],"roleCascade":false}
{"msg":"listening","port":3099}
```

Then:

```
1. POST /webhooks/passport/reconcile          (no secret header)
   {"code":"FORBIDDEN","message":"invalid reconcile secret"}      HTTP 403

2. POST /webhooks/passport/reconcile          (X-Reconcile-Secret)
   {"ok":true,"summary":{...,"durationMs":459,"empty":true}}      HTTP 200

3. POST /webhooks/passport/sync               (unsigned)
   {"code":"BAD_SIGNATURE","message":"invalid signature"}         HTTP 401

4. POST /webhooks/passport/nope               (control)
                                                                  HTTP 404
```

**The 404 control is the point of the exercise**: it proves the other three are real
routes rather than a catch-all answering everything. `durationMs: 459` is a real
network round trip to Passport, and the server log carried the warning:

```
{"level":"warn","msg":"passport reconcile: snapshot returned eight EMPTY collections.
  This is what a missing or inactive entitlement looks like — it is NOT evidence that
  the projection is correct. Verify with the Passport console."}
```

The throwaway database used for the run was removed afterwards.

## 6. The gate

```
pnpm typecheck                    all 11 packages    pass
pnpm lint                         eslint, whole repo pass
pnpm format:check                 prettier           pass
pnpm test                         2122 passed | 92 skipped
pnpm -F @brandfactory/web build   tsc + vite         pass
```

## 7. What is deliberately still missing

- **`PASSPORT_RECONCILE_SECRET` is not in `.env`.** It was passed inline for the
  verification run. Set it in the deployed environment, or the trigger stays at 503 —
  which is the correct refusal, not a failure.
- **Nothing calls the access derivation.** `authz.ts` is untouched; wiring it is
  phase 8, and doing it before the operator gate would lock everyone out.
- **No login change** (phase 6). SSO is inactive because `PASSPORT_SUPABASE_URL` is
  unset.
- **No external cron.** The schedule is an in-process timer, which is correct for a
  single-instance deployment and recorded as coupled to that fact. If the app ever
  scales out, this moves to a platform scheduler hitting the endpoint that now exists.

## 8. Needed from the operator

Unchanged from phase 4, and the first item is now the only thing standing between this
integration and real data:

| Needed | Blocks |
| --- | --- |
| An **entitlement** for an org on **Marketing Base** (super admin) | any real data at all |
| `sync_url` registered at the backend host — cannot be verified from the app side | live deliveries |
| `PASSPORT_RECONCILE_SECRET` in the deployed environment | the manual trigger |
| `PASSPORT_SUPABASE_URL`, dashboard URL, per-app callback | phase 6 |
