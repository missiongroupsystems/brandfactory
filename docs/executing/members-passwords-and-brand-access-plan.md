# Members, first passwords and per-brand access

**Status:** proposed. Nothing built. Written 4 October 2026, rewritten 5 October.
**Supersedes** two earlier drafts of this file:
the first was wrong about where the door is, the second built an emailed invite the
owner does not want.
**Surface:** `packages/db` (three columns, two tables), `packages/server` (a gate
module, one route group, one adapter change), `packages/web-next` (one screen, one
sign-in path, one forced screen).
**Migrations:** one. **New dependency:** none.

This plan copies Launchpad's pre-Passport user management, surveyed in full on
4 October 2026, and specifically its **pre-`0.9.208`** onboarding — the version where
an admin set the first password. Launchpad later replaced that with an emailed invite;
we are deliberately taking the earlier design, and the machinery for it is still in
its codebase. Where this plan departs from Launchpad, the departure is named.

## What the earlier drafts got wrong

**Draft one led with the open Supabase signup endpoint** and proposed closing it in the
dashboard. The owner accepted that risk and deferred it, which left the draft with no
stated reason to exist. The reason is better than the one it gave, and it is ours to
fix in code:

`packages/adapters/auth/src/supabase.ts:70` creates a `users` row for any email it has
never seen, and `authz.ts` then admits that row to every workspace, brand and project.
**The auto-provisioner is the door, not the signup endpoint.** Launchpad states the
rule we lack: *"Never provision for a non-member. A valid token proves who somebody is,
not that they belong here."* Close that and the signup endpoint stops mattering. A
stranger may still mint a valid Supabase token with the public anon key; they reach a
401 instead of seven brands. No dashboard change, so a settled decision stays settled.

**Draft two required a mailer we do not have.** It copied Launchpad's `generateLink` →
own-domain `/auth/confirm` → SendGrid chain, which is the right design for a product
that already sends mail. It is one new outbound dependency, one secret and one page for
nine people. The owner's answer is the Google Admin Console model instead, below.

## A live constraint we found while checking

`upsertUserById` conflicts on `users.id` only, and the adapter passes the JWT `sub` as
that id. A row created by any other path keeps its own random uuid, the insert then
violates `users_email_unique`, the adapter swallows the error, and `getUserById(sub)`
misses. **A `users` row not keyed to the Supabase `sub` is unreachable.**

So the admin create must make the Supabase auth account first, then write our row with
the `sub` Supabase returns. That is a constraint, not a preference. Launchpad reached
the same order by another route and paid for the alternative: its
`on_auth_user_created` trigger plus `ON CONFLICT DO UPDATE` caused a production
deadlock documented across 221 lines.

We keep `users.id = sub` and add no `supabase_id` column. One Supabase project issues
every token, so there is one `sub` per person — provided GoTrue links a Google identity
to the existing account when the address is already confirmed, which is its default.

**This is no longer a blocker, and that is a consequence of the new design.** If the
linking does not happen, a Google sign-in mints a second `sub`, finds no `users` row
and gets a 401. That is a closed door the person reports in a sentence, not silent
wrong access — and with a password now the primary path, the workaround is to use it.
Worth confirming, not worth waiting on. Read it with:

```bash
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  https://api.supabase.com/v1/projects/spffglhadlkfrkmbhzdv/config/auth | jq
```

## Onboarding: the admin sets the first password

The Google Admin Console model. An admin creates the account and chooses a first
password. The person signs in with that password **or** with Google. Either way, their
first authenticated request lands on one screen: choose your own password. Until they
do, they reach nothing else.

This is Launchpad before `0.9.208`, and the evidence that it ran is still in its code:
`admin_password_audit` records the action `'set-on-create'`, `users` carries
`must_change_password`, and `features/users/` still ships `set-password-dialog.tsx`,
`password-control.tsx` and a browser-side `password.ts` with its own test file.

Three things make this a gate rather than a suggestion. Each is a bug Launchpad already
paid for.

**1. A prompt is not a gate; the flag is enforced on the server.** A flagged user may
call exactly three paths — read themselves, set their own password, sign out. Every
other route refuses. Without that, a person holding a password their admin chose can
still call the whole API, and the redirect is decoration. Launchpad allow-lists those
three paths in middleware, and warns three times in one file that the route order
carrying them is load-bearing: Hono matches in declaration order, so
`POST /members/me/password` must be declared **before** `POST /members/:id/password`,
or an admin-only route swallows the one path a flagged user needs.

**2. The password is generated in the browser, never on the server.** Launchpad's
`password.ts` is a browser-side generator and validator. The admin reads the value from
their own screen; the server receives it over TLS, hands it to Supabase and stores
nothing. The audit row records **that** a password was set and **who** set it, never
what it was. Launchpad's note: *"⚠️ IT STORES NO PASSWORD, and it never will."*

**3. The status line says "Temporary password", not "Has not signed in yet."** An admin
reset sets the same flag, so the second wording is a flat untruth about somebody who has
used the product for a year. Launchpad shipped the first wording after catching exactly
that.

### Google does not clear the flag, and that is correct

A person who signs in with Google still has to set a password. This looks like friction
and is not: until they do, a password their admin chose is a live credential on their
account, usable by anyone who saw it on the admin's screen or in the message that
carried it. Clearing the flag on a Google sign-in would leave that credential standing
with nothing prompting its replacement. Launchpad lists the analogous case as a known
risk — *"a temporary-password user who redeems a link stays flagged."*

One consequence for the screen: it **sets** a password, it does not **change** one.
There is no current-password field. A Google user has none to supply, and Supabase's
`updateUser({ password })` on a live session does not ask for the old one.

### Existing users

Nine people hold accounts today and none has a password set through this app, because
this app has never had a password screen. The migration therefore backfills the flag to
`true` for all of them, and each sets a password at their next sign-in.

**We do not try to detect whether a password already exists.** Two ways to ask, both
rejected:

- `auth.users.encrypted_password` is GoTrue's own schema. Launchpad's rule:
  *"nothing in this repository reads GoTrue's schema directly, and a GoTrue upgrade can
  change it with no notice."*
- The Admin API's `identities[]` does not settle it. A magic-link sign-in also creates
  an `email` identity, so `provider: 'email'` does not prove a password.

The backfill needs neither, because it rests on a fact about our code rather than an
inference about GoTrue's state. From then on the flag is authoritative: set on admin
create, cleared only when the person sets their own password.

### What we still get for free

Skipping the mailer does not leave anyone stranded. **Supabase already sends recovery
mail** from dashboard configuration — that is the path fixed on 21 August when the
sender moved to `missionsystems.ai`. So *forgot password* works today with nothing
built, and it is the self-service route for anybody whose temporary password goes
missing before they use it.

`packages/web-next/src/auth/sign-in-panel.tsx` gains `signInWithPassword` alongside the
magic link and Google it has now. The magic link stays: it is a working way in that
costs nothing, and it does not bypass anything, because the flag still forces the
set-password screen behind it.

## The model

Three changes, one migration.

**`users` gains three columns.**

- `role` — a `pgEnum` with one value, `admin`, nullable. Null is an ordinary member.
- `must_set_password` — boolean, not null, default true.
- `deactivated_at` — nullable timestamp. Presence revokes at the gate.

Launchpad names its flag `must_change_password`. Ours says `set`, because the screen
sets rather than changes, and the Google case is precisely why that distinction is real.

Launchpad stores its admin role as **bare text**, and that cost it a shipped bug: an
unrecognised value fell through to *no admin access*, so editing somebody's phone
number revoked their administrator access with nothing said. It handles the symptom with
a rule worth knowing — offer the stored value as its own option, and warn above every
field. We remove the cause instead: two values and a `pgEnum` mean the database refuses
junk. We also skip `hr_manager`, the split that leaves Launchpad's `routes/users.ts`
carrying four inline `adminRole !== 'admin'` checks. At nine people it is pure cost.

**`user_brands`** — `(user_id, brand_id, role)`, `unique(user_id, brand_id)`,
`on delete cascade` from `users`. `role` is a `pgEnum`: `viewer | editor | manager`.

Draft one proposed two tables and binary access. One table with a role is right.
Launchpad's `user_brands` has no role column, documents around the gap, and — the
finding that matters most here — **is empty in production.** Its own code says so:

> *"⚠️ Phase 0 F1: `user_brands` is EMPTY in production, so a `brand` recipient resolves
> to nobody here too. The route is right and the data is missing."*

So Launchpad is the gold standard for the admin screen, the password surface and the
service guards, all of which run daily. Its per-brand access is built and has never
carried data. We are the first to use that shape, which is a reason to give it a role
column now and a reason to read its reasoning rather than trust its runtime.

**`credential_audit`** — `actor_id`, `actor_email`, `subject_id`, `subject_email`,
`action` (`set-on-create | reset | granted | revoked | role_changed | deactivated |
reactivated`), `brand_id`, `from_role`, `to_role`, `created_at`. **No foreign keys.**

One table covers both credential acts and membership changes. Launchpad has a table for
the first and audits the second **not at all** — its biggest gap, which it names. The
FK-free shape is its conclusion after the deadlock: *"An audit row is a record of an
act, not a relationship. With the FK gone, a hard delete leaves the id standing, which
is more information, not less."* Emails are denormalised for the same reason.

A person setting **their own** password writes no row. Launchpad's reasoning:
*"`admin_password_audit` logs ADMIN acts on OTHER people's credentials; a person
choosing their own password is not one, and logging it would make the table answer a
different question than its name."*

One warning comes with the table: an unread audit table returns zero rows and no error,
which reads as *nobody ever did anything*. Ship a reader or ship nothing.

Alongside the migration, a **unique index on `lower(email)`**. Launchpad's `users.email`
is unique but not case-insensitively, so `Bob@x.com` and `bob@x.com` can both exist, and
it names the index as its own owed fix. One line, on day one.

## One gate module

`authz.ts` keeps its three functions and stops doing `void userId`. A new module exports
the rules as pure functions:

```ts
isActive(user)                 // !deactivatedAt
isAdmin(user)                  // role === 'admin' && isActive(user)
mustSetPassword(user)          // the flag
brandRole(user, brandId)       // the user_brands role, or null
canReadBrand(user, brandId)    // admin, or any role
canWriteBrand(user, brandId)   // admin, or editor | manager
```

`requireWorkspaceAccess` admits an active user. `requireBrandAccess` calls
`canReadBrand`. `requireProjectAccess` chains to the brand unchanged. Every route
already calls the helper for its aggregate, which is why 1.29.0 was safe to ship and
why this is a small edit rather than an audit. The flagged-user allow-list sits in
middleware, ahead of all of it.

**We do not copy RLS.** The largest departure. Launchpad's session-variable RLS bought
defence in depth and cost it: a request-long transaction that became a connection-pool
crisis, an invisible bug where a policy's own subquery was filtered and silently
returned one row, four tables needing explicit `REVOKE` plus a "read this through
`baseDb`" rule, and a replay harness built only so a policy could be changed safely. At
nine users, one workspace and a trusted server, one tested gate function is the honest
boundary. RLS can land later as a second rail over a model that already works.

The house rule comes with the gate, from Launchpad's `CLAUDE.md:343`:

> *"Permission gates are computed, never attempted … it is a rendering gate, not a
> security boundary — the service re-checks everything, so getting it wrong makes the
> UI wrong, never the data."*

So the client imports the same pure functions, and controls are **hidden, not disabled**.

## Routes

```
POST   /members                      admin   create: auth account, then our row, then brands
PATCH  /members/:id                  admin   role, brands, display name
POST   /members/me/password          any     set your own; clears the flag   ← declare first
POST   /members/:id/password         admin   reset; sets the flag
POST   /members/:id/deactivate       admin   reversible
POST   /members/:id/reactivate       admin
GET    /members                      admin
GET    /members/me                   any     on the flagged allow-list
```

Create, in order, because the constraint above forces it:

1. Refuse an address outside the allowed domains — a hardcoded constant, not Launchpad's
   table and screen. Its own comment concedes the table stopped being a security
   boundary and is now a typo guard, and names the trap it leaves: *"`@gmial.com` is a
   real way to create an account nobody can sign into."*
2. `createUser({ email, password, email_confirm: true })`.
3. Insert our `users` row keyed to the returned `sub`, with `must_set_password = true`,
   plus the `user_brands` rows — one transaction.
4. Delete the auth account if that transaction throws. Launchpad's compensation, and
   without it the admin's retry answers 409 forever.
5. Write `set-on-create` to the audit.

## Revocation

`deactivated_at` set, plus a GoTrue ban, both reversible. Launchpad bans for `876600h`
— about a hundred years — and comments *"ban, not delete — preserves audit trail"*.

We do not copy its three-way lifecycle. Launchpad has a soft delete, a ban and a hard
delete with a transfer/delete-all fork and a thirteen-metric footprint, and **no route
reaches the soft delete** — it is dead code. For nine people, reversible deactivation is
what is wanted. A hard delete can come later behind a typed-email confirmation.

Three guards, in the **service** rather than the route or the screen:

- **The last admin cannot be demoted or deactivated.** Launchpad guards this on delete
  and not on `PATCH`, so a full admin there can demote themselves and lose the screen.
  We guard both paths.
- **No self-deactivate and no self-role-change.**
- **No self-reset.** Launchpad's reason, which is the sharpest of the three: an admin who
  reset their own password here *"would flag themselves into the change screen with no
  admin left to free them."*

We also **skip the auth cache**. Launchpad caches the resolved user for 60 seconds and
every writer must call `invalidateAuthCache`; its own comment calls that *"the most
dangerous line in this function"*, because a missed clear leaves the app refusing after a
success — the hardest shape to attribute. A per-request select of a nine-row table is
free, and the flag has to be read fresh on every request anyway.

## The screens

**`/settings/members`**, admin only, built in Launchpad's layering because that layering
is why its rules are testable:

```
model.ts      pure rules, gates, labels; no React and no network imports
backend.ts    the only file that knows a request happens
hooks.ts      SWR reads, mutations, and a stated invalidation policy
components/   the table, the sheet, the password dialog
```

One table — name and email, brands with roles, access badge, status. No pagination and
no filters; Launchpad's 200-row cap with four URL-synced filters and in-memory narrowing
is for a different headcount, and its own comment concedes real pagination is the honest
fix past 200. Row actions **hidden, not disabled**, and every one suppressed on the
viewer's own row.

**The set-password screen**, forced. Any authenticated person whose flag is set lands
here and cannot leave it. It sets rather than changes, so no current-password field.
Shared validation with the create form, in `model.ts`, so the rule cannot drift between
the password an admin picks and the one a person picks.

Four details to copy exactly:

- **Nothing is optimistic.** The server applies rules the client cannot predict — the
  domain constant, a duplicate email, the last-admin guard — so its answer is the only
  one worth rendering.
- **`undefined` and `null` are different answers.** `undefined` means the server could
  not find out; `null` means there is nothing to show. Neither is *pending*, so neither
  may draw a label that says so.
- **A not-yet state is not a refusal.** Drawing *you are not an administrator* during the
  first second of a cold load flashes it at an administrator. Draw nothing.
- **Hide the nav row, and still answer in words** to somebody arriving from a bookmark.
  Launchpad: *telling them this is an administrators' page costs nothing and answers the
  question a 404 leaves open.*

## Order

**Phase A — schema and backfill. No behaviour change.** The migration adds the three
columns, the two tables and the `lower(email)` index, then sets `role = 'admin'` and
`must_set_password = true` for every existing user and writes a `user_brands` row per
user per brand. Nothing reads them yet.

This is what makes everything after it safe: on the day enforcement lands, every current
user already has exactly the access they have today.

**Phase B — the set-password gate.** The middleware allow-list, the forced screen, and
`POST /members/me/password`. All nine set a password. Ship this before the door closes,
so the flag is cleared by people who can already sign in.

**Phase C — close the door.** `verifyToken` stops creating rows for unknown subjects; an
unknown token resolves to no user and the request answers 401. `authz.ts` starts reading
the columns. Because every existing user is an admin with every brand, nothing visibly
changes.

Between C and D no route adds a person, so an admin adds one with SQL. That window is
days at this size, and the alternative is leaving the door open longer.

**Phase D — the gate module and the remaining routes**: create, reset, deactivate.

**Phase E — the screen.**

**Phase F — not code.** Demote the people who should be members and narrow their brands.
Until somebody does this, everyone is an admin with every brand and the model is as open
as it is today — the difference being that it is a deliberate data state rather than a
missing feature.

## Tests

Launchpad's testable surface is its pure functions, and we copy that:

- the gate's truth table — admin, brand member by each role, non-member, deactivated,
  flagged
- the flagged allow-list: exactly three paths pass, and a fourth is refused
- the provision rule: an unknown subject resolves to nothing, and a case-variant address
  cannot create a second row
- the last-admin, self-reset and self-deactivate refusals
- the password validator, shared by both forms
- a **route-declaration-order test**. `/members/me/password` and `/members/:id/password`
  collide, and Launchpad warns three times in one file: *"Do not reorder this file to
  group the two password routes together."* One `Set` of registered paths, and a guard
  against a vacuous pass.

## What this does not do

- **No emailed invite and no mailer.** Deliberate. Supabase's own recovery mail covers
  the case a temporary password goes missing.
- **No teams or groups.** Nine users do not need a group abstraction, and Launchpad's
  materialised team inheritance through triggers exists for a larger estate.
- **No access-request queue.** A vestige of self-signup, which Launchpad has since
  deleted. Do not build an approval queue for a door we are not opening.
- **No second identity store.** Supabase holds the credential throughout.
- **No audit reader.** The table is written from phase D. Reading it is a later piece,
  and the warning above applies: an unread audit table is indistinguishable from an
  empty one.
- **No password-age or rotation policy.** The flag answers *has this person chosen their
  own password*, which is a different question from *how old is it*.
- **Nothing from Passport.** Launchpad does not conform to it today either. If
  BrandFactory joins it later, three rules transfer: resolve by verified email and never
  by `sub`; a removed member is a tombstone you keep; and membership is not access.
