# Plan: a read in one trip, with every check kept

Builds on `core-plan-once-plan.md` (branch `perf/core-plan-once`).

## Why

Fly `sin` to Supabase Singapore, one trip is 2.2 ms. With saved plans and brandbase 1.4.0 a read
still makes 4 or 5 trips, and costs 1.7 to 4.5 times a traditional backend's single query
(`docs/completions/pack-walls-once-phases-1-to-1.md`). The trips are now most of the gap:

| Move        | Traditional | Core, saved plans | Trips |
| ----------- | ----------- | ----------------- | ----- |
| List brands | 4.1 ms      | 18.4 ms           | 5     |
| List posts  | 12.9 ms     | 26.0 ms           | 4     |
| Load brand  | 30.1 ms     | 51.9 ms           | 4     |

The trips today: (1) begin, claims, check row, role; (2) each before-rule; (3) the move; (4) log
and commit.

## What changes

A read (a move `kindOf` calls a read, with no upload, called by a principal, of a version this
process has read, by a principal whose person this process has seen) goes in two trips:

1. begin; the claims; the settings; the check; `set local role pack_runtime`; each before-rule;
   the move; each after-rule.
2. reset role, the log row, commit (`Tx.atCommit`, as today).

The database judges the check and the rules itself, and stops the text at the first refusal:

- `packs.judge(environment, pack, op, hash, agent_of)` (core migration 0008), run as the login
  role before the role drops. It raises a refusal when the live hash is not `hash` (STALE), when
  there is no claims row (NO_ACCOUNT), when the principal's person is not `agent_of` (STALE),
  and when the loadouts do not hold the move: its own, and its person's for an agent
  (FORBIDDEN). The same order and the same answers as `inOneTrip` and `authorise`.
- `claims.rule_ok(row, rule)`, run as pack_runtime around each rule: raises the rule's refusal
  unless the rule's first row has `ok` true.
- A refusal is `P0001` with the message `core_refused` and a JSON detail. A failure stops the
  text: nothing after it runs, the commit included. The core rolls back and logs the refusal as
  today (`call`'s catch).

Values go into the text as dollar-quoted literals of unknown type, the text node-pg would send as
a parameter, so they coerce as parameters do. Pack SQL may not contain `$`, and `bind` places the
literals at the parameter tokens only.

With `DATABASE_PREPARE` on, each rule and the move is saved with `PREPARE` (before `begin`, once
per connection) and run with `EXECUTE`, so the trip keeps saved plans. A saved statement outlives
a failed transaction, so the core records it as saved after a success or a core refusal (both
run after every `PREPARE`), and drops the connection after any other failure.

## Statements among the core's own

Pack SQL now goes in one text with the core's statements and the caller's values, so it must not
leave a quote open: Postgres would end it at the next value's tag, and a caller's value would run
as SQL as the login role (the review's blocker). `sqlProblem` refuses a string, quoted name,
dollar quote or block comment that does not end, at publish. A version published before that is
checked again on its first read (`fits`, per version and move): a move whose statements do not
all close, or with a rule that writes (Postgres refuses a writing statement inside the rule's
sub-select, before the check has run), goes the way it went before. So does a call whose saved
statement went stale after a table changed shape; the connection is dropped.

One difference stays: a rule's `message` and `details` come back through `to_jsonb`, so a
`details` column that is not jsonb or text reads as JSON gives it (a bigint as a number, a
timestamp in Postgres's form), not as node-pg would. BrandBase's rules give jsonb.

## The four problems the review found in the first try, and the fix for each

1. A read's side effects committed before the check was judged: the check and the rules run
   first and stop the text; the commit is a separate trip, sent only after the core has the rows.
2. The check row lost on an error: the refusal is the error, with its reason in the detail.
3. Refusals logged as 200: the log row goes with the commit, after the core has judged the call;
   a refusal is logged by `call`'s catch.
4. The agent's own loadout not checked: `packs.judge` counts both loadouts, as `authorise` does.

Also: input that fails validation goes the existing way, so a caller without the move gets
FORBIDDEN, not the validation details.

## Tests (Postgres, prepare on and off)

- A read makes two trips; a second read on the connection prepares nothing.
- Each refusal (stranger, no loadout, an agent without the move, its person without it, a rule)
  answers as before, is logged once with its status, and commits nothing, including what a
  pack function the read calls would have written.
- A version promoted between calls; an agent's person changed: the call goes the long way.
- A move that fails at run time (bad input) answers as before; the next call on the same pool
  works.
- Invalid input from a caller without the move: FORBIDDEN.

## Measure

Local, then Fly `sin` to a Supabase Singapore test project, against `perf/core-plan-once`.
