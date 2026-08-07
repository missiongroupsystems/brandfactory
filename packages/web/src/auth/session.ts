import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getAuthToken, useAuthStore } from '@/auth/store'

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

// De-dupes concurrent `getSession()` calls. A brand page mounts several
// queries at once and each one asks for a token; supabase-js serialises
// refreshes internally, but there is no reason to queue five identical awaits
// behind one network round-trip.
let inFlight: Promise<string | null> | null = null

async function readSessionToken(): Promise<string | null> {
  try {
    // `getSession()` is the refresh point, not just a getter: supabase-js
    // checks `expires_at` and transparently redeems the refresh token when the
    // access token has expired or is about to.
    const { data, error } = await supabase!.auth.getSession()
    const token = data.session?.access_token
    if (error || !token) {
      // No usable session. Fall back to whatever is stored and let the server
      // be the authority — if the stored token is genuinely dead, the 401 it
      // earns drives the logout path, which is the correct outcome. Returning
      // null here would instead send an *unauthenticated* request, which is
      // the same 401 with less information in the server log.
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
  if (!supabase) return getAuthToken()

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
 * The fallback to `scope: 'local'` covers a sign-out attempted offline. The
 * global call revokes every refresh token for the user and needs the network to
 * do it; the local one only empties localStorage, which is what actually has to
 * happen before the store is cleared. A revoked-server-side session is the
 * better outcome, so the global call is tried first and the local one only
 * catches what it drops.
 *
 * Note that `supabase.auth.signOut()` also fires `SIGNED_OUT`, which
 * `startSessionSync` turns into a `logout()` of its own. The explicit call
 * below is not redundant: the sync only runs when a token existed at mount, and
 * local dev auth has no session behind it and no event to emit at all.
 */
export async function signOut(): Promise<void> {
  if (supabase) {
    const failed = await supabase.auth
      .signOut()
      .then(({ error }) => !!error)
      .catch(() => true)
    if (failed) await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
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
  if (!supabase || syncStarted) return
  syncStarted = true

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      useAuthStore.getState().logout()
      return
    }
    if (session?.access_token && session.access_token !== getAuthToken()) {
      useAuthStore.getState().setToken(session.access_token)
    }
  })
}
