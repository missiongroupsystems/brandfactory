"use client";

import * as React from "react";

/**
 * The session token, and who it belongs to.
 *
 * Ported from `packages/web/src/auth/store.ts`, with one substitution: zustand out,
 * `useSyncExternalStore` in. The semantics are identical — same `bf_token` key, same
 * `sessionStorage`, same three writers, and `setToken` still exists separately from `setAuth`
 * for the same reason (the access token rotates roughly hourly while the identity behind it
 * does not, and `setAuth` would demand a `userId` the refresh path has no fresh source for).
 *
 * **Why not zustand.** The one zustand store this app had was `features/spaces`'s, and it
 * left with that feature — the dependency is gone. Even while it was here it was no licence
 * to keep this one there too: the rule in `AGENTS.md` is about an *editing draft*, and this is
 * neither a draft nor server state — it is a browser fact that does not exist on the server.
 * Under SSR the Vite store's module-scope `sessionStorage.getItem`
 * is a `ReferenceError`, and merely guarding it is not enough either: the guarded version
 * renders "signed out" into the static HTML and then hydrates over a client that is signed in,
 * which React reports as a mismatch and a reader sees as a flash of the wrong app.
 *
 * `useSyncExternalStore` is the API for exactly this. The server snapshot is a frozen
 * signed-out state, so the prerender is honest about what a server can know; the client
 * snapshot is read from storage at module scope in the browser only, and React re-renders once
 * after hydration if the two differ. It is the shape `features/brands/active-brand.ts`
 * introduced in 1.32.0 for the brand preference, applied to the thing that gates the app.
 *
 * Nothing here is React-only: `getAuthToken()` and `logout()` are called from the API client
 * and from `session.ts`, neither of which is a component.
 */

const TOKEN_KEY = "bf_token";

export interface AuthState {
  token: string | null;
  userId: string | null;
}

/**
 * Storage access throws rather than returning null when it is unavailable — Safari's private
 * mode and a blocked third-party context both do it. A degraded session is survivable; an
 * exception at module scope takes the whole app down before it renders.
 */
function readStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeStoredToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token === null) window.sessionStorage.removeItem(TOKEN_KEY);
    else window.sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Unavailable storage means the session lasts this tab and no longer.
  }
}

// `userId` is deliberately not persisted, matching the Vite store: it is re-established by
// `AuthBoundary`'s boot probe of `/me`, which has to run anyway to find out whether the stored
// token is still worth anything.
let state: AuthState = { token: readStoredToken(), userId: null };

/** A separate frozen value, never `state` — the two snapshots must not be the same object. */
const SERVER_STATE: AuthState = Object.freeze({ token: null, userId: null });

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeAuth(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getAuthState(): AuthState {
  return state;
}

/**
 * What a server render is allowed to believe about the session: nothing.
 *
 * Exported rather than inlined into the hook so the contract is assertable — that this is a
 * signed-out state, and that it is a *different object* from `getAuthState()`'s, which is what
 * lets React notice the difference after hydration and re-render instead of reporting a
 * mismatch.
 */
export function getServerAuthState(): AuthState {
  return SERVER_STATE;
}

/**
 * Safe to call outside React — the API client's header callback and `session.ts` both do.
 *
 * A **presence** check only. It reads a cached copy that may have expired; anything about to
 * put the token on the wire wants `getFreshAuthToken()` from `session.ts` instead.
 */
export function getAuthToken(): string | null {
  return state.token;
}

export function setAuth(token: string, userId: string): void {
  writeStoredToken(token);
  state = { token, userId };
  emit();
}

/** Token-only update for a session refresh. `userId` must survive it — see the note above. */
export function setToken(token: string): void {
  writeStoredToken(token);
  state = { token, userId: state.userId };
  emit();
}

export function logout(): void {
  writeStoredToken(null);
  state = { token: null, userId: null };
  emit();
}

/**
 * Subscribe a component to the session.
 *
 * Returns the whole state rather than a selector, because both fields change together on every
 * write and the snapshot is a cached object — a selector would need its own memoisation to
 * avoid the infinite loop `useSyncExternalStore` throws on a fresh object per read.
 */
export function useAuthState(): AuthState {
  return React.useSyncExternalStore(subscribeAuth, getAuthState, getServerAuthState);
}

/**
 * Test seam. Not exported for product code: every real transition goes through `setAuth`,
 * `setToken` or `logout`, and a fourth writer would be a fourth place to keep in step.
 */
export function __setAuthStateForTests(next: AuthState): void {
  writeStoredToken(next.token);
  state = next;
  emit();
}
