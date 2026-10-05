# Members, first passwords and per-brand access — Phases A to E

**Plan:** `docs/completions/members-passwords-and-brand-access-plan.md`. **Released in:** 1.58.0.
**Migration:** `0027_chief_prodigy` — three columns, two tables, one unique index.
**Wire:** `POST /me/password`, and six routes under `/members`.
**Port:** `AuthProvider` gains `setPassword`, `createUser`, `deleteUser` and `setSuspended`, plus a
`holdsPasswords` capability flag.
**Screens:** a forced set-password screen and a terminal no-access screen in **both** frontends,
password sign-in on `/sign-in`, and `/settings/members`.
**New dependency:** none.

One document for all five phases. Phase F was retired rather than completed — the last section says
why.

## Why it was five phases, and why the deploy order is not the commit order

| Phase | What it closed | Visible change |
| --- | --- | --- |
| A | Three columns, two tables, and a backfill that recorded today's access | None — everything written, nothing read |
| B | The set-password gate, and the screen behind it | Everybody is asked to choose a password |
| C | The auto-provisioner, which was the door | A stranger holding a valid token meets a refusal |
| D | Six admin routes: create, patch, reset, deactivate, reactivate | None — no screen yet |
| E | `/settings/members` | An administrator can add somebody, and take it back |

⚠️ **Phase B must be in production, and all nine people must have set a password, before Phase C
lands.** The flag has been true for every one of them since Phase A's migration. Phase C does not
change that, but it does mean an account that cannot complete Phase B's screen has no other way in.

The split is not bookkeeping. A migration that closed access and a migration that recorded it are
two different changes, and doing them together is how a deploy locks nine people out of their own
tool.

## Phase A — the columns, the tables, and the backfill that makes the rest safe

**Migration:** `0027_chief_prodigy`. **Wire:** unchanged. **Screens:** none.
**Behaviour:** none. Every column this adds is written and nothing reads it yet.

Three columns on `users` — `role`, `must_set_password`, `deactivated_at` — two tables,
`user_brands` and `credential_audit`, and a unique index on `lower(email)`.

The vocabularies live twice on purpose, per the zod-⇄-pgEnum convention:
`packages/shared/src/member/role.ts` holds `WorkspaceRoleSchema`, `BrandRoleSchema` and
`CredentialAuditActionSchema`; `packages/db/src/schema/` holds the matching pgEnums. `role.test.ts`
pins the values each one refuses, which is what stops a member being added to one side and not the
other.

### The backfill is the point of the phase

The migration's generated half is unremarkable. Its hand-written half is why the phase exists:

```sql
UPDATE "users" SET "role" = 'admin' WHERE "role" IS NULL;
INSERT INTO "user_brands" ("user_id", "brand_id", "role")
SELECT u."id", b."id", 'manager' FROM "users" u CROSS JOIN "brands" b
ON CONFLICT ON CONSTRAINT "user_brands_user_brand_key" DO NOTHING;
```

Every current user becomes an admin with every brand. That is not a judgement about any of them —
it is today's shared-access behaviour written down, so that on the day enforcement lands in Phase C
nothing visibly changes.

The grants are written at `manager` even though every one of those users is also an admin, so the
rows are inert today. They exist so that demoting somebody out of `admin` later does not silently
take their brands away in the same edit. Two decisions stay two decisions.

Verified on the dev database: 1 user, 1 admin, 1 flagged, 7 grants across 7 brands, all `manager`.

### `must_set_password` needed no statement, and that is deliberate

`ADD COLUMN ... DEFAULT true NOT NULL` already leaves every existing row reading true, which is the
answer the owner asked for: a person with no password set is asked to set one at their next sign-in.

**We do not ask GoTrue whether a password already exists**, and the migration says why.
`auth.users.encrypted_password` is GoTrue's own schema, and Launchpad's rule — *"nothing in this
repository reads GoTrue's schema directly, and a GoTrue upgrade can change it with no notice"* —
applies. The Admin API's `identities[]` does not settle it either, because a magic-link sign-in also
creates an `email` identity, so `provider: 'email'` does not prove a password.

The default rests on a fact about our own code instead: this app has never had a password screen, so
nobody has chosen a password through it. That is checkable by reading the repository, which an
assertion about GoTrue's state is not.

### One thing that will abort the migration, correctly

`users_email_lower_idx` is a **unique** index on `lower(email)`. If production holds two accounts
differing only in the case of their address, this migration fails and nothing is applied.

That is the right outcome. `users.email` is unique but case-sensitively, so `Bob@x.com` and
`bob@x.com` can both exist, and on a path that hands out a session two such rows are a way to
authenticate somebody as the wrong person. Launchpad has the same constraint, reached the same gap,
and names this index as its own owed fix — it resolves a sign-in by verified email and has to *fail
closed on ambiguity* because the index is missing. We add the index and the ambiguity cannot arise.

Merge the rows by hand and run the migration again.

### The typed client caught the only drift

`pnpm typecheck` failed on `packages/server/src/test-helpers.ts` in three places the moment the
columns existed, because `User` is inferred from the schema and the fakes no longer matched it. That
is the contract-drift guard in `CLAUDE.md` doing its job on a schema change rather than a route
change.

The fakes now default to `role: 'admin'`, `mustSetPassword: false`, `deactivatedAt: null` — today's
behaviour — so every existing test keeps asserting what it asserted before. A test about the gate
sets them explicitly.

### Also in this phase

`supabase/.temp/` is ignored by git and by Prettier. The Supabase CLI writes a link record and a
version cache there; `format:check` was failing on a file the CLI owns.

## Phase B — the gate, and the one screen behind it

**Migration:** none. **Wire:** one new route, `POST /me/password`. **Screens:** a forced
set-password screen in **both** frontends, and password sign-in on `/sign-in`.
**Port:** `AuthProvider` gains `setPassword`.

Phase A wrote `must_set_password` and nothing read it. This phase makes it mean something: an
account whose password an admin chose can read itself and replace that password, and nothing else.

The important half is not the screen.

> ⚠️ **A frontend that redirects a flagged reader to a set-password page has improved the experience
> and closed nothing.** The session is valid, so every route still answers a direct call.

So the refusal lives in `middleware/password-gate.ts`, mounted per prefix in `app.ts`. The screens
are the courteous half, and both say so in their own docblocks.

### The allow-list is a mount point, not a list of strings

`app.ts` mounts the gate on `/workspaces`, `/brands`, `/projects`, `/blob-urls` and `/research` —
and on `/members` from Phase D — and deliberately not on `/me`. The two routes a flagged person
needs are reachable because of **where they live**, not because a string comparison exempted them.
Signing out needs nothing from us — it is a Supabase call in the browser.

This also removes a trap rather than inheriting one. Launchpad keeps its self-service password route
under the same `/users` prefix as its admin routes, so `POST /users/me/password` and
`POST /users/:id/password` sit in one file where Hono's declaration order decides which wins. It
warns about that three times:

> *"⚠️⚠️ **REGISTRATION ORDER IS LOAD-BEARING AND THE CORRECT ORDER LOOKS ARBITRARY.** …
> **Do not reorder this file to group the two password routes together.**"*

Ours is under `/me`, where this app already keeps everything about the caller, so the two paths
cannot collide at all. The route-order test the plan called for is therefore **not** built: it would
assert against a collision that no longer exists, and a test that cannot fail is worse than no test.
Phase D's `/members/:id/password` does not reintroduce it, because the self-service route is not its
sibling.

### The mount list has a test that enumerates it

The next person to add a top-level prefix must add it twice — once for authentication, once for the
gate. Forgetting the second is invisible: the new routes authenticate correctly and answer a flagged
account.

So `app.test.ts` does not keep its own copy of the list. It reads the prefixes the app actually
registered from `app.routes`, subtracts three that are open for stated reasons (`/me`, `/blobs`,
`/health`), and requires every remaining one to refuse a flagged caller with `PASSWORD_NOT_SET`.

Checked against a deliberate break: removing `app.use('/brands/*', passwordSet)` fails it with
`/brands let a flagged caller through: expected 404 to be 403`. A first assertion pins the derived
list so a pass cannot go vacuous if `app.routes` ever stops reporting what the test reads.

### The hole the mount-list test could not see

Three paths stay outside the authentication gate on purpose, and `/rt` is the one that mattered. It
verifies its own token and **ends at the WebSocket upgrade**, so it never enters the Hono middleware
chain — `createPasswordGateMiddleware` does not cover it, and the mount-list test above cannot see
it either, because it reads `app.routes`.

Without a second check there, an account holding a password its admin chose is refused every HTTP
route and can still subscribe to a project channel and read the canvas traffic flowing through it.
`authorizeChannel` would not stop it: it walks the aggregate chain to `requireWorkspaceAccess`,
which admits every authenticated user today.

So `ws.ts` repeats the check in its `authenticate` hook and refuses the connection outright rather
than per channel — there is nothing a flagged account is entitled to read there, so there is no
channel worth evaluating. Two tests cover it, and they reach the hook through
`bindToNodeWebSocketServer` rather than asserting on a comment.

The other two are fine as they are. `/health` is a probe with optional auth. `/blobs` takes a signed
URL as its capability, and the route that mints one — `/blob-urls` — is gated, so an account that
has been flagged since it was created holds none.

**The lesson Phase C inherited**: that phase closes the door on accounts with no `users` row, and
`ws.ts` needed the same repetition for the same reason. The middleware chain is not the whole
perimeter.

### The server sets the password, not the browser

Supabase would let the client call `updateUser({ password })` with its own session and then ask us to
clear the flag. A client that skipped the first call would get the flag cleared anyway, and the flag
would then claim something false about the account.

Both halves go through `POST /me/password`, so the flag can only be cleared by a path that actually
set a password. The order inside the handler is load-bearing in the other direction too: the provider
is called **first**, and the flag is cleared only after it accepts. Clearing first and failing second
leaves somebody past the gate holding a credential their admin still knows. There is a test for
exactly that.

**It sets, it does not change — there is no current-password field.** Somebody who signed in with
Google has no password to supply, and they are one of the two readers this screen exists for. The
live session is the proof of identity, as it is for every other write.

**No audit row.** `credential_audit` logs admin acts on other people's credentials; a person
choosing their own password is not one, and a row for it would make the table answer a different
question than its name.

### A refused password and a broken provider are different answers

The first version of this route reported both as a 500. That was wrong, and it was wrong on the one
screen somebody locked out of the app has to complete.

Supabase may refuse a password our own rule accepted — it holds its own minimum and can check a
breach list. That is a 400 with its words, which the person fixes by typing another password. A
timeout or a bad service key is ours, and reporting it as *pick another password* sends somebody who
is already locked out to try variations of a password that was never the problem.

`PasswordRejectedError` carries the first case, thrown only on a 4xx from GoTrue. An error the SDK
did not attribute a status to is treated as a fault, because an unattributed failure is not evidence
the password was bad.

### `setPassword` on the port, and the local provider's refusal

The port grows one method, because the password is the identity provider's to hold and this is the
seam Passport replaces rather than a route.

The local dev provider **throws** rather than succeeding silently. A no-op there would let the server
clear `must_set_password` on an account whose password was never set, which is the one claim that
column must not make. `db:seed` writes dev users unflagged for the same reason, so nothing reaches
the throw in a normal dev session.

The Supabase provider builds its admin client lazily, on first use:

> *A verify-only deployment should start. It should fail where the act is attempted, with a message
> naming the two keys — not at startup with a message about a feature it does not use.*

`SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are already set in production for storage, so nothing new
has to be configured. **Confirm that before deploying**, because the failure is a sentence on the
set-password screen rather than a boot error.

### Both frontends — and the stated reason was wrong

This section originally read *"because both are deployed"*. **Checked against Vercel on 5 October,
after the merge: that is false.** There are two BrandFactory projects, `brandfactory-web` and
`brandfactory-calendar`, and **both build `web-next`**. `packages/web` is not deployed anywhere.
`brandfactory-web` is the project MKT-0 found repurposed from Vite to Next, still carrying both env
var sets, and its name is the only thing left pointing at the old app.

So the Vite copy of this screen is **precautionary, not load-bearing**. It costs a file in a package
that is being replaced screen by screen, and it means the day somebody deploys `packages/web` the
gate does not greet them with a wall of 403s. That is a reasonable thing to have; it is not the
reason given, and the reason given would have had somebody believe a deployment existed that does
not.

The duplication is deliberate and temporary, like the rest of `packages/web`. The rule it must not
break is that the **validation** is not duplicated — `passwordProblem` lives in
`@brandfactory/shared` and runs in both browsers and on the server. Three copies of a length rule is
how one of them ends up disagreeing with the other two.

In each it is a **render gate, not a redirect**: there is no route for the screen, so nothing to
deep-link past and no URL to come back from. A redirect would leave the app's own chrome one
back-button away, which reads as a door that did not quite close.

`PASSWORD_MIN_LENGTH` is 14, and composition rules are deliberately absent: *one capital, one digit,
one symbol* pushes people towards `Password1!` and buys very little, while a floor somebody can
satisfy with a phrase buys more. The one non-length rule rejects a password containing the email's
local part, which is the common weak choice on a work account.

### Three corrections to existing code

**`packages/web/src/api/queries/me.ts` said something that stopped being true.** Its docblock
justified `staleTime: Infinity` with *"Nothing in the product writes to `users`"*.
`POST /me/password` writes to `users`, and `AuthBoundary` reads the field it writes. The comment now
names the write and the screen invalidates the key, because a refetch is what `Infinity` forbids. A
write that forgets to invalidate is a reader stuck on the set-password screen after successfully
setting their password.

**`callJson` would have thrown a parse error over a successful write.** `204` has no body. Both
frontends gain a `callVoid` that delegates its failure path to `callJson` rather than copying it — on
a non-ok response `callJson` always throws, so the two cannot drift.

**`packages/web`'s `AuthBoundary.test.tsx` rendered the boundary bare**, with no
`QueryClientProvider`, and nine of its tests failed the moment the component read a react-query hook.
That is not a concession the test had to make: `main.tsx` wraps the whole router in the provider and
`__root.tsx` renders the boundary inside the route tree, so production had always supplied it. The
test was less like the app than it looked, and the hook is what exposed it. It now renders through a
`renderBoundary` helper that supplies what the real tree does.

### Sign-in now offers a password

`/sign-in` in `web-next` leads with email and password, keeps Google, and demotes the magic link to
*Email me a sign-in link instead*. The link stays because it is a working recovery path that costs
nothing and bypasses nothing — a flagged account still meets the set-password screen behind it.
Supabase's own recovery mail covers a temporary password that goes missing, which is why this phase
needs no mailer.

`finishSignIn` was hoisted out of the mount effect into a `useCallback`, because the password path
needs the same three steps — probe `/me`, seed the store, navigate — and a second copy of them is a
second place for the destination to drift.

Supabase answers one message for a wrong password and an unknown address. That is right, and it is
passed through unchanged: telling them apart tells a stranger which of our addresses are real.

## Phase C — the door, which was never the signup endpoint

**Migration:** none — Phase A wrote the columns. **Wire:** no new routes; two new refusal codes on
every authenticated path. **Screens:** a terminal no-access screen in both frontends.

`createSupabaseAuthProvider.verifyToken` inserted a `public.users` row for any `sub` whose token
carried an email it had never seen. `authz.ts` did `void userId` and admitted that row to every
workspace, brand, project, asset and contract.

So the live path was: read the public anon key out of the deployed JavaScript — it ships in the
bundle by design — create a Supabase account with an address you control, sign in, and read every
brand. Email confirmation did not help, because the attacker confirms their own address.

**The auto-provisioner was the door. The open signup endpoint only ever produced a token.** That
distinction is the correction this plan's first draft needed: closing signups in the Supabase
dashboard was a workaround for a hole in our own code, and the owner had already accepted and
deferred that risk. This closes it in the code instead, which means the deferred decision stays
deferred.

Launchpad states the rule in one line, and it is the rule we were missing:

> *"**Never provision for a non-member.** A valid Passport token proves who somebody is, not that
> they belong here."*

A stranger may still mint a valid token. They now reach a refusal.

### 403, not 401 — a deliberate departure from the plan

The plan said an unknown token should answer 401. Building it showed that to be wrong.

Both frontends probe `GET /me` at boot and sign the reader out on any non-ok answer. A 401 there
returns a stranger to the sign-in page with nothing said — where they sign in again, successfully,
and bounce off a second time. The security outcome is identical and the diagnosis is not: a colleague
whose account has not been created yet reports *"the app signs me out instantly"*, which is far
harder to act on than a sentence on screen.

The token **is** valid. What is missing is an account here, and that is authorization. So:

| Cause | Code | Status |
| --- | --- | --- |
| Token verifies, no `users` row | `NO_ACCOUNT` | 403 |
| Row exists, `deactivated_at` set | `ACCOUNT_DEACTIVATED` | 403 |
| Token absent, expired or invalid | `UNAUTHORIZED` | 401 |

**Two codes rather than one**, because the two want different sentences. *You were never added* and
*your access was withdrawn* are different news, and an administrator reading the support message
that follows needs to know which one happened.

### The refusal is in the middleware, not only in `authz.ts`

`GET /me` does not call the authorization helpers — it is the probe. Refusing only in `authz.ts`
would have left `/me` answering a stranger with `404 USER_NOT_FOUND`, which is the non-ok answer
that causes the loop above.

So `createAuthMiddleware` resolves the row and refuses there, giving every authenticated path one
answer including the probe. `requireActiveUser` in `authz.ts` checks the same two facts again, and
that is not redundancy to tidy away: `ws.ts` never enters the middleware chain, and a second rail on
the one boundary in the app is worth a nine-row select.

### `authz.ts` cost no call-site change, and one `Pick` proved the rule

Every route already passes `deps.db`, which satisfies the whole `AuthzDeps` interface, so growing
that interface reached fifty handlers without touching one. That property is what the plan meant by
*a small edit rather than an audit*, and it held.

The exception is instructive. `routes/research.ts` declares its own narrowed
`Pick<Db, 'getBrandById' | 'getWorkspaceById' | ...>` rather than taking the facade, and it failed to
compile until the two authorization reads were added to that list. The narrowing is good practice and
the compiler caught the consequence immediately — which is the typed-facade contract working, not a
cost.

`AuthzDeps` declares the branded `UserId` to match the real query signatures; a function taking
`UserId` is not assignable to one taking `string`. The handlers hold a bare string from the token, so
the cast happens inside `authz.ts`, once.

### The rules, and the one that is recorded but not enforced

`@brandfactory/shared`'s `member/access.ts` holds them as pure functions over two facts — the
person's row, and their grant on the brand in question:

```ts
isActive(user)                   deactivatedAt === null
isAdmin(user)                    active && role === 'admin'
canReadBrand(user, grant)        admin, or any grant
canWriteBrand(user, grant)       admin, or editor | manager
```

One definition, imported by `authz.ts` and available to both frontends as a rendering gate.
Launchpad's house rule comes with it: *"it is a rendering gate, not a security boundary — the service
re-checks everything, so getting it wrong makes the UI wrong, never the data."*

> ⚠️ **`canWriteBrand` is correct and unused by the server.** Read access is enforced from this
> phase; `viewer` against `editor` is not, because enforcing it means a write gate on every mutating
> route and that is its own phase.
>
> **Phase D must therefore refuse to store a `viewer` grant.** A grant whose meaning nothing applies
> is worse than no column at all — somebody would grant `viewer`, believe writes were blocked, and be
> wrong. Phase A's backfill wrote `manager` everywhere, so no such row exists today.

**Not-found before forbidden** in `requireBrandAccess`, so a member cannot learn which brand ids
exist by comparing the two refusals.

**Deactivation is checked before the role**, including for an admin. An administrator whose access
was withdrawn must not keep the one privilege that could restore it.

**Two user reads per brand request**, and that is the chosen trade. `requireBrandAccess` calls
`requireActiveUser` rather than threading the row through a return type that fifty call sites
destructure. The plan took that over Launchpad's 60-second cache, whose own comment calls the
invalidation *"the most dangerous line in this function"* — a missed clear leaves the app refusing
after a success, which is the hardest shape to attribute. A select of a nine-row table is free; a
cache that lies is not.

### `/rt` needed all three refusals repeated

Phase B put the password check in `ws.ts` because the socket ends at the upgrade and never enters the
middleware chain. The same is true of the two new ones, and Phase B's notes said so in advance.

`authorizeChannel` would not have caught them. It walks the aggregate chain into `authz.ts`, which
from this phase does refuse an unknown account — but only *after* the socket is open and subscribed,
which is a connection this app should never have accepted. So the check is at `authenticate`, and the
channel test is the second rail.

### Four tests said the opposite thing, and inverting them is the record

The suite encoded the shared-access model explicitly, which made the change legible:

- `authz.test.ts` — *"returns the workspace for any authenticated user (shared access)"*, and the
  same for brand and project.
- `ws.test.ts` — *"allows any authenticated user on an existing channel (shared access)"*.
- `me.test.ts` — *"404s when the auth provider has no matching user"*.

Each is now its inverse, with the old title quoted in the new test so the change is readable from the
file rather than from this document. `authz.test.ts` seeds five people against one brand — an admin
with no grant, a member with a `manager` grant, a member with none, a deactivated admin, and an id
with no row at all — which is the truth table the plan asked for.

The rest of the server suite passed untouched, because `createTestApp` seeds its users as admins and
an admin needs no grant.

### Both frontends say so rather than signing the reader out

A terminal `NoAccessScreen` in each, drawn when the boot probe answers 403 with one of the two codes.
It offers one control, *Sign out*.

**An ordinary 403 must not draw it.** `FORBIDDEN` on a brand is a different situation — the session
is fine — so the boundary reads the code and falls through to the old sign-out path for anything
else, including a 401. There is a test for each of those four cases in both frontends.

It is checked **before** the set-password screen: somebody with no account here has nothing to set a
password for.

## Phase D — the routes an administrator actually uses

**Migration:** none — Phase A wrote the tables. **Wire:** six routes under `/members`.
**Port:** `AuthProvider` gains `holdsPasswords`, `createUser`, `deleteUser`, `setSuspended`.
**Screens:** none — Phase E.

```
GET    /members                   list, with each person's brand grants
POST   /members                   create: provider account, then our row, then grants
PATCH  /members/:id               display name, workspace role, brand grants
POST   /members/:id/password      reset somebody else's, and flag them
POST   /members/:id/deactivate    reversible
POST   /members/:id/reactivate
```

**Admin only by its mount.** `app.ts` puts `createAdminMiddleware()` on the whole prefix, so there is
no per-route check to forget. Launchpad's equivalent file carries four inline
`user.adminRole !== 'admin'` checks because it has two admin roles with different powers; we have
one, and a mounted middleware is both the rule and a complete statement of what it covers.

The prefix also carries the **password gate**. An administrator holding a password somebody else
chose is not an exception to it, and there is a test saying so.

⚠️ **No self-service route may be added here.** A person's own password is `POST /me/password`, under
the prefix this app already uses for everything about the caller. Launchpad keeps both under
`/users`, which puts `POST /users/me/password` and `POST /users/:id/password` in one file where
Hono's declaration order decides which wins — it warns about that three times. Ours cannot collide,
and adding a self-service route to this prefix would reintroduce the trap *and* put it behind the
admin gate.

### The create order is forced, not stylistic

1. Refuse an address that already exists, naming it — so the administrator gets a sentence rather
   than a 500 from a unique index. Phase A's `lower(email)` index is still the backstop, and the
   email is lower-cased on the way in.
2. Create the identity-provider account, with the password the administrator chose.
3. Write our `users` row **keyed to the id the provider returned**, plus the grants.
4. Delete the provider account if step 3 throws.
5. Write `set-on-create` to the audit.

Step 3 is why the order cannot be reversed. `users.id` **is** the Supabase `sub`, and
`upsertUserById` conflicts on that column only — so a row written with a fresh uuid collides on
`email` the first time its owner signs in, the adapter swallows that error, and the row is
unreachable forever. Phase A found that reading the code; this is the phase where it constrains
something.

Step 4 is Launchpad's compensation and its reason holds: without it the provider holds an account we
have no row for, and every retry answers a conflict there with nothing here to show for it. A test
drives a create whose insert collides and asserts the provider delete happened.

**`holdsPasswords`, not a provider name.** `CLAUDE.md` forbids naming a vendor in domain code, and
the question the route is asking is a capability. On the local dev provider no credential exists, so
*an administrator chose this account's password* is a vacuous claim — the route asks for no password
and flags nothing. Flagging would park every dev account on a screen `setPassword` then refuses to
satisfy.

### `viewer` is refused on the wire, and that is the honest half of Phase C

Phase C enforces that a grant *exists*. It does not enforce `viewer` against `editor`, because that
needs a write gate on every mutating route. So the wire refuses the one value whose meaning is not
yet real:

```ts
export const GrantableBrandRoleSchema = BrandRoleSchema.refine((r) => r !== 'viewer', {
  message: 'viewer access is not available yet — per-role write rules are not built',
})
```

The vocabulary stays whole in the database and no row can carry a restriction nothing applies.
Somebody setting `viewer` and believing writes were blocked would be wrong, and that is worse than
not offering the option. Deleting that refinement opens the enum, so it is the thing to delete when
the write gate lands — not before.

### Grants are diffed, never replaced

`setBrandGrants` compares what is stored with what was sent and issues inserts, role updates and
deletes inside one transaction. Launchpad's note is the reason:

> *"`users.update` used to delete every row and re-insert. … a burst of writes, and a window in
> which a concurrent read sees them on no team project at all."*

Here the window is smaller and worse-shaped: a concurrent request from the person being edited would
be refused a brand they are **keeping**, because for a moment the grant did not exist. Saving a
profile must not log somebody out of a brand.

The diff also makes the audit truthful — a role change records `role_changed`, not a revoke followed
by a grant. And an **omitted** `brands` field means *leave as is*: a screen saving a display name
must not silently empty somebody's access. Both have tests.

### Four guards, in the service

- **No self-demotion.** Distinct from the last-admin guard and it catches a case that one does not:
  an administrator dropping their own role on the screen whose job is granting it.
- **No self-deactivation.**
- **No resetting your own password here.** Launchpad's reason is the sharpest of the three: an
  administrator who did *"would flag themselves into the change screen with no admin left to free
  them."*
- **The last active admin cannot be demoted or deactivated.** A workspace with none cannot add or
  restore anybody, and the only way back is SQL against production. Launchpad guards this on delete
  and **not** on its role edit, so a full admin there can demote the last one; both paths are guarded
  here, and `countActiveAdmins` ignores deactivated rows so the guard means *last usable admin*.

### Two orders, deliberately opposite

Deactivate writes our column **first** and suspends at the provider after, failing softly. Reactivate
lifts the provider ban **first** and propagates its failure.

Each is ordered so a half-completed call leaves the account *less* reachable, not more.
`deactivated_at` is the boundary, so writing it first means the gate is already closed if the
provider call fails — and a provider error then is a live credential nobody can use, not a failed
deactivation. Reporting it as one would invite a retry that looks like the first attempt never
worked. Restoring access is the mirror: a 200 has to mean both halves are true, or an administrator
records access the person cannot use and has no way to tell.

I wrote the comment for `reactivate` before the code and then wrote the code the other way round. The
comment was right, so the code changed to match it.

### The audit is written and still unread

One row per act, FK-free, with the emails denormalised. `writeAudit` never throws into the caller's
path and never joins the caller's transaction — Launchpad's audit write held an FK to `users`, took
`FOR KEY SHARE` on a row the request's own transaction held `FOR UPDATE`, and **every user create
deadlocked for two months.** A lost audit row is a smaller harm than a create that hangs.

A test asserts the password never appears anywhere in what was written.

⚠️ **Nothing reads the table.** An unread audit table returns zero rows and no error, which reads as
*nobody has ever done anything*. The reader is still owed.

### Live tests, because the fake cannot prove the database

`packages/db/src/members.live.test.ts` — six tests, skipped without `DATABASE_URL`, all passing
against the dev database. They cover what only real Postgres can answer, and each one is something
the fake mirrors in JavaScript without evidence:

- **the `lower(email)` unique index exists and refuses a case-variant address.** The fake lower-cases
  and compares in memory, which proves nothing about migration 0027.
- the grant diff inside a real transaction, and its idempotence.
- `user_brands` cascading away with the person.
- `countActiveAdmins` ignoring a deactivated admin.
- `credential_audit` accepting a row whose ids reference nothing, which is the point of the missing
  foreign keys.

### The enumerating test earned its keep

`app.test.ts` reads the prefixes the app registered rather than holding its own list, and adding
`/members` failed it immediately — `expected [ … 4 more ] to deeply equal [ … 3 more ]`. That is the
test doing exactly what Phase B built it for: a new top-level prefix has to be added to the
authentication mount list and the password-gate mount list, and forgetting the second is otherwise
invisible.

## Phase E — the screen, and the row that is absent rather than disabled

**Migration:** none. **Wire:** none — Phase D's six routes. **Screens:** `/settings/members`, plus
one sidebar row and one new cache scope.

### The layering, and why it is Launchpad's

```
api.ts        the only file that knows a request happens
model.ts      pure rules, labels and gates; no React, no network imports
hooks.ts      SWR reads, writes, and a stated invalidation policy
components/   the table, the form sheet, two dialogs, the gate
```

Launchpad states the reason for the top of that stack — *"Everything above this file — `./model`,
`./hooks`, `./components/*` — is written against the shapes below and never learns that a request
happened"* — and the reason for the bottom: *"`packages/web` runs `*.test.ts` only, so a hook cannot
be rendered in this suite and a component cannot be asserted on. Everything worth asserting therefore
lives out here."*

This package *can* render components, and the rule still earns its place: a rule with a renderer in
front of it is tested through two layers of guesswork. `model.test.ts` has 17 tests and needs neither
a DOM nor a server.

**The access rules are not in `model.ts`.** They are in `@brandfactory/shared`'s `member/access.ts`,
which the server calls too, so this screen cannot hold an opinion the boundary does not share.

### What the screen is, and what it deliberately is not

One table — name and email, access, status, actions. **No pagination, no filters, no search.**
Launchpad's equivalent caps at 200 rows and narrows four dimensions in memory, and its own comment
concedes the honest fix past 200 is real pagination rather than a bigger number. At nine people none
of that apparatus has a job.

**Row actions are hidden, not disabled**, and each is suppressed where the server would refuse.
`rowActions` in `model.ts` mirrors three guards in `routes/members.ts`:

- a reset is never offered on your own row — you would flag yourself into the set-password screen
  with no administrator left to free you. Your own password is on `/me`.
- nor a deactivation.
- the deactivate control is absent on the last active administrator, so the control is missing rather
  than present-and-failing. The server's `LAST_ADMIN` conflict is still the boundary, and the dialog
  renders it if it arrives.

Editing your own row **is** offered — it carries a display name — and the role select inside the
sheet is the part that refuses, with a sentence saying so. That sentence appears only there, which is
the rule Launchpad states for when to explain a block: only where the reader *has* the permission and
the control is missing anyway.

### The status cell says "Temporary password"

Never *"has not signed in yet"*. An administrator's reset sets the same flag, so the second wording
would be a flat untruth about somebody who has used the product for a year. Launchpad shipped the
first wording after catching exactly that, and `model.ts` carries the note next to the function.

A deactivation outranks the flag when both are true, because *deactivated* is the one that decides
what the person can do.

### The password is generated in the browser

`generatePassword` lives in `@brandfactory/shared` and runs only in a browser. The administrator
reads the value off their own screen; the server receives it over TLS, hands it to the identity
provider and stores nothing. **No password this app suggests was ever chosen on a server or written
to a server log.**

Its alphabet drops `0`/`O` and `1`/`l`/`I`: a generated password is read off one screen and typed
into another, often from a phone, and a character somebody cannot transcribe is a support
conversation. It uses rejection sampling rather than `%`, which would favour the first few letters of
the alphabet.

The copy under both password fields says the person will be asked to choose their own — so the
administrator passes on a temporary credential knowingly, rather than believing they have set
somebody's password for good.

### `viewer` is absent from the role select, for the third time in three places

`GRANTABLE_BRAND_ROLES` filters it out, `GrantableBrandRoleSchema` refuses it on the wire, and
`canWriteBrand` is the rule that would make it mean something. All three open together or not at all.
A test pins the list to `['editor', 'manager']`.

Offering it would let somebody set it, believe writes were blocked, and be wrong — which is worse
than not offering it.

### The nav row is absent for a non-admin, and the page still answers in words

`NavItem` gains `adminOnly`, and the sidebar filters on it. One test asserts Members is the only row
carrying the flag, so the flag means one thing.

**Hiding a row is about not offering a destination that would refuse.** It is not the boundary.
Somebody arriving anyway — a bookmark, a shared link, a demotion that happened this morning — meets
`AdminGate`, which says whose page this is. Launchpad's note: *telling them this is an
administrators' page costs nothing and answers the question a 404 leaves open.*

`AdminGate` has three states and the middle one is the point:

> *"── Not-yet is not a refusal ───── For the ~1s before `/users/me` lands there is no answer, and
> drawing the refusal then would flash *you are not an administrator* at an administrator on every
> cold load. It draws nothing instead."*

The sidebar makes the same call in the opposite direction: an absent answer **hides** an `adminOnly`
row rather than showing it, because a row drawn on nothing would appear and then vanish for every
member on every cold load. A row that arrives a beat late is the quieter mistake.

### The invalidation set includes `me`, and that is the one that looks wrong

Every write invalidates `[bf-members]` and `me`. `me` is deliberately outside every other screen's
set — who you are does not change when you edit a brand. This is the screen where an administrator
can edit **their own row**, and `me` is what `AuthBoundary` reads to decide whether to draw the app at
all. A reset that left it stale would leave somebody looking at an app they can no longer use.
Launchpad reached the same conclusion for the same reason.

`[bf-members]` is **not** workspace-scoped, because a `users` row is not.

**Nothing is optimistic.** The server applies rules this client cannot predict — a duplicate address,
the last-admin guard, a password its identity provider refuses — so its answer is the only one worth
rendering, and each dialog renders the server's words rather than an assumption.

### Two honest gaps

**The form always offers a password field.** `AuthProvider.holdsPasswords` is a server fact and no
route exposes it, so the screen passes `holdsPasswords` as a constant. On a deployment whose provider
holds none — local dev — that produces a field the server accepts and ignores, rather than a failure.
Exposing the capability would mean a config route for one cosmetic case; the constant is commented
where it is passed.

**Creating a member in local dev is not usable end to end.** The dev provider's user id *is* the
bearer token, and the screen does not show the id it just created, so there is no way to sign in as
that person from the UI. The dev flow is `db:seed`, which prints a token. Worth fixing the day
somebody needs a second dev account; not worth a field on a production screen.

## Phase F — retired, not completed

**All nine existing users stay administrators** — taken by the owner on 5 October 2026.

Phase A's backfill made every current user an admin with every brand so that enforcement could land
without changing anybody's access. Earlier drafts of the plan treated that as scaffolding to be
narrowed later. It is not: these nine all work across the estate, and there is no brand any of them
should be kept out of.

So the per-brand machinery is built and holds no restrictive data, which is **exactly where Launchpad
is** — its own code records `user_brands` as empty in production. Worth stating rather than glossing,
because it would be easy to read these five phases as having delivered per-brand access that is in
use. It is not in use. What changed is that it *can* be: the tenth person can now be added as a
member with two brands instead of as an administrator with seven, which is what this app could not do
before and the reason the work was commissioned.

Two consequences in the code, both already true:

- **A new account defaults to `role: null`.** The form offers administrator as a deliberate choice,
  so nobody becomes one by inertia — which is the behaviour that matters now that the existing nine
  are all admins and the default would otherwise be copied from them.
- **`viewer` stays refused** in all three places. The day a member needs read-only access is the day
  the write gate is worth building.

## The gate, phase by phase

`typecheck` 0 errors across all 11 packages, `lint` 0 errors and 0 warnings (root and `web-next`),
`format:check` clean and both frontends building, at every phase.

| Phase | Passing | Skipped | Added |
| --- | --- | --- | --- |
| A | 3072 | 174 | `role.test.ts`, 9 measured on its own |
| B | 3101 | 174 | 29 |
| C | 3124 | 174 | 23 |
| D | 3151 | 180 | 27, and 6 live tests needing `DATABASE_URL` |
| E | 3172 | 180 | 21 — `model.test.ts` (17) and four nav invariants |

Phase A's 3072 is **not** comparable to 1.57.0's reported 3208: two marketing-requests commits landed
between that release and this work, so the difference between those two figures is not Phase A's.

One honest note from Phase C. The first full run reported two failures in `@brandfactory/web` —
`PostEditorDialog` and `SocialPostList`, neither of which that phase touches. They did not reproduce:
both pass in isolation, the whole `web` project passes alone at 1078 tests across 84 files, and the
next full run was green. The machine was carrying a **load average of 140 on 8 cores** with none of
this work running. That is the same signature the Mission Events work recorded. The suite
configuration is **not** changed for it — raising `testTimeout` was tried once and was wrong, and
leaving a wrong explanation in the config would mislead whoever read it next. Re-run on an idle
machine before reading anything into those numbers.

## What this does not do

- **No write-role enforcement**, and so no `viewer`. `canWriteBrand` is correct and no route calls
  it.
- **No audit reader.** The table is written from Phase D and read by nothing.
- **No emailed invite and no mailer.** Deliberate. Supabase's own recovery mail covers the case a
  temporary password goes missing.
- **No teams or groups.** Nine users do not need a group abstraction.
- **No access-request queue.** A vestige of self-signup, which we are not opening.
- **No second identity store.** Supabase holds the credential throughout.
- **No password-age or rotation policy.** The flag answers *has this person chosen their own
  password*, which is a different question from *how old is it*.
- **Nothing from Passport.** If BrandFactory joins it later, three rules transfer: resolve by
  verified email and never by `sub`; a removed member is a tombstone you keep; and membership is not
  access.
