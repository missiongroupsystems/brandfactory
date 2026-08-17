# Passport sync consumer, phase 6B — the login screen, and the two silent sign-outs it found

**Status:** complete. 2026-08-18, on `feat/passport-sync` at **1.40.0**.

Executes phase 6B of
[`docs/executing/passport-sync-consumer-plan.md`](../executing/passport-sync-consumer-plan.md),
the browser half of the email-first login whose server half landed in 1.37.0.

**No migration.** The screen becomes two steps, a second Supabase client arrives to hold
hosted-login refreshes, and `/auth/passport/complete` receives the session. **2259 tests**
(+55).

Everything still lands **dark**: `VITE_PASSPORT_SUPABASE_URL` and its anon key are unset, so
`passportSupabase` is null, the server routes everyone to `app-native`, and the visible change
is one extra click on the way to the magic link.

---

## 1. What the screen is now

Step 1 is **one email field and a Continue button**. Nothing else — no Google button, no
"sign in with SSO", no toggle. Continue POSTs the address to the app's own
`/auth/resolve-login`, which answers `passport` or `app-native` and nothing else.

- `passport` → a **full-page** `location.assign('/api/auth/passport/start')`. Not a fetch: the
  browser has to follow the redirect chain to Passport and back, and a `fetch` here "succeeds"
  with a 302 and then does nothing at all.
- `app-native` → step 2 is revealed **in place**, with no page transition: the magic link and
  the Google button, exactly as before.

The point of the shape is that **the person is never asked which kind of account they have**,
because most people do not know. A provider toggle is the thing this screen exists to remove,
which is why `supabase.test.tsx` asserts the absence of one rather than the presence of a form.

Two decisions inside step 2 are worth recording:

- **The email field stays editable** rather than being echoed back with a "Change" link. The
  echo was written first and is wrong twice over: a typo is the most common failure on this
  screen and an editable field fixes it with no extra control, and a visitor who arrives on an
  `?error=` (below) starts on step 2 **with no email at all** — an echo would render an empty
  line above a disabled button.
- **The app-native branch stays forever.** It is the non-member path *and* the degradation
  path. Deleting it once SSO works would make Passport a hard availability dependency for
  signing in, with no way back if the OAuth configuration is wrong.

`resolveLoginRoute` **falls back to `app-native` on every failure** — a 500, a 404 from an
older deployment, a thrown network error, a body that is not the expected shape, and any
`route` value that is not the exact string `passport`. The asymmetry is the reason: a member
routed to app-native by mistake sees a step they may not be able to use, which is visible and
recoverable, while a non-member routed to hosted login is stranded at Passport with no account
and no way back.

## 2. Two silent sign-outs, both found while building this

Neither was in the plan. Both make a hosted-login user's session die about an hour after it
starts, with nothing logged.

### 2a. The refresh had no client to run on

A refresh token is redeemable only by the GoTrue that minted it. A member's session is issued
by **Passport's** Supabase project, so the app's own client cannot refresh it — it finds no
session, the access token expires in place, and the person is signed out roughly an hour in.
Under the standard login that is **every member**, not an edge case.

So `session.ts` now builds a **second client**, `passportSupabase`, and `sessionClient()`
picks between them from a persisted `TokenIssuer` (`bf_token_issuer`). `readSessionToken`,
`signOut` and `startSessionSync` all route through it — the last subscribing to **both**
clients, because either may hold the session and only the one holding it emits.

Both are defined in one file, beside `getSession`, so the callback that establishes a session
and the path that later refreshes it cannot end up using different clients.

### 2b. `setAuth`'s default undid the issuer on every page load

This one is worse, because it defeats 2a entirely and looks like nothing.

`setAuth(token, userId, issuer = 'app-native')` reads as harmless — only the hosted-login
route passes anything else. But `AuthBoundary`'s boot probe calls `setAuth(token, data.id)` on
**every page load** of a signed-in app, because it is re-confirming a session and has no way
to know which project issued it. With a defaulted third argument, **one reload rewrites a
`passport` session as `app-native`**, and from then on the refresh and the sign-out both
address the wrong project.

The fix is a semantic, not a call-site correction: **an omitted `issuer` preserves the
recorded one.** `issuer ?? readIssuer() ?? 'app-native'`. Reading from `sessionStorage` rather
than from the store matters — after a reload the probe runs in a fresh module graph.

Then, so that "omitted" means something specific: **only a sign-in states the issuer**, and
all three now do so explicitly (`providers/supabase.tsx` and `providers/local.tsx` →
`app-native`, the callback route → `passport`). Anything re-confirming a session omits it.

This needed a **source sweep**, not just a store test. The plausible regression is somebody
seeing a two-argument call to a three-parameter function in `AuthBoundary` and "completing"
it with `'app-native'`: it compiles, it lints, every behavioural test still passes, and it
reads as *more* explicit than what it replaced. `setauth-issuer.test.ts` checks both
directions — no non-sign-in file passes an issuer, and every sign-in file does. Proven by
making that exact edit: 2 of 4 cases fail.

## 3. The error arrival, and the infinite bounce it would have been

The server's `/auth/passport/callback` redirects failures to `/login?error=<code>`. Two
things were wrong with reading that.

**The raw code was rendered.** `readInitialUrlError` read `error_description ?? error`
first, so the `loginErrorMessage` lookup below it was unreachable and the person saw the
string `no_access`. Our codes are now read **first**.

That only works because the code set is **closed**. Supabase's own magic-link errors arrive
in the *same* `?error=` parameter, so a catch-all `default:` in `loginErrorMessage` would
swallow a real magic-link failure and replace it with an SSO message. It returns `null` for
anything that is not ours — and the price of that is a code the server sends and the browser
does not know rendering as **nothing at all**: a login screen with no explanation and no
error anywhere to find it by. `passport-auth-error-codes.test.ts` closes that by sweeping the
server for `fail('…')` and comparing both directions, including flagging a declared code the
server has stopped sending. Proven by adding a `fail('passport_misconfigured')`: 3 of 4 cases
fail.

**And an error arrival started on step 1**, where the only control is Continue — which routes
the same address straight back to the branch that just refused it. For `no_access` and
`passport_sso_failed` neither clears by retrying, so that is an **infinite bounce**. It also
made the copy lie: two messages say "sign in with a magic link below", and on step 1 there is
no magic link below. **Any** error in the URL now starts on step 2, Supabase's included —
they arrive from the app-native branch, which is where that lands.

## 4. `/auth/passport/complete`

The server's callback redirects here with the session in a **URL fragment**, which is a
security property and not a formatting choice: a fragment is never sent to a server, so the
tokens cannot land in an access log or a `Referer`. The page strips it via
`history.replaceState` **before** branching on its contents, so a reload or a shared link
never carries a live session — and so a half-formed fragment is not left in the address bar
while an error renders.

It then calls `setSession` on **Passport's** client, resolves the person through **our**
`/me` (the same call the app-native branch makes, so both converge on one identity source
rather than trusting a token claim), records the issuer as `'passport'`, and navigates to `/`.

It carries **no `beforeLoad` guard**, deliberately. Every other route redirects a signed-in
visitor to `/`; this page's job is to *create* the session, and a stale token from a previous
one would bounce the person away before the new session exists — leaving them signed in as
whoever they were before.

Every failure path renders a message and a link back to `/login`, because the page has no
other controls: without one, a failed sign-in is a screen that says "Signing you in…" for
ever. Verified by breaking both load-bearing lines at once (the wrong client, the omitted
issuer): 10 of 12 cases fail.

## 5. What the tests cover, and one thing they do not

| File | Cases | Pins |
| --- | --- | --- |
| `auth/resolveLogin.test.ts` | 12 | the four fallbacks, the exact-string check, the two messages whose wording is load-bearing |
| `auth/providers/supabase.test.tsx` | 12 | step 1 offers no choice; a member never reaches step 2; error arrivals land on step 2; both error namespaces still read |
| `routes/auth.passport.complete.test.tsx` | 12 | Passport's client, the `'passport'` issuer, the fragment stripped first, every error legible, no guard |
| `auth/setauth-issuer.test.ts` | 4 | only a sign-in states the issuer, in both directions |
| `auth/passport-auth-error-codes.test.ts` | 4 | the server's codes and the browser's copy, in both directions |
| `auth/session.test.ts` | +3 | preserve-on-omit, across a reload, and that a sign-in can still change it |

**One harness detail is worth reading before touching these.** jsdom marks
`location.assign` a read-only, non-configurable own property, so it cannot be replaced in
place — and a `Proxy` cannot help, because returning anything but the real function from a
`get` trap violates a proxy invariant and throws. It has to go through `window`. But
`defineProperty(window, 'location', { value: { ...location } })` is a **snapshot**:
`history.replaceState` then updates the real Location while the component keeps reading a
frozen `href`, so every URL-driven case sees a bare `/login`, renders step 1, and fails as
though the component were wrong. The stub uses a live getter per URL field. Both dead ends
are recorded at the code, because the second one costs an hour and reads as a product bug.

**Not covered:** the wiring itself — that `loginRoute` renders `SupabaseAuthProvider` and that
`passportCompleteRoute` is in `appRoutes`. Both are one line in `router.tsx` and covered by
`tsc` only in the sense that the import resolves.

## 6. The gate

```
pnpm typecheck                    all 11 packages           pass
pnpm lint                         eslint, whole repo        pass
pnpm format:check                 prettier                  pass
pnpm test                         2259 passed | 92 skipped
pnpm -F @brandfactory/web build   tsc + vite                pass
```

## 7. Still open

- **The magic-link bypass**, unchanged from the 1.37.0 note and now the largest gap. The
  router is a *decision*, not an enforcement: BrandFactory's magic link and Google button go
  straight from the browser to GoTrue, so a member who reaches step 2 by any means can
  authenticate around Passport. The fix is a server-side proxy that refuses an active member
  with a non-committal response. It changes the live app-native login path, so it wants its
  own pass.
- **Nothing here has run against a real Passport project.** Every hosted-login case is
  covered by a test with a mocked client; the `?error=` paths, the fragment shape, and the
  refresh on Passport's project are all unverified end to end. That needs the config in §8
  **and** an entitlement.
- **Phase 8** (retire `brands` / `workspaces` as shadows) still blocks the unit-scoped
  request path, and still waits on decision **D1**.
- **Phase 9**, the structure write-through (proposal §7).

## 8. Needed from the operator

Each is already documented in `packages/web/.env.example` and the server's `.env.example`.

| Needed | Without it |
| --- | --- |
| `VITE_PASSPORT_SUPABASE_URL` + `VITE_PASSPORT_SUPABASE_ANON_KEY` | `passportSupabase` is null; a hosted-login session cannot be established or refreshed. Must name the **same project** as the server's `PASSPORT_SUPABASE_URL`. |
| `APP_BASE_URL` on the server | the callback cannot build an absolute redirect |
| A per-app callback registered with Passport | the hosted-login round trip cannot complete |
| An **entitlement** for an org on **Marketing Base** | nothing routes to `passport` at all, so none of this is reachable |
| `PASSPORT_REPO_TOKEN` | CI, still red |
