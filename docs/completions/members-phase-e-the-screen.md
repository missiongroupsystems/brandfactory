# Members Phase E — the screen, and the row that is absent rather than disabled

**Plan:** `docs/executing/members-passwords-and-brand-access-plan.md`.
**Migration:** none. **Wire:** none — Phase D's six routes. **Screens:**
`/settings/members`, plus one sidebar row and one new cache scope.

## The layering, and why it is Launchpad's

```
api.ts        the only file that knows a request happens
model.ts      pure rules, labels and gates; no React, no network imports
hooks.ts      SWR reads, writes, and a stated invalidation policy
components/   the table, the form sheet, two dialogs, the gate
```

Launchpad states the reason for the top of that stack — *"Everything above this file —
`./model`, `./hooks`, `./components/*` — is written against the shapes below and never
learns that a request happened"* — and the reason for the bottom: *"`packages/web` runs
`*.test.ts` only, so a hook cannot be rendered in this suite and a component cannot be
asserted on. Everything worth asserting therefore lives out here."*

This package *can* render components, and the rule still earns its place: a rule with a
renderer in front of it is tested through two layers of guesswork. `model.test.ts` has
17 tests and needs neither a DOM nor a server.

**The access rules are not in `model.ts`.** They are in `@brandfactory/shared`'s
`member/access.ts`, which the server calls too, so this screen cannot hold an opinion
the boundary does not share.

## What the screen is, and what it deliberately is not

One table — name and email, access, status, actions. **No pagination, no filters, no
search.** Launchpad's equivalent caps at 200 rows and narrows four dimensions in memory,
and its own comment concedes the honest fix past 200 is real pagination rather than a
bigger number. At nine people none of that apparatus has a job.

**Row actions are hidden, not disabled**, and each is suppressed where the server would
refuse. `rowActions` in `model.ts` mirrors three guards in `routes/members.ts`:

- a reset is never offered on your own row — you would flag yourself into the
  set-password screen with no administrator left to free you. Your own password is on
  `/me`.
- nor a deactivation.
- the deactivate control is absent on the last active administrator, so the control is
  missing rather than present-and-failing. The server's `LAST_ADMIN` conflict is still
  the boundary, and the dialog renders it if it arrives.

Editing your own row **is** offered — it carries a display name — and the role select
inside the sheet is the part that refuses, with a sentence saying so. That sentence
appears only there, which is the rule Launchpad states for when to explain a block:
only where the reader *has* the permission and the control is missing anyway.

## The status cell says "Temporary password"

Never *"has not signed in yet"*. An administrator's reset sets the same flag, so the
second wording would be a flat untruth about somebody who has used the product for a
year. Launchpad shipped the first wording after catching exactly that, and `model.ts`
carries the note next to the function.

A deactivation outranks the flag when both are true, because *deactivated* is the one
that decides what the person can do.

## The password is generated in the browser

`generatePassword` lives in `@brandfactory/shared` and runs only in a browser. The
administrator reads the value off their own screen; the server receives it over TLS,
hands it to the identity provider and stores nothing. **No password this app suggests
was ever chosen on a server or written to a server log.**

Its alphabet drops `0`/`O` and `1`/`l`/`I`: a generated password is read off one screen
and typed into another, often from a phone, and a character somebody cannot transcribe
is a support conversation. It uses rejection sampling rather than `%`, which would
favour the first few letters of the alphabet.

The copy under both password fields says the person will be asked to choose their own —
so the administrator passes on a temporary credential knowingly, rather than believing
they have set somebody's password for good.

## `viewer` is absent from the role select, for the third time in three places

`GRANTABLE_BRAND_ROLES` filters it out, `GrantableBrandRoleSchema` refuses it on the
wire, and `canWriteBrand` is the rule that would make it mean something. All three open
together or not at all. A test pins the list to `['editor', 'manager']`.

Offering it would let somebody set it, believe writes were blocked, and be wrong — which
is worse than not offering it.

## The nav row is absent for a non-admin, and the page still answers in words

`NavItem` gains `adminOnly`, and the sidebar filters on it. One test asserts Members is
the only row carrying the flag, so the flag means one thing.

**Hiding a row is about not offering a destination that would refuse.** It is not the
boundary. Somebody arriving anyway — a bookmark, a shared link, a demotion that happened
this morning — meets `AdminGate`, which says whose page this is. Launchpad's note:
*telling them this is an administrators' page costs nothing and answers the question a
404 leaves open.*

`AdminGate` has three states and the middle one is the point:

> *"── Not-yet is not a refusal ───── For the ~1s before `/users/me` lands there is no
> answer, and drawing the refusal then would flash *you are not an administrator* at an
> administrator on every cold load. It draws nothing instead."*

The sidebar makes the same call in the opposite direction: an absent answer **hides** an
`adminOnly` row rather than showing it, because a row drawn on nothing would appear and
then vanish for every member on every cold load. A row that arrives a beat late is the
quieter mistake.

## The invalidation set includes `me`, and that is the one that looks wrong

Every write invalidates `[bf-members]` and `me`. `me` is deliberately outside every
other screen's set — who you are does not change when you edit a brand. This is the
screen where an administrator can edit **their own row**, and `me` is what `AuthBoundary`
reads to decide whether to draw the app at all. A reset that left it stale would leave
somebody looking at an app they can no longer use. Launchpad reached the same conclusion
for the same reason.

`[bf-members]` is **not** workspace-scoped, because a `users` row is not.

**Nothing is optimistic.** The server applies rules this client cannot predict — a
duplicate address, the last-admin guard, a password its identity provider refuses — so
its answer is the only one worth rendering, and each dialog renders the server's words
rather than an assumption.

## Two honest gaps

**The form always offers a password field.** `AuthProvider.holdsPasswords` is a server
fact and no route exposes it, so the screen passes `holdsPasswords` as a constant. On a
deployment whose provider holds none — local dev — that produces a field the server
accepts and ignores, rather than a failure. Exposing the capability would mean a config
route for one cosmetic case; the constant is commented where it is passed.

**Creating a member in local dev is not usable end to end.** The dev provider's user id
*is* the bearer token, and the screen does not show the id it just created, so there is
no way to sign in as that person from the UI. The dev flow is `db:seed`, which prints a
token. Worth fixing the day somebody needs a second dev account; not worth a field on a
production screen.

## The decision that closes the set

**All nine existing users stay administrators** — taken by the owner on 5 October 2026,
and it retires Phase F rather than completing it.

Phase A's backfill made every current user an admin with every brand so that enforcement
could land without changing anybody's access. Earlier drafts treated that as scaffolding
to be narrowed later. It is not: these nine all work across the estate, and there is no
brand any of them should be kept out of.

So the per-brand machinery is built and holds no restrictive data, which is **exactly
where Launchpad is** — its own code records `user_brands` as empty in production. Worth
stating rather than glossing, because it would be easy to read this set of five phases
as having delivered per-brand access that is in use. It is not in use. What changed is
that it *can* be: the tenth person can now be added as a member with two brands instead
of as an administrator with seven, which is what this app could not do before and the
reason the work was commissioned.

Two consequences in the code, both already true:

- **A new account defaults to `role: null`.** The form offers administrator as a
  deliberate choice, so nobody becomes one by inertia — which is the behaviour that
  matters now that the existing nine are all admins and the default would otherwise be
  copied from them.
- **`viewer` stays refused** in all three places. The day a member needs read-only
  access is the day the write gate is worth building.

## The gate

`typecheck` 0 errors across all 11 packages. `lint` 0 errors and 0 warnings, root and
`web-next`. `format:check` clean. Both frontends build.

**3172 tests pass, 180 skipped, 0 failed** — up 21 from Phase D's 3151. The new ones are
`model.test.ts` (17) and four nav invariants.
