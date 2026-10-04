"use client";

import {
  generatePassword,
  passwordProblem,
  PASSWORD_MIN_LENGTH,
  type MemberSummary,
} from "@brandfactory/shared";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * Choose a new password for somebody who has lost theirs.
 *
 * ⚠️ **Generated in the browser, and shown once.** The administrator reads it off
 * their own screen and passes it on themselves. Nothing stores it, nothing logs
 * it, and the audit row records only *that* a reset happened and *who* did it.
 *
 * The account is flagged again by the server, so the person is asked to replace
 * this before they reach anything — which is also why the copy says so rather
 * than implying the password is theirs to keep.
 */
export function SetPasswordDialog({
  member,
  onOpenChange,
  pending,
  onSubmit,
}: {
  /** Absent when closed. */
  member?: MemberSummary;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: (id: string, password: string) => Promise<void>;
}) {
  const [draftKey, setDraftKey] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const key = member?.id ?? null;
  if (draftKey !== key) {
    setDraftKey(key);
    setPassword(member ? generatePassword() : "");
    setError(null);
  }

  if (!member) return null;

  const problem = password ? passwordProblem(password, member.email) : null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (problem || password.length === 0) return;
    setError(null);
    try {
      await onSubmit(member.id, password);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set the password.");
    }
  };

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Set a password for {member.displayName ?? member.email}</SheetTitle>
        </SheetHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 px-4 pb-6">
          <div className="space-y-2">
            <Label htmlFor="reset-password">New password</Label>
            <div className="flex gap-2">
              <Input
                id="reset-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby="reset-password-help"
                required
              />
              <Button type="button" variant="secondary" onClick={() => setPassword(generatePassword())}>
                Regenerate
              </Button>
            </div>
            <p id="reset-password-help" className="text-helper text-ink-tertiary">
              Send this to them yourself. They will be asked to choose their own before they can
              use anything. At least {PASSWORD_MIN_LENGTH} characters.
            </p>
            {problem ? (
              <p role="alert" className="text-helper text-error">
                {problem}
              </p>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="text-helper text-error">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!!problem || password.length === 0 || pending}>
              {pending ? "Saving…" : "Set password"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
