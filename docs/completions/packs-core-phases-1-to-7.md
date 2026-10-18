# Packs on a core: phases 1 to 7

Built from `docs/completions/packs-core-plan.md` and `packs-core-proposal.md`, on `feat/packs-core`.
Nothing is deployed; no migration has run on the Supabase database. `packages/server` was the
reference until phase 7 removed it from this branch; `feat/brandbase-backend` still has it.

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

## Phase 2: the BrandBase pack, posts first

`packs/brandbase/` is data only: `manifest.json`, `ontology.json`, `migrations/`, `ops/`, `rules/`,
`tests/`. The core reads it with `readPack` and runs it; no BrandBase code is in `packages/core`.

- **Migrations.** `0000` and `0001` are `packages/server/drizzle`'s `.sql` files as they are, so the
  schema stays `brandbase`. `0002_packs_access` adds row rules on every table, forced, and keyed by
  `brandbase.can_reach(brand)`: the caller's own `users` row (an admin, not deactivated) or their
  own `members` row. A policy on `users` and `members` lets a caller see only their own rows, so
  `can_reach` needs no `SECURITY DEFINER`. Crew and send records follow their shoot or post. The
  runtime role may read but not write `users` and `members`. It also adds the read helpers
  (`camel`, `iso`, `today`, `instant`, `stage`, `post_stage`, `post_json`) and the partial unique
  index for the story row. `0003_send_rules` ports `domain/publish.ts`: the YouTube title, the
  LinkedIn text, `text_for` and `send_blockers`, in the composer's order.
- **The story index differs from the plan.** The plan says `(brand_id, day) WHERE format = 'story'`.
  The demo's seed has several posted stories on one day (marked Posted by hand), so the index is
  `WHERE format = 'story' AND marked IS DISTINCT FROM 'posted'`. The rule `post.story_free` still
  refuses a planned story on a day where stories went out; the index stops two planned stories
  racing for one day. The race case passes on PGlite and on a real Postgres.
- **Moves** (8): `brand.state`, `post.list`, `post.create_draft`, `post.edit`, `post.move`,
  `post.mark`, `post.unplan`, `post.schedule`. The plan names six plus the state read; `post.edit`
  is the server's PATCH, which two ported cases need. `post.mark` takes draft, scheduled or posted,
  as the server's `/mark` did; the plan called it `mark_posted`. Every move takes `brand` in its
  input: the door has no route for it. Each move is one statement; moves that change two tables
  use data-modifying CTEs, and pass the rows they changed to `post_json`, because a statement does
  not see its own changes.
- **Rules** (18), each one SQL statement returning `ok`. `post.found` locks the post row
  (`FOR UPDATE`), so the rules after it and the write see the same post. A rule may return
  `message` (the send blockers' first line) and `details` (the list, or the current post for
  `STALE`).
- **Time.** `:now` is the core's clock; "today" is `(:now AT TIME ZONE brand.timezone)::date`. The
  core sets each move's session time zone to UTC.
- **Differences from the server, on purpose.** A create sent again with the same id runs the rules
  again before it answers with the post it made (the server skipped them); a repeat after the day
  passed is refused. Every answer is 200 (the server answered 201 for a new post). Timestamps from
  `post_json` are in `toISOString` form; other rows' timestamps are Postgres's
  (`2026-10-06T04:00:00+00:00`).

Core changes for the pack:

- **Idempotency keys** (core migration `0003_idempotency`, header `Idempotency-Key`). A key is the
  caller's, per move. The call claims the key in its transaction; a second call under it waits for
  the first to commit and gets its answer; other input under the same key is refused with
  `KEY_REUSED`; a refused first call leaves no claim. This replaces the server's `post_sends`.
- **The test runner** (`runner.ts`). A version's tests are JSON: cases of steps (a move as a named
  caller, SQL to set up or look, moves at once). Each case runs on a fresh database (the core, the
  pack's migrations, its fixture, the version made live there) through the same call path as a
  screen. `packs.test.ts` runs every pack in `packs/` this way, on PGlite, and again on a real
  Postgres when `CORE_TEST_PG_URL` is set (a template database per version, a copy per case).

Tests: 37 cases before the review, 46 after it. `posts.test.ts`'s 19 cases are all ported, with 5 more: a day that is not a date,
another brand's file, Scheduled with no day, unplan that restores the idea, and the race between
two stories. `send.test.ts`'s first 9 cases are ported, plus a key used for another send and the
text shaping. The 3 job-runner cases wait for phase 5. `isolation.json` covers every move with
another brand's ids (all 404, nothing changed) and a deactivated account.

**Adversarial review** (one Sonnet reviewer, one pass, then fixes). It found no cross-brand read
or write: every move filters on `brand_id = :brand`, jobs take their brand from the post's row, and
a user in both brands calling with one brand's id and the other's post got not-found every time.

- *Fixed:* two first creates of one id at once: the second got `ID_TAKEN`, because `on conflict do
  nothing` returns no row and the statement's snapshot cannot see the first commit. The create now
  uses `on conflict (id) do update … where x.brand_id = excluded.brand_id`, which re-reads the
  committed row. Case: "makes one post when the same create arrives twice at once".
- *Fixed:* the race case passed with the index dropped (the rule alone refused the second story,
  because the two calls did not overlap). A case now inserts two planned stories on one day with
  SQL and expects the database to refuse with `posts_story_day`. The test proves the index holds;
  no case makes two moves overlap on purpose.
- *Fixed:* a send checked only the accounts it named, not the post's own: a post holding `yt` on a
  brand without YouTube got a `yt` job. Rule `post.send_channels_fit` checks the accounts the send
  will use, as `assertChannels` did.
- *Fixed:* a story moved to the day and time it already has was refused when a posted story was on
  that day; the server answered with the post unchanged. `post.story_free` now passes an unchanged
  day and time.
- *Fixed:* a replay under an idempotency key returned the stored answer without any check, so a
  member removed since the first call still got it. A replay now passes the before-rules again; a
  read move ignores the key (it changes nothing, so it runs again rather than keep a copy of what
  it read); the time limit is set before the key is claimed. The cost: a replay sent after the post moved on
  (for example after a send went live) gets that rule's refusal, such as `POST_POSTED`, instead of
  the first answer. A double click within seconds still gets the first answer. The core cannot
  tell a rule about access from a rule about state, and refusing is the safe side.
- *Fixed:* `post.send_day_not_past` and `post.send_not_uploading` had no case that saw them refuse.
  Cases added, and `packs.test.ts` now fails when any rule a move uses has no such case, or any
  move has no not-found case.
- *Fixed in the runner:* moves sent at once by a new caller now wait for the same setup; `same`
  compares both ways; the Postgres target drops its template databases at the end.
- *Fixed, smaller:* TikTok's promotion answers are read the way JavaScript reads `if` (`"yes"` is
  on), not cast to boolean; a send lists the accounts live first, then due, then the new ones; an
  admin naming a brand that does not exist gets 404 (`brand.reachable` now asks whether the brand
  row is visible, which covers both).
- *Not fixed, documented:* a bad day or time shape is 400 `VALIDATION` from the input schema, where
  the server said `BAD_DAY` or `BAD_TIME`, and schema errors come before `POST_POSTED` and
  `NOT_FOUND`. `youtube_title` cuts at 99 code points; the server cut at 99 UTF-16 units (they
  differ only for characters outside the Basic Multilingual Plane). Forced row rules also hold for
  the tables' owner: any other process on this schema (the old server, its seed script) must
  connect as a superuser or a role with BYPASSRLS. The idempotency table has no expiry yet.

**The test stall** (seen in phases 1 to 3, found in phase 3; see there).

Not verified: the pack on a local Supabase stack. Docker stopped during this phase, so the
real-Postgres runs used `embedded-postgres` (Postgres 18) from the scratchpad. `pg_input_is_valid`
needs Postgres 16 or later.

## Phase 3: publish, promote, roll back

- **The command line** (`pnpm -F @brandfactory/core core <command>`, `src/cli.ts`): `migrate`
  (the core's migrations, then each pack's), `login` (`--dev <id>` locally; with Supabase, email
  and `CORE_PASSWORD`), `publish <dir>`, `test <pack> <version>`, `promote <pack> <version>
  [--env]`, `principal`, `loadout`. Every command that acts for someone verifies the session's
  token as the server verifies a call (`authenticate` in `run.ts`), and the verified user id is
  what `promote` passes as `app.actor`. A Supabase service key names a role, not a user (no `sub`),
  so it is refused (`auth.test.ts`). The session is kept in `~/.config/brandbase-core/session.json`
  (mode 600), or given as `CORE_TOKEN`.
- **The server** (`src/main.ts`, `pnpm -F @brandfactory/core start`): Postgres (`DATABASE_URL`) or
  PGlite (`PGLITE_DIR`, core migrations on start). `src/env.ts` refuses the dev sign-in and a
  pinned clock when `NODE_ENV=production` or the database is not on this machine. CORS for the
  screens with `CORS_ALLOWED_ORIGINS`.
- **`core test`** runs the version's own cases, then the platform tests (`src/platform.ts`), on
  throwaway PGlite databases, and records one run bound to the version's hash. Passed means every
  case and every platform test passed. The platform tests:
  1. the runtime role is not a superuser, has no BYPASSRLS, owns nothing and is a member of no role
     (no move as the system role);
  2. every table the runtime role can reach has row-level security enabled and forced (company
     isolation in the database);
  3. every rule a move uses has a case that sees it refuse a call;
  4. every move has a case where it answers not-found (company isolation in the cases).
  A pack cannot remove them: they are core code, not pack data. Effect moves needing approval
  come with effect moves (phase 4); at-most-once sends with the scheduler (phase 5).
- **What the platform tests cannot see.** Test 4 counts not-found answers; it does not know which
  caller should have been refused. A pack could pass it with a case that asks for an id nobody
  holds. The database checks (2, and 5 to 7 below) are the wall.

**The demo** (`packs/brandbase/demo/hour-rule.sh`), run on 17 Oct against one core server on a
local Postgres 18, with no restart between the steps:

```
1.0.0: published, 46/46 cases passed, live.        07:30 → made a1 at 07:30
1.1.0 (no post before 08:00): 46/46 passed, live.  07:30 → refused: TOO_EARLY (a post goes out from 08:00)
1.2.0 (a case expects 07:30): 46/47, failed.        promote → NO_PASSING_RUN
promote 1.0.0 (roll back).                          07:30 → made a3 at 07:30
the same server throughout: pid 26665, running
```

The plan's demo also has the calendar and an agent refuse 07:30. The calendar comes in phase 6
(web-next on the core) and the agent in phase 4 (MCP); here the call is the one the calendar will
make, sent with curl.

**Adversarial review** (one Sonnet reviewer, then fixes). Promotion and the hash binding held: the
actor comes from a verified token, a service key and an agent are refused, and a run's hash read
back from the registry equals the stored one. It found holes in the platform tests, reproduced:

- *Fixed, high:* a pack migration (it runs as the migrator, a superuser) could add a
  `SECURITY DEFINER` function that reads past every row rule; a move calling it passed the SQL
  check and the platform tests, and returned another user's rows. New platform test 5: no
  function the runtime role can call runs with its owner's rights.
- *Fixed, high:* a pack migration could switch off `channels_promotion` (or any guard) on the
  real database. New platform test 6: every guard trigger of the registry is there and enabled,
  and the runtime role has no right in schema `packs`. And `core migrate <pack> <version>` now
  applies only a published version's migrations, and only with a passing run: a migration reaches
  a real database after the platform tests have checked what it does, never from a folder.
- *Fixed:* a policy `using (true)` passed. New platform test 7: every table with row-level
  security has a policy, and none lets every row through.
- *Fixed:* `DATABASE_URL=postgres://u@localhost/x?host=prod…` passed as local, but pg connects to
  the `host` parameter. A `host` or `hostaddr` parameter now counts as remote; `[::1]` counts as
  local. Under the dev sign-in the server listens on 127.0.0.1 only.
- *Fixed:* `core principal bot --agent-of ana` on an existing person printed success and left a
  person (now refused with `PRINCIPAL_EXISTS`); a flag with no value fell back silently (now
  refused); `loadout all` granted the newest published version's moves, not the live version's
  (now the live version's, and an error when none is live); `login --dev` saved before it checked;
  the session file was briefly readable; shutdown could hang on keep-alive connections.
- *Fixed, high, in a second pass:* checking the registry's end state was not enough. A migration
  ran as the login role (a superuser), so it could replace `packs.check_promotion()`'s body, or
  switch a guard off, write a row and switch it back on, and still pass. Pack migrations now run
  as `pack_migrator` (core migration `0004_migrator`): not a superuser, no right in `packs`,
  unable to call `set_config` (made after the function wall), with CREATE on the database so it
  owns the schemas it makes. Its way back to the login role is `RESET ROLE` or `SET ROLE`, so
  publish refuses a migration whose text holds them, anywhere, function bodies included (a body
  is a string until it runs, and a plpgsql `RESET ROLE` run by `pack_runtime` would land on the
  login role too). It also refuses dynamic `EXECUTE`, `set_config`, `SECURITY DEFINER`, role and
  server changes, extensions, and any mention of `packs.` or the core's roles
  (`migrationProblem` in `sql.ts`). BrandBase's `0002` lost its dynamic policy loop for plain
  statements. The registry check now covers `pack_migrator` too.
- *Fixed, third pass:* the reviewer got back to the login role with `COMMIT;` (it ends the
  transaction that holds `SET LOCAL ROLE`, and the rest of the text ran as the login role), and
  past the text rules with `set /**/ role`, `set --x` and a newline, and `set "role"`. A word
  filter cannot refuse `COMMIT` or `END`, which PL/pgSQL bodies hold. Now the core splits a
  migration into top-level statements with the same tokenizer as the move check (strings,
  quoted names and dollar-quoted bodies kept whole), refuses any that starts with transaction
  control, `SET`, `RESET`, `CALL`, `COPY` and the like, and runs them one at a time through the
  protocol that runs one statement only. Block comments are refused; the text rules read the
  raw text twice, with and without line comments, with quote marks removed. The pack migration
  step refuses what publish refuses, so a test database runs no unchecked migration either.
  Two more registry checks: the `packs` functions are the core's (compared with a database that
  holds only the core's migrations), and no schema has a role's name (it would come first in
  that role's `search_path`). Tests: a migration as `pack_migrator` cannot switch off, rewrite
  or write the registry, or grant into it; publish refuses each escape the reviewer found;
  a replaced guard body and a role-named schema fail the registry check.
- *Fixed, fourth pass:* a function can carry its own setting: `create function … set
  session_authorization = 'postgres'` passed the text rules (the setting's name has an
  underscore), and a move calling it read another user's rows as the login role. The reviewer's
  point stands: text rules keep missing. So the walls are now in the database. Platform test 8:
  no function the runtime role can call carries a setting (`pg_proc.proconfig`), whichever
  setting and however it got there (`create function … set`, `alter function … set`). Platform
  test 9: no trigger, rule or column default calling code outside `pg_catalog` on a table the
  runtime role can reach, since such code runs as whoever writes the row, and a fixture, a seed
  or a core write is the login role. The text rule also catches `session_authorization`.
- *Stopped here, after four passes; what is left:*
  1. **The login role must not be a superuser in a deployment.** Every escape the review found
     ends at the session user: `RESET ROLE`, `SET ROLE`, a function's `SET`. On a superuser
     login role that is everything. A deployment should log in as a role that is a member of
     `pack_runtime`, `pack_admin` and `pack_migrator`, owns the `packs` schema, and has nothing
     else; core migrations then run as a superuser once, by hand. Not built: there is no
     deployment yet.
  2. The text rules are a first line only; the database checks are the wall, and they check
     what a version does on the test database. A migration that behaves differently on another
     database (gated on `current_database()`) could pass them; reading migrations before
     promotion stays a person's job, as the proposal says.
  3. On Postgres 14 or older, PUBLIC may create in schema `public`, so `pack_migrator` could put
     an object there that shadows an unqualified name. The core's queries name `pg_catalog`
     objects or qualify them; not tested on 14.
- *Documented:* the policy check is a lint, not a wall: `using (true)` fails it, `using (1 = 1)`
  passes. The `SECURITY DEFINER` check stays as a second line behind the migration text check.
  A schema made earlier by another role (the old server's `brandbase` on the archive database)
  is not `pack_migrator`'s, so its migrations would fail there; that database needs its own plan.
- *Documented:* whoever holds `DATABASE_URL` can add principals and loadouts: the database
  credential is the root of trust. `core test` runs the platform tests on PGlite only.

**The test stall, found.** Since phase 1, a Vitest run sometimes never ended, with a worker at
100% CPU. A separate investigation found the cause: under load a test runs past Vitest's 5 s
limit; Vitest then runs `afterEach`, which closes the test's PGlite while its query is between two
protocol messages. PGlite 0.5.8's `close()` does not wait for the query, and removes the callbacks
the query's next message needs; that message traps, and PGlite's `execProtocolRawSync` retries it
forever, so the event loop never frees and no timeout fires. Evidence: a stuck worker paused over
the inspector showed a Bind message at read position 0 trapping on every pass; ten traced workers
all showed query, close, trap; `db.query(…)` then `db.close()` on plain PGlite hangs every time.
Fix in `db.ts`: `close()` waits for work in flight and refuses new work (`db.test.ts` hangs
without it); the runner's moves-at-once step waits for every call before the case's database is
closed; the core's `testTimeout` is 30 s. Before: 4 of 4 runs stalled; after: 0 of 8 for the
investigation and 3 of 3 since. Not yet reported upstream to electric-sql/pglite.

## Phase 4: agents

- **MCP** (`src/mcp.ts`, `POST /mcp/:pack`): JSON-RPC over HTTP with JSON answers, MCP's
  streamable HTTP transport without streaming. `initialize`, `ping`, `tools/list` and
  `tools/call`; a notification gets 202 and no body. The tools are the live version's moves,
  read on every request, named with `__` for the dots (`post__move`), sorted by name, with each
  move's description and input schema. The list is the caller's loadout (and, for an agent, its
  person's); a move outside it is left out, and a token with no account is refused. A tool call
  is `call()`, the same eight checks as a screen; a refusal is the tool's answer
  (`isError: true` and the refusal as JSON), so the agent reads why.
- **Agents** are principals with `agent_of` (phase 1). An agent's calls reach its person's rows
  (`app.user_id` is the person, `app.agent_id` the agent) and need the move in both loadouts,
  read on every call. An agent may publish a version; it can never promote one (the database
  refuses) or approve an effect.
- **Effect moves.** A move that names a `connector` is an effect: the core sets the kind from
  that, and a move that names none cannot reach a connector. It carries a read-only `payload`
  statement, what goes out, besides its `sql`, which records the connector's answer (bound as
  `:outcome`). Firing one (`src/effects.ts`): work out the payload now, under the caller's row
  rules and the move's before-rules; use up an approval for exactly that payload's hash
  (`FOR UPDATE SKIP LOCKED`, in the same transaction); send through the connector; record the
  answer. With no unused approval for that hash the call is refused, `NEEDS_APPROVAL`, with the
  payload in the details so a screen can show what needs a yes.
- **Approvals** (core migration `0005_approvals`, `POST /approve/:pack/:op`): a person whose
  loadout holds the move says yes to what it would send now; the core stores the payload's hash.
  An agent is refused by the route (`NOT_A_PERSON`) and by a trigger on the table. An edit to
  what goes out changes the hash and so voids the yes; a yes is used once; it is used before the
  send, so a send that failed or whose outcome is unknown needs a new yes (`SEND_FAILED`).
- **Connectors.** `CoreDeps.connectors` by name. Only `simulated` exists: it sends nothing and
  answers an id made from the payload. Real ones come with the platforms' reviews.
- **Platform test 10:** every effect move has a case that sees it wait for a person's yes.

Acceptance: an agent can draft a version but not promote it; an agent cannot create an approval;
revoking a person's move takes effect on their agent's next call (`core.test.ts`,
`effects.test.ts`). BrandBase has no effect move yet; `post.publish_job` comes with phase 5.

**Adversarial review** (one Sonnet reviewer, one pass). No bypass of the acceptance points; its
probes confirmed that three fires at once on one yes send once (`FOR UPDATE SKIP LOCKED`), that
every approve and fire is logged once, refusals included, and that a person cannot approve what
their row rules hide. Fixed, each with a test:

- A yes outlived its person's right: it now counts only while its person is a person who still
  holds the move. No expiry: phase 5 sends what a person approved days ahead.
- The hash bound the payload only; it now binds `{connector, payload}`, so a version that sends
  the same thing somewhere else needs a new yes. A yes is not bound to a version, so it survives
  a promotion or a rollback that leaves what goes out unchanged.
- A send whose recording failed lost the platform's answer: the answer is now kept on the
  approval (`outcome`) the moment it comes back. A connector that does not answer in 30 s fails.
- MCP: a missing or bad token is HTTP 401 for every method; a refusal inside a request is that
  request's JSON-RPC error and the batch goes on; an empty batch, more than 50 requests, or a
  body over 1 MB is refused. Move names may no longer hold `__` or end a part in `_`, so a tool
  name maps back to exactly one move.
- `/approve` logs path parts as `/ops` does and records an agent's person; a connector name
  that is an inherited key (`constructor`) no longer resolves.
- *Accepted:* a yes is for what goes out, not for who sends it: another caller whose row rules
  produce the byte-identical payload may use it (only a payload that names nothing private can
  be identical across people).

Not re-reviewed after these fixes (small, each tested; the review cadence asks for re-review
only of risky fixes).
## Phase 5: timed moves

- **Scheduled calls** (core migration `0006_scheduler`, `src/scheduler.ts`). The core owns the
  schedule: `packs.scheduled_calls` (move, input, run at, the principal who asked, a pack's key)
  and `packs.alerts`. A move asks for later calls in its result: a `schedule` column beside
  `result`, a list of `{ op, input, at, key }`, which the core checks (a move of this version, a
  time, an object) and stores in the move's transaction. Asking again under a key moves the call
  and arms it again, unless it is running. A call runs as the principal who asked, through
  `call()`'s checks (loadout read at run time), with no token: `call({ as })` is the scheduler's
  alone and no route sets it.
- **The loop** (`tick`, every 5 s in `main.ts`, one instance): calls whose heartbeat stopped
  first, then due calls one at a time. The claim is the server's `jobs.ts` claim made generic:
  one `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)` to `running`. New: one call per
  claim, a heartbeat every 30 s while it runs, and on a heartbeat older than 15 minutes the call
  ends `unknown_outcome`, never run again by the loop, with an alert row for its principal. The
  claim is the only place the core works across companies, and it runs no pack SQL.
- **How a call ends:** `done`, `refused` (a refusal: no person's yes, a send that failed, a job no
  longer waiting), `failed` (a fault), or `unknown_outcome`. A pack may name moves for the bad
  ends in its manifest (`scheduler.onRefused`, `scheduler.onUnknown`); the core calls them as the
  principal with `{ call, input, code?, message? }`.
- **BrandBase.** `post.schedule` asks for one `post.publish_job` per job at its time, and
  `post.move` asks again under the same keys when jobs move. Job ids are `post:channel`, so a
  screen knows them to approve each send. `post.publish_job` is an effect on the simulated
  connector: its payload is the job's account, format, the text that account gets (`text_for`)
  and the media; a job that no longer waits sends nothing. `post.job_refused` fails the job with
  the reason ("Waiting for a person to approve this send." when nobody said yes);
  `post.job_unknown` fails it with "Interrupted. Check the account before you retry."
- **Results reach the calendar** through `GET /events/:pack` (server-sent events; `?token=` for a
  browser's EventSource): "something in this pack changed", after every committed write or
  effect and every end of a scheduled call, with no data. A screen reads its state again through
  its moves, under its own row rules. Within a second in `events.test.ts`. Supabase Realtime was
  the other option; it would need the pack's tables published to it and its own row rules, and
  the core already knows when something changed.

Acceptance (`packs/brandbase/tests/jobs.json`, on PGlite and Postgres):
- a job cut off right after the claim sends nothing (its approval stays unused) and ends
  `unknown_outcome`, with an alert and the job failed;
- a job cut off after the connector took it ends `unknown_outcome`, is not run again by the loop,
  and an agent's retry is refused without a new yes (`NEEDS_APPROVAL`), as is an agent's
  attempt to give one (`NOT_A_PERSON`);
- the server's three job cases: due jobs go out and the post is posted; one account fails alone
  and only it is retried; and the cut-off case above.

Not done: the alert reaches nobody yet (it is a row; a screen or a message would read it), and
`post.publish_job` is not refused for a direct call before its time (it sends only with a
person's yes for exactly that, so an early send is a person's choice).

**Adversarial review** (one Sonnet reviewer, one pass). It found no way for a call to run twice
and no send after `unknown_outcome`: one-statement claim with `SKIP LOCKED`, a re-arm skipped
while running, `end()` a no-op after `unknown_outcome`, the approval used before the send. Fixed,
each with a case:

- A fault after the connector took the send (the answer unstorable, the database gone) ended the
  call `failed` and left the job waiting with its yes used up, so a drag and a new yes could send
  it twice. Every error after the send point is now `OUTCOME_UNKNOWN`: the call ends
  `unknown_outcome`, with an alert and the pack's `onUnknown`.
- Moving a post made the mover the owner of every waiting call, which could then fail as
  FORBIDDEN. A waiting call keeps who asked for it; an ended one goes to who asks again.
- A follow-up the principal could not call failed silently. Asking for a call now needs the
  asked-for move and the pack's follow-up moves in the asker's loadout (and an agent's
  person's), refused at once otherwise; a follow-up that still fails raises an alert.
- Job ids from the server's data are UUIDs: `post.publish_job` takes them too.
- `/events/:pack`: the name must be a pack name and the caller an account; the emitter's topics
  are prefixed, so `newListener` and `error` are not packs.
- A move may ask for at most 100 calls, with keys up to 200 characters and inputs up to 16,000.
- The claim's `SKIP LOCKED` had no test that could fail: `postgres.test.ts` now holds one claim
  open while a second runs, and fails without it.

Accepted and documented: the token in `/events?token=` can reach proxy logs (a short-lived
ticket would fix it); `post.mark` and `post.unplan` leave calls that end `refused` when they
run; a re-arm asked for while a send is running is skipped; a deploy cuts running sends, which
end `unknown_outcome` 15 minutes later; a crash between a call's end and its follow-up loses the
follow-up; any member who holds `post.job_refused` can fail a waiting job of their brand.
## Phase 6: web-next on the core (first part: the brand load and the posts)

- **The route map** (`packages/web-next/src/lib/core-routes.ts`). With `NEXT_PUBLIC_CORE_URL`
  set, `request()` in `lib/remote.ts` sends the ported routes to the core as moves
  (`POST /ops/brandbase/<move>`, the path's ids and the body as the input): `GET /me`
  (`account.me`), `GET /brands` (`brand.list`), `GET /brands/:id/state` (`brand.state`), and the
  post routes (create, edit, move, mark, unplan, send). Every other route still goes to
  `NEXT_PUBLIC_API_URL` (`packages/server`), or, with only the core set, is refused with "This is
  not on the new backend yet." and the brand reloads. The stores, the optimistic moves, the write
  queue, "Sending…" and the refusal handling are unchanged: the core answers in the server's
  shape (`{ code, message }` refusals with the same codes and words, posts in camelCase).
- **Schedule is the person's yes**, given with the sending. A scheduled call may say
  `approve: true` (an effect call only); when the caller is a person, the core works out what the
  call would send, under their row rules, and stores their yes in the same transaction as the
  call (`approveIn` in `effects.ts`; a yes already waiting for the same thing is not stored
  twice). An agent's sending stores none: its jobs wait for a person. `post.schedule` asks for
  it; `post.move` does not (a move changes the time, not what goes out, so the yes still
  matches).
- **Two moves for signing in**: `account.me` and `brand.list`, both refused (not-found) for a
  token with no account or a deactivated one.
- **A local stack** (`packs/brandbase/demo/web.sh`): a throwaway local Postgres gets the core,
  the pack (published, tested, migrated from the tested version, live), the demo's data (the
  server's seed script, run as a tool: with `DATABASE_URL` it runs no migrations of its own) and
  `admin@local` with every move; then the core on :3013. Run web-next with
  `NEXT_PUBLIC_CORE_URL=http://localhost:3013`.

Verified with Playwright on that stack (screenshots, 1440 × 900), against Postgres 18:
1. Sign-in reads `account.me` and `brand.list`, and the week of 5 Oct draws from `brand.state`.
2. A drag of Thursday's 18:00 reel to Saturday: `post.move` 200, the post on the core on
   10 Oct at 18:00, version 2.
3. The ravioli post marked Posted behind the screen's back, then dragged: `post.move` 409, the
   screen shows "This post is posted and cannot change." and puts it back on Thursday as posted.
4. The composer on the moved reel, "Schedule on" Instagram and TikTok: `post.move` (no change),
   `post.edit`, `post.schedule`, then the done screen ("Sat 10 Oct, 18:00, on 2 accounts"); the
   core holds two waiting jobs, two calls for Sat 18:00 SGT and the two yeses by `admin@local`,
   stored with the sending.
   "Sending…" passed in under 150 ms, too quick for the screenshot.
No request went to `packages/server` in these runs.

**Why not the hybrid the plan describes** (the core for ported routes, `packages/server` for the
rest, on one database): the server refuses its dev sign-in whenever `DATABASE_URL` is set, so on a
shared local Postgres it needs Supabase auth, which needs the local Supabase stack, which needs
Docker (off during this session). `remote.ts` supports the hybrid; it is not run yet.

Left in phase 6: the other route groups, one at a time with their tests: ideas (plan, place,
edit, suggestions), shoots and crew, share links and comments (the guest page), inbox, brand kit
and voice, connections and TikTok defaults, media uploads (signed upload URLs), pasted links.

**Adversarial review** (one Sonnet reviewer, one pass). Fixed:

- The first version approved each job in separate requests after `post.schedule` answered. A
  "now" send was due at once, so the scheduler could fire it before the yes arrived (refused,
  the job failed); a retry approved again and left spare yeses. The yes now comes with the
  sending, in its transaction (above), and a replay under the same key stores nothing again.
  Case: "takes the yes with the sending, so a send now is never due without it".
- A deactivated account got "no access"; it gets the server's 403 `ACCOUNT_DEACTIVATED` again
  (rule `account.active`). A token with no account is not-found (the server said 403
  `NO_ACCOUNT`; no screen reads the code).
- A body could replace a path's ids in the route map; the path's come last now.
- `/me` and the brand list answer timestamps as the server did (`…Z`).
- The runner's abandoned pass logs any error other than its closed database.
### Phase 6, second part: ideas and shoots

- **Ideas** (6 moves, pack migration `0004_ideas`): `idea.create`, `idea.edit`, `idea.drop`,
  `idea.plan`, `idea.place`, `idea.to_calendar`. `landing_day` and `week_end` port the calendar's
  landing rule. A new reserved parameter, `:fields` (the whole input as JSON), lets an edit tell a
  field sent as null (cleared) from one not sent (kept), as the server's partial edits did.
- **Shoots** (11 moves, pack migration `0005_shoots`): create, on-day, edit, drop, add and remove
  an idea, order, add and remove crew, reply, and `shoot.invite`, an effect on a `lark` connector
  (simulated, as the server's was: no Lark provider exists) that sends only to the crew not yet
  invited and records exactly those, from what went out (a new reserved parameter, `:payload`).
  An idea is shot once; a planned shoot left empty goes; one added by hand or from Lark stays.
- **Crew rows carry their brand.** A move that makes a shoot and its crew in one statement could
  not pass the crew's row rule, which looked the shoot up and could not see it yet. `crew` gains
  `brand_id`, set by the moves, kept equal to the shoot's by a composite key
  (`shoots (id, brand_id)`); rows without it (the server's seed) fall back to the shoot's brand.
  A crew id another brand holds is refused by the key (`crew_pkey` → `ID_TAKEN`).
- **The invite is pressed, so it is approved then fired**: the route map marks it
  `approveFirst`, and the client sends `POST /approve/…` then the move. No scheduler stands
  between them.
- **Differences from the server:** a second invite with nobody left to invite answers 404
  "nothing to send" (the server answered the shoot unchanged; the button is disabled then); two
  invite presses at once could each send, since each press is its own yes (the button is
  disabled while it sends; the server claimed the crew first).

Tests: 15 of the server's 16 idea cases (its shoot-pruning case set up the shoot with SQL), its 14
shoot cases, and a case for every rule they did not refuse; every new move in the isolation case.
Checked with Playwright on the local stack: Draft on the idea page plans the idea as a post on
Fri 9 Oct at 18:00 (`idea.plan` 200); "Send Lark invites" on the Raffles City call sheet approves,
sends and marks all four crew invited ("Invites sent").

**Adversarial review** (one Sonnet reviewer, one pass). The crew key and policy held against
every cross-brand insert and update it tried. Fixed:

- A repeated `shoot.create` for a shoot that exists ran its clean-up anyway (data-modifying CTEs
  always run): a retry after a network error could take an idea back and drop another shoot. The
  clean-up now runs only for a new shoot. Case: "changes nothing when the same create comes again
  after the idea moved on".
- Two invite presses (or two tabs) while a send was in flight could each send. The core now
  refuses a yes (409 `SENDING`) while a send of exactly the same thing has used its yes and not
  answered, for up to two minutes; a send that fails marks its yes, so a retry is not held up.
  Case in `effects.test.ts`.
- Making shoots took no brand-wide lock (the server's `lockShoots`): two creates or on-day joins
  at once could leave an idea in two shoots, or two shoots on one day. `shoot.lock_brand` locks
  the brand's row first, in create, on-day and add-idea.
- Another brand's post or shoot id was a generic `CONFLICT`; `posts_pkey` and `shoots_pkey` now
  map to `ID_TAKEN`.
- Cases added for behaviour mutations showed untested: a shoot's day edit, Lark switched off, the
  landing why.

Documented, not changed: a second invite with nobody left to invite is 404 (the button is
disabled then); idempotent repeats of `idea.create` and `idea.plan` run the day rules again;
field messages differ for `BAD_CHANNEL` and `BAD_DAY`; `btrim` trims spaces where zod trimmed all
whitespace (a blank value is still refused).

### Phase 6, third part: inbox, brand kit, connections and the moodboard's links

- **Inbox** (3 moves): `inbox.reply` (kept with who sent it, queued; no platform sender exists, so
  it stays a write; it becomes an effect with one), `inbox.send_to` (the brand's order of people),
  `inbox.clear_noise` (noise, and emoji-only messages with no letter or digit, via
  `textfn.has_word`).
- **Brand kit** (8 moves, pack migration `0006_kit`): the voice published as a new version under
  `voiceEdited`'s rules and numbered in the same statement (`UNIQUE(brand, n)`), brought back as
  a new version, colours through `hexOf` (a bad hex is refused, naming it), the logo (never a
  `blob:` URL), and brand files titled from their names, renamed, versioned and dropped.
- **Connections and the moodboard** (3 moves): `connection.set`, `brand.tiktok_defaults`,
  `pasted.add` (the client's id; a picture is https or none; stamped with the core's clock).
- Tests: the server's 5 inbox, 5 kit, 4 pasted-and-sources cases, a case for each rule they did
  not refuse, and every move in the isolation case.

**Second review pass** (the same reviewer): the first part's fixes hold (a correct repro of the
repeat create on the new snapshot steals nothing; `SENDING` lets a second send after a success
or a failure through); the new groups have no integrity or cross-brand defect. Fixed: dropping a
brand file twice answers `{deleted}` both times, as the server did (the store retries);
`shoot.lock_brand` takes `FOR NO KEY UPDATE`, so it does not wait on inserts that reference the
brand; `pasted.add` keeps a seed's own seven fields and ignores others, as zod did;
`voice_edited` trims all whitespace. Known and left: two people each holding an open yes for the
same payload could each send it once (two approvers, low risk).

### Phase 6, fourth part: share links and comments

- **Core: guest moves.** A move marked `"guest": {"capability": "<field>"}` runs at
  `POST /guest/{pack}/{op}` with no sign-in. The named input field is the capability: shorter
  than 32 characters, or on a move that is not a guest move, answers 404. The move runs through
  the same checks as any other, with no person and `app.capability` set, so only row rules that
  read `capability()` let it reach anything. A guest move cannot name a connector. Calls are
  limited per address and pack (30 a minute, 10 writes) and logged; the log keeps only the first 4 characters of the
  capability, as it is a right like a password. A new platform test asks
  every guest move for a case that sees a wrong token refused.
- **Pack** (pack migration `0007_share`): tokens of 43 base64url characters from two random
  UUIDs; guest row rules on links, ideas, shoots, crew, comments and posts, each keyed by the
  token of a link open to guests. Team moves `share.link`, `share.set`, `comment.reply` (signed
  with the brand's name), `comment.done`; guest moves `guest.view` (only what the brief or call
  sheet says), `guest.comment` (view-only links refused), `guest.edit` (the brief's words and
  shot titles, a new hook carried to the idea's post unless it is out).
- **web-next.** `guestRequest` sends the share page's three routes to the guest moves with the
  token; the team's four routes join `core-routes.ts`.
- Tests: the server's share cases, and a case where a member names their own brand with another
  brand's comment id. Checked with Playwright on the local stack: a guest opens a brief with no
  sign-in and comments, the team sees it, replies and marks it done from the idea page, the guest
  sees the reply, a made-up token shows "This link has nothing to show", and the brief fits a
  phone.


**Review** (one Sonnet reviewer; the change touches authorization, where the review skill would
use two). Fixed:

- A guest who could edit could carry a new hook to a post already out. `post_stage` reads
  `post_jobs`, where a guest had no row rule, so every post looked unsent to it. The guest now
  reads the jobs of the one post its link may carry a hook to; a test with a live job fails
  without that rule.
- The rate limit was counted per address and pack name, so made-up pack names in the path each
  had a new allowance. It is now per address.
- A guest's comment or edit did not reach the team's open screens; it now does, as any write
  does (checked by hand on the events stream).
- A wrong-token case counted for the platform test even when the core refused a short token
  itself; now only a token long enough to reach the pack's rules counts.
- Two first shares of one idea at the same moment could answer 404; `share.link` now takes the
  existing link on a conflict.

Left: a malformed token answers 400 where the server answered 404; the guest page shows "nothing
to show" for both.

### Phase 6, fifth part: uploads

- **Core: files** (`files.ts`). A move marked `"upload"` makes a file's record; the core passes a
  new key `<pack>/<uuid>.<ext>` as `:file` (the architecture notes' rule: the core makes the key,
  never the client), and turns the move's `upload: {key, type}` into a signed write URL and a
  stable address. It signs only a key of that pack's shape. `GET /files/<signature>/<key>` checks
  the signature and redirects to a storage URL good for an hour. Two stores, as the server had:
  files on disk for development (served by the core at `/blobs/*` with a named type and
  `nosniff`, refused in production) and Supabase Storage. Neither overwrites a key: the disk
  writes with `wx`, Supabase signs uploads with `upsert: false`.
- **Pack.** `media.create` (kind by type, the same id again keeps its record and key, another
  brand's id is refused with `ID_TAKEN`). Tests: the server's media cases, plus a key, path or
  `file` from the client refused and a member's other brand refused.
- **web-next.** Uploads go to `media.create` on the core. `next.config.ts` turns off the image
  optimiser when only the core is set, as it did for the API, or uploaded pictures would not
  show. Checked with Playwright: a picture added to an idea's references uploads to the core's
  disk store, the idea keeps its stable address, and it shows after a reload; a forged
  signature answers 404.
- With uploads, every route web-next calls has a move on the core.
- Not done: the notes' finalize step (read the stored file once, record its hash, size and type,
  freeze the record). A record's key can be signed again for a write, but storage refuses the
  second write. A stable address has no expiry and stays good while the file is stored, as the
  server's did; the Supabase store is ported unchanged and not run here (no local Supabase).


**Review** (one Sonnet reviewer): the acceptance points held (no client key, no cross-pack or
cross-verb signature, no traversal, no overwrite, brand isolation). Fixed:

- The fixed local `FILES_SECRET` applied whenever the core was not in production, also with a
  real sign-in; it now applies only with the dev sign-in on this machine.
- A disk write with no length (or a chunked one) was read whole before its size was checked; it
  is now refused with 411 before it is read.
- A core with no file store made the record and then answered 501; it now refuses first.
- New core tests run an upload move through the door end to end (the core's key, the signed
  write, the stable address, and a replay under the same idempotency key re-signed).

Noted: a record made by the old server, with a key not of the core's shape, could not be signed
again; nothing imports such rows.

## Phase 7: `packages/server` retired on this branch

The owner agreed on 18 Oct, once every route web-next calls ran on the core.

- **The seed** moved to `packs/brandbase/demo/seed.ts`: the same row building, plain SQL in place
  of Drizzle (each key is its column in snake case, inserted through `jsonb_populate_recordset`
  so a column left out keeps its default), in one transaction. Checked against the old seed:
  two fresh databases, migrated by the core and seeded one each way, hold the same rows in every
  `brandbase` table, apart from the times the rows were written; the new seed also fills
  `crew.brand_id`. `packs/brandbase` is a workspace package for this alone (`pg`, `tsx`, a
  typecheck); the core still reads only its data.
- **Deploy files.** `packages/core/Dockerfile` (the server's, for the core) and `fly.toml` on it:
  the release step runs the core's own migrations; settings `FILES_*`, `CORE_ENVIRONMENT`. Not
  deployed. The core's migrations need a superuser, unchecked on Supabase (phase 1).
- **web-next** has no path to the old API: `NEXT_PUBLIC_CORE_URL` alone turns the backend on, and
  a route with no move is refused as `NO_MOVE`.
- `packages/server` deleted; the workspace, the lockfile, `CLAUDE.md` and the READMEs follow. The
  plan and the proposal moved here from `docs/executing/`. The pack's migration comments still
  name the server's files they came from; those are on `feat/brandbase-backend`.

**After phase 7.** The branch is pushed and open as pull request #3 against `main`. The owner chose
the existing `brandfactory` Fly app for the core (open decision 3, 18 Oct). Before a deploy:
check that Supabase's `postgres` role can run the core's migrations, and run the Supabase file
store. The as-built board is `docs/refs/packs-core/as-built.excalidraw`.

