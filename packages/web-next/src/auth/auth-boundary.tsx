"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { mutate } from "swr";

import { getFreshAuthToken, startSessionSync } from "@/auth/session";
import { getAuthState, logout, setAuth, subscribeAuth } from "@/auth/store";
import { BF_API_BASE_URL } from "@/lib/api/bf-client";
import { SCOPES } from "@/lib/api/cache";

import type { Me } from "@/features/me/hooks";

/**
 * The gate. Everything inside `app/(app)/` renders behind it.
 *
 * Ported from `packages/web/src/auth/AuthBoundary.tsx`. Three things differ, and all three
 * follow from this being a Next app rather than a Vite one.
 *
 * **1. Not-signed-in is not a synchronous fact here.** The Vite boundary starts `ready` when
 * the store has no token, because it can read `sessionStorage` at mount and be sure. Here the
 * first render happens on the server, where the token snapshot is always `null` by
 * construction (`auth/store.ts`) — so treating that as "signed out" would prerender a redirect
 * into every page in the app. The boundary therefore renders the spinner until a probe of
 * `/me` has actually answered. The server rendering "checking" is honest: it genuinely does
 * not know.
 *
 * **2. Nothing here calls `setState` synchronously inside an effect.** That is
 * `react-hooks/set-state-in-effect`, which fails this build — the rule `hooks/use-mobile.ts`
 * was rewritten for. The signed-out branch navigates and sets nothing; the only state write is
 * `setProbed(true)`, and it happens in a promise callback after the round trip.
 *
 * **3. The cache reset is SWR's.** `mutate(() => true, undefined, {revalidate: false})` is the
 * documented clear-everything form. The ordering constraint is the Vite one and is the reason
 * it lives here rather than inside `signOut`: every cached row belonged to the user who just
 * left, and signing in as a second user in the same tab would otherwise open on the first
 * user's workspaces while the refetches land. Here it also covers the 401 path in `callJson`,
 * which is the other caller of `logout()`.
 *
 * The session stays client-side throughout — no cookies, no middleware, no server-side
 * fetching — which matches how every screen in this app already loads its data, and is why the
 * fifteen fixture-backed Ops screens underneath keep working untouched.
 */
export function AuthBoundary({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [probed, setProbed] = React.useState(false);

  // Any 401 anywhere clears the token, but clearing it used to leave the user parked on the
  // page they were already on, under a screen of stale cache. Watch the transition rather than
  // relying on a navigation happening to occur.
  React.useEffect(() => {
    let previous = getAuthState().token;
    return subscribeAuth(() => {
      const current = getAuthState().token;
      const wasSignedIn = previous !== null;
      previous = current;
      if (!wasSignedIn || current !== null) return;

      router.replace("/sign-in");
      // Asked for after the navigation, not before it: dropping the cache while these pages
      // are still mounted restarts every live SWR key with no token behind it, which is a
      // screen of spinners and a burst of 401s on the way out the door.
      void mutate(() => true, undefined, { revalidate: false });
    });
  }, [router]);

  React.useEffect(() => {
    // Read the store, not the hook: this runs once at mount and wants the value as it is now,
    // not one closed over from a render that happened before hydration.
    if (!getAuthState().token) {
      router.replace("/sign-in");
      return;
    }

    startSessionSync();

    const controller = new AbortController();
    // `getFreshAuthToken`, not the stored token: on a boot more than an hour after sign-in the
    // stored copy is expired, and probing with it would 401 and sign the user out of a session
    // that is still perfectly alive behind the refresh token.
    void getFreshAuthToken()
      .then(async (token) => {
        if (!token) {
          // `logout()` rather than a navigation: the subscription above owns the redirect, so
          // every way out of a session goes through one path.
          logout();
          return;
        }
        const res = await fetch(`${BF_API_BASE_URL}/me`, {
          headers: { authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok) {
          logout();
          return;
        }
        const data = (await res.json()) as Me;
        setAuth(token, data.id);
        // The probe already holds the whole row. `useMe` reads this key and would otherwise
        // fetch the identical response a second time on every page load, purely because this
        // one was parsed for its `id` and the rest dropped.
        void mutate([SCOPES.me], data, { revalidate: false });
        setProbed(true);
      })
      .catch((err: unknown) => {
        // Network error — let the app through; `callJson` handles any later 401. Refusing to
        // render because one request failed would make an API blip look like a sign-out.
        if ((err as { name?: string }).name !== "AbortError") setProbed(true);
      });

    return () => controller.abort();
    // Mount only, and `router` is stable. Re-running on every token write would re-probe on
    // each hourly refresh; the subscription above is what watches the transition that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!probed) {
    return (
      <div className="flex flex-1 items-center justify-center p-8" aria-busy="true">
        <span className="sr-only">Checking your session</span>
        <div className="size-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
