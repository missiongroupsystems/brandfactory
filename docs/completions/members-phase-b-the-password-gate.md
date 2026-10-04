# Members Phase B — the gate, and the one screen behind it

**Plan:** `docs/executing/members-passwords-and-brand-access-plan.md`.
**Migration:** none. **Wire:** one new route, `POST /me/password`.
**Screens:** a forced set-password screen in **both** frontends, and password
sign-in on `/sign-in`. **Port:** `AuthProvider` gains `setPassword`.

## What this closes

Phase A wrote `must_set_password` and nothing read it. This phase makes it mean
something: an account whose password an admin chose can read itself and replace that
password, and nothing else.

The important half is not the screen.

> ⚠️ **A frontend that redirects a flagged reader to a set-password page has improved
> the experience and closed nothing.** The session is valid, so every route still
> answers a direct call.

So the refusal lives in `middleware/password-gate.ts`, mounted per prefix in `app.ts`.
The screens are the courteous half, and both say so in their own docblocks.

## The allow-list is a mount point, not a list of strings

`app.ts` mounts the gate on `/workspaces`, `/brands`, `/projects`, `/blob-urls` and
`/research`, and deliberately not on `/me`. The two routes a flagged person needs are
reachable because of **where they live**, not because a string comparison exempted
them. Signing out needs nothing from us — it is a Supabase call in the browser.

This also removes a trap rather than inheriting one. Launchpad keeps its self-service
password route under the same `/users` prefix as its admin routes, so
`POST /users/me/password` and `POST /users/:id/password` sit in one file where Hono's
declaration order decides which wins. It warns about that three times:

> *"⚠️⚠️ **REGISTRATION ORDER IS LOAD-BEARING AND THE CORRECT ORDER LOOKS ARBITRARY.**
> … **Do not reorder this file to group the two password routes together.**"*

Ours is under `/me`, where this app already keeps everything about the caller, so the
two paths cannot collide at all. The route-order test the plan called for is therefore
**not** in this phase: it would assert against a collision that no longer exists, and a
test that cannot fail is worse than no test. Phase D's `/members/:id/password` does not
reintroduce it, because the self-service route is not its sibling.

## The mount list has a test that enumerates it

The next person to add a top-level prefix must add it twice — once for authentication,
once for the gate. Forgetting the second is invisible: the new routes authenticate
correctly and answer a flagged account.

So `app.test.ts` does not keep its own copy of the list. It reads the prefixes the app
actually registered from `app.routes`, subtracts three that are open for stated reasons
(`/me`, `/blobs`, `/health`), and requires every remaining one to refuse a flagged
caller with `PASSWORD_NOT_SET`.

Checked against a deliberate break: removing `app.use('/brands/*', passwordSet)` fails
it with `/brands let a flagged caller through: expected 404 to be 403`. A first
assertion pins the derived list so a pass cannot go vacuous if `app.routes` ever stops
reporting what the test reads.

## The hole the mount-list test could not see

Three paths stay outside the authentication gate on purpose, and `/rt` is the one that
mattered. It verifies its own token and **ends at the WebSocket upgrade**, so it never
enters the Hono middleware chain — `createPasswordGateMiddleware` does not cover it, and
the mount-list test above cannot see it either, because it reads `app.routes`.

Without a second check there, an account holding a password its admin chose is refused
every HTTP route and can still subscribe to a project channel and read the canvas
traffic flowing through it. `authorizeChannel` would not stop it: it walks the aggregate
chain to `requireWorkspaceAccess`, which admits every authenticated user today.

So `ws.ts` repeats the check in its `authenticate` hook and refuses the connection
outright rather than per channel — there is nothing a flagged account is entitled to
read there, so there is no channel worth evaluating. Two tests cover it, and they reach
the hook through `bindToNodeWebSocketServer` rather than asserting on a comment.

The other two are fine as they are. `/health` is a probe with optional auth. `/blobs`
takes a signed URL as its capability, and the route that mints one — `/blob-urls` — is
gated, so an account that has been flagged since it was created holds none.

**The lesson for Phase C**: that phase closes the door on accounts with no `users` row,
and `ws.ts` will need the same repetition for the same reason. The middleware chain is
not the whole perimeter.

## The server sets the password, not the browser

Supabase would let the client call `updateUser({ password })` with its own session and
then ask us to clear the flag. A client that skipped the first call would get the flag
cleared anyway, and the flag would then claim something false about the account.

Both halves go through `POST /me/password`, so the flag can only be cleared by a path
that actually set a password. The order inside the handler is load-bearing in the other
direction too: the provider is called **first**, and the flag is cleared only after it
accepts. Clearing first and failing second leaves somebody past the gate holding a
credential their admin still knows. There is a test for exactly that.

**It sets, it does not change — there is no current-password field.** Somebody who
signed in with Google has no password to supply, and they are one of the two readers
this screen exists for. The live session is the proof of identity, as it is for every
other write.

**No audit row.** `credential_audit` logs admin acts on other people's credentials; a
person choosing their own password is not one, and a row for it would make the table
answer a different question than its name.

## A refused password and a broken provider are different answers

The first version of this route reported both as a 500. That was wrong, and it was
wrong on the one screen somebody locked out of the app has to complete.

Supabase may refuse a password our own rule accepted — it holds its own minimum and can
check a breach list. That is a 400 with its words, which the person fixes by typing
another password. A timeout or a bad service key is ours, and reporting it as *pick
another password* sends somebody who is already locked out to try variations of a
password that was never the problem.

`PasswordRejectedError` carries the first case, thrown only on a 4xx from GoTrue. An
error the SDK did not attribute a status to is treated as a fault, because an
unattributed failure is not evidence the password was bad.

## `setPassword` on the port, and the local provider's refusal

The port grows one method, because the password is the identity provider's to hold and
this is the seam Passport replaces rather than a route.

The local dev provider **throws** rather than succeeding silently. A no-op there would
let the server clear `must_set_password` on an account whose password was never set,
which is the one claim that column must not make. `db:seed` writes dev users unflagged
for the same reason, so nothing reaches the throw in a normal dev session.

The Supabase provider builds its admin client lazily, on first use:

> *A verify-only deployment should start. It should fail where the act is attempted,
> with a message naming the two keys — not at startup with a message about a feature it
> does not use.*

`SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are already set in production for storage, so
nothing new has to be configured. **Confirm that before deploying**, because the failure
is a sentence on the set-password screen rather than a boot error.

## Both frontends — and the stated reason was wrong

This section originally read *"because both are deployed"*. **Checked against Vercel on
5 October, after the merge: that is false.** There are two BrandFactory projects,
`brandfactory-web` and `brandfactory-calendar`, and **both build `web-next`**.
`packages/web` is not deployed anywhere. `brandfactory-web` is the project MKT-0 found
repurposed from Vite to Next, still carrying both env var sets, and its name is the only
thing left pointing at the old app.

So the Vite copy of this screen is **precautionary, not load-bearing**. It costs a file
in a package that is being replaced screen by screen, and it means the day somebody
deploys `packages/web` the gate does not greet them with a wall of 403s. That is a
reasonable thing to have; it is not the reason given, and the reason given would have
had somebody believe a deployment existed that does not.

The rule that does hold either way: the **validation** is not duplicated —
`passwordProblem` lives in `@brandfactory/shared` and runs in both browsers and on the
server.

In each it is a **render gate, not a redirect**: there is no route for the screen, so
nothing to deep-link past and no URL to come back from. A redirect would leave the app's
own chrome one back-button away, which reads as a door that did not quite close.

The duplication is deliberate and temporary, like the rest of `packages/web`. The rule
it must not break is that the **validation** is not duplicated — `passwordProblem` lives
in `@brandfactory/shared` and runs in both browsers and on the server. Three copies of a
length rule is how one of them ends up disagreeing with the other two.

`PASSWORD_MIN_LENGTH` is 14, and composition rules are deliberately absent: *one
capital, one digit, one symbol* pushes people towards `Password1!` and buys very little,
while a floor somebody can satisfy with a phrase buys more. The one non-length rule
rejects a password containing the email's local part, which is the common weak choice on
a work account.

## Three corrections to existing code

**`packages/web/src/api/queries/me.ts` said something that stopped being true.** Its
docblock justified `staleTime: Infinity` with *"Nothing in the product writes to
`users`"*. `POST /me/password` writes to `users`, and `AuthBoundary` reads the field it
writes. The comment now names the write and the screen invalidates the key, because a
refetch is what `Infinity` forbids. A write that forgets to invalidate is a reader stuck
on the set-password screen after successfully setting their password.

**`callJson` would have thrown a parse error over a successful write.** `204` has no
body. Both frontends gain a `callVoid` that delegates its failure path to `callJson`
rather than copying it — on a non-ok response `callJson` always throws, so the two
cannot drift.

**`packages/web`'s `AuthBoundary.test.tsx` rendered the boundary bare**, with no
`QueryClientProvider`, and nine of its tests failed the moment the component read a
react-query hook. That is not a concession the test had to make: `main.tsx` wraps the
whole router in the provider and `__root.tsx` renders the boundary inside the route
tree, so production had always supplied it. The test was less like the app than it
looked, and the hook is what exposed it. It now renders through a `renderBoundary`
helper that supplies what the real tree does.

## Sign-in now offers a password

`/sign-in` in `web-next` leads with email and password, keeps Google, and demotes the
magic link to *Email me a sign-in link instead*. The link stays because it is a working
recovery path that costs nothing and bypasses nothing — a flagged account still meets
the set-password screen behind it. Supabase's own recovery mail covers a temporary
password that goes missing, which is why this phase needs no mailer.

`finishSignIn` was hoisted out of the mount effect into a `useCallback`, because the
password path needs the same three steps — probe `/me`, seed the store, navigate — and a
second copy of them is a second place for the destination to drift.

Supabase answers one message for a wrong password and an unknown address. That is right,
and it is passed through unchanged: telling them apart tells a stranger which of our
addresses are real.

## The deploy order, which is not the commit order

Phase C closes the door on unknown accounts. **This phase must be in production first**,
and all nine people must have set a password, before that lands. The flag is already
true for every one of them after Phase A's migration, so the sequence is: deploy this,
everyone signs in and sets a password, then deploy Phase C.

## The gate

`typecheck` 0 errors across all 11 packages. `lint` 0 errors and 0 warnings, root and
`web-next`. `format:check` clean. Both frontends build.

**3101 tests pass, 174 skipped, 0 failed** — up 29 from Phase A's 3072. The skips are
the `*.live.test.ts` files in `packages/db` that need `DATABASE_URL`.
