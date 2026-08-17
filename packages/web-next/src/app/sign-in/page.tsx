import type { Metadata } from "next";

import { SignInPanel } from "@/auth/sign-in-panel";
import { AppLogo } from "@/components/brand/app-logo";

export const metadata: Metadata = {
  title: "Sign in — Marketing Hub",
};

/**
 * The sign-in surface. **Outside the `(app)` route group on purpose**: it has no sidebar, no
 * brand, no workspace, and it is the one screen `AuthBoundary` must not gate — a boundary that
 * redirected here from here would be a loop.
 *
 * A server page rendering one client component, which is the shape every screen in this app
 * uses. The mark, the heading and the layout prerender; only the form needs JavaScript.
 *
 * The chrome is 1.28.0's, ported: the Mission Systems mark in the one brand green, and the
 * form in the order its sibling apps use — email and magic link first, a rule, then Google.
 * Google is second and `secondary`, because the primary action is the one this deployment
 * always supports; the OAuth button depends on a provider being configured.
 */
export default function SignInPage() {
  return (
    <main className="flex min-h-svh flex-1 items-center justify-center bg-surface-sunken p-4">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <AppLogo />
          <div className="space-y-1">
            <h1 className="text-h2 text-ink">Brand Operating System</h1>
            <p className="text-helper text-ink-secondary">Sign in to continue</p>
          </div>
        </div>
        <SignInPanel />
      </div>
    </main>
  );
}
