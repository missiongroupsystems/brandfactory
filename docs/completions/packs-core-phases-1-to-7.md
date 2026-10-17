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

**Seen twice, not reproduced:** under a machine load average above 100, a Vitest run of the core
used CPU for minutes and printed nothing. The same files then passed in under a minute (165 tests,
PGlite and Postgres). If it recurs, run one file at a time with `--reporter=verbose` to find which.

Not verified: the pack on a local Supabase stack. Docker stopped during this phase, so the
real-Postgres runs used `embedded-postgres` (Postgres 18) from the scratchpad. `pg_input_is_valid`
needs Postgres 16 or later.
