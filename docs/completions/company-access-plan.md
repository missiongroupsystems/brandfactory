# Plan: access by company (brandbase 1.5.0)

## Why

Phil asked that every marketing person in a company sees every brand of that company. Today the
pack walls each brand on its own (`can_reach`, migration 0002; the once-per-statement form,
0012): an admin (`users.role = 'admin'`) reaches every brand in the database, a member only the
brands they hold a `members` row for. There is no company, so "admin" means every brand of every
company, and a second company would see the first's brands through any admin.

The production database (`brandbase-db`) holds no brand and one user, so the model can change now
at the cost of one migration.

## The model

- `organizations` (a company): `id text primary key`, `name text not null`, `created_at`.
- `org_members`: `user_id` → `users`, `org_id` → `organizations`, `role` one of `owner`, `admin`,
  `member` (Passport's words), primary key `(user_id, org_id)`. A person may be in several
  companies.
- `brands.org_id` → `organizations`, not null: a brand belongs to one company.
- A person reaches a brand when they are active (`users.deactivated_at is null`) and a member of
  the brand's company, whatever their role. Roles decide nothing yet; they are kept for the
  management moves that come later (who may add brands or people).
- No global admin: `users.role` no longer reaches anything. `account.me` answers the caller's
  companies with their role in each, and the brands they reach.
- The per-brand `members` table goes (it is empty in production). Share links stay the way to
  let an outsider view or comment on one shoot or idea.

## The walls (migration `0013_companies.sql`)

- `brandbase.reached_orgs()`: the companies the caller, if active, is a member of (an array),
  read from `org_members` and `users`, which the caller sees only their own rows of.
- `brands` policy: `org_id = any ((select brandbase.reached_orgs())::text[])`.
- Every other `reach` policy (the 17 tables 0012 rewrote, `crew` included): `brand_id = any
  ((select brandbase.reached())::text[])`, with `brandbase.reached()` now the ids of the brands
  the caller reaches, read from `brands` under its own policy. No policy reads its own table, so
  nothing loops; the sub-selects name no row, so each runs once per statement (as in 0012).
- `brandbase.reaches_all()` goes; `brandbase.can_reach(brand)` keeps its name with the company
  rule, for anything that calls it.
- `org_members` and `organizations` get row rules: a person sees their own memberships and the
  companies they belong to. Neither is writable by `pack_runtime` (as `users` and `members`
  are not today): companies and memberships are managed outside the moves, by hand now and by
  Passport's sync later.

## What changes elsewhere

- Moves: `account.me`, `brand.list` (description), any move or rule that reads `members` or
  `users.role`. The builder lists them.
- Tests: the fixture gets two companies (`casa` and `temper` in company A, a third brand in
  company B), a member of A, an owner of A, a member of both, a deactivated member, a stranger.
  Cases: a member of A sees every brand of A and none of B, also through every move that names
  another company's brand; a member of both sees both; deactivated and stranger see none; a new
  brand in A is seen at once by A's members; the guard case that no `reach` policy calls a
  per-row function.
- `demo/seed.ts`: one company holding the demo brands, `SEED_ADMIN` its owner.
- web-next: only if it reads `user.role` or the shape of `account.me`.
- Manifest 1.5.0; changelog; completion doc.

## Passport later

A company is a Passport organisation, `org_members` its memberships and roles; Passport's sync
fills both, and nothing in the walls changes.

## Not in this plan

Moves to create companies, brands or memberships; per-brand access inside a company; applying
1.5.0 to production (after review, with the owner).
