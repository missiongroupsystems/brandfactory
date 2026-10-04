# Members Phase C — the door, which was never the signup endpoint

**Plan:** `docs/executing/members-passwords-and-brand-access-plan.md`.
**Migration:** none — Phase A wrote the columns. **Wire:** no new routes; two new
refusal codes on every authenticated path. **Screens:** a terminal no-access screen in
both frontends.

## What was open

`createSupabaseAuthProvider.verifyToken` inserted a `public.users` row for any `sub`
whose token carried an email it had never seen. `authz.ts` did `void userId` and admitted
that row to every workspace, brand, project, asset and contract.

So the live path was: read the public anon key out of the deployed JavaScript — it ships
in the bundle by design — create a Supabase account with an address you control, sign in,
and read every brand. Email confirmation did not help, because the attacker confirms
their own address.

**The auto-provisioner was the door. The open signup endpoint only ever produced a
token.** That distinction is the correction this plan's first draft needed: closing
signups in the Supabase dashboard was a workaround for a hole in our own code, and the
owner had already accepted and deferred that risk. This closes it in the code instead,
which means the deferred decision stays deferred.

Launchpad states the rule in one line, and it is the rule we were missing:

> *"**Never provision for a non-member.** A valid Passport token proves who somebody
> is, not that they belong here."*

A stranger may still mint a valid token. They now reach a refusal.

## 403, not 401 — a deliberate departure from the plan

The plan said an unknown token should answer 401. Building it showed that to be wrong.

Both frontends probe `GET /me` at boot and sign the reader out on any non-ok answer. A
401 there returns a stranger to the sign-in page with nothing said — where they sign in
again, successfully, and bounce off a second time. The security outcome is identical and
the diagnosis is not: a colleague whose account has not been created yet reports *"the
app signs me out instantly"*, which is far harder to act on than a sentence on screen.

The token **is** valid. What is missing is an account here, and that is authorization.
So:

| Cause | Code | Status |
|---|---|---|
| Token verifies, no `users` row | `NO_ACCOUNT` | 403 |
| Row exists, `deactivated_at` set | `ACCOUNT_DEACTIVATED` | 403 |
| Token absent, expired or invalid | `UNAUTHORIZED` | 401 |

**Two codes rather than one**, because the two want different sentences. *You were never
added* and *your access was withdrawn* are different news, and an administrator reading
the support message that follows needs to know which one happened.

## The refusal is in the middleware, not only in `authz.ts`

`GET /me` does not call the authorization helpers — it is the probe. Refusing only in
`authz.ts` would have left `/me` answering a stranger with `404 USER_NOT_FOUND`, which is
the non-ok answer that causes the loop above.

So `createAuthMiddleware` resolves the row and refuses there, giving every authenticated
path one answer including the probe. `requireActiveUser` in `authz.ts` checks the same
two facts again, and that is not redundancy to tidy away: `ws.ts` never enters the
middleware chain, and a second rail on the one boundary in the app is worth a nine-row
select.

## `authz.ts` costs no call-site change, and one `Pick` proved the rule

Every route already passes `deps.db`, which satisfies the whole `AuthzDeps` interface, so
growing that interface reached fifty handlers without touching one. That property is what
the plan meant by *a small edit rather than an audit*, and it held.

The exception is instructive. `routes/research.ts` declares its own narrowed
`Pick<Db, 'getBrandById' | 'getWorkspaceById' | ...>` rather than taking the facade, and
it failed to compile until the two authorization reads were added to that list. The
narrowing is good practice and the compiler caught the consequence immediately — which is
the typed-facade contract working, not a cost.

`AuthzDeps` declares the branded `UserId` to match the real query signatures; a function
taking `UserId` is not assignable to one taking `string`. The handlers hold a bare string
from the token, so the cast happens inside `authz.ts`, once.

## The rules, and the one that is recorded but not enforced

`@brandfactory/shared`'s `member/access.ts` holds them as pure functions over two facts —
the person's row, and their grant on the brand in question:

```ts
isActive(user)                   deactivatedAt === null
isAdmin(user)                    active && role === 'admin'
canReadBrand(user, grant)        admin, or any grant
canWriteBrand(user, grant)       admin, or editor | manager
```

One definition, imported by `authz.ts` and available to both frontends as a rendering
gate. Launchpad's house rule comes with it: *"it is a rendering gate, not a security
boundary — the service re-checks everything, so getting it wrong makes the UI wrong,
never the data."*

> ⚠️ **`canWriteBrand` is correct and unused by the server.** Read access is enforced from
> this phase; `viewer` against `editor` is not, because enforcing it means a write gate on
> every mutating route and that is its own phase.
>
> **Phase D must therefore refuse to store a `viewer` grant.** A grant whose meaning
> nothing applies is worse than no column at all — somebody would grant `viewer`, believe
> writes were blocked, and be wrong. Phase A's backfill wrote `manager` everywhere, so no
> such row exists today.

**Not-found before forbidden** in `requireBrandAccess`, so a member cannot learn which
brand ids exist by comparing the two refusals.

**Deactivation is checked before the role**, including for an admin. An administrator
whose access was withdrawn must not keep the one privilege that could restore it.

**Two user reads per brand request**, and that is the chosen trade. `requireBrandAccess`
calls `requireActiveUser` rather than threading the row through a return type that fifty
call sites destructure. The plan took that over Launchpad's 60-second cache, whose own
comment calls the invalidation *"the most dangerous line in this function"* — a missed
clear leaves the app refusing after a success, which is the hardest shape to attribute. A
select of a nine-row table is free; a cache that lies is not.

## `/rt` needed all three refusals repeated

Phase B put the password check in `ws.ts` because the socket ends at the upgrade and never
enters the middleware chain. The same is true of the two new ones, and the completion doc
for that phase said so in advance.

`authorizeChannel` would not have caught them. It walks the aggregate chain into
`authz.ts`, which from this phase does refuse an unknown account — but only *after* the
socket is open and subscribed, which is a connection this app should never have accepted.
So the check is at `authenticate`, and the channel test is the second rail.

## Four tests said the opposite thing, and inverting them is the record

The suite encoded the shared-access model explicitly, which made the change legible:

- `authz.test.ts` — *"returns the workspace for any authenticated user (shared access)"*,
  and the same for brand and project.
- `ws.test.ts` — *"allows any authenticated user on an existing channel (shared access)"*.
- `me.test.ts` — *"404s when the auth provider has no matching user"*.

Each is now its inverse, with the old title quoted in the new test so the change is
readable from the file rather than from this document. `authz.test.ts` seeds five people
against one brand — an admin with no grant, a member with a `manager` grant, a member with
none, a deactivated admin, and an id with no row at all — which is the truth table the
plan asked for.

The rest of the server suite passed untouched, because `createTestApp` seeds its users as
admins and an admin needs no grant.

## Both frontends say so rather than signing the reader out

A terminal `NoAccessScreen` in each, drawn when the boot probe answers 403 with one of
the two codes. It offers one control, *Sign out*.

**An ordinary 403 must not draw it.** `FORBIDDEN` on a brand is a different situation —
the session is fine — so the boundary reads the code and falls through to the old
sign-out path for anything else, including a 401. There is a test for each of those four
cases in both frontends.

It is checked **before** the set-password screen: somebody with no account here has
nothing to set a password for.

## What this phase does not do

- **No write-role enforcement.** See the warning above, and Phase D's obligation.
- **No members routes.** Creating, resetting and deactivating are Phase D. Between now and
  then an admin adds a person with SQL — the window is days at this size, and the
  alternative was leaving the door open longer.
- **No audit reader.** Still written from Phase D, still unread.

## Deploy order

**Phase B must be in production first, and all nine people must have set a password**,
before this lands. The flag has been true for every one of them since Phase A's
migration. This phase does not change that, but it does mean an account that cannot
complete Phase B's screen has no other way in.

## The gate

`typecheck` 0 errors across all 11 packages. `lint` 0 errors and 0 warnings, root and
`web-next`. `format:check` clean. Both frontends build.

**3124 tests pass, 174 skipped, 0 failed** — up 23 from Phase B's 3101.

One honest note on getting there. The first full run reported two failures in
`@brandfactory/web` — `PostEditorDialog` and `SocialPostList`, neither of which this
phase touches. They did not reproduce: both pass in isolation, the whole `web` project
passes alone at 1078 tests across 84 files (including the three files this phase changed
in that package), and the next full run was green. The machine was carrying a **load
average of 140 on 8 cores** with none of this work running.

That is the same signature the Mission Events work recorded — 3–5 failures in that
package, a different set each run, under external load. The suite configuration is
**not** changed for it. Raising `testTimeout` was tried once for this and was wrong;
leaving a wrong explanation in the config would mislead whoever read it next. Re-run on
an idle machine before reading anything into those numbers.
