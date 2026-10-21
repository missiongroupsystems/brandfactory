# Plan: the brand walls asked once per statement (brandbase 1.4.0)

## Why

Measured on a local Postgres (median of 300 calls, a member who holds one brand, the core with
saved plans from `perf/core-plan-once`, the demo seed with no post jobs), a read through the core
costs about twice the same SQL with the access check written once in its WHERE. The results of
this change are in `pack-walls-once-phases-1-to-1.md`.

| Move        | Skip all checks | Traditional, check in WHERE | Core |
| ----------- | --------------- | --------------------------- | ---- |
| List brands | 0.42            | 0.45                        | 2.10 |
| List posts  | 4.82            | 4.92                        | 10.5 |
| Load brand  | 10.7            | 10.8                        | 23.8 |

The access check costs under 0.1 ms when asked once. The core's walls ask it once per row:

- Every `reach` policy calls `brandbase.can_reach(brand_id)`, a SQL function with a correlated
  `EXISTS` over `users` and `members`. Postgres runs it for each row it reads.
- `post_json(p)` reads a post's jobs in its own statement, once per post, and each of those
  statements asks the wall again for each job.

Skipping the checks for reads (the idea that started this) leaks: `brand.list` has no WHERE and
relies on the wall alone. Two reviewers (Opus, Sonnet) confirmed the leak and that no read in the
pack gives the same answer to every caller. This plan keeps every wall and makes it cheaper.

## What changes

1. Migration `0012_walls_once.sql`:
   - `brandbase.reaches_all()`: the caller is an active admin.
   - `brandbase.reached()`: the brands the caller, if active, is a member of.
   - Each `reach` policy (17 tables with `can_reach(brand_id)` or `can_reach(id)`, and `crew`)
     is altered to `(select brandbase.reaches_all()) or <brand> = any ((select brandbase.reached()))`.
     Both sub-selects name no row, so Postgres runs each once per statement (an InitPlan).
   - Written out in full, one `ALTER POLICY` per table: the core refuses `EXECUTE` in a migration.
   - `can_reach` stays: rules and other policies may still call it, and it gives the same answer.
2. `post.list` and `brand.state` read each post's jobs with a `LEFT JOIN LATERAL` in the move's
   own statement and pass them to `post_json(p jsonb, jobs jsonb)`, which reads no table. The
   moves that return one post keep `post_json(p)`.
3. Manifest 1.4.0.

## Same answers

- A NULL brand: `can_reach` gives false, the new form gives NULL for a non-admin. Both deny in
  USING and in WITH CHECK.
- Both reviewers ran the old and new form side by side for an admin, a member, a deactivated
  member and admin, an unknown user, an agent's claims, a guest token and no claims row, under
  saved generic plans, for SELECT, INSERT and UPDATE: the same answers.
- The pack's tests (`isolation.json` and the rest) run every move as admin, member, deactivated and
  unknown callers; they must pass unchanged. A new case checks that the policies no longer call
  `can_reach`, so a later migration that brings the per-row form back fails a test.

## Measure

`.work/bench/` in this worktree: a database at 1.3.0 and one at 1.4.0, both seeded with the demo
plus post jobs (the demo seed has none), the same core, interleaved, as admin and member.

## Not in this plan

- A one-trip read in the core. The reviewers found four problems with the version tried (side
  effects committed before the check is judged, a lost check row on error, refusals logged as
  200, the agent's loadout not checked). It needs its own design.
- Production. Migration 0012 is not applied to the live database.
