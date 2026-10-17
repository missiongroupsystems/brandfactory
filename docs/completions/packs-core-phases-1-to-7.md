# Packs on a core: phases 1 to 7

Built from `docs/executing/packs-core-plan.md` and `packs-core-proposal.md`, on `feat/packs-core`.
Nothing is deployed; no migration has run on the Supabase database. `packages/server` is untouched
and stays the reference.

## Phase 1: the core skeleton

`packages/core`: Hono, raw SQL on PGlite (tests, local) or `pg` (a server), Ajv for input schemas.
No Drizzle: a move's statement is pack data, so the core only binds parameters and runs it.

- **Registry** (`migrations/0001_registry.sql`, schema `packs`): `principals` (a person, or an
  agent with `agent_of`; an agent of an agent is refused by a trigger), `pack_versions` (frozen by
  a trigger; the hash is SHA-256 of the canonical JSON of the whole version), `test_runs` (frozen),
  `channels` (the live pointer), `loadouts`, `op_calls` (the log) and `migrations` (the core's and
  each pack's, by scope; a migration whose text changed after it ran is refused).
- **Promotion.** A trigger on `channels` refuses the move unless a passing `test_runs` row exists
  whose `version_hash` equals the target's `content_hash`, and `app.actor` is a principal with no
  `agent_of`. `promote()` sets `app.actor` and drops to `pack_admin` in one transaction.
- **Roles.** `pack_runtime` runs moves and has nothing in `packs`. `pack_admin` is the only role
  with INSERT on `pack_versions` and `test_runs` and INSERT/UPDATE on `channels`. The login role is
  the migrator. Supabase's `anon` and `authenticated` get nothing in `packs`.
- **Function wall.** `set_config`, `pg_sleep*`, advisory locks, the `*_to_xml*` and `xpath*`
  families, file functions, every large-object function, `dblink*`, `pg_notify`,
  `pg_logical_emit_message` and backend signals: EXECUTE is taken from PUBLIC and given back to
  every role that exists at migration time except the two pack roles. `registry.test.ts` checks
  that the runtime role can call none of the functions `sql.ts` forbids, so the two lists cannot
  drift. A role made later does not get these functions. On Supabase, PostgREST's `authenticator`
  calls `set_config` and exists before the migration, so it keeps it.
- **The migrator must be a superuser.** Granting the pack roles to the login role and revoking
  `lo_import` fail for a role that only has CREATEROLE. The migration then stops; it does not leave
  a partial wall. Supabase's `postgres` role is not a full superuser, so before this runs on a
  Supabase database someone must check it there, or run the wall as a one-time admin step.
- **The door**, `POST /ops/:pack/:op` (`app.ts`, `run.ts`), one function per check: authenticate
  (the server's `auth.ts`, copied), resolve the live version (read on every call), authorise (the
  principal's loadout, and for an agent its person's loadout too, both read on every call),
  validate (Ajv, cached per version hash and move), before-rules, the statement, after-rules, log.
  Steps 5 to 7 are one transaction: `set_config` for `app.user_id`, `app.agent_id` and
  `statement_timeout` as the login role, then `SET LOCAL ROLE pack_runtime`. Every call is logged,
  refused or not.
- **Named parameters.** `:name` binds an input field; `:now` (the core's clock), `:actor` (the
  person) and `:agent` are the core's and no input may use those names. Objects and arrays bind as
  JSON text. A row with one column named `result` answers with that value.
- **Refusals.** `{ code, message, rule?, details? }`. A rule returns one row with `ok`; false
  refuses with the rule's status, code and message, and its `details` column if it has one. A
  constraint or trigger named in the manifest's `errors` becomes that refusal; a row-level security
  violation becomes 404 (a guess learns nothing); other unique violations 409; a timeout 503; a
  data exception 400.
- **Move kind** is derived by the core: a statement that holds INSERT, UPDATE or DELETE outside a
  string is a write. Effect moves come with connectors (phase 4).
- **SQL check at publish** (`sql.ts`): one statement starting with SELECT, INSERT, UPDATE, DELETE,
  WITH or VALUES; no comments, no `$n`, no `SELECT … INTO`, no `U&` identifiers; no listed word
  (EXECUTE, COPY, RESET, GRANT, CREATE, DROP …) or listed function, quoted or qualified.
- **Purity test** (`purity.test.ts`): whole lower-case words, so `POST` and `postgres` pass.

**Spike.** PGlite 0.5.8 (Postgres 18.3) supports roles, `SET LOCAL ROLE`, forced row-level security
and revoking `set_config`. It does not enforce `statement_timeout`, and it runs one statement at a
time. `postgres.test.ts` covers the timeout and the runtime role's wall on a real Postgres when
`CORE_TEST_PG_URL` is set; in the normal gate those 5 tests are skipped.

**Found:** `RESET ROLE` as its own statement does leave `pack_runtime` (the session user is the
login role). The SQL check is the wall for it (a move must start with SELECT … VALUES); inside a
statement the only way out is `set_config('role', …)`, which is revoked. On a deployment the login
role should not be a superuser.

**Adversarial review** (one Sonnet reviewer, one pass, then fixes):

- *High, fixed:* a non-ASCII character before `$$` (`select 1 as é$$; reset role; … x$$`) hid SQL
  from the check, because Postgres reads `é$$` as an identifier. On a real server node-pg sent the
  text with the simple protocol and `reset role` ran. Now the tokenizer reads identifiers as
  Postgres does, and every query goes through the extended protocol, which refuses more than one
  statement. Tests: `sql.test.ts` and `postgres.test.ts`.
- *Fixed:* a successful call's log row is written in the move's transaction, back as the login
  role, so a write and its log row commit together. A refusal is logged after the rollback, and a
  failed log write no longer replaces the refusal. Logged input has NUL removed and is capped at
  16,000 characters; path parts that are not names are logged as `?`. The body is capped at 1 MB.
- *Fixed:* every large-object function and `pg_logical_emit_message` are revoked; a test run's
  hash must be its version's hash (trigger `test_run_hash`); promoting a missing version answers
  `NO_VERSION`; the account is checked before the move name, so a stranger cannot list moves; a
  connection that cannot roll back is dropped from the pool.
- *Documented, not fixed:* the migrator must be a superuser (above).

**Not as planned.** RLS keyed by brand membership (with the admin rule) is pack SQL in phase 2: the
core sets only the verified user id, and a policy looks up whatever else it needs in the same
transaction. Without that, the core would have to know what a "member" is.

**Rule language: SQL, not CEL** (open decision 1, settled by a spike on 17 Oct). The spike took
`@marcbachmann/cel-js` 8.0.0 (maintained, zero dependencies) and the four rules:

| Rule | CEL | SQL `EXISTS` |
|---|---|---|
| Posted is final | needs the post's stage, from the database | one statement |
| Not on a past day | needs the brand's time zone, from the database | one statement |
| No post before 07:00 | works on the input alone | one statement |
| One story a day | needs the stories on that day, from the database | one statement, and a unique index |

- Three of four rules need facts only SQL can fetch, so CEL would need a SQL "facts" step per move
  as well: two languages for one rule.
- `matches()` uses JavaScript's `RegExp` without the `u` flag, not RE2:
  `"a🍝".matches("\\p{Extended_Pictographic}")` is `false` with no error, and `^(a+)+$` on 28 a's
  and a b blocked the process for 8.9 s. In the one core process, that stalls every app.
- SQL rules run in the move's transaction under the caller's row rules, so a check and the write
  it guards see the same rows.

So a rule is one SQL statement returning `ok`. The text shaping that needs Unicode classes becomes
generic SQL functions installed by the core (phase 2).
