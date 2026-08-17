# Passport sync consumer, phase 2 — the projection

**Status:** complete, 2026-08-17. Written against `main` at **1.32.0**
(1999 passed | 78 skipped before → **2016 passed | 82 skipped** after; +17 passing,
+4 skipped, the skips being the live-Postgres suites).

Executes phase 2 of
[`docs/executing/passport-sync-consumer-plan.md`](../executing/passport-sync-consumer-plan.md).

**Migration 0013.** Eight read-model tables in a dedicated `passport` Postgres schema.
Nothing writes them yet — the receiver is phase 3 — so no behaviour changes.

---

## What landed

| File | Change |
| --- | --- |
| `packages/db/src/schema/passport/schema.ts` | **new** — the `pgSchema('passport')` namespace and the doctrine |
| `packages/db/src/schema/passport/mutable.ts` | **new** — the five aggregates carrying `version` |
| `packages/db/src/schema/passport/immutable.ts` | **new** — the three without one |
| `packages/db/src/schema/passport/index.ts` | **new** — the all-eight checklist, and the table groups |
| `packages/db/src/schema/passport/projection.test.ts` | **new** — 8 definition-level assertions |
| `packages/db/src/passport-write-guard.test.ts` | **new** — 9 tests; the read-only enforcement under `D4-b` |
| `packages/db/src/passport-projection.live.test.ts` | **new** — 4 tests; "the migration actually applied" |
| `packages/db/src/schema/index.ts` | registers the projection with the Drizzle client |
| `packages/db/drizzle.config.ts` | `schemaFilter: ['public', 'passport']` |
| `packages/db/drizzle/0013_fine_sinister_six.sql` | generated, then annotated with the three decisions |

## 1. The four properties, and what each is defending against

Grouped by mutability rather than one file per table, because that split is the
load-bearing one: it decides how each event is applied.

| Property | Without it |
| --- | --- |
| Passport UUIDs are the primary keys, verbatim, with **no local default** | A `defaultRandom()` here mints a local id that silently diverges from Passport's. Asserted in both the schema test and the live test (`column_default IS NULL`). |
| **No foreign keys, and no constraint beyond the primary key** | A `unit.upserted` may legitimately arrive before the `org.upserted` that would satisfy an FK. The constraint rejects it, the receiver answers 500, and Passport's worker retries **forever**. |
| Five tables carry `version`, three do not | The version guard only exists where there is a version. Getting the split wrong means comparing against a column that is not there, or overwriting an immutable row on redelivery. |
| `status = 'removed'` is a tombstone | Delete instead and nightly reconciliation resurrects the row from the snapshot — a revoked user silently regaining access. |

### The unique index I wanted and did not add

Our identity-link writer (phase 4) is idempotent per `(subject, app_id)`, so a unique
index there looks like free enforcement of an invariant we already maintain.

**It is not free, and the reasoning is the same one that rules out foreign keys.** The
wire does not promise that invariant. If Passport ever delivered two links sharing a
subject, insert-if-absent takes both today; with a unique index the second delivery
raises, the receiver answers 500, and the delivery worker retries it forever. **A
constraint the wire does not promise converts a data condition into a retry storm.**
Idempotency stays procedural, in the writer, and the reasoning is recorded at the table
so the next reviewer does not "fix" it.

## 2. `drizzle-kit` had to be told the schema exists

`schemaFilter` defaults to `['public']`. Left alone, drizzle-kit does not merely skip
the projection — it treats those tables as **unmanaged**, so `db:generate` emits nothing
for them and a later run could propose dropping them. One line in `drizzle.config.ts`
puts the read model under migration control with everything else.

Both capabilities were verified against the installed versions before use rather than
assumed: `pgSchema` exists in drizzle-orm **0.36.4**, and `schemaFilter` is supported by
drizzle-kit **0.28.1**.

The generated migration was **annotated, not hand-written** — the schema, the eight
tables, the 17 indexes and the absence of every constraint are all as generated. The
header records the three things that look like omissions and are decisions, because a
migration is where someone looks when they wonder why there are no foreign keys.

## 3. Read-only by test, under `D4-b`

`PASSPORT_SYNC_DATABASE_URL` was proposed and then dropped. The reasoning is worth
keeping because it is a genuine departure from the canonical guidance.

The canonical control is
`REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA passport FROM <app_role>`, and it
comes from consumers where the **browser holds a Postgres connection** through
PostgREST. There `authenticated` is an untrusted principal with real table privileges,
and without the revoke a client writes the projection directly.

BrandFactory has no such principal, and I checked rather than assumed — the browser's
Supabase client is used for exactly four things, all authentication
(`exchangeCodeForSession`, `getSession`, `onAuthStateChange`, `signOut`). No `.from()`,
no `.rpc()`, no `.schema()`. So the only writer a revoke could exclude is **our own
request path**: a developer mistake, not a privilege escalation.

`passport-write-guard.test.ts` catches that mistake earlier and more legibly, and it
sweeps **two** shapes because one alone is a loophole:

- Drizzle builders — `.insert(passportUnit)`, `.update(...)`, `.delete(...)`, anchored
  on the `passport` export prefix (which is why that naming convention is load-bearing);
- **raw templates** — `sql` fragments naming `passport.<table>` in an insert/update/delete.

Three modules are allowlisted, two of which do not exist yet. Naming them early is
deliberate: the guard should protect the tables from the moment they exist, not from the
moment a writer arrives.

**The detector is unit-tested on fixtures rather than asserting it found something.**
The sign-out sweep in phase 1 could assert non-emptiness because legitimate call sites
exist; here zero writes is the *correct* state until phase 3, so that check would be
meaningless. Instead six cases exercise the detector on known input — it catches an
insert, an update, a delete and a raw write; it allows the three sanctioned writers; and
it does **not** flag reads, prose discussing a write, or a write to a similarly-named
app-owned table.

**The trade is real, not free:** a runtime privilege denial would also catch SQL built
dynamically at a call site a source sweep cannot see. Reopen `D4` if the browser ever
talks to Postgres directly, or if the projection needs to be readable by a principal
that is not this server. Both triggers are written at the code.

## 4. Verifying the migration meant working around the local database

Two environment facts, recorded because the next person will hit them:

- **`.env` points at port 5434, which was not running.** The compose file publishes
  5432, so `docker compose up` does not start the database this project is configured
  for.
- **Host port 5432 is served by something other than the container.** Password auth
  succeeds *inside* `brandfactory-postgres` over TCP and fails from the host with the
  same credentials, so a different Postgres is answering there.

Neither is mine to change, and I changed neither. Verification ran against a
**throwaway** `postgres:16` on port 55432, which was removed afterwards. (The
`brandfactory-postgres` container was recreated by my `docker compose up` and is
running; its volume is intact.)

Applied all 13 migrations to an empty database and asserted the result against Postgres
itself rather than against the schema definition:

```
tables: 8
indexes: 25                        (17 declared + 8 primary keys)
FKs between projection tables: 0
non-PK constraints: 0
uuid PKs: 8
```

### The live test earns its place, proven by breaking it

`passport-projection.live.test.ts` exists because **"the migration is written" and "the
migration is applied" are different claims**, and only the second one keeps the receiver
from answering 500 to every delivery. Run against a second, deliberately unmigrated
database, three of its four cases fail loudly:

```
× has all eight tables in the `passport` schema
    → expected [] to deeply equal [ Array(8) ]
× keys every table on a Passport UUID, with no local default
    → expected [] to have a length of 8 but got +0
× indexes the columns the request path resolves identity by
    → expected [] to include 'passport_membership_email_idx'
```

(The no-constraints case passes vacuously there, since no tables means no constraints.
The other three are the control.)

## 5. The gate

```
pnpm typecheck                    all 11 packages    pass
pnpm lint                         eslint, whole repo pass
pnpm format:check                 prettier           pass
pnpm test                         2016 passed | 82 skipped
pnpm -F @brandfactory/web build   tsc + vite         pass
```

The web build's chunk-size warning is pre-existing.

## 6. What is deliberately still missing

- **No writer.** Nothing populates these tables: no receive endpoint, no handlers
  (phase 3), no reconciliation (phase 5). The tables are empty and that is correct.
- **No reader.** `authz.ts` is untouched and still runs the interim shared-access model.
  Access derivation is phase 4.
- **No `passport.user` table**, and there never will be one — `user.upserted` carries
  only fields `passport.membership` already embeds, and the snapshot has no `users`
  collection to reconcile a mirror against, so it could drift with nothing able to
  detect it.
- **Placement is still the operator's answer, not the registry's** — all three unit
  types, and therefore no role cascade, since Passport refuses `role_cascade` on any
  shape outside `{entity, outlet}` / `{brand, outlet}`. Phase 4 replaces it with the
  authoritative read.

## 7. Needed before phase 4

`PASSPORT_API_URL`, `PASSPORT_APP_ID` and `PASSPORT_API_KEY`, for the registry read.
Phase 3 needs none of them and can start immediately.
