"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getAuthToken, logout, setToken } from "@/auth/store";

/**
 * The Supabase session — the refresh, the sign-out and the event bridge.
 *
 * Ported from `packages/web/src/auth/session.ts`. The logic is unchanged; the env vars carry
 * Next's `NEXT_PUBLIC_` prefix and the store is the module above rather than zustand.
 *
 * The client lives here, at module scope, rather than inside the sign-in component. That
 * placement is the whole point: a client that only exists while `/sign-in` is mounted cannot
 * refresh anything for the app that runs after sign-in, which is how a Supabase access token
 * (1h default `exp`) was allowed to go stale in `sessionStorage` and 401 every request until
 * the user reloaded.
 *
 * **Constructed in the browser only.** `packages/web` has no server to run on, so it could
 * build the client unconditionally; here the module is evaluated during SSR as well, and a
 * session store is a browser fact. Nothing server-side in this app fetches — every screen
 * loads its data from a client component through SWR — so there is nothing on the server that
 * would want a token.
 *
 * `detectSessionInUrl: false` — the sign-in provider exchanges the magic-link code by hand so
 * it can surface exchange errors instead of letting supabase-js log silently. `persistSession`
 * and `autoRefreshToken` are left at their defaults (both true): the refresh token belongs in
 * `localStorage`, where it outlives the tab-scoped access token copy.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  typeof window !== "undefined" && supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { detectSessionInUrl: false, flowType: "pkce" },
      })
    : null;

// De-dupes concurrent `getSession()` calls. A page mounts several SWR hooks at once and each
// one asks for a token; supabase-js serialises refreshes internally, but there is no reason to
// queue five identical awaits behind one network round-trip.
let inFlight: Promise<string | null> | null = null;

async function readSessionToken(): Promise<string | null> {
  try {
    // `getSession()` is the refresh point, not just a getter: supabase-js checks `expires_at`
    // and transparently redeems the refresh token when the access token has expired or is
    // about to.
    const { data, error } = await supabase!.auth.getSession();
    const token = data.session?.access_token;
    if (error || !token) {
      // No usable session. Fall back to whatever is stored and let the server be the authority
      // — if the stored token is genuinely dead, the 401 it earns drives the logout path, which
      // is the correct outcome. Returning null here would instead send an *unauthenticated*
      // request, which is the same 401 with less information in the server log.
      return getAuthToken();
    }
    // Keep the store in step with the session. `AuthBoundary` and the API client's header
    // callback read the store, so a refresh that only lived inside supabase-js would leave both
    // of them holding a dead token.
    if (token !== getAuthToken()) setToken(token);
    return token;
  } catch {
    // Network failure inside the refresh — send the stored token rather than nothing, for the
    // same reason as above.
    return getAuthToken();
  }
}

/**
 * The single token accessor for anything that talks to the server. Always prefer this over
 * `getAuthToken()`, which reads a cached copy that may have expired. `getAuthToken()` remains
 * correct only for presence checks, where a stale-but-present token still means "signed in".
 */
export async function getFreshAuthToken(): Promise<string | null> {
  // Local dev auth is a static server-printed token with no session behind it and nothing to
  // refresh. So is the server during SSR, where `supabase` is null by construction.
  if (!supabase) return getAuthToken();

  inFlight ??= readSessionToken().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * End the session — the identity provider first, the local store second.
 *
 * **The order is the whole function.** `logout()` is what the app reacts to: `AuthBoundary`
 * watches the token go null and sends the reader to `/sign-in`, where the provider's mount
 * effect calls `getSession()` and signs them straight back in if a session is still there.
 * Clearing the local copy while the refresh token in `localStorage` is still alive therefore
 * races the sign-out against itself, and the race is one the sign-in wins about as often as not.
 *
 * The fallback to `scope: 'local'` covers a sign-out attempted offline. The global call revokes
 * every refresh token for the user and needs the network to do it; the local one only empties
 * `localStorage`, which is what actually has to happen before the store is cleared. A
 * revoked-server-side session is the better outcome, so the global call is tried first and the
 * local one only catches what it drops.
 *
 * Note that `supabase.auth.signOut()` also fires `SIGNED_OUT`, which `startSessionSync` turns
 * into a `logout()` of its own. The explicit call below is not redundant: the sync only runs
 * when a token existed at mount, and local dev auth has no session behind it and no event to
 * emit at all.
 */
export async function signOut(): Promise<void> {
  if (supabase) {
    const failed = await supabase.auth
      .signOut()
      .then(({ error }) => !!error)
      .catch(() => true);
    if (failed) await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
  logout();
}

let syncStarted = false;

/**
 * Mirrors supabase-js session events into the store, so a background refresh (which fires on a
 * timer and on tab focus, without anyone calling `getFreshAuthToken`) updates the copy the
 * boundary and the client read. Idempotent: StrictMode mounts effects twice and a second
 * subscription would double every store write.
 */
export function startSessionSync(): void {
  if (!supabase || syncStarted) return;
  syncStarted = true;

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      logout();
      return;
    }
    if (session?.access_token && session.access_token !== getAuthToken()) {
      setToken(session.access_token);
    }
  });
}
