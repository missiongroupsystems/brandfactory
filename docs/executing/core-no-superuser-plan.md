# The core with no superuser: plan

Branch `feat/core-no-superuser`. Phase 9 of the packs core (`docs/completions/packs-core-phases-1-to-8.md`).
Revision 3: revision 2 after a third review (Opus, 2 Nov 2026). Where "Revision 3" below and
the design above disagree, revision 3 wins.

## Why

The core keeps companies apart inside Postgres: a pack's SQL runs as `pack_runtime`, and row
rules read the caller from `claims.calls` (phase 8). Two walls keep that SQL in `pack_runtime`:
the SQL check (`src/sql.ts`) and core migration `0001`, which takes `set_config`, the `*_to_xml`
family and other risky functions from PUBLIC. Only a function's owner can take it from PUBLIC,
and the built-in functions belong to the bootstrap superuser. On Supabase nobody is a superuser,
so `0001`'s revokes are skipped with a warning, and `migrateCore` refuses to install there.

Without `0001`, SQL that gets past the text check (a query built at run time and run by
`query_to_xml`, say) can call `set_config('role', <login>, …)` and become the session user, the
login role. Today the login role owns the core's schemas, is a member of every pack role
(`pack_migrator` owns every pack table), writes `claims.calls` for any caller, and reads and writes
the core tables that hold every company's calls. One escape reads every company.

## Goal and acceptance

The core installs and runs on a Postgres where nobody is a superuser, and SQL that escapes to the
session user gains nothing its own call's caller does not already have.

1. `core migrate` succeeds as a role that is not a superuser; on a superuser (Fly) it still applies
   `0001`'s revokes as a second wall, and reports which took.
2. The server logs in as `core_server`, which owns nothing, holds `pack_runtime` only, has no
   right on any core table, and reaches the core's data only through the functions of D3.
3. The attack suite (phase 5) runs on a real Postgres 18 as roles that are not superusers, with
   `set_config`, `query_to_xml` and the other `0001` functions left to PUBLIC. Escaped SQL cannot:
   name another caller; remove, replace or add a claims row; read or write another company's rows
   in a pack table or a core table; grant itself a move; turn a row rule off; change the registry;
   leave state on a pooled connection that the next call runs under; or run longer than the
   server's deadline. Each attack has a control that leaks when its wall is removed.
4. No regressions: the core's tests and the brandbase pack's cases pass on PGlite and on Postgres;
   nothing in `packages/web-next` changes.
5. Speed: no new round trip on a person's call (a guest's call may take one, D6); the median of a
   read call and a write call on a local Postgres moves by under 1 ms, measured before and after.
   The scheduler may take one more trip per tick.
6. Production is not touched. The change for Fly goes to the owner as a script, tested on a
   Postgres made the old way, then moved.

## Who the attacker is

A published pack version's SQL (moves, rules, before-rules, payloads, migrations), including SQL
that gets past the text check. Not in scope: someone holding the server's environment or an
owner's login. The core's own TypeScript is trusted. A pack's own row rules decide what its own
callers see; the core guarantees the caller is who the server said, and that a pack cannot reach
the registry, the core's tables or the session.

## Design

### D1. Three logins

- **`core_owner`** owns the core's schemas, tables, sequences and functions. It runs core
  migrations, publish, test runs, promote, principals and loadouts from the CLI (`CORE_OWNER_URL`).
  On Supabase: a role that `postgres` makes, **without BYPASSRLS** (so the core's `SECURITY
  DEFINER` functions stay under forced row rules); on Fly it may be the superuser. Holds the pack
  roles `WITH ADMIN` so it can grant `pack_runtime` to `core_server`.
- **`core_migrator`** runs pack migrations from the CLI (`CORE_MIGRATOR_URL`): a member of
  `pack_migrator` only. An escape during a pack migration reaches `pack_migrator`, which owns pack
  tables but has no right in `packs` or `claims`.
- **`core_server`** is the deployed server's login (`DATABASE_URL`): `LOGIN NOSUPERUSER NOCREATEDB
  NOCREATEROLE NOBYPASSRLS NOREPLICATION`, owns nothing, member of `pack_runtime` only, no `TEMP`
  where the owner can revoke it. The server refuses to start when its login is a superuser, owns
  anything, has BYPASSRLS, or holds any other membership.
- `setupLogin` makes `core_server` and `core_migrator` as `core_owner` (no superuser needed) and
  refuses a name that owns anything.
- PGlite (tests, local) keeps one in-process superuser playing every part. The walls of this plan
  are tested on Postgres only: PGlite's session user is a superuser, so `RESET SESSION
  AUTHORIZATION` undoes any test there.

### D2. Claims written once, and never removed inside the transaction

- **No delete at commit.** The deferred trigger `claims.forget` goes. Any role can run `SET
  CONSTRAINTS ALL IMMEDIATE`, which fires it at once and deletes the row mid-transaction (checked
  on PGlite, 2 Nov: a role with no rights removed the row). Rows stay; the scheduler's tick deletes
  rows of finished transactions (`xact < pg_snapshot_xmin(pg_current_snapshot())`) through a
  `core_owner` function. Readers already filter on the current transaction, so old rows are inert.
  This also takes a delete off every call.
- **Once per transaction.** `claims.open(user_id, agent_id, capability)` and
  `claims.open_principal(principal)` are the only way in: `SECURITY DEFINER`, owned by
  `core_owner`, `SET search_path = pg_catalog`, `EXECUTE` for `core_server` only. A second open with
  the same values is a no-op (the approval path, `approveIn` → `payloadOf` → `setClaims`, opens
  again for the same caller); with different values it raises. `claims.open_actor(actor)` is the
  registry's, for `core_owner` only.
- **Always a row before pack SQL.** Every transaction that drops to a pack role opens claims first.
  `open_principal` for an unknown principal writes a row marked unknown (a `known` column), so
  `checkOf`, `packs.judge` and `inOneRead` read "no account" from the flag, not a missing row.
- **Why this holds.** Pack SQL runs inside the server's transaction and cannot end it: through SPI
  (`query_to_xml`, functions) Postgres refuses `COMMIT`, `ROLLBACK`, `SAVEPOINT` and `PREPARE
  TRANSACTION`, and an exception block rolls back only its own work. Phase 5 tests each, and `SET
  CONSTRAINTS`, `DISCARD` and `RESET` too.
- **Why not a signature.** The server cannot know the transaction id before its first trip, so a
  signature bound to it costs a round trip; one not bound to it can be read from
  `pg_stat_activity` by another session and raced.

### D3. The core's tables: `core_server` has no grant on any of them

Every access the server makes goes through a `SECURITY DEFINER` function owned by `core_owner`
(`SET search_path = pg_catalog`, schema-qualified inside), of one of two kinds:

- **For this call's caller** (needs this transaction's claims row, acts only for that caller):
  record and read an idempotency key, schedule or move a timed call, store an approval, log a call,
  add an agent with a share of the caller's own loadouts. An escape inside a call can do these for
  that call's caller only, which the call could already do.
- **Server only** (refuses when this transaction has a claims row; an escape always runs in a
  transaction that has one): look up a principal and its loadouts (`authorise`, `resolve`), read
  the live version, claim due timed calls, heartbeat, end, alert, log a refused call with no
  caller, purge finished claims rows.

Table by table, from the code (`run.ts`, `effects.ts`, `scheduler.ts`, `agents.ts`, `events.ts`,
`registry.ts`):

| Table | Today | After |
| --- | --- | --- |
| `pack_versions`, `channels` | login reads; CLI writes | server-only read function; CLI as `core_owner` |
| `principals`, `loadouts` | login reads; `startAgent`, `addPrincipal` write | server-only lookups; `add_agent` for the caller; CLI for people |
| `idempotency` | login reads and writes in the call | caller functions |
| `op_calls` | login inserts, also with no caller | caller function; server-only function for refused calls (an escape can add audit rows for its own caller only) |
| `approvals` | any person holding the move approves and fires | caller functions that keep that rule (holds the move), not "own rows only" |
| `scheduled_calls` | upsert across principals ("an ended one belongs to who asks again") | caller function for `schedule`, which keeps that rule; server-only for the loop |
| `alerts` | scheduler writes | server-only |
| `migrations`, `test_runs` | CLI | CLI as `core_owner` |

`packs.judge`, `claims.rule_ok` and the `claims.*` readers get explicit `EXECUTE` grants, since
their owner changes.

### D4. Nothing carries over on a pooled connection

The server's first batch, before `begin`, resets the session: `reset role; reset all; discard
temp; select pg_advisory_unlock_all()`. This rides the existing first trip. `discard all` is not
used: it would drop the server's named statements. Escaped SQL that prepares or deallocates a
statement under one of the server's names (`core_<hash>`, `one_<hash>`) is tested in phase 5; if
SPI allows it, the server prefixes names with a per-process random tag and checks
`pg_prepared_statements` once per connection.

### D5. The server's own deadline

A pack can lift `statement_timeout`. The server keeps its own deadline per call and, when it
passes, cancels the backend through the protocol's cancel request (the backend's key; no extra
trip per call) and destroys the client.

### D6. What other sessions can read

`pg_stat_activity` and `pg_stat_statements` show other `core_server` sessions' statement text. So
no secret or company data goes in as a literal:

- a guest's capability token goes as a bound parameter (one more trip for guest calls only);
- `inOneRead` without prepared statements (`inline()`) puts input in the text: on Postgres the
  server requires `DATABASE_PREPARE` on, or binds the input at the cost of a trip;
- user ids stay as literals in the claims: they show who is active, not their data. Accepted.

### D7. Supabase's own roles and settings

The checks at start (`src/platform.ts`) and `core migrate` assert, on any server:

- `anon`, `authenticated` and `service_role` (PostgREST) have no `USAGE` on `packs`, `claims`,
  `textfn` or any pack schema, and no default privilege reaches them;
- `dblink` and `postgres_fdw` are not installed;
- pack views have `security_invoker = true`, and pack migrations create no `SECURITY DEFINER`
  function (the text check already refuses it; the start check reads the catalog);
- `core_server` matches D1.

Advisory locks and `pg_notify` stay callable by PUBLIC on Supabase: a covert channel and a way to
slow things, not a read of another company's rows. Accepted and written down.

## Revision 3: what the third review changed

Each item was checked against the code; the two marked *confirmed* were run on Postgres 18.

- **R0. A pack function could leave `pack_runtime` today, on Fly too** (*confirmed*). A migration
  can write a string body in escapes (`E'r\x65set role'`): the raw text check misses it, Postgres
  stores it decoded, and `RESET ROLE` inside the function returns to the login role. The `0001`
  revokes do not help (it is a statement, not `set_config`). Fix (phase 0): after each pack
  migration, read the stored, decoded definition of every object `pack_migrator` owns and refuse
  the migration when one holds a forbidden word or function (`definitionProblem`).
- **R1. A login can change its own password and defaults** (*confirmed*: `ALTER ROLE current_user
  PASSWORD …` and `… SET search_path` succeed for a role with no rights). An escape to
  `core_server` could set a password it knows and log in from outside, with no claims row. Walls:
  Supabase's network restrictions limited to the server's addresses (an owner's step, in the
  script); the server refuses to start, and refuses a new connection, when `pg_roles.rolconfig` is
  set for its login or `core_migrator`; the server's own statements set `search_path` to
  `pg_catalog` and are schema-qualified. Without the network restriction this wall does not hold,
  and the plan says so where it is deployed.
- **R2. One owner per pack.** `pack_migrator` owns every pack's tables and has `CREATE` on the
  database, so pack A's migration can change pack B's rules. Instead `core_owner` (with
  `CREATEROLE`) makes `pack_<name>` for each pack and creates the pack's schema owned by it; pack
  migrations run as that role; nobody has `CREATE` on the database. The start check refuses a
  schema named after any login (it would come first in `"$user"`).
- **R3. Claims name the pack.** The claims row records the pack and version of the call; every
  caller function of D3 refuses another pack. Otherwise an escape in pack A, for a person who holds
  pack B's moves, could schedule, approve or log for B.
- **R4. Prepared statements.** SPI can `PREPARE` and `DEALLOCATE`, a rollback does not undo them,
  and an escape can read `pg_prepared_statements`, so a random name does not help. The commit
  batch refuses when a statement was prepared in this transaction (`prepare_time >=
  transaction_timestamp()`), and a connection is dropped after any rollback that followed pack SQL.
- **R5. Reset at release, every path.** D4's reset moves to after each `commit` and `rollback`,
  before the connection goes back to the pool: `reset role; reset all; set search_path =
  pg_catalog; discard temp; unlisten *; select pg_advisory_unlock_all()` (`reset all` does not
  reset the role). Autocommit work (`resolve`, `authorise`, the refused-call log, the scheduler's
  lookups) goes through the same wrapper. `TEMP` is revoked from PUBLIC on the database by its
  owner (Supabase's `postgres`), in the script.
- **R6. Inputs in flight are visible to an escape.** With prepared statements on, inputs still go
  as literals (`execute one_x('…')`), and the call log too. An escape running as `core_server` can
  read other sessions' last statements in `pg_stat_activity`, idle pooled sessions included (the
  third phase 3 review decoded another call's logged input this way). Binding every input costs
  round trips. Not accepted as it stands: phase 4 decides between binding the log's input, a
  `pg_stat_activity` that hides other sessions' text, or writing the leak down.
- **R7. The purge and row rules.** The core's tables keep no row rules and no grants; only
  `claims.calls` has them, with a policy that lets `core_owner` delete finished rows. `core_owner`
  is not a superuser anywhere (Fly included), so the two behave alike.
- **R8. Reads after the claims row.** `checkOf` and `packs.judge` read channels, versions and
  loadouts after the claims row is written: they become caller functions bound to this caller and
  pack, not server-only ones. `core_migrator` gets named functions for what the CLI reads and
  writes (`pack_versions`, `test_runs`, `packs.migrations`).
- **R9. The deadline.** node-pg has no public cancel: the server sends a CancelRequest itself from
  the backend's process id and key, and falls back to `pg_terminate_backend` from another
  connection. An escape can cancel or end other `core_server` backends (it is the same role):
  that can stop the server, not read data. Accepted, and written down.
- **R10. An allowlist, not a denylist.** The start check asserts the logins can use only
  `pg_catalog`, `claims`, `textfn`, `packs` (through functions) and the pack schemas, and that
  `pg_cron`, `pg_net`, `http`, `dblink`, `postgres_fdw` and `vault` are absent or out of reach.

## Phases

Each phase ends with an independent review before its commit.

0. **The escape that exists today** (R0). Done: `585bdf4` (2.55.0).
1. **Claims** (D2, R3, R7). No delete at commit and the purge; `claims.open*` with the pack and
   version in the row; a second open with other values refused; the `known` flag; every path that
   drops to a pack role opens first; the guest token bound (D6). The login stays as it is, so
   every commit runs.
2. **Core tables** (D3, R8). Done with phase 2's commit; left for phase 3 from its review:
   `packs.judge` is not yet bound to the claims' pack and has no `search_path`; the brandbase
   test cases and `runner.ts` read and write core tables directly (they run as `core_owner`);
   a holder of a move can still re-arm another person's waiting call of that move with its own
   input (the old rule, "a waiting call keeps who asked for it"): the owner's call. The functions of D3, every call site moved to them, while the login
   still owns everything (they work either way).
3. **Logins** (D1, R1, R2, R10). `core_owner`, one owner role per pack, `core_server` with
   `pack_runtime` only and no grant on core tables, the CLI's URLs, the start checks, `migrateCore`
   without a superuser. Only now does the server's login lose its rights.
4. **Session and deadline** (D4, R4, R5, D5, R9).
5. **Attack suite** on Postgres 18: every item of acceptance 3 and the reviews' lists, each with
   a control.
6. **Whole check**: tests, brandbase cases on PGlite and Postgres, the speed comparison, the docs
   and changelog, and the owner's script for Fly, tested on a Postgres made the old way first.

Each phase ends with an independent review before its commit.

## Progress and the next step (kept current for whoever picks this up)

- Done and pushed on `feat/core-no-superuser`: phase 0 `585bdf4` (2.55.0), phase 1 `43fc554`
  (2.56.0), phase 2 `a353ab4` (2.57.0), phase 3 `f988888` (2.58.0), phase 4 `82cb39d` (2.59.0).
  Each had an independent review; findings fixed with tests.
- Tests on a real Postgres: `docker run -d --name core-nosuper-pg -e POSTGRES_PASSWORD=test -p
  127.0.0.1:55432:5432 postgres:18`, then `CORE_TEST_PG_URL=postgres://postgres:test@127.0.0.1:55432/postgres pnpm test`.
- Phase 3 (logins) is the commit after phase 2: migration 0013, `setupLogin`, `migrateCore`
  without a superuser, the server's start check, `fly.toml` with no release step.
- **Phase 3's review, fixed:** large objects and role settings (also per database) a call leaves
  are refused at its commit (`packs.end_of_call`, from the log and from a send's first
  transaction), and the start check refuses them, and `dblink`, `postgres_fdw`, `pg_net`, `http`
  and `pg_cron` where the login may call them; `setup-login` runs again as a non-superuser
  installer (a new password; the attributes checked) and clears settings in every database; the
  purge works as an owner without BYPASSRLS.
- **Accepted, written down:** counters still pass a few bits from one call to the next
  (`pg_stat_*` scan counts, `nextval` on a sequence, which a rollback does not undo). 0013's
  `judge` accepts a claims row with no pack only for the deploy window; a later migration removes
  that.
- **Still open (R1):** an escape can change the login's own password inside a call that commits;
  nothing in the database can see that (`pg_authid` is the superuser's). The walls are Supabase's
  network restriction and the start check's refusal of every way to open a second session.
- **Known gap on Fly:** the installer's old login stays the owner of the core and of the
  `SECURITY DEFINER` functions, and keeps `pack_admin` and `pack_migrator` (the CLI needs them).
  A bug in a definer function reaches what that login can. Phase 3b moves ownership to a
  `core_owner` with no other role.
- **Phase 4 (session) is the commit after phase 3:** each connection is cleaned before it goes back
  to the pool (`src/db.ts`, `cleanText`): `reset role; reset all; discard temp; close all; discard
  sequences; unlisten *`, advisory locks where the login may, and a check that every statement the
  server runs by name is still the one it made (PREPARE and DEALLOCATE outlive a rollback; a
  changed one drops the connection). The server's saved statements are made in their own message,
  once per connection, so their stamps match no statement of a call. The clean runs after the
  answer, so no call waits for it; it is also the session's last statement, so an idle session
  shows it in `pg_stat_activity`, not the call's input.
  - Cost (review, 20 callers on a pool of 5, one machine): throughput 20 to 25% lower when the
    pool is the limit, p50 6 to 8 ms; each connection is held one more round trip.
  - Accepted: a statement other sessions see while it runs (its input among it).
  - Not verified: `pg_stat_statements` on Supabase (installed there by default; its entries are
    kept per role, and constants inside a DO body may stay).
  - Not done: D5, the server's own deadline (a pack that lifts its time limit can slow the
    server, not read data).
- **Next:** phase 6's owner script, tested on a Postgres made the old way (it is what a deploy
  needs); phase 3b (one owner role per pack, R2; the CLI's migrator login); phase 5 (gather the
  attacks the phases' tests already run into one suite, add those still missing: `SET
  CONSTRAINTS`, a guest's escape, `pg_stat_statements` on Supabase); the server's own deadline
  (D5).

## The owner's steps for Fly (brandbase-db), when this is deployed

`$OLD` is the login the server uses today (it owns the core); `core_server` is the new one.
Steps 5 and 6 go back to back; step 5 cannot be undone except from the backup.

1. Back up `brandbase-db` (a Fly snapshot or `pg_dump`).
2. `fly proxy 15432:5432 -a brandbase-db`; the `postgres` password from the Keychain.
3. As `postgres`: `create role pack_server nologin;` then, with
   `CORE_LOGIN_PASSWORD=$(openssl rand -hex 24)` and the `postgres` URL as `DATABASE_URL`,
   `core setup-login core_server`. Nothing changes for the running site.
4. Build the image without releasing it, and stage the new secret: `fly deploy --build-only
   --push --image-label nosuper`; `fly secrets set --stage DATABASE_URL=<core_server's URL>`.
5. As `$OLD` (`DATABASE_URL=<$OLD's URL> core migrate`): applies core 0011 to 0013. The running
   code keeps working: 0013's `judge` takes its claims rows, which name no pack.
6. `fly deploy --image registry.fly.io/brandfactory:nosuper`. The new code starts as
   `core_server`; it refuses to start on any other login.
7. Check: `/health`, `fly logs`, one real call. The CLI (publish, promote, `migrate <pack>`) keeps
   `$OLD`'s URL.

## Open questions## Open questions

- Moving the data from Fly to Supabase is a separate plan, after this lands.
