"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { supabase } from "@/auth/session";
import { setAuth } from "@/auth/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BF_API_BASE_URL } from "@/lib/api/bf-client";

/**
 * Sign in with a magic link or with Google.
 *
 * Ported from `packages/web/src/auth/providers/supabase.tsx`, with three substitutions: the
 * router is `next/navigation`, the redirect lands on `/sign-in` rather than `/login`, and the
 * store is the module one rather than zustand. The flow is unchanged.
 *
 * The Supabase client is **imported**, not constructed here. Two clients over one `localStorage`
 * session is two refresh schedulers racing each other, and the one that used to live in this
 * file in the Vite app was unreachable from the signed-in app — which is precisely how the
 * access token was left to expire in place.
 */

interface MeResponse {
  id: string;
}

function readInitialUrlError(): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const queryErr = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const hash = new URLSearchParams(url.hash.slice(1));
  const hashErr = hash.get("error_description") ?? hash.get("error");
  const raw = queryErr ?? hashErr;
  return raw ? decodeURIComponent(raw.replace(/\+/g, " ")) : null;
}

export function SupabaseAuthProvider() {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(() => readInitialUrlError());
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    if (!supabase) return;

    const finishSignIn = async (token: string) => {
      try {
        const res = await fetch(`${BF_API_BASE_URL}/me`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          setError(`Sign-in failed (${res.status}): ${body || res.statusText}`);
          return;
        }
        const data = (await res.json()) as MeResponse;
        setAuth(token, data.id);
        // `/`, not a screen: the root redirects to the shell's landing route, and putting the
        // destination in two places is how the two come apart.
        router.replace("/");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Sign-in network error: ${msg}`);
      }
    };

    const code = new URL(window.location.href).searchParams.get("code");

    if (code) {
      // Manual exchange so we can show the actual error instead of letting supabase-js log
      // silently. Strip `?code=` from the URL on success so a refresh does not re-exchange —
      // `window.history.replaceState`, not `router.replace`, which this app has already been
      // bitten by for search-param writes in a production build (see AGENTS.md).
      void supabase.auth.exchangeCodeForSession(code).then(({ data, error: exErr }) => {
        if (exErr) {
          setError(`Magic-link exchange failed: ${exErr.message}`);
          return;
        }
        window.history.replaceState({}, "", window.location.pathname);
        if (data.session?.access_token) void finishSignIn(data.session.access_token);
      });
    } else {
      // No code in the URL — a session may already be present (the user refreshed after a
      // successful exchange, or signed in on another tab).
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session?.access_token) void finishSignIn(data.session.access_token);
      });
    }
  }, [router]);

  if (!supabase) {
    return (
      <p className="text-helper text-error">
        NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set for Supabase
        sign-in.
      </p>
    );
  }
  // Re-bound to a local const: TypeScript does not carry the null-narrowing of an *imported*
  // binding into a nested closure, since another module could in principle reassign it. The
  // guard above is the real check.
  const client = supabase;

  if (sent) {
    return (
      <div className="w-full space-y-1 text-center">
        <p className="font-medium text-ink">Check your email</p>
        <p className="text-helper text-ink-secondary">
          We sent a magic link to <strong>{email}</strong>.
        </p>
      </div>
    );
  }

  const handleGoogle = async () => {
    setError(null);
    // `signInWithOAuth` redirects the tab to Google, then back to `/sign-in` with `?code=`,
    // which the mount effect above exchanges — the same path the magic link uses. No email, so
    // it sidesteps the SMTP flow entirely.
    const { error: oauthError } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/sign-in` },
    });
    if (oauthError) setError(oauthError.message);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: signInError } = await client.auth.signInWithOtp({
        email: email.trim(),
        // Land on `/sign-in` so this component mounts and processes the `?code=` query.
        // Returning to `/` lets the redirect fire before the code is exchanged, stripping it.
        options: { emailRedirectTo: `${window.location.origin}/sign-in` },
      });
      if (signInError) setError(signInError.message);
      else setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full space-y-5">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            required
          />
        </div>
        {error ? (
          <p role="alert" className="text-helper text-error">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
          {loading ? "Sending…" : "Send magic link"}
        </Button>
      </form>
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border-subtle" />
        <span className="text-eyebrow text-ink-tertiary">or continue with</span>
        <span className="h-px flex-1 bg-border-subtle" />
      </div>
      <Button
        type="button"
        variant="secondary"
        className="w-full gap-2"
        onClick={() => void handleGoogle()}
      >
        <GoogleIcon className="h-4 w-4" />
        Sign in with Google
      </Button>
    </div>
  );
}

// The four-colour Google "G", inlined so it needs no asset and no runtime fetch. Standard
// Google identity mark — the one place in this app where colour is not ours to choose.
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
