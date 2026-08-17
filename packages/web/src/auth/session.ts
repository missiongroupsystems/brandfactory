import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getAuthToken, getTokenIssuer, useAuthStore } from '@/auth/store'

// The Supabase client lives here, at module scope, rather than inside the
// login component. That placement is the whole point: a client that only
// exists while `/login` is mounted cannot refresh anything for the app that
// runs after sign-in, which is how a Supabase access token (1h default `exp`)
// was allowed to go stale in `sessionStorage` and 401 every request until the
// user reloaded.
//
// `detectSessionInUrl: false` — the login provider exchanges the magic-link
// code by hand so it can surface exchange errors instead of letting
// supabase-js log silently. `persistSession` and `autoRefreshToken` are left
// at their defaults (both true): the refresh token belongs in localStorage,
// where it outlives the tab-scoped access token copy.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { detectSessionInUrl: false, flowType: 'pkce' },
      })
    : null

/**
 * A SECOND client, bound to **Passport's** Supabase project.
 *
 * Under hosted login the session is issued by Passport's project, and a refresh token
 * is redeemable only by the GoTrue that minted it. So without this client every
 * hosted-login user is **silently signed out at token expiry** — roughly an hour in,
 * with nothing logged and no error to find. It is not an edge case: under the standard
 * login, every member's session is Passport-issued.
 *
 * Null until `VITE_PASSPORT_SUPABASE_URL` and its anon key are set, which is what keeps
 * this dark: with them absent the login router sends everyone down the app-native
 * branch and nothing here is ever reached.
 *
 * **Anon key, never a service-role key** — this file is bundled into the browser.
 *
 * Defined HERE, beside the app's own client and beside `getSession`, so the callback
 * that establishes a session and the path that later refreshes it cannot end up using
 * different clients. That divergence writes one cookie name and reads another: sign-in
 * appears to work and fails on the very next request, with nothing in either log to
 * connect the two.
 */
const passportUrl = import.meta.env.VITE_PASSPORT_SUPABASE_URL
const passportKey = import.meta.env.VITE_PASSPORT_SUPABASE_ANON_KEY

export const passportSupabase: SupabaseClient | null =
  passportUrl && passportKey
    ? createClient(passportUrl, passportKey, {
        // Same reasoning as the client above: for hosted login the code exchange runs
        // on the SERVER, so this client must not try to read the URL.
        auth: { detectSessionInUrl: false, flowType: 'pkce' },
      })
    : null

/**
 * The client that actually holds this tab's session.
 *
 * Chosen from the recorded issuer rather than by asking both, because guessing wrong is
 * silent in both directions — see `TokenIssuer` in `./store`.
 */
export function sessionClient(): SupabaseClient | null {
  return getTokenIssuer() === 'passport' ? passportSupabase : supabase
}

// De-dupes concurrent `getSession()` calls. A brand page mounts several
// queries at once and each one asks for a token; supabase-js serialises
// refreshes internally, but there is no reason to queue five identical awaits
// behind one network round-trip.
let inFlight: Promise<string | null> | null = null

async function readSessionToken(): Promise<string | null> {
  try {
    // On the client that HOLDS the session: a Passport-issued refresh token is
    // redeemable only by Passport's GoTrue.
    const client = sessionClient()
    if (!client) return getAuthToken()

    // `getSession()` is the refresh point, not just a getter: supabase-js
    // checks `expires_at` and transparently redeems the refresh token when the
    // access token has expired or is about to.
    const { data, error } = await client.auth.getSession()
    const token = data.session?.access_token
    if (error || !token) {
      // No usable session. Fall back to whatever is stored and let the server
      // be the authority — if the stored token is genuinely dead, the 401 it
      // earns drives the logout path, which is the correct outcome. Returning
      // null here would instead send an *unauthenticated* request, which is
      // the same 401 with less information in the server log.
      //
      // ⚠️ **DO NOT add `logout()` here, however tempting it looks.** This fallback is
      // what makes a Passport outage degrade instead of erasing everyone: a timeout or
      // a 5xx from the refresh is indistinguishable *at this point* from a revocation,
      // and treating either as "signed out" turns a ten-minute blip into a mass logout
      // of every signed-in user — who then cannot sign back in, because the thing that
      // is down is the login.
      //
      // Both cases already end correctly without it. On an outage the stored access
      // token is still valid and requests keep working. On a genuine revocation the
      // access token stays valid until its own `exp` — which is the defined semantics
      // of revoking a REFRESH token — and the first 401 after that drives the logout
      // through `callJson`. Pinned by a test in `session.test.ts`.
      return getAuthToken()
    }
    // Keep the store in step with the session. Route guards (`beforeLoad`) and
    // the realtime socket read the store synchronously, so a refresh that only
    // lived inside supabase-js would leave both of them holding a dead token.
    if (token !== getAuthToken()) {
      useAuthStore.getState().setToken(token)
    }
    return token
  } catch {
    // Network failure inside the refresh — send the stored token rather than
    // nothing, for the same reason as above.
    return getAuthToken()
  }
}

// The single token accessor for anything that talks to the server. Always
// prefer this over `getAuthToken()`, which reads a cached copy that may have
// expired. `getAuthToken()` remains correct only for presence checks (route
// guards) where a stale-but-present token still means "signed in".
export async function getFreshAuthToken(): Promise<string | null> {
  // Local dev auth is a static server-printed token with no session behind it
  // and nothing to refresh.
  if (!sessionClient()) return getAuthToken()

  inFlight ??= readSessionToken().finally(() => {
    inFlight = null
  })
  return inFlight
}

/**
 * End the session — the identity provider first, the local store second.
 *
 * **The order is the whole function.** `logout()` is what the app reacts to:
 * `AuthBoundary` watches the token go null and redirects to `/login`, where
 * `SupabaseAuthProvider`'s mount effect calls `getSession()` and signs the user
 * straight back in if a session is still there. Clearing the local copy while
 * the refresh token in localStorage is still alive therefore races the sign-out
 * against itself, and the race is one the sign-in wins about as often as not.
 *
 * ## `scope: 'local'` is not a detail — it is the difference between signing
 * ## out of this app and signing out of the whole suite
 *
 * Every GoTrue client — `supabase-js` included — defaults `signOut()` to
 * **`scope: 'global'`**, which revokes *every* refresh token that person holds
 * **in the project**. Today BrandFactory's sessions come from its own Supabase
 * project, so that only reaches BrandFactory's own tabs. Under Mission
 * Passport's hosted login a member's session is issued by **Passport's**
 * project, shared by every consumer app in the suite — so the default would
 * make this button sign the person out of every other Mission Systems app and
 * of Passport's own console.
 *
 * **The symptom is delayed, which is why nobody attributes it to this
 * function.** Sign-out revokes the *refresh* token; the access token is a JWT
 * that stays valid until it expires. The other apps keep working normally and
 * then throw everyone out at their next refresh, up to a token lifetime later.
 * "I signed out of BrandFactory at 09:05" and "the other app logged me out at
 * 09:52" do not look like the same event, and it gets filed as flaky sessions.
 *
 * So: **`local`, always, on both calls.** `scope: 'others'` is not a middle
 * ground — same blast radius, minus this tab. "Sign out everywhere" has exactly
 * one home suite-wide, the Passport console's confirmed action, and a consumer
 * never implements its own. Nor does this button redirect to Passport's
 * `/logout`: that ends the person's *SSO session*, so the next app they open
 * makes them sign in again — a different promise from "sign out of this app".
 *
 * `auth/signout-scope.test.ts` sweeps the source for any call site that omits
 * the scope, because a behavioural test only covers the call sites that exist
 * today and the real failure mode is the next one somebody adds.
 *
 * The second call is the offline path: the first needs the network to reach
 * GoTrue, while the retry only has to empty localStorage, which is what must
 * happen before the store is cleared.
 *
 * Note that `supabase.auth.signOut()` also fires `SIGNED_OUT`, which
 * `startSessionSync` turns into a `logout()` of its own. The explicit call
 * below is not redundant: the sync only runs when a token existed at mount, and
 * local dev auth has no session behind it and no event to emit at all.
 */
export async function signOut(): Promise<void> {
  // On the client that HOLDS the session. The two clients write differently-named
  // cookies, so signing out with the wrong one clears nothing that matters and the
  // person stays signed in — the mirror image of the refresh trap above, and just as
  // quiet.
  const client = sessionClient()
  if (client) {
    const failed = await client.auth
      .signOut({ scope: 'local' })
      .then(({ error }) => !!error)
      .catch(() => true)
    if (failed) await client.auth.signOut({ scope: 'local' }).catch(() => undefined)
  }
  useAuthStore.getState().logout()
}

let syncStarted = false

// Mirrors supabase-js session events into the auth store, so a background
// refresh (which fires on a timer and on tab focus, without anyone calling
// `getFreshAuthToken`) updates the copy the route guards read. Idempotent:
// StrictMode mounts effects twice and a second subscription would double every
// store write.
export function startSessionSync(): void {
  if (syncStarted) return
  const clients = [supabase, passportSupabase].filter((c): c is SupabaseClient => c !== null)
  if (clients.length === 0) return
  syncStarted = true

  // BOTH clients, because either may hold the session and only the one holding it
  // emits. Subscribing to our own project alone would leave a hosted-login user's
  // background refresh invisible to the route guards, which read the store
  // synchronously — the exact staleness this sync exists to prevent.
  for (const client of clients) {
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        useAuthStore.getState().logout()
        return
      }
      if (session?.access_token && session.access_token !== getAuthToken()) {
        useAuthStore.getState().setToken(session.access_token)
      }
    })
  }
}
