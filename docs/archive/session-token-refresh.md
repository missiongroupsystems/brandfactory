# Session token refresh — the app stops sending an expired token

Status: **done**. Unplanned bug fix, raised from production
(`brandfactory.fly.dev`) on 2026-07-28, not part of a tracked phase plan.

## The report

A brand hub rendered its name and description correctly, with
`Failed to load brand.` and `Failed to load threads. Thread counts are
unavailable.` in red beneath them. The console showed three 401s:

```
brandfactory.fly.dev/workspaces          401
brandfactory.fly.dev/brands/09eb740b-…   401
```

Reported as intermittent — *"sometimes this happens"* — and self-healing on
reload.

## The bug

The web app captured the Supabase access token **once**, at sign-in, and sent
that frozen string forever:

| Where | What it did |
| --- | --- |
| `auth/providers/supabase.tsx:59` | `setAuth(session.access_token, …)` at sign-in |
| `auth/store.ts` | wrote it to `sessionStorage`, served it via `getAuthToken()` |
| `api/client.ts:43` | put that same cached string on every request |

A Supabase access token is a JWT with a **1-hour default `exp`**, and the server
enforces it — `jwtVerify` in `packages/adapters/auth/src/supabase.ts:47` rejects
an expired token, which surfaces as exactly these 401s.

Nothing refreshed the stored copy. The `supabase-js` client that *does*
auto-refresh was module-scoped **inside `providers/supabase.tsx`**, a component
that only mounts on `/login`. Once signed in, no refresh listener was alive
anywhere in the process. Leave a tab open past the hour and every query 401s.

Two behaviours shaped how it presented, and both are fixed here too:

1. **It didn't redirect.** `callJson` (`api/client.ts:33`) calls `logout()` on a
   401 but never navigates, and route guards only run in `beforeLoad`. So
   nothing re-evaluated: React Query kept serving the last good brand from cache
   while every refetch failed underneath it. Hence a correct-looking header over
   red error text.
2. **It self-healed on reload**, which is why it read as intermittent: reload →
   no token → guard redirects to `/login` → `SupabaseAuthProvider`'s
   `getSession()` finds the still-valid, auto-refreshed session in localStorage
   → signs straight back in. The user never sees a login form, so the failure
   looks random rather than time-based.

## The load-bearing mechanism

**The Supabase session is the source of truth for the token; `sessionStorage`
is a cache of it.** Everything follows from moving the client to module scope
where the whole app can reach it, and routing every server-bound token read
through one accessor that consults the session before answering.

`supabase.auth.getSession()` is the refresh point, not merely a getter — it
checks `expires_at` and redeems the refresh token transparently. So "get me a
token" and "refresh if needed" are the same call, and no expiry arithmetic is
written anywhere in this repo.

## What changed

### 1. `auth/session.ts` — new module, the client's new home

Holds the `supabase` client at module scope (created only when
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are present) and exports:

- **`getFreshAuthToken(): Promise<string | null>`** — the single token accessor
  for anything that talks to the server. Calls `getSession()`, writes the result
  back into the store when it differs, returns it.
- **`startSessionSync(): void`** — mirrors `onAuthStateChange` into the store, so
  a background refresh (supabase-js fires one on a timer and on tab focus, with
  nobody calling `getFreshAuthToken`) reaches the copy the route guards read.
  `SIGNED_OUT` maps to `logout()`. Guarded by a module flag: StrictMode mounts
  effects twice, and a second subscription doubles every store write for the life
  of the tab.

Three decisions worth keeping:

- **Fall back to the stored token, never to `null`.** When there is no session,
  or `getSession()` throws, we send what we have and let the server be the
  authority. A genuinely dead token earns a 401 that drives the logout path —
  the correct outcome — and the server log records *who* it was. Returning
  `null` produces the same 401 with less information.
- **Concurrent calls de-dupe into one in-flight promise.** A brand page mounts
  several queries at once and each asks for a token. The de-dupe is per-flight,
  cleared in `.finally()` — a permanent cache would make the first token
  resolved the only token ever sent, which is the original bug wearing a
  different hat. Pinned by its own test.
- **`getAuthToken()` survives, with a narrowed remit.** It is still correct for
  *presence* checks — the `beforeLoad` guards in all eight routes, where
  stale-but-present still means "signed in". It is no longer correct for
  authenticating a request, and the comment on `getFreshAuthToken` says so.

### 2. `auth/store.ts` — a `setToken` action

The refresh path cannot use `setAuth`: it demands a `userId` that a token
rotation has no fresh source for, and passing a placeholder would overwrite a
correct one. `setToken` updates the token and `sessionStorage` while leaving
`userId` alone. (`userId` has no reader outside the store today, but a store
action that silently corrupts a field is a trap set for whoever adds the first
one.) Pinned by a test.

### 3. Four token consumers moved to `getFreshAuthToken`

| File | Call site |
| --- | --- |
| `api/client.ts` | the `hc` `headers` callback — now `async` |
| `agent/useAgentChat.ts` | before the POST that opens the SSE stream |
| `api/queries/blobs.ts` | `fetchReadUrl` and `uploadBlob` |
| `realtime/client.ts` | `connect()` |

`hono/client` awaits a `headers` callback that returns a promise —
`headers?: Record<string,string> \| (() => Record<string,string> \|
Promise<Record<string,string>>)` in the installed `hono@4.12.14`. Checked in
`node_modules`, not assumed from the docs.

In `useAgentChat` the `await` sits **before** the optimistic user-message
append, preserving the existing property that a signed-out send leaves no orphan
bubble in the cache. An agent turn can stream for minutes, but the server
authenticates once at request start, so a token that is fresh at the POST stays
good for the whole stream.

`fetchReadUrl` matters more than it looks: it runs on a 4-minute
`refetchInterval` for the life of any mounted image, which makes it the surface
most likely to be the *first* call made with an expired token.

### 4. `realtime/client.ts` — async connect, with a generation guard

The WS token goes in the URL and is verified once, at upgrade, so an open socket
legitimately outlives its token. But **every reconnect re-authenticates**, and
reconnects are exactly what happens after a laptop sleeps past the hour mark —
the old code read a cached token, so the backoff loop would retry a dead token
on every tick, forever, with the exponential delay making it look like a network
problem.

`connect()` now dispatches to an async `openSocket(generation)`. Because the
socket is constructed a microtask *after* `connect()` returns, an unsubscribe or
a reconnect landing in that window has to be able to invalidate the in-flight
attempt:

```ts
private connect() {
  this.state = 'connecting'
  void this.openSocket(++this.connectGeneration)
}
// …in openSocket, after awaiting the token:
if (generation !== this.connectGeneration || this.state !== 'connecting') return
```

`closeSocket()` bumps the generation too — it sets `state = 'idle'` and nulls
`this.ws`, so without the bump a pending attempt would build an orphan socket
that nothing holds a reference to and nothing closes. A token that fails to
resolve falls through with no `token=` param rather than aborting: the server
closes the socket and the existing backoff retries, which beats never
reconnecting at all.

### 5. `auth/AuthBoundary.tsx` — stops causing the logout it was checking for

Two changes:

- **Probe `/me` with `getFreshAuthToken()`, not the stored token.** On a boot
  more than an hour after sign-in, the stored copy is expired; probing with it
  401s and the boundary signs the user out of a session that is still perfectly
  alive behind the refresh token. The boundary was itself a source of forced
  logouts.
- **Redirect on the token going null.** A store subscription watches the
  `prev.token && !state.token` transition and navigates to `/login`. This is
  what closes symptom (1) above — every 401 handler in the app clears the token,
  and now that clearing actually moves the user somewhere. Watching the
  transition, not the value, keeps a first paint with no token (route guards
  already handle it) and a plain token *rotation* from triggering a redirect;
  both are covered by tests.

`startSessionSync()` is called here, on mount, rather than at module import —
an import-time side effect would fire in every test that touches the module
graph.

### 6. `auth/providers/supabase.tsx` — imports the client instead of building one

Two clients over one localStorage session is two refresh schedulers racing each
other. The login provider now imports `supabase` from `auth/session`.

One typecheck wrinkle worth recording: TypeScript does not carry the
null-narrowing of an *imported* binding into a nested closure (another module
could in principle reassign it), so `handleSubmit` needs a locally re-bound
`const client = supabase` after the existing guard. The guard is unchanged; only
the binding is new.

## Tests

**400 → 426 (+26)**, full suite green, no skips added.

| File | Δ | Covers |
| --- | --- | --- |
| `auth/session.test.ts` | +12 (new) | refresh + store sync, `userId` preservation, no-op on unchanged token, in-flight de-dupe, de-dupe clears after settle, both fallbacks, unconfigured/local-auth path, sync mirroring, `SIGNED_OUT`, subscribe-once |
| `auth/AuthBoundary.test.tsx` | +7 (new) | fresh-token probe, sync started, logout+redirect on a rejected refresh, redirect on external 401, **no** redirect on rotation, no-token fast path, network-error passthrough |
| `realtime/client.test.ts` | +4 (9 → 13) | token in the connect URL, **fresh token per reconnect**, tokenless connect, abandoned in-flight connect |
| `api/client.test.ts` | +3 (5 → 8) | fresh token on the wire, per-request rotation, header omitted when none resolves |

The nine existing realtime tests were rewritten to await socket construction —
they asserted synchronously on `FakeWebSocket.instances[0]`, which no longer
exists the instant `subscribe()` returns. They drain the microtask queue via a
`flush()` helper rather than guessing a tick count; fake timers don't stall
microtasks, so it stays deterministic. Two of them (`ref-counts subscribers`,
`reconnects with exponential backoff`) needed an explicit drain *before*
asserting a socket was **not** created — otherwise the assertion would pass even
if a connect had been started, which is a test that cannot fail.

Two mutation checks, both caught:

- Deleting the generation guard in `openSocket` → *abandons an in-flight
  connect…* fails.
- Reverting `AuthBoundary` to probe with the stored token → *probes /me with a
  refreshed token…* fails.

The `api/client.ts` change needs no mutation check: the test asserts
`Bearer fresh` while the store holds `expired`, so it can only pass if the
promise is genuinely awaited.

## Verification

- `pnpm test` — 416 passed, 10 skipped (the pre-existing live-Postgres skips), 0 failed.
- `pnpm typecheck` — clean across all 8 packages.
- `pnpm lint`, `pnpm format:check` — clean.
- `pnpm --filter @brandfactory/web build` — succeeds.

**Not verified live.** The failure takes an hour of wall-clock to reproduce by
definition, and this was not run against the deployed app. The honest
confirmation is: sign in, leave the tab open for over an hour, and load a brand
page without reloading. Recorded here rather than claimed, in the spirit of
1.5.0's Phase H note.

## Not done

- **No boot-time session hydration.** `sessionStorage` is per-tab, so opening
  the app in a *new* tab still has no token, still bounces through `/login`, and
  still signs in silently via `getSession()`. That is a separate (and much less
  harmful) papercut, and fixing it means blocking first paint on a session read
  in `main.tsx`. Left alone deliberately.
- **No token refresh mid-socket.** An open WS keeps its original token until it
  reconnects. Correct today, because the server verifies only at upgrade — but
  it is an assumption this repo now depends on in two places, so it is written
  down here.
