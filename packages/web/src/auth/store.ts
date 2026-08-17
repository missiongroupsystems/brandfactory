import { create } from 'zustand'

const TOKEN_KEY = 'bf_token'
const ISSUER_KEY = 'bf_token_issuer'

/**
 * Which project issued the session this tab holds.
 *
 * `app-native` — BrandFactory's own Supabase project (magic link, Google).
 * `passport` — Mission Passport's project, via hosted login.
 *
 * **Recorded because the refresh and the sign-out must run on the client that
 * actually holds the session.** The two clients write differently-named cookies and
 * keep separate refresh schedulers, so using the wrong one is silent both ways:
 * refreshing on the wrong client finds nothing and lets the token expire in place,
 * and signing out on the wrong client clears nothing and leaves the person signed
 * in.
 *
 * Persisted rather than derived, because after a reload both clients restore
 * independently and asking each one in turn costs a round trip to guess something we
 * already knew.
 */
export type TokenIssuer = 'app-native' | 'passport'

function readIssuer(): TokenIssuer | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem(ISSUER_KEY)
  return raw === 'passport' || raw === 'app-native' ? raw : null
}

interface AuthState {
  token: string | null
  userId: string | null
  issuer: TokenIssuer | null
  /** `issuer` omitted PRESERVES the recorded one — see the implementation. */
  setAuth: (token: string, userId: string, issuer?: TokenIssuer) => void
  setToken: (token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null,
  userId: null,
  issuer: readIssuer(),
  /**
   * `issuer` omitted means **leave the recorded issuer alone**, not "app-native".
   *
   * ## The bug this shape exists to stop
   *
   * A plain `issuer = 'app-native'` default reads as harmless — only the hosted-login
   * route passes anything else, so what could overwrite it? `AuthBoundary`'s boot probe,
   * which calls `setAuth(token, data.id)` on **every page load** of a signed-in app. With
   * a defaulted argument, one reload rewrites a `passport` session as `app-native`, and
   * from then on the refresh and the sign-out both run against the wrong GoTrue project.
   *
   * Every symptom is delayed and silent. The reload works. Every request works. About an
   * hour later the refresh finds no session on the app's own client, and the person is
   * signed out with nothing logged anywhere — which is precisely the failure the issuer
   * was introduced to prevent, reintroduced by the default meant to make it convenient.
   *
   * So: **only a sign-in states the issuer, and the two that exist state it explicitly**
   * (`providers/supabase.tsx`, `providers/local.tsx` → `app-native`;
   * `routes/auth.passport.complete.tsx` → `passport`). Anything else re-confirming an
   * existing session omits it and preserves what is there. `app-native` remains the
   * answer when nothing is recorded at all, which is a first sign-in on a build that
   * predates this field.
   */
  setAuth: (token, userId, issuer) => {
    const resolved = issuer ?? readIssuer() ?? 'app-native'
    sessionStorage.setItem(TOKEN_KEY, token)
    sessionStorage.setItem(ISSUER_KEY, resolved)
    set({ token, userId, issuer: resolved })
  },
  // Token-only update for session refresh: the access token rotates roughly
  // hourly while the identity behind it does not, so `userId` must survive.
  // `setAuth` can't do this job — it demands a userId the refresh path has no
  // fresh source for, and passing a placeholder would silently corrupt it.
  setToken: (token) => {
    sessionStorage.setItem(TOKEN_KEY, token)
    set({ token })
  },
  logout: () => {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(ISSUER_KEY)
    set({ token: null, userId: null, issuer: null })
  },
}))

// Safe to call outside React (beforeLoad, API client interceptors).
export function getAuthToken(): string | null {
  return useAuthStore.getState().token
}

/** Which project issued the current session, for picking the right client. */
export function getTokenIssuer(): TokenIssuer | null {
  return useAuthStore.getState().issuer
}
