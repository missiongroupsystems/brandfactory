# Core: plan once, and one first trip (option C)

Branch `perf/core-plan-once`, from main `29eea81`. It carries the speed fixes from `perf/core-round-trips` (option B,
not yet reviewed) and builds option C on them. Board: `docs/refs/packs-core/call-paths.excalidraw`.

## Why

One idea edit on main takes 15 round trips and 17 ms on a laptop Postgres; B takes 9 and 10.8 ms. Most of what is
left is Postgres planning the move's SQL again on every call: under the row rules `idea.edit` plans in 5.5 ms and
runs in 0.6 ms. A named (prepared) statement is planned once per connection: the same statement under the same
claims and role ran in 0.79 ms instead of 6.28 ms. B's first two trips (the live pointer, then the caller and
loadout) can ride with the begin.

## What changes

1. **Plan once.** `Conn.query` takes `{ prepare: true }`. On Postgres the statement is sent named, by a hash of its
   text, so each connection parses and plans it once; PGlite ignores the flag. Only the move's SQL and the rules'
   SQL use it: their texts come from published, frozen pack versions, so the number of names a connection holds is
   bounded by the ops and rules of the versions it has run. Core statements keep the unnamed form.
2. **One first trip.** With a live version already seen by this process, a call to a read or write sends one
   message: begin, the time limit and zone, the claims taken from `packs.principals` (the person, or the agent and
   its person), a check row (the live pointer's hash, the principal's `agent_of`, how many loadouts hold the move),
   then the drop to `pack_runtime` (not for a keyed write, which claims its key first, as today). The core reads the
   check row:
   - no principal: 403 `NO_ACCOUNT`; the move not in every loadout needed: 403 `FORBIDDEN`; both roll back;
   - a hash other than the one in memory (a promote or a rollback happened): roll back, read the live version, run
     the call again the B way;
   - otherwise validate the input against the cached version and go on as today.
   The first call per process, effects, guest calls and the scheduler keep the B path.
3. Refusal order stays: authentication, version, account, loadout, validation. A refused call is logged as today.

## Data shape

- `Db.transaction(fn, first)` hands `fn` the rows of `first`'s result whose columns include `core_check`.
- The claims statement for the first trip inserts from `packs.principals` and writes nothing when the principal is
  missing, so a missing account sees no rows even before the core refuses.

## Tests (each must fail if its rule breaks)

- Two people on a pool of one connection, the same prepared read more than five times each (past Postgres' switch
  to a generic plan): each sees only their own brand's rows.
- A promote between two calls: the second call runs the new version (the hash check, not the cache, decides).
- A principal with no account, and one without the move: refused, nothing written, logged.
- An agent: claims carry the person; the agent and the person both need the move.
- A table gains a column after a statement was prepared: the next call still answers (the move's result type is a
  single `jsonb` column, so Postgres re-plans instead of failing).
- The existing core, pack (PGlite and Postgres) and isolation tests pass unchanged.

## Risks

- The first trip builds SQL text from caller values: only through `textLiteral` (hex), as B does for the claims.
- Prepared statements need a session to keep them: the Supabase pooler in transaction mode (port 6543) does not.
  The core must use the direct port or session mode. Check the Fly `DATABASE_URL` before release.
- A generic plan can be slow for skewed data: measure on production-sized data before release; `plan_cache_mode`
  can force custom plans per statement if one regresses.
- B is unreviewed; the review covers B and C together (Opus and Sonnet: authorization and the claims text).
- A kept plan can fold an IMMUTABLE function into a constant, so a function that reads the caller (the claims, a
  setting, the role) would answer every later caller on that connection as the first. This holds with preparing off
  too: a plpgsql function keeps its own plans. A version fails its platform tests (`noImmutableFunctionReadsTheCaller`)
  unless each immutable function has a `RETURN` or `BEGIN ATOMIC` body that reads no table and calls no function or
  operator that is not immutable. Postgres records no dependency on a built-in, so a body that calls `now()` passes;
  but the caller lives only in `claims.calls`, a table, and in the names the check reads in the body.

## Measure

A (main), B and C on one fresh local Postgres with the demo seed: each trip timed at the pg client, 300 calls each of
`post.list`, `brand.state`, `idea.edit`, plus the plain-SQL floor (D).

## As built

Uncommitted on the branch, with B. What differs from the plan:

- **Preparing is a setting, off by default.** `DATABASE_PREPARE=on` (`env.ts`) makes `openPostgres` send the moves'
  and rules' SQL named; off, `{ prepare: true }` sends them unnamed, as before. `openPostgres` refuses `on` when the
  URL's port is 6543 (Supabase's transaction pooler), so the core will not start that way. An empty value is off.
  `fly.toml` notes it under `[env]`, unset; production needs the direct port or the session pooler before it is
  turned on. The pack tests on Postgres (`runner.ts`) run with it on. The core's one-trip tests on Postgres run
  both ways, and the rest of its Postgres tests run with it off, as production does.
- **Immutable functions must show what they read.** A new platform test, `noImmutableFunctionReadsTheCaller`
  (`platform.ts`), fails a version with an IMMUTABLE function the runtime role can call that has a string body (SQL
  or plpgsql, which the catalog cannot see into), depends on a table or view, depends on a function or an operator
  that is not immutable, or names the claims, `current_setting`, `current_user`, `session_user` or `current_role`.
  `testVersion` and the pack suite run it. brandbase's immutable functions all have `RETURN` bodies and pass.
- **The logged version.** The one first trip sets the log row's version only after the hash check passes, so a first
  trip that fails logs no version, as the B way does.
- **A statement the server lost.** With preparing on, an error 26000 ("prepared statement … does not exist") from a
  named statement drops that connection (`release(err)`) and `Db.transaction` runs the whole transaction once more on
  another. Statements of old versions go too: a connection lives at most 30 minutes (`maxLifetimeSeconds`).
- **The check row comes from the claims.** The first trip writes the claims from `packs.principals`
  (`principalClaimsSql`, beside `claimsSql`), then reads the check row back from that claims row: `known` is whether
  it exists, the person and the agent are its `user_id` and `agent_id`, and the loadouts are counted for those. So
  the call is judged on exactly the claims its move runs under, and `packs.principals` is read once.
- **The check row is always there.** It selects from `(select 1)` left joined to the claims row. A missing principal
  gives `known = false`, not an empty result. So a pack that is no longer live shows as a hash mismatch first, the call
  goes the B way, and it gets `PACK_NOT_LIVE` before `NO_ACCOUNT`, as today.
- **Which calls take one trip.** Only `call()` without `as`, when the remembered version holds the move and the move
  is a read or a write. A move the remembered version lacks goes the B way (and gets `OP_NOT_FOUND` there). The
  remembered version is kept per `Db` object, then per environment and pack, so tests with many databases in one
  process never share it. The B way remembers each version it reads, and forgets it when the pack is not live.
- **A table that changes shape.** A move that names its columns keeps answering: Postgres plans it again. A `select
  *` or `returning *` move fails with "cached plan must not change result type". The pool then gives that text a new
  name (a number after the hash), and `Db.transaction` runs the whole transaction once more. The old statement stays
  on its connection until the connection closes.
- **Pack SQL may not name `pg_prepared_statements`** (`sql.ts`): it shows the text of every statement prepared on the
  connection, other packs' moves among them. A move may not call the function behind it, `pg_prepared_statement()`,
  and a migration may not name either (so no view over them). `pack_runtime` can still read `pg_stat_activity`, which shows the text
  of other calls in flight as the same role; that predates C and is not fixed here.
- **Effects.** The payload statement and the effect's recording statement are prepared too: both are the move's own
  SQL. Effects otherwise keep the B way.
- **The key check.** A malformed idempotency key is now refused inside the transaction, after the first trip, so it
  costs one trip. The refusal order is the same.
- **Trips, measured** (`.work/bench/trips.ts`, a warm call as `admin@local`, preparing on or off): `post.list` 4,
  `brand.state` 4, `idea.edit` 7. Each is one first trip, one per rule, one for the move and one to finish.

Tests added: in `postgres.test.ts`, "a call whose version this process has read", once with named statements and
once without (two people on a pool of one, a promote between calls, a stranger and a missing move refused, an
agent, a keyed write and its replay), and "a call with named statements" (a table that gains a column, statements
the server dropped, a keyed `returning *` write run again); in `core.test.ts`, "reads the pointer, the account and
the loadout in the first trip once it knows the version" (PGlite); in `platform.test.ts`, immutable functions that
may read the caller (eight ways, a pure chain that passes, and a version that fails) and migrations over the prepared statements; in `db.test.ts`, the
refusal on the transaction pooler; in `env.test.ts`, `DATABASE_PREPARE`; in `sql.test.ts`, the prepared statements
view and function.

## Measured

Local Postgres 17, database `core_bench_c` (brandbase 1.3.0 and the demo seed), as admin@local. The five ways were
called in turn, one call each, 300 times per move, so load on the machine fell on all of them alike (load average
6–12 during the run). Medians in ms:

| Move | A main | B speed fixes | C plans off | C plans on | D plain SQL |
|---|---|---|---|---|---|
| `post.list` | 28.4 | 19.7 | 19.3 | 16.3 | 8.0 |
| `brand.state` | 60.7 | 50.7 | 49.3 | 41.4 | 19.8 |
| `idea.edit` | 20.0 | 14.9 | 14.6 | 7.5 | 0.8 |

Round trips per call: A 12/12/15, B 6/6/9, C 4/4/7, D 1.

- B saves most of what A spends reading the whole pack (4.5 ms) and on small trips.
- C with plans off is about B: on one machine a saved trip costs about 0.2 ms. Between Fly and Supabase a trip
  costs more, so the gain there is larger; not measured.
- Plans on halves the edit. What is left is the row rules running, not planning: `EXPLAIN ANALYZE` of the edit as
  pack_runtime plans in 5.0 ms and runs in 6.3 ms when planned fresh, and runs in 3.2 ms on a kept generic plan; the
  same statement as the owner, with no row rules, plans in 0.09 ms and runs in 0.2 ms. The next cost to cut is the
  row rules themselves (for example a policy that reads the caller once per statement, not once per row), in the pack.
