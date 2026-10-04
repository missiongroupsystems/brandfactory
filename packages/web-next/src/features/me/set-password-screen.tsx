"use client";

import * as React from "react";
import { mutate } from "swr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bf, callVoid } from "@/lib/api/bf-client";
import { SCOPES } from "@/lib/api/cache";
import { PASSWORD_MIN_LENGTH, passwordProblem } from "@brandfactory/shared";

/**
 * Choose your own password. The one screen a person whose password an admin
 * chose is allowed to see.
 *
 * **It sets, it does not change — there is no current-password field.**
 * Somebody who signed in with Google has no password to supply, and they are
 * one of the two readers this screen exists for. The live session is the proof
 * of identity, exactly as it is for every other write in the app.
 *
 * ⚠️ **This screen is a courtesy, not the boundary.** The server refuses every
 * other route with `PASSWORD_NOT_SET` whether or not this renders. If this
 * component were deleted the app would still be closed to a flagged account —
 * it would just be closed rudely. Do not add a way to skip it believing the
 * data is still safe; do not treat its presence as the thing keeping anyone
 * out.
 *
 * **Validation comes from `@brandfactory/shared`.** The same function runs
 * here, on the admin's create form, and on the server. Three copies of a
 * length rule is how one of them ends up disagreeing with the other two.
 */
export function SetPasswordScreen({ email }: { email: string }) {
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Computed, not attempted: the button is disabled because the rule says so,
  // and the reason is on screen before the reader presses anything.
  const problem = password ? passwordProblem(password, email) : null;
  const mismatch = confirm.length > 0 && password !== confirm;
  const ready = password.length > 0 && !problem && !mismatch && password === confirm;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setError(null);
    setSubmitting(true);
    try {
      await callVoid(await bf.me.password.$post({ json: { password } }));
      // Re-read `/me`. The flag is now false, so the boundary above this
      // renders the app instead of this screen — there is no navigation to do.
      await mutate([SCOPES.me]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set your password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-5">
        <div className="space-y-1">
          <h1 className="text-lg font-medium text-ink">Choose your password</h1>
          <p className="text-helper text-ink-secondary">
            Your account was set up by an administrator, who chose a temporary password. Pick
            your own to continue.
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby="new-password-help"
              required
            />
            <p id="new-password-help" className="text-helper text-ink-tertiary">
              At least {PASSWORD_MIN_LENGTH} characters. A short phrase works well.
            </p>
            {problem ? (
              <p role="alert" className="text-helper text-error">
                {problem}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            {mismatch ? (
              <p role="alert" className="text-helper text-error">
                The two passwords do not match.
              </p>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="text-helper text-error">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={!ready || submitting}>
            {submitting ? "Saving…" : "Set password and continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
