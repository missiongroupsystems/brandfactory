# Members Phase D — the routes an administrator actually uses

**Plan:** `docs/executing/members-passwords-and-brand-access-plan.md`.
**Migration:** none — Phase A wrote the tables. **Wire:** six routes under `/members`.
**Port:** `AuthProvider` gains `holdsPasswords`, `createUser`, `deleteUser`,
`setSuspended`. **Screens:** none — Phase E.

## The routes

```
GET    /members                   list, with each person's brand grants
POST   /members                   create: provider account, then our row, then grants
PATCH  /members/:id               display name, workspace role, brand grants
POST   /members/:id/password      reset somebody else's, and flag them
POST   /members/:id/deactivate    reversible
POST   /members/:id/reactivate
```

**Admin only by its mount.** `app.ts` puts `createAdminMiddleware()` on the whole
prefix, so there is no per-route check to forget. Launchpad's equivalent file carries
four inline `user.adminRole !== 'admin'` checks because it has two admin roles with
different powers; we have one, and a mounted middleware is both the rule and a complete
statement of what it covers.

The prefix also carries the **password gate**. An administrator holding a password
somebody else chose is not an exception to it, and there is a test saying so.

⚠️ **No self-service route may be added here.** A person's own password is
`POST /me/password`, under the prefix this app already uses for everything about the
caller. Launchpad keeps both under `/users`, which puts `POST /users/me/password` and
`POST /users/:id/password` in one file where Hono's declaration order decides which wins
— it warns about that three times. Ours cannot collide, and adding a self-service route
to this prefix would reintroduce the trap *and* put it behind the admin gate.

## The create order is forced, not stylistic

1. Refuse an address that already exists, naming it — so the administrator gets a
   sentence rather than a 500 from a unique index. Phase A's `lower(email)` index is
   still the backstop, and the email is lower-cased on the way in.
2. Create the identity-provider account, with the password the administrator chose.
3. Write our `users` row **keyed to the id the provider returned**, plus the grants.
4. Delete the provider account if step 3 throws.
5. Write `set-on-create` to the audit.

Step 3 is why the order cannot be reversed. `users.id` **is** the Supabase `sub`, and
`upsertUserById` conflicts on that column only — so a row written with a fresh uuid
collides on `email` the first time its owner signs in, the adapter swallows that error,
and the row is unreachable forever. Phase A found that reading the code; this is the
phase where it constrains something.

Step 4 is Launchpad's compensation and its reason holds: without it the provider holds
an account we have no row for, and every retry answers a conflict there with nothing
here to show for it. A test drives a create whose insert collides and asserts the
provider delete happened.

**`holdsPasswords`, not a provider name.** `CLAUDE.md` forbids naming a vendor in domain
code, and the question the route is asking is a capability. On the local dev provider no
credential exists, so *an administrator chose this account's password* is a vacuous
claim — the route asks for no password and flags nothing. Flagging would park every dev
account on a screen `setPassword` then refuses to satisfy.

## `viewer` is refused on the wire, and that is the honest half of Phase C

Phase C enforces that a grant *exists*. It does not enforce `viewer` against `editor`,
because that needs a write gate on every mutating route. So the wire refuses the one
value whose meaning is not yet real:

```ts
export const GrantableBrandRoleSchema = BrandRoleSchema.refine((r) => r !== 'viewer', {
  message: 'viewer access is not available yet — per-role write rules are not built',
})
```

The vocabulary stays whole in the database and no row can carry a restriction nothing
applies. Somebody setting `viewer` and believing writes were blocked would be wrong, and
that is worse than not offering the option. Deleting that refinement opens the enum, so
it is the thing to delete when the write gate lands — not before.

## Grants are diffed, never replaced

`setBrandGrants` compares what is stored with what was sent and issues inserts, role
updates and deletes inside one transaction. Launchpad's note is the reason:

> *"`users.update` used to delete every row and re-insert. … a burst of writes, and a
> window in which a concurrent read sees them on no team project at all."*

Here the window is smaller and worse-shaped: a concurrent request from the person being
edited would be refused a brand they are **keeping**, because for a moment the grant did
not exist. Saving a profile must not log somebody out of a brand.

The diff also makes the audit truthful — a role change records `role_changed`, not a
revoke followed by a grant. And an **omitted** `brands` field means *leave as is*: a
screen saving a display name must not silently empty somebody's access. Both have tests.

## Three guards, in the service

- **No self-demotion.** Distinct from the last-admin guard and it catches a case that one
  does not: an administrator dropping their own role on the screen whose job is granting
  it.
- **No self-deactivation.**
- **No resetting your own password here.** Launchpad's reason is the sharpest of the
  three: an administrator who did *"would flag themselves into the change screen with no
  admin left to free them."*
- **The last active admin cannot be demoted or deactivated.** A workspace with none
  cannot add or restore anybody, and the only way back is SQL against production.
  Launchpad guards this on delete and **not** on its role edit, so a full admin there can
  demote the last one; both paths are guarded here, and `countActiveAdmins` ignores
  deactivated rows so the guard means *last usable admin*.

## Two orders, deliberately opposite

Deactivate writes our column **first** and suspends at the provider after, failing
softly. Reactivate lifts the provider ban **first** and propagates its failure.

Each is ordered so a half-completed call leaves the account *less* reachable, not more.
`deactivated_at` is the boundary, so writing it first means the gate is already closed if
the provider call fails — and a provider error then is a live credential nobody can use,
not a failed deactivation. Reporting it as one would invite a retry that looks like the
first attempt never worked. Restoring access is the mirror: a 200 has to mean both halves
are true, or an administrator records access the person cannot use and has no way to tell.

I wrote the comment for `reactivate` before the code and then wrote the code the other
way round. The comment was right, so the code changed to match it.

## The audit is written and still unread

One row per act, FK-free, with the emails denormalised. `writeAudit` never throws into
the caller's path and never joins the caller's transaction — Launchpad's audit write held
an FK to `users`, took `FOR KEY SHARE` on a row the request's own transaction held
`FOR UPDATE`, and **every user create deadlocked for two months.** A lost audit row is a
smaller harm than a create that hangs.

A test asserts the password never appears anywhere in what was written.

⚠️ **Nothing reads the table.** An unread audit table returns zero rows and no error,
which reads as *nobody has ever done anything*. The reader is still owed.

## Live tests, because the fake cannot prove the database

`packages/db/src/members.live.test.ts` — six tests, skipped without `DATABASE_URL`, all
passing against the dev database. They cover what only real Postgres can answer, and
each one is something the fake mirrors in JavaScript without evidence:

- **the `lower(email)` unique index exists and refuses a case-variant address.** The fake
  lower-cases and compares in memory, which proves nothing about migration 0027.
- the grant diff inside a real transaction, and its idempotence.
- `user_brands` cascading away with the person.
- `countActiveAdmins` ignoring a deactivated admin.
- `credential_audit` accepting a row whose ids reference nothing, which is the point of
  the missing foreign keys.

## The enumerating test earned its keep

`app.test.ts` reads the prefixes the app registered rather than holding its own list, and
adding `/members` failed it immediately — `expected [ … 4 more ] to deeply equal [ … 3
more ]`. That is the test doing exactly what Phase B built it for: a new top-level prefix
has to be added to the authentication mount list and the password-gate mount list, and
forgetting the second is otherwise invisible.

## The gate

`typecheck` 0 errors across all 11 packages. `lint` 0 errors and 0 warnings, root and
`web-next`. `format:check` clean. Both frontends build.

**3151 tests pass, 180 skipped, 0 failed** — up 27 from Phase C's 3124. The skipped
count rose by 6: `members.live.test.ts`, which needs `DATABASE_URL`. Those six pass when
it is set, and they were run that way before this was committed.
