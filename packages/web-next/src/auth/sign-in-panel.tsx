"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { LocalAuthProvider } from "@/auth/providers/local";
import { SupabaseAuthProvider } from "@/auth/providers/supabase";
import { useAuthState } from "@/auth/store";

/**
 * Which sign-in the deployment offers, and the way back out of this page for somebody who is
 * already signed in.
 *
 * **The redirect is an effect, not a render-time branch, and that is the SSR constraint rather
 * than a preference.** The token lives in `sessionStorage`, which the server cannot read, so
 * the prerendered HTML of this page is always the signed-out one. Deciding during render would
 * mean deciding on the server snapshot — `null` — every time. The effect runs after hydration,
 * when the real answer is available.
 *
 * The Supabase provider does its own navigation after a fresh exchange; this covers the other
 * case, which is arriving at `/sign-in` with a live session already in the tab (a bookmark, a
 * back button, a second tab).
 */
export function SignInPanel() {
  const { token } = useAuthState();
  const router = useRouter();

  React.useEffect(() => {
    if (token) router.replace("/");
  }, [token, router]);

  // `local` is the default because it is the server's default (`AUTH_PROVIDER=local` in
  // `.env.example`) — the two have to agree, or the page offers a door the API will not open.
  return process.env.NEXT_PUBLIC_AUTH_PROVIDER === "supabase" ? (
    <SupabaseAuthProvider />
  ) : (
    <LocalAuthProvider />
  );
}
