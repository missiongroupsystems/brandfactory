# Passport sync consumer, phase 3 — the receiver and the 17 handlers

**Status:** complete, 2026-08-17. Written against `main` at **1.33.0**
(2016 passed | 82 skipped before → **2060 passed | 92 skipped** after; +44 passing,
+10 skipped, the skips being the live-Postgres suites).

Executes phase 3 of
[`docs/executing/passport-sync-consumer-plan.md`](../executing/passport-sync-consumer-plan.md).

**No migration.** The projection now fills up from real deliveries. Nothing reads it
yet — access derivation is phase 4 — so no user-visible behaviour changes.

---

## What landed

| File | Change |
| --- | --- |
| `packages/db/src/queries/passport.ts` | **new** — every projection write, and the version guard |
| `packages/db/src/queries/passport-version-guard.test.ts` | **new** — 12 tests; the guard's SQL, rendered and asserted |
| `packages/db/src/passport-writes.live.test.ts` | **new** — 10 tests; what Postgres *does* with that SQL |
| `packages/server/src/passport/handlers.ts` | **new** — all 17 handlers, and the wire→row mapping |
| `packages/server/src/passport/handlers.test.ts` | **new** — 15 tests, incl. the detached-call regression |
| `packages/server/src/routes/passport-sync.ts` | **new** — `POST /webhooks/passport/sync` |
| `packages/server/src/routes/passport-sync.test.ts` | **new** — 12 tests; the receive contract over real HTTP |
| `packages/server/src/app.test.ts` | +2 — the mount is real, and outside the auth gate |
| `packages/server/src/app.ts` | mounts `/webhooks` |
| `packages/db/src/index.ts` | exports the write path |
| `packages/db/src/passport-write-guard.test.ts` | allowlists updated for where the writes actually landed |

## 1. The SQL went into the db package, not the server

`packages/server/src/db.ts` is a **narrow facade of named helper functions**, not a
Drizzle handle. So a handler in the server package cannot write SQL through its deps
at all, and the repo's own architecture answered the question: the SQL belongs in
`@brandfactory/db` beside every other query, and the handlers become 17 thin mappers.

That turned out to be better than the reference consumer's shape for a second reason.
The write helpers are **deliberately absent from the `Db` facade**, so a route handler
cannot reach the projection through its dependencies — it would have to import
`writePassportUnit` by name. Which is greppable, and now grepped.

### The write guard needed a second sweep

Phase 2's guard looked for Drizzle and raw-SQL writes. With the SQL behind eleven
exported wrappers, that alone became a loophole: the wrappers are importable
anywhere. So the guard now holds **two** allowlists —

- `ALLOWED_SQL` — who may write the tables directly. One file.
- `ALLOWED_HELPER_CALLERS` — who may call the wrappers. The handlers, plus phase 4's
  identity-link writer.

and sweeps for `(write|delete|replace)Passport…`. That naming is load-bearing, not
cosmetic: it is one distinctive pattern that cannot be hit by accident.

**Nightly reconciliation is deliberately not on either list.** It will re-apply a
snapshot *through the sync handlers*, so the version guard and the tombstone rules
keep one implementation. A second write path would drift from them, and the drift
would only show under replay.

**The guard caught my own test, which is how I know it works.** Adding
`passport-writes.live.test.ts` produced 34 violations, all in that one file and
nothing else. The fix was to name it in the allowlist with its reason — **not** to
exempt `*.test.ts` as a class, which would have been the comfortable fix and would
have left a hole exactly where the mistake it exists to catch would appear.

## 2. The version guard, checked at both layers and proven by breaking it

Two failure modes, both silent, neither visible in a round-trip test that applies one
event and reads it back:

- **`<` instead of `<=`** drops every equal-version replay. Passport retries on any
  non-2xx, so replays are ordinary traffic — after a transient 500, for instance —
  and whatever the first attempt failed to write is then lost for good.
- **A column missing from `set`** stops updating while every other field stays fresh:
  a row that is correct everywhere except where you are looking.

So `set` is derived from `getTableColumns` rather than hand-listed (`passport.unit`
has 13 updatable columns), and the guard is checked twice:

| Layer | Asserts |
| --- | --- |
| `passport-version-guard.test.ts` | the SQL we **generate**, rendered through `PgDialect` — no database. `<=` present and `<` absent; every `set` entry is `excluded."physical_name"` binding no parameter; all 13 unit columns covered; `gst_reg_no` not `gstRegNo` |
| `passport-writes.live.test.ts` | what Postgres **does** with it — older ignored, equal re-applied, newer applied, tombstone kept, immutables insert-if-absent / delete-if-present |

**Proven by sabotage.** Changing `<=` to `<` fails **six** tests — the five
SQL-text assertions and the live equal-version replay:

```
× the version guard > RE-APPLIES an equal version, so a replay is idempotent
× organization > compares with <=, so an equal-version replay re-applies
    → expected '"passport"."organization"."version" < …' to contain '<='
  (…and unit, membership, entitlement, unit_app_membership)
```

Reverted, and green again.

## 3. Closures, not a class — the trap removed rather than patched

`applyEvent` resolves a handler by property lookup and calls it **detached**:

```ts
const handler = handlers[entry.method]
await handler(payload)              // `this` is undefined in here
```

A class whose handlers delegate through `this.` therefore throws on the first real
delivery — **five of the seventeen** would, since `archiveOrg`, `archiveUnit`,
`removeMembership`, `removeUnitAppMembership` and `resyncOrg` all reuse another
handler. It is invisible to `tsc`, because the call is well-typed, and a test
asserting the methods *exist* passes happily. The reference consumer shipped it
broken and found it by driving a running receiver, which answered 500 and left a
revoked member's row `active`.

The handlers are an **object of closures** built by a factory, so there is no `this`
to lose and the trap cannot occur — rather than a constructor that reflectively
rebinds every method. The detached call is still asserted, because the property that
matters is "survives a detached call", and a future refactor to a class would
reintroduce the trap invisibly.

## 4. The receive contract

```
POST /webhooks/passport/sync

  503  no secret configured   fail CLOSED — an unset secret must never mean
                              "accept anything"
  401  bad/absent signature   the delivery worker PAUSES (correct backpressure)
  400  malformed JSON
  400  stale schema_version   refused BEFORE dispatch
  500  a handler threw        the worker RETRIES
  200  applied and committed
  200  unknown event type     forward-compatible no-op
```

Three details that are decisions:

- **The route has no `try`/`catch`.** The error must reach `app.onError`, which maps
  an unhandled error to `{ code: 'INTERNAL' }` / 500 — exactly the retry semantics
  required. Swallowing it would ack an event that was never applied.
- **Verification is over the raw bytes.** Parsing first and re-serialising would
  change key order and whitespace, and every signature would fail. A test alters a
  body after signing to keep that honest.
- **Mounted at `/webhooks`, outside every `authRequired` prefix.** Passport
  authenticates with an HMAC over the body, not a JWT. The per-prefix middleware
  layout made this a one-line mount rather than a restructure — the same property
  that keeps `/blobs`, `/health` and `/rt` outside the gate.

`app.test.ts` asserts the **mount**, which no unit test can see: an unconfigured
receiver answers **503, not 404**, and an unsigned delivery gets `BAD_SIGNATURE`
rather than an auth-middleware 401. A 404 there would mean Passport delivers, nothing
receives, and the projection silently stays empty.

## 5. Verified with real signed deliveries against a real database

The check that caught the detached-`this` bug elsewhere, run against the mounted
router, the real handlers and a migrated throwaway Postgres:

```
deliveries:
  200  org.upserted
  200  org.archived                  <- a delegating handler
  200  unit.upserted
  200  membership.upserted
  200  membership.removed            <- a delegating handler
  200  org.upserted        (v1, stale redelivery)
  200  org.archived        (v2, equal-version replay)
  200  something.invented.later
  401  org.upserted        (forged signature, claiming v9 "FORGED")

projected state:
  organization { name: 'E2E Org v2', status: 'archived', version: 2 }
  unit         { type: 'outlet', kind: 'cafe', postal: '123456' }
  membership   { status: 'removed', version: 2 }
```

Every property holds. The stale v1 did **not** overwrite (`E2E Org v2`, not `STALE`);
the equal-version replay re-applied; the unknown type was a no-op; the forged
delivery was refused and wrote no `FORGED`; the sparse outlet profile landed; the
tombstone survived.

The throwaway container was removed afterwards. The local-database quirks recorded in
phase 2 §4 still apply — `.env` points at port 5434, which is not running, and host
5432 is served by something other than the compose container.

## 6. The gate

```
pnpm typecheck                    all 11 packages    pass
pnpm lint                         eslint, whole repo pass
pnpm format:check                 prettier           pass
pnpm test                         2060 passed | 92 skipped
pnpm -F @brandfactory/web build   tsc + vite         pass
```

## 7. What is deliberately still missing

- **Nothing reads the projection.** `authz.ts` is untouched and still runs the
  interim shared-access model. Access derivation is phase 4.
- **No `sync_url` registered**, so no real deliveries arrive yet. The receiver
  answers 503 until `PASSPORT_WEBHOOK_SECRET` is set.
- **`membership.removed` does not yet revoke sessions.** Rule 6 asks for it; there is
  no Passport-issued session to revoke until phase 6, and the subject denylist is
  phase 7. Recorded at the handler rather than silently skipped.
- **No reconciliation.** Phase 5, and it will go through these same handlers.
- **`org.resync` is implemented** and upsert-only, so a super admin can already
  converge a drifted projection once deliveries are live.

## 8. Needed before phase 4

`PASSPORT_API_URL`, `PASSPORT_APP_ID` and `PASSPORT_API_KEY`, for the registry read
that replaces the assumed placement with the authoritative one.
