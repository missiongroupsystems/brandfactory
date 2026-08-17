"use client";

import * as React from "react";

/**
 * A single string remembered in `localStorage`, readable from React without breaking SSR.
 *
 * **Extracted because there are now two**, which is this app's stated bar for promoting
 * something out of a feature folder: the active brand (1.32.0) and the active workspace. Both
 * are user preferences rather than routes or server state — the call the root `CLAUDE.md`
 * records for `sidebar-prefs.ts` and `key-dates-prefs.ts`, and the reason neither is a column.
 *
 * Three properties, and each of them was a bug in something before it was a rule here.
 *
 * **`useSyncExternalStore`, not `useState` plus an effect.** Reading `localStorage` during
 * render is wrong on the server, and seeding it from an effect is
 * `react-hooks/set-state-in-effect`, which fails this build. The server snapshot is `null`
 * because there is no storage during SSR, and guessing would put a wrong name in static HTML.
 *
 * **Same-tab subscribers are notified by hand.** The `storage` event fires in *other* tabs
 * only, so a write here has to notify locally or the control would not re-render on its own
 * click. The cross-tab listener is kept as well: two windows on one product should agree.
 *
 * **Every touch is guarded.** Storage access throws rather than returning null when it is
 * unavailable — Safari's private mode and a blocked third-party context both do it. Losing the
 * persistence is a degraded session; an exception takes the sidebar down.
 */
export interface StoredPreference {
  /** Subscribe a component to the value. `null` during SSR and when nothing is stored. */
  use: () => string | null;
  /** Write it, and notify this tab. */
  set: (value: string) => void;
}

export function createStoredPreference(key: string): StoredPreference {
  const listeners = new Set<() => void>();

  function subscribe(onChange: () => void): () => void {
    listeners.add(onChange);
    window.addEventListener("storage", onChange);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onChange);
    };
  }

  function getSnapshot(): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function getServerSnapshot(): string | null {
    return null;
  }

  function set(value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Unavailable storage means the choice lasts this render and no longer. The listeners
      // still fire, so the control follows the click either way — it just will not survive a
      // reload, which is better than a click that appears to do nothing.
    }
    for (const listener of listeners) listener();
  }

  return {
    use: () => React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot),
    set,
  };
}
