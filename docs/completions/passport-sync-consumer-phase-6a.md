# Passport sync consumer, phase 6A — the login, server half

**Status:** complete, 2026-08-17. Written against `main` at **1.36.0**
(2122 passed | 92 skipped before → **2168 passed | 92 skipped** after; +46 tests).

Executes the backend half of phase 6 of
[`docs/executing/passport-sync-consumer-plan.md`](../executing/passport-sync-consumer-plan.md).

**Migration 0014.** It **lands dark**: `PASSPORT_SUPABASE_URL` is unset, so SSO is
inactive, `/auth/resolve-login` answers `app-native` for everybody, and the existing
magic-link and Google sign-in are untouched.

**The frontend half (6B) is not built** — see §8. The split is deliberate: without
Passport's project configured there is no way to click through hosted login, so a UI
built now could not be verified at all, while the backend can be curled.

---

## What landed

| File | Purpose |
| --- | --- |
| `passport/token.ts` | Verify a token against **Passport's** project; `ssoActive` |
| `passport/provision.ts` | Resolve or provision the local `users` row, by verified email |
| `passport/login-routing.ts` | The routing decision — one function over one boolean |
| `passport/pkce.ts` | Challenge, attempt creation, single-use redemption |
| `passport/session-exchange.ts` | The one hand-rolled Passport call |
| `passport/gate.ts` | The callback's access gate |
| `passport/rate-limit.ts` | Fixed-window, IP and email buckets |
| `routes/passport-auth.ts` | `/auth/resolve-login`, `/auth/passport/start`, `/auth/passport/callback` |
| `middleware/auth.ts` | The second accepted issuer, and `tokenIssuer` in the context |
| `db/schema/passport_login_attempts.ts` + query | The server-side PKCE store |
| `db/queries/users.ts` | `findUsersByEmail`, case-insensitive, plural |
| `env.ts`, `.env.example` | `APP_BASE_URL` |

Tests: 28 for the router, 12 for the middleware (5 new), 7 for the provisioner, plus
the env additions.

## 1. Two bugs found by reading, before they could bite

Both are why the contract insists on resolving by **verified email**.

- **`upsertUserById` conflicts on `id` only.** A Passport `sub` for somebody who already
  has an app-native row with the same email violates the `users.email` unique index.
  The auth adapter *swallows* that failure, the subsequent lookup misses, and the person
  gets a 404 from `/me` holding a perfectly valid token. **Every member with a legacy
  local account would have been unable to sign in.**
- **`getUserByEmail` compares exactly.** It cannot find a case-variant row, so it cannot
  report the ambiguity either. `findUsersByEmail` is case-insensitive and returns **every**
  match, because the count is the point: on a path that hands out a session, picking the
  first silently authenticates somebody as the wrong person. The durable fix is a
  case-insensitive unique index on `users.email`; that is recorded at the query.

## 2. One bug found by curling, which no test caught

`/auth/passport/start` answered a **JSON 500** instead of redirecting — the precise
failure the "always redirect" property exists to prevent, since this route is reached by
top-level navigation and that body renders as the entire page.

The cause: `APP_BASE_URL` was unset, the failure branch built a relative URL, and
**`Response.redirect` requires an absolute URL and throws on a relative one.** The throw
escaped to the error boundary.

Two fixes, and the first is more interesting than a bug fix:

- **Relative is not a degraded case here — it is correct for one of two real
  topologies.** In development BrandFactory is single-origin, because Vite proxies
  `/api`, `/rt` and `/blobs` to the server, so a relative `/login` is right and an
  absolute one would be wrong. Only a split-origin deployment needs `APP_BASE_URL`. So
  `frontendPath()` uses the configured origin when there is one, falls back to relative,
  warns when missing, and uses `c.redirect` (which accepts both) rather than
  `Response.redirect`.
- **Both browser-facing routes now have a catch-all** that redirects. The anticipated
  failures already did; this is what makes the *unanticipated* ones redirect too. Three
  regression tests cover it, including a store that throws where no named branch handles
  it.

Re-verified against a running server on the real `.env`:

```
POST /auth/resolve-login  "member@acme.test"   {"route":"app-native"}  200
POST /auth/resolve-login  "stranger@x.test"    {"route":"app-native"}  200
POST /auth/resolve-login  "not-an-email"       {"route":"app-native"}  200
GET  /auth/passport/start                      302 -> /login?error=passport_unavailable
GET  /auth/passport/callback?code=x&state=y     302 -> /login?error=passport_sso_failed
```

Three identical answers, and redirects rather than JSON. Everyone routes `app-native`
because SSO is inactive — correct, and the whole reason this can ship dark.

## 3. A latent breakage from phase 2, fixed here

`drizzle.config.ts` globs `./src/schema/**/*.ts`, and drizzle-kit loads every match with
`require()`. Phase 2 put `projection.test.ts` inside that tree *after* running
`db:generate`, so **`db:generate` was broken on `main`** — it died with "Vitest cannot be
imported in a CommonJS module using require()" and would have done so for anyone.

Moved to `src/passport-projection-schema.test.ts`, with the reason written at the top of
the file: the schema directory holds schema and nothing else.

## 4. The router's six properties, each pinned by a test

The shape is a security control, and the test matters more than usual: this gets
re-litigated about once per product manager, with real UX evidence behind it, and a
passing test is the only thing that survives the argument.

1. **Two routes, never three.** A member, a stranger, a malformed address and an unknown
   address all return a body with **exactly one key**. A non-member and a nonexistent
   email are indistinguishable — `app-native` means "type a password", never "this
   account exists".
2. **No format validation before routing.** `not-an-email` gets a 200 and a route, because
   rejecting it up front would leak "this isn't even valid" *ahead of* the decision.
   Only the length is capped, at 320 octets, and only to bound the rate limiter's keys.
3. **Two buckets, IP and email.** Tested both ways: varying the IP does not defeat the
   email bucket, and varying the email does not defeat the IP bucket.
4. **`/passport/start` redirects on every failure** — see §2.
5. **`/passport/start` is rate-limited**, because it writes an unauthenticated row.
6. **Both branches cost the same wall time.** The membership lookup runs
   **unconditionally**, even with SSO off, and a test asserts it was called twice. A
   two-valued endpoint is still an oracle if one branch hits the database and the other
   returns early.

An ambiguous pair of case-variant memberships routes `app-native` — the safe direction:
it cannot hand a session to the wrong person, and the operator sees the ambiguity in the
projection rather than in a support ticket.

## 5. PKCE, and what the verifier must never touch

The verifier lives in `passport_login_attempts`, keyed by the opaque `state`. It never
reaches the browser — not a cookie, not `localStorage`, not a query parameter — because
that is the entire point: it is what stops any party who intercepts an authorization
code from redeeming it, **including Passport**. A test asserts the verifier does not
appear in the redirect.

- **Single-use is structural.** `redeemPassportLoginAttempt` is one atomic
  `DELETE … RETURNING`, so two concurrent callbacks for one `state` cannot both succeed.
  Read-then-delete would leave a replay window, and replay is what `state` exists to
  prevent. Tested by replaying a real callback.
- **The challenge is unpadded base64url**, asserted — a padded challenge is a different
  string and the exchange then fails with a flat refusal that says nothing.
- **The table is app-owned and lives in `public`**, not in the `passport` schema: nothing
  in it arrives from a sync event, so it is rule 7's carve-out used as intended.
- Written by unauthenticated requests, so three things bound it: the route's rate limit,
  a TTL, and a sweep of expired rows on every insert.

## 6. The second issuer, and the clause order that decides everything

`middleware/auth.ts` tries the adapter first and falls through to Passport. A
Passport-issued token fails the first attempt with "no signing key matches this kid" —
**the normal case for an SSO user, not an outage.**

**An expired token is checked FIRST and is terminal.** Retrying it against Passport's
issuer would fail there too and only hide the real reason. That ordering is the whole
trap: the mirror of it — a narrower check placed *above* the broader one, to give it a
nicer message — 401'd every Passport-authenticated request for another consumer's entire
SSO rollout. A test asserts the fallthrough is not even attempted for an expired token.

`c.var.tokenIssuer` now records which issuer signed the request. Two things need it and
neither can recover it later without re-verifying: the sign-out must run on the client
that holds the session, and phase 9's structure write-through may forward **only** a
Passport-issued token.

**Reversible in both directions**, and tested: with SSO inactive the middleware behaves
exactly as before, and a Passport token is simply refused.

## 7. The gate on the callback

Three outcomes, and the middle one is the one people forget:

- **not a member → DENY**, not "skip the access check". The local resolver returns an
  existing row on a bare email match, so a *removed* member with a legacy row would
  otherwise walk straight in. Tested.
- **member with no access → DENY** with its own code. Membership is not access.
- **member with access → in.**

It **fails open on access while no entitlement has synced**, deliberately: before the
projection lands every derivation is empty, so denying on that would lock out the whole
company on the day SSO is switched on. Membership itself never fails open, which is what
keeps this from being a hole. Both branches tested.

## 8. The gap this phase does NOT close

**BrandFactory's magic link and Google button go straight from the browser to Supabase
GoTrue, with no server endpoint in between.** So a member can still request a magic link
from BrandFactory's own project and authenticate around Passport's MFA, session policy
and revocation entirely. **The router is the decision; it is not the enforcement.**

This is stated at the top of `routes/passport-auth.ts` so nobody reads the router's
existence as the door being shut. The fix, for 6B:

- **Proxy the magic-link request** through a server endpoint that re-checks
  `isActiveMember` and refuses a member (`403`, pointing at hosted login), keeping the
  response **non-committal either way** ("if that address has an account, we've sent a
  link") so the enumeration oracle is not rebuilt in the recovery flow. Same helper as
  the router — one implementation, never a fork.
- **Google is an OAuth flow at our own project and cannot be proxied the same way.**
  Either restrict it to the `app-native` branch in the UI *and* refuse a member at the
  first request their session makes, or drop it for members. That is a product decision.

Also not built, and all frontend (6B): the two-step login screen, the second Supabase
client bound to Passport's project for **refresh** (without it every hosted-login user is
silently signed out at token expiry), the `/auth/passport/complete` route that reads the
fragment, and the outage handling that must tell a genuine `401/403` from a timeout —
collapsing those two turns a ten-minute Passport blip into a mass logout of people who
then cannot sign back in, because the thing that is down is the login.

Phase 1 already fixed the sign-out scope, so that trap is closed ahead of 6B.

## 9. The gate

```
pnpm typecheck                    all 11 packages    pass
pnpm lint                         eslint, whole repo pass
pnpm format:check                 prettier           pass
pnpm test                         2168 passed | 92 skipped
pnpm -F @brandfactory/web build   tsc + vite         pass
```

Plus the manual curl run in §2, against a migrated throwaway database that was removed
afterwards.

## 10. Needed from the operator

| Needed | Blocks |
| --- | --- |
| `PASSPORT_SUPABASE_URL` — Passport's Supabase project | activating SSO at all |
| `PASSPORT_DASHBOARD_URL` — the **browser** host, a different host from the API | `/passport/start` |
| The callback registered on Passport's **per-app** allow-list (Apps → the app → *Sign-in callbacks*), matching byte for byte | the exchange; a mismatch is a flat `403` that says nothing |
| `APP_BASE_URL`, if the web app is a different origin from the API | a correct redirect home |
| Passport's **anon** key for the browser client | 6B's refresh path |
| An **entitlement** for an org on **Marketing Base** | any real access at all |

Note that `PASSPORT_SSO_ENABLED` stays unset: it defaults on and is gated on
`PASSPORT_SUPABASE_URL`, so an environment without Passport's project stays app-native
with no flag for anyone to remember.
