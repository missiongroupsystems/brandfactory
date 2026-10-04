"use client";

import { Button } from "@/components/ui/button";

/**
 * A terminal screen for somebody holding a valid session and no access.
 *
 * Two causes, two sentences. The server tells them apart with `NO_ACCOUNT` and
 * `ACCOUNT_DEACTIVATED`, because *you were never added* and *your access was
 * withdrawn* are different news — and an administrator reading the support
 * message that follows needs to know which one happened.
 *
 * **Why this exists rather than a sign-out.** Before Phase C a token with no
 * `users` row behind it was handed one, so this state could not occur. Closing
 * that door made the boundary's `if (!res.ok) logout()` reachable for a real
 * person, and it answers them by returning to the sign-in page with nothing
 * said — where they sign in again, successfully, and bounce. A colleague whose
 * account has not been created yet would report *"the app signs me out
 * instantly"*, which is far harder to act on than a sentence.
 */
export function NoAccessScreen({
  reason,
  onSignOut,
}: {
  reason: "NO_ACCOUNT" | "ACCOUNT_DEACTIVATED";
  onSignOut: () => void;
}) {
  const body =
    reason === "ACCOUNT_DEACTIVATED"
      ? "Your access to Brand Base has been withdrawn. An administrator can restore it."
      : "You signed in successfully, but this address has no Brand Base account. An administrator has to add you.";

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-lg font-medium text-ink">No access</h1>
        {/* The words carry the meaning, never the colour alone. */}
        <p className="text-helper text-ink-secondary">{body}</p>
        <Button type="button" variant="secondary" className="w-full" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
