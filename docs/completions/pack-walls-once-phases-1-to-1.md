# The brand walls asked once per statement: as built

Plan: `pack-walls-once-plan.md`. Branch `perf/pack-walls-once`, from `main` at `29eea81`.

## Phase 1: brandbase 1.4.0

### What changed

- `packs/brandbase/migrations/0012_walls_once.sql` adds `brandbase.reaches_all()` and
  `brandbase.reached()` and alters the 18 `reach` policies (the 17 with `can_reach(brand_id)` or
  `can_reach(id)`, and `crew`) to the once-per-statement form. Each `ALTER POLICY` is written out:
  the core refuses `EXECUTE` in a migration. `can_reach` is kept and unchanged.
- `post.list` and `brand.state` read each post's jobs with a `left join lateral` and call
  `post_json(p jsonb, jobs jsonb)`. Moves that return one post keep `post_json(p)`.
- Manifest 1.4.0.
- `tests/isolation.json`, three cases:
  - a member who holds two brands lists both and no other; an admin lists all three;
  - a deactivated admin gets 404 from `post.list` and `brand.state`, where the wall is the only
    guard (checked to fail when `reaches_all()` ignores `deactivated_at`);
  - no `reach` policy calls `can_reach`, and all 18 use both wrapped sub-selects (checked to fail
    without 0012).

### Measured

Local Postgres, median of 300 calls each, ways called in turn. Two databases built by
`.work/bench/setup.sh` (not tracked): 1.3.0 from `main` and 1.4.0, each with the demo seed, a member
who holds `casa-vostra` only, and two scheduled jobs on each of the 46 posts (92 jobs). "Main" is
`main`'s core; "plans" is the core from `perf/core-plan-once` with `DATABASE_PREPARE` on.
"Traditional" is 1.4.0's SQL as the login role with the access check in its WHERE, one trip.

| Caller | Move        | Traditional | Main 1.3.0 | Main 1.4.0 | Plans 1.3.0 | Plans 1.4.0 |
| ------ | ----------- | ----------- | ---------- | ---------- | ----------- | ----------- |
| admin  | list brands | 0.57        | 8.82       | 8.78       | 2.18        | 1.93        |
| admin  | list posts  | 3.66        | 23.79      | 16.01      | 15.76       | 5.26        |
| admin  | load brand  | 9.48        | 38.46      | 26.90      | 26.96       | 12.30       |
| member | list brands | 0.52        | 8.91       | 8.97       | 2.26        | 2.12        |
| member | list posts  | 3.63        | 25.86      | 16.55      | 17.84       | 5.91        |
| member | load brand  | 9.50        | 42.42      | 31.24      | 30.88       | 16.60       |

- On `main`'s core, 1.4.0 cuts list posts and load brand by about a third. List brands does not
  change: `main` reads the whole pack version on each call, and that dominates.
- With saved plans, 1.4.0 cuts list posts by about 3 times and load brand by about half. What is
  left over the traditional query is about 2 ms of trips and set-up, and the walls themselves.
- "Main" here is `main` on 21 Oct 2026, before the saved-plans core (2.31.0) merged; "plans" is
  that core, now on `main`.

Fly `sin` to a Supabase test project in Singapore (`ap-southeast-1`; one trip 2.2 ms), 21 Oct 2026,
the same five ways, median of 300, as the member (ms):

| Move        | Traditional | Main 1.3.0 | Main 1.4.0 | Plans 1.3.0 | Plans 1.4.0 |
| ----------- | ----------- | ---------- | ---------- | ----------- | ----------- |
| List brands | 4.1         | 52.7       | 54.8       | 18.9        | 18.4        |
| List posts  | 12.9        | 84.4       | 69.3       | 48.0        | 26.0        |
| Load brand  | 30.1        | 125.5      | 99.4       | 80.9        | 51.9        |

On Supabase's Micro database the walls cost more than locally, so 1.4.0 helps more there: with
saved plans list posts 46% less and load brand 36%. BrandFactory's old Supabase project is in
`ap-northeast-2` (Seoul), where each trip from `sin` would cost tens of ms.

Not covered by the pack's tests: 1.4.0 through saved plans with the one-trip read's rule wrapper
(`packs.test.ts` runs unprepared). The reviews' generic-plan checks and the Fly run above cover it.

### Reviews

Opus and Sonnet, independently, on the uncommitted tree. Neither found a blocker or a major.

- Both ran 1.3.0 and 1.4.0 side by side for 14 to 18 callers (admin, member, a member of two
  brands, deactivated member and admin, an unknown user, an agent's claims, guests with edit, shoot,
  view, team-only and bad tokens, a member or admin with a guest token, an empty and no claims
  row) over SELECT, INSERT, UPDATE (also moving a row to another brand), DELETE, upserts, the
  crew rows with no brand, and the guest edit and comment paths: identical results, errors
  included.
- Both checked saved generic plans on one connection across callers: each caller gets its own
  answer; the sub-selects run on each execution.
- Opus ran 0012 on a copy of the 1.3.0 database as `pack_migrator`, as `core migrate` does: it
  applies.
- Fixed from the reviews: the guard case now requires the wrapped sub-selects (a bare
  `reaches_all() or … = any (reached())` would have passed), and the deactivated-admin case.
- Noted, not changed: the guard counts policies named `reach` only, and a new table must update
  its count of 18. `brand.state` orders posts by day and time with no tie-break (as before).

### Gate

Typecheck, lint, format and the web build pass (the untracked `.work/` left out). Tests with
Postgres: 865, none skipped.

### Not done

- Migration 0012 is not applied to production. The core is not deployed: `brandfactory` on Fly
  still runs the old server (release v120, 7 Oct 2026).
- No measurement on Fly and Supabase.
