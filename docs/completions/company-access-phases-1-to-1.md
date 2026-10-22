# Access by company: as built

Plan: `company-access-plan.md`. Branch `feat/company-access`, from `main` at `0a12d46`.

## Phase 1: brandbase 1.5.0

### What changed

- `packs/brandbase/migrations/0013_companies.sql`:
  - `organizations` (id, name, created_at) and `org_members` (user, company, role `owner`,
    `admin` or `member`), each with forced row rules: a person sees their own memberships
    (`user_id = caller()`) and the companies they are an active member of. `pack_runtime` gets
    `SELECT` on both and no write.
  - `brands.org_id`, not null, a foreign key to `organizations`.
  - `brandbase.reached_orgs()`: the companies the caller, if active, is a member of.
    `brandbase.managed_orgs()`: those where they are an owner or admin. `brandbase.reached()` is
    now the ids of the brands the caller sees under the brands wall. `can_reach(brand)` keeps its
    name with the company rule. `reaches_all()` is dropped; nothing called it.
  - The brands wall is three policies: `reach` (select) and `reach_update` for any member of the
    brand's company, and `manage` (insert) for its owners and admins only. The runtime role may
    update only `tiktok_defaults` (the one column a move changes; column privileges) and may not
    delete a brand, so no statement removes a brand or changes its id or company. The
    17 other `reach` policies (`crew` included) are `brand_id = ANY ((SELECT
    brandbase.reached())::text[])`. Every sub-select names no row, so each runs once per
    statement, as in 0012.
  - The per-brand `members` table is dropped.
  - Backfill for a database 1.4.0 already holds brands in: one company, `mission-group`
    ("Mission Group"), takes every brand; each `users.role = 'admin'` becomes its owner and each
    person with a `members` row its member. An empty database gets no company. The migration runs
    as the tables' owner, whom forced row rules also hold, so it lifts `FORCE` on `brands`,
    `users`, `members` and `brand_kits` for the backfill and forces them again in the same
    transaction (`members` is then dropped). Anyone who held a 1.4.0 `members` row, for any one
    brand, reaches every brand of the company after it.
  - `brand_kits.org_id`, not null, filled from the brand for existing kits, with a foreign key
    `(brand_id, org_id)` to `brands (id, org_id)`, and a `manage` insert policy on `brand_kits`
    for owners and admins. See "Deviations".
- `brand.create` (new move, `ops/brand.create.json`): `{ org, name, handle, linked, line?,
  timezone? }`. The id is the name as a slug (a–z, 0–9 and `-`, at most 60). The brand goes after
  its company's other brands, with an empty kit (voice `{summary: '', words: [], examples: []}`,
  colours `[]`, logo `{src: null, name: null}`), in one statement. Rules: `brand.by_a_person`
  (403 `PERSON_ONLY` for an agent: there is no move to remove a brand an agent made),
  `brand.org_reached` (404 for a company the caller is not in), `brand.org_managed` (403
  `FORBIDDEN` for a member), `brand.timezone_known` (400 `BAD_TIMEZONE`). Two creates at once in
  one company may take the same position; the switcher then orders them by id, which is
  accepted. An id another brand holds is 409 `BRAND_TAKEN`
  (`brands_pkey` in the manifest). It answers in `brand.list`'s shape. `core loadout … all`
  takes it with the other moves.
- `account.me` answers `companies` (`id`, `name`, `role`, by name) beside `user` and `brands`;
  `user` no longer carries `role`. `account.me` and `brand.list` list brands company by company
  (by company name, then id), then by position and id, so a person in two companies does not get
  their brands interleaved.
- `demo/seed.ts`: one company, `demo`, holds the demo brands; `SEED_ADMIN` is its owner.
- `ontology.json`: `organizations` and `org_members` in place of `members`.
- Manifest 1.5.0.

### Tests

- Fixture: company A (`co-a`) holds `casa` and `osteria`, company B (`co-b`) holds `temper`.
  `member` and `owner` are in A, `both` is a member of A and an admin of B, `b-owner` owns B,
  `gone` is A's and deactivated, `loner` has an account (`users.role = 'admin'`) and no company,
  `stranger` has none. The other test files call as `both` where they called as `admin`, and
  `send.json` drops the member's `org_members` row where it dropped their `members` row.
- `isolation.json`: the existing "every move with another brand's ids" case, now another
  company's; a member and an owner of A list `casa` and `osteria`, a member of both lists all
  three; `account.me` with companies and roles; a member writes in A's second brand; a brand
  added to A is seen at once by A's members, one added to B by none of them; an account in no
  company reaches nothing whatever its `users.role`; a deactivated member of both reaches
  nothing; a person sees only their own memberships and companies, and `pack_runtime` writes
  neither table; the guard (below).
- The guard: in every `reach`, `reach_update` and `manage` policy, once the wrapped `(SELECT
  brandbase.reached() …)`, `reached_orgs()` and `managed_orgs()` calls are taken out, no
  `brandbase.` function call is left; 17 policies use `reached()`, 2 on `brands` use
  `reached_orgs()`, 2 use `managed_orgs()`.
- `brands.json` (new): an owner adds a brand with an empty kit, after the company's brands, seen
  at once by every member (`kit.colours` works on it) and by no one in B; an admin of B adds one
  to B; a member, an admin of another company, an outsider, an unknown company, a deactivated
  account and a stranger are refused; past the move, a member's insert into `brands` and a kit
  for another company's brand are refused by the row rules and the kit's key; a name whose id
  another brand holds, in this company or another, is 409; bad input is 400. Past any move, a
  raw delete of a brand (by a member, an owner, an admin of the other company) and a raw update of
  its `org_id`, `id` or `line` are refused with "permission denied", and every brand stays where it
  was; an update of `tiktok_defaults` works. An agent acting for an owner is refused
  `PERSON_ONLY` and adds nothing.
- `packs/brandbase/upgrade.test.ts` (new vitest project, PGlite): migrations 0000–0012, 1.4.0
  rows (two brands, a kit, an admin, a member of one brand, an admin who also holds a members
  row, a deactivated admin, a user with nothing), then 0013. Every brand stays visible to the
  admin, and the member now sees both (their company's); the others see none; the old kit takes
  its brand's company; every table has forced row rules again and `members` is gone. A second
  case: no brand, no company. The pack runner cannot test an upgrade: it migrates an empty
  database and then loads the fixture. The test checks the migration runs as the tables' owner,
  `pack_migrator`, which is no superuser and has no BYPASSRLS, as on production.
- Mutation checks, each restored after: `reached_orgs()` ignoring `deactivated_at` (3 cases
  fail); the brands select wall `USING (true)` (13 fail); one wall as `can_reach(brand_id)` (the
  guard fails); the brands insert wall on `reached_orgs()` instead of `managed_orgs()` (the
  past-the-move case and the guard fail); the backfill without the members carry-over (the
  upgrade test fails). After the review: without the `brands` lift the upgrade case fails (the
  backfill sees no brand, so `SET NOT NULL` refuses); without the `brand_kits` lift it fails (the
  kit keeps no company, so `SET NOT NULL` refuses); without the `users` or the `members` lift
  both upgrade cases fail (their row rules read `claims.calls`, which `pack_migrator` may not
  read).
- The seed was run on Postgres 18: the owner reaches the 3 demo brands and 46 posts, an unknown
  user none.

### Deviations from the plan

- Fixture: the plan put `casa` and `temper` in company A and a third brand in B. Every test file
  uses `temper` as the brand a member must not reach, so `temper` is company B's and `osteria`
  is A's second brand. The cases the plan lists are all there.
- `account.me`'s `user` drops `role`: `users.role` no longer means anything. The column stays.
- Brand creation (`brand.create`, the `manage` policies, `managed_orgs()`) and the backfill were
  added to the plan while it was built; the plan said production was empty.
- `brand_kits.org_id`: a statement cannot see a row it is adding, so the kit that `brand.create`
  adds beside its brand fails the kits wall, which asks for the caller's brands. Triggers are
  refused by the platform tests and a rule that writes would be a second statement. The kit
  names the brand's company instead; the foreign key `(brand_id, org_id)` holds it to the
  brand's own company at the statement's end, and `manage` lets only that company's owners and
  admins add it.

### Review

Opus and Sonnet, independently; no blocker. Fixed:

- Major: a member could delete a brand (`reach_delete`). The delete wall is gone and the runtime
  role has no `DELETE` on `brands`.
- Major: a member of two companies could move a brand between them (`reach_update` checked only
  that both companies were theirs). The runtime role may now update only `tiktok_defaults`.
- Existing kits had no company, so the kit foreign key did not bind them. 0013 fills it and
  makes it not null; the seed and the tests' kit rows give it.
- The upgrade test was thought to run as a superuser. It runs as `pack_migrator` (checked in the
  test), and removing any lift makes it fail (above).
- `brand.create` was open to agents through `loadout … all`. It is now for a person only.
- `brand.list` and `account.me` interleaved two companies' brands. They now go company by
  company.

### Open

- web-next does not use `brand.create` or `companies` yet, and its kit store keys kits by the
  demo's fixed brand ids; a kit logo with `src: null` would break `brand-logo.tsx`
  (`src.startsWith`). The UI change that shows "Add brand" must handle both.
- Brand ids are one namespace across companies: a name whose id a brand of another company
  holds answers 409 `BRAND_TAKEN`, which tells the caller such a brand exists. Accepted while
  Mission Group is the only company.
- Not applied to production.
