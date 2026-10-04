# Members, invites and per-brand access

**Status:** proposed. Nothing built.
**Surface:** `packages/db` (two tables), `packages/server` (`authz.ts` + one route group),
`packages/web-next` (one screen). **Migrations:** two. **New dependency:** none —
`SUPABASE_SERVICE_KEY` is already set in production for storage.

## Why now

Three facts that only matter together:

1. **Supabase signups are open.** `POST /auth/v1/signup` reaches email validation rather than
   returning `signup_disabled`, so the gate is off.
2. **The anon key is public** — it ships in the browser bundle, by design.
3. **`authz.ts` does `void userId`** — every authenticated user reaches every workspace, and
   through the aggregate chain every brand, project, asset and contract.

So the live path is: read the anon key out of the deployed JavaScript, create an account with your
own email, sign in, and read every brand. Email confirmation does not help, because the attacker
uses an address they control.

Closing the Supabase gate stops that today. It also makes adding a person a dashboard errand,
which is the user management this app never had.

## The boundary: what is Passport's and what is ours

This is the decision worth making explicitly, because "wait for Passport" has been the answer for
seven weeks and the references to it are all forward-looking.

**Authentication is Supabase's today and Passport's later.** Who exists, who holds a credential,
how a session is proved. We should not build a second identity store, and nothing below does.

**Authorization is ours and always will be.** *Which brands may Natalie see* is a statement about
BrandFactory's own aggregates. Passport can tell us who somebody is and which organisation they
belong to; it cannot know that Chloe works on Chin Mee Chin and not on temper., because brands are
this product's nouns. `authz.ts` is already the single gate, and it says so.

So: build membership and brand scoping here. Call Supabase's admin API for the invite, behind a
thin seam Passport can replace.

## Two tables

**`workspace_members`** — `(workspace_id, user_id, role)`, primary key on the pair.
`role` is `admin | member`, a new `pgEnum`.

- `admin` may invite, revoke, change roles, and reaches **every** brand in the workspace.
- `member` reaches only the brands granted to them.

**`brand_members`** — `(brand_id, user_id)`, primary key on the pair. Presence is access.

**Two tables rather than one scoped row**, and no per-brand roles in this pass. A workspace admin
is a different kind of statement from a brand grant, and folding them together would mean
"admin" is maintained as a row per brand — a thing that drifts the first time somebody adds a
brand. One dimension of complexity at a time: who is an admin, and which brands a member sees.
Per-brand roles (edit versus read) can come later and would be a column on `brand_members`.

## `authz.ts` becomes real, in one function each

```ts
requireWorkspaceAccess  → a `workspace_members` row must exist
requireBrandAccess      → workspace admin, OR a `brand_members` row
requireProjectAccess    → unchanged; it already chains to the brand
```

Every route in the app already calls the helper for its aggregate, so nothing else moves. That
property is why 1.29.0 was safe to ship and is why this is a small edit rather than an audit.

Two reads to add to the `Db` facade, both by primary key.

## The invite, and the seam

`POST /workspaces/:id/members` — admin only.

```
{ email, role, brandIds[] }
```

The server, in one transaction plus one outbound call:

1. Calls Supabase admin `inviteUserByEmail` with the **service key** — creates the auth user and
   sends the invite mail. This is the only new outbound call, and it lives behind the existing
   `AuthProvider` port as `inviteUser`, so Passport replaces one method rather than a route.
2. Inserts the `users` row from the id Supabase returns, rather than waiting for
   auto-provision — we need the id now to write membership.
3. Inserts `workspace_members`, and `brand_members` for each granted brand.

`DELETE /workspaces/:id/members/:userId` — removes the membership rows **and** disables the
Supabase user. Removing only our rows would leave a credential that still authenticates, and the
auto-provisioner would recreate the `users` row on the next request. Revocation that leaves a way
back in is not revocation.

`PATCH` on the same path changes role and brand grants.

**The last admin cannot be removed or demoted.** A workspace with no admin cannot invite anybody,
and the only fix would be SQL. The route refuses it.

## The screen

`/settings/members` in `web-next`, workspace-scoped, admin-only: the member list with role and
brand count, an invite sheet (email, role, brand checkboxes), role and brand editing, and revoke
behind a confirm. Members see their own row and nothing else.

A read-only list for a non-admin is pointless, so the nav row only appears for admins — the same
honesty rule the `Empty` and `Sample` tags follow.

## Order, and why this order

**Phase A — tables and backfill. No behaviour change.**
Migration creates both tables and inserts `workspace_members(role: 'admin')` for **every existing
user**. Nine rows. Nothing reads them yet.

This is the step that makes everything after it safe: on the day enforcement lands, every current
user already has exactly the access they have today.

Alongside it, and not code: **close the Supabase signup gate.**

**Phase B — enforcement.** `authz.ts` starts reading the tables. Because every existing user is an
admin, nothing visibly changes. A new self-signed-up account now reaches nothing, which is the
point.

**Phase C — invite and revoke routes**, plus `inviteUser` on the auth port.

**Phase D — the screen.**

**Phase E — not code.** Demote the people who should be members, and grant brands. Until somebody
does this, everyone is an admin and the model is as open as it is today — the difference being that
it is now a deliberate data state rather than a missing feature.

## What this does not do

- **No per-brand roles.** Access is binary. Edit-versus-read is a later column.
- **No groups or teams.** Nine users do not need a group abstraction.
- **No audit log.** Worth having, and a bigger piece than this. The calendar's `approved_by` is
  the only provenance the app records today.
- **No SSO or domain allowlist.** That stays Supabase's, and is worth setting there regardless:
  restricting Google to your Workspace domains closes the passwordless version of the same hole.
- **No second identity store.** Supabase holds the credential throughout.

## The open question for whoever reviews this

Does Passport have a date? If it lands within a few weeks, phases C and D are arguably its work
and we should do A and B only — they close the hole and cost two tables and one function. If it
does not, all five phases belong here.

A and B are worth doing either way, and they are the urgent half.
