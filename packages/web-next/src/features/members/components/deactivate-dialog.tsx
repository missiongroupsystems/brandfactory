"use client";

import type { MemberSummary } from "@brandfactory/shared";
import * as React from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * Withdraw somebody's access, behind a confirm.
 *
 * `AlertDialog` rather than a plain dialog, for the reason this package states
 * elsewhere: it will not dismiss on a backdrop click or Escape past a pending
 * write, which is the deliberateness the control is here to enforce.
 *
 * **The copy says reversible, because it is.** There is no hard delete here. For
 * nine people a deactivation is nearly always temporary, and a confirm that
 * implies otherwise makes a routine act feel like a destructive one.
 */
export function DeactivateDialog({
  member,
  onOpenChange,
  pending,
  onConfirm,
}: {
  member?: MemberSummary;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onConfirm: (id: string) => Promise<void>;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [draftKey, setDraftKey] = React.useState<string | null>(null);
  const key = member?.id ?? null;
  if (draftKey !== key) {
    setDraftKey(key);
    setError(null);
  }

  if (!member) return null;
  const who = member.displayName ?? member.email;

  const confirm = async () => {
    setError(null);
    try {
      await onConfirm(member.id);
      onOpenChange(false);
    } catch (err) {
      // Rendered inside the dialog rather than flashing past it — the
      // last-admin conflict arrives here, and it is the one a reader needs.
      setError(err instanceof Error ? err.message : "Could not deactivate.");
    }
  };

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <div className="flex flex-col gap-2">
          <AlertDialogTitle>Deactivate {who}?</AlertDialogTitle>
          <AlertDialogDescription>
            They will be signed out and refused everything until somebody reactivates them. Their
            brand access is kept, so restoring it is one click. Nothing they created is deleted.
          </AlertDialogDescription>
        </div>

        {error ? (
          <p role="alert" className="text-helper text-error">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <AlertDialogClose render={<Button variant="secondary" disabled={pending} />}>
            Cancel
          </AlertDialogClose>
          {/* Not an `AlertDialogClose`: closing waits for the server, so a
              `LAST_ADMIN` conflict is read here rather than disappearing. */}
          <Button onClick={() => void confirm()} disabled={pending}>
            {pending ? "Deactivating…" : "Deactivate"}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
