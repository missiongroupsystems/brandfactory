# Members Phase A — the columns, the tables, and the backfill that makes the rest safe

**Plan:** `docs/executing/members-passwords-and-brand-access-plan.md`.
**Migration:** `0027_chief_prodigy`. **Wire:** unchanged. **Screens:** none.
**Behaviour:** none. Every column this adds is written and nothing reads it yet.

## What landed

Three columns on `users` — `role`, `must_set_password`, `deactivated_at` — two tables,
`user_brands` and `credential_audit`, and a unique index on `lower(email)`.

The vocabularies live twice on purpose, per the zod-⇄-pgEnum convention:
`packages/shared/src/member/role.ts` holds `WorkspaceRoleSchema`, `BrandRoleSchema` and
`CredentialAuditActionSchema`; `packages/db/src/schema/` holds the matching pgEnums.
`role.test.ts` pins the values each one refuses, which is what stops a member being
added to one side and not the other.

## The backfill is the point of the phase

The migration's generated half is unremarkable. Its hand-written half is why the phase
exists:

```sql
UPDATE "users" SET "role" = 'admin' WHERE "role" IS NULL;
INSERT INTO "user_brands" ("user_id", "brand_id", "role")
SELECT u."id", b."id", 'manager' FROM "users" u CROSS JOIN "brands" b
ON CONFLICT ON CONSTRAINT "user_brands_user_brand_key" DO NOTHING;
```

Every current user becomes an admin with every brand. That is not a judgement about any
of them — it is today's shared-access behaviour written down, so that on the day
enforcement lands in Phase C nothing visibly changes. A migration that closed access
and a migration that recorded it are two different changes, and doing them together is
how a deploy locks nine people out of their own tool.

The grants are written at `manager` even though every one of those users is also an
admin, so the rows are inert today. They exist so that demoting somebody out of `admin`
later does not silently take their brands away in the same edit. Two decisions stay two
decisions.

Verified on the dev database: 1 user, 1 admin, 1 flagged, 7 grants across 7 brands, all
`manager`.

## `must_set_password` needed no statement, and that is deliberate

`ADD COLUMN ... DEFAULT true NOT NULL` already leaves every existing row reading true,
which is the answer the owner asked for: a person with no password set is asked to set
one at their next sign-in.

**We do not ask GoTrue whether a password already exists**, and the migration says why.
`auth.users.encrypted_password` is GoTrue's own schema, and Launchpad's rule — *"nothing
in this repository reads GoTrue's schema directly, and a GoTrue upgrade can change it
with no notice"* — applies. The Admin API's `identities[]` does not settle it either,
because a magic-link sign-in also creates an `email` identity, so `provider: 'email'`
does not prove a password.

The default rests on a fact about our own code instead: this app has never had a
password screen, so nobody has chosen a password through it. That is checkable by
reading the repository, which an assertion about GoTrue's state is not.

## One thing that will abort the migration, correctly

`users_email_lower_idx` is a **unique** index on `lower(email)`. If production holds two
accounts differing only in the case of their address, this migration fails and nothing
is applied.

That is the right outcome. `users.email` is unique but case-sensitively, so `Bob@x.com`
and `bob@x.com` can both exist, and on a path that hands out a session two such rows are
a way to authenticate somebody as the wrong person. Launchpad has the same constraint,
reached the same gap, and names this index as its own owed fix — it resolves a sign-in by
verified email and has to *fail closed on ambiguity* because the index is missing. We
add the index and the ambiguity cannot arise.

Merge the rows by hand and run the migration again.

## The typed client caught the only drift

`pnpm typecheck` failed on `packages/server/src/test-helpers.ts` in three places the
moment the columns existed, because `User` is inferred from the schema and the fakes no
longer matched it. That is the contract-drift guard in `CLAUDE.md` doing its job on a
schema change rather than a route change.

The fakes now default to `role: 'admin'`, `mustSetPassword: false`,
`deactivatedAt: null` — today's behaviour — so every existing test keeps asserting what
it asserted before. A test about the gate sets them explicitly.

## Also in this commit

`supabase/.temp/` is ignored by git and by Prettier. The Supabase CLI writes a link
record and a version cache there; `format:check` was failing on a file the CLI owns.

## The gate

`typecheck` 0 errors. `lint` 0 errors. `format:check` clean.
**3072 tests pass, 174 skipped, 0 failed** across all 11 packages — the skips are the
`*.live.test.ts` files in `packages/db` that need `DATABASE_URL`.

`role.test.ts` contributes **9** of those, measured on its own. The total is not
comparable to 1.57.0's reported 3208: two marketing-requests commits landed after that
release and before this one, so the difference between the two figures is not this
phase's.
