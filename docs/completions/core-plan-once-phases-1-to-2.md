# Fewer trips per call: as built

Plans: `core-plan-once-plan.md` (phase 1, with its "As built" and "Measured"), and
`core-read-in-one-trip-plan.md` (phase 2). Branch `perf/core-plan-once`, from `main` at `29eea81`.

## Phase 1: the B speed fixes and saved plans

What changed, the tests and the local measurements are in `core-plan-once-plan.md` ("As built", "Measured").

Fly `sin` to a Supabase test project in Singapore (one trip 2.2 ms), median of 300 calls, as a
member who holds one brand, with brandbase 1.4.0 (`perf/pack-walls-once`): `main`'s core 54.8 /
69.3 / 99.4 ms for list brands / list posts / load brand; this phase with saved plans 18.4 / 26.0 /
51.9 ms; a traditional single query 4.1 / 12.9 / 30.1 ms. Method and table:
`docs/completions/pack-walls-once-phases-1-to-1.md`.

Reviews: three passes (Opus and Sonnet on the first two, Opus on the third). Fixed from them: the
transaction pooler with named statements (now refused), statements never freed (connections live
30 minutes), the check and the claims read apart (the check now reads the claims row), the prepared
statements view readable by pack SQL (screened), and immutable functions that read the caller,
which a saved generic plan, and plpgsql's own plans, could keep across callers (a platform test
now fails such a version). The last fix of the third pass was checked with the reviewer's bypass
script (all 8 variants refused) and the tests; the phase 2 panel had it in view but did not review
it as such.

## Phase 2: a read in one trip

What changed is in `core-read-in-one-trip-plan.md`. In short: a read sends the claims, the check
(`packs.judge`, core migration 0008), the drop to `pack_runtime`, its rules (`claims.rule_ok`) and
its move in one trip, and the log row with the commit in a second. The database stops the first
trip at the first refusal. With `DATABASE_PREPARE` on, the rules and the move run as statements
saved with `PREPARE`.

Trips per read, measured at the pg client (`.work/onetrip/bench.mts`): list brands 5 → 2, list
posts 4 → 2, load brand 4 → 2, with the same answers for an admin and a member.

Local Postgres, median of 300, as the member (ms):

| Move        | Traditional | Before, no plans | Before, plans | One trip, plans | One trip, no plans |
| ----------- | ----------- | ---------------- | ------------- | --------------- | ------------------ |
| List brands | 0.35        | 1.70             | 1.52          | 0.89            | 1.07               |
| List posts  | 2.15        | 5.95             | 3.58          | 3.16            | 5.45               |
| Load brand  | 5.70        | 14.53            | 9.85          | 9.50            | 13.94              |

Fly `sin` to the Supabase test project in Singapore, brandbase 1.4.0, 22 Oct 2026, median of 300, as
the member (ms; the admin's are within a few ms):

| Move        | Traditional | Before, no plans | Before, plans | One trip, plans | One trip, no plans |
| ----------- | ----------- | ---------------- | ------------- | --------------- | ------------------ |
| List brands | 3.6         | 16.9             | 16.2          | 9.5             | 10.2               |
| List posts  | 12.4        | 31.5             | 23.9          | 19.6            | 27.1               |
| Load brand  | 29.8        | 63.7             | 49.4          | 47.3            | 59.7               |

- Two fewer trips save about 5–7 ms a read: list brands 41% less with saved plans, list posts 18%,
  load brand 4%.
- Without saved plans (production today, on the transaction pooler), the one-trip read saves 4–7 ms
  too, but planning each statement afresh costs more than a trip on the larger reads.
- What is left over the traditional query is the walls and the work of the move itself for load
  brand, and the claims and log writes and the second trip for list brands.

Reviews: Opus and Sonnet, independently, then a fresh Opus on the fixes.

- Blocker (Opus): a pack statement that left a quote open (`select $v$`) took in the core's text
  after it, so a caller's value ran as SQL as the login role. Fixed in two places: `sqlProblem`
  refuses an open string, quoted name, dollar quote or block comment at publish, and `closes`
  checks every statement of a read again before it goes in the shared text (`fits`, per version
  and move), so a version published before goes the old way. `closes` also refuses a comment, a
  backslash in a plain string, and a digit followed by anything but a digit, `.`, space or an operator (Postgres before 15 reads
  `1e5$a$` as a number and a dollar quote). An end-to-end test inserts such a version straight
  into the registry; with the guard taken out, the injected row is written and the test fails.
- Fixed besides: a rule that writes goes the old way (Postgres refuses it inside the rule's
  sub-select); a stale saved statement drops its connection and the call goes the old way; a NUL
  byte in a value goes the old way (it answers 400, not 500); a rule id must be the pack's own;
  `raisedIn` matches the check's and the rule wrapper's signatures in any message language and
  refuses a quoted name.
- Verified on Postgres 17.5 (fresh Opus): 54 lexer forms, none where `closes` and `sqlProblem`
  accept a text and Postgres takes in the next statement; no pack function can pass as `packs.judge`
  or `claims.rule_ok` in `raisedIn`.
- Kept: a rule's `message` and `details` pass through `to_jsonb` (a bigint `details` reads as a
  number); a move may call `claims.rule_ok` to refuse its own call under one of its own rules.

Tests: `postgres.test.ts`, run with saved plans on and off: two trips and statements saved once per
connection; each refusal (no loadout, an agent without the move, a removed principal, a rule with
its words and details, a move that fails at run time, invalid input from a caller without the move)
answers and logs as before and commits nothing a read's function wrote; an agent's person changed;
a NUL byte; the open-quote version. `sql.test.ts`: `literal`, `inline`, `withoutSemicolon`,
`closes` and the open forms `sqlProblem` refuses. Mutation checks: an agent rule broken in
`packs.judge` fails 4 tests; a `claims.rule_ok` that refuses everything fails 25 brandbase cases on
PGlite, so the pack's own cases run through this path.

## Gate

Typecheck, lint, format and the web build pass (the untracked `.work/` left out). Tests with
Postgres: 916, none skipped.

## Not done

- Production still points `DATABASE_URL` at the transaction pooler (6543), where saved plans are
  refused; a read there takes two trips without saved plans. Moving to the session pooler is the
  owner's call.
- Core migration 0001 needs a superuser, which Supabase does not give (found on the Supabase test
  project): the core cannot be installed on Supabase as built. Migrations 0002 to 0008 and the
  pack's ran there as `postgres` and `pack_migrator`.
- Core migration 0008 is not applied to production; the core is not deployed.
