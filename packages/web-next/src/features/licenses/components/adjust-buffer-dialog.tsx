"use client";

import { Loader2Icon } from "lucide-react";
import * as React from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSubmit } from "@/hooks/use-submit";

import { useSettingsMutations } from "@/features/settings/hooks";

/**
 * Adjust the licence-expiry buffer — a **deliberate** edit, not a live header field.
 *
 * A number in the list header reads as a disposable filter, but this one rewrites the
 * `expiring` flag of every licence in the product. So editing is a modal with an explicit
 * Save and a plain warning, and the tab shows the effective window read-only until you open
 * it. `AlertDialog` (not a plain dialog) because it will not dismiss on a backdrop click or
 * Escape past a pending write — the deliberateness this control is here to enforce.
 *
 * The draft resets **during render** when `open` flips true (the React adjust-state-on-prop
 * pattern `AGENTS.md` prescribes), so reopening after a cancel or a change never shows a
 * stale number — and it is not the effect pattern that has broken this build before.
 *
 * TODO(auth): the write behind Save (`PATCH /settings`) is the "changes everyone's flags"
 * class this app gates on the ops role. While `AUTH_MODE` makes every caller the admin it is
 * open; when identity lands, gate this control (and hide it for a `member`) — the same seam
 * the backend route marks.
 */
export function AdjustBufferDialog({
  open,
  onOpenChange,
  currentBufferDays,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBufferDays: number;
}) {
  const { update } = useSettingsMutations();
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();

  const [draft, setDraft] = React.useState(String(currentBufferDays));
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(String(currentBufferDays));
      reset();
    }
  }

  const parsed = Number(draft);
  const valid = draft.trim() !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= 3650;

  async function save() {
    if (!valid) return;
    if (await run(() => update({ license_expiry_buffer_days: parsed }))) {
      onOpenChange(false);
    }
  }

  const fieldError = fieldErrors.license_expiry_buffer_days;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <div className="flex flex-col gap-2">
          <AlertDialogTitle>Adjust the expiry buffer</AlertDialogTitle>
          <AlertDialogDescription>
            The buffer is added to each licence type&rsquo;s renewal lead time to decide when it
            starts reading as expiring. Changing it changes the expiring flag for every licence.
          </AlertDialogDescription>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="buffer-days">Buffer (days)</Label>
          <Input
            id="buffer-days"
            type="number"
            inputMode="numeric"
            min={0}
            max={3650}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void save();
              }
            }}
            aria-invalid={!valid || Boolean(fieldError)}
            className="w-32"
          />
          <p className="text-helper text-ink-tertiary">A whole number of days, 0 to 3650.</p>
        </div>

        {fieldError ? (
          <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
            {fieldError}
          </p>
        ) : formError ? (
          <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
            {formError}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogClose render={<Button variant="secondary" disabled={isPending} />}>
            Cancel
          </AlertDialogClose>
          {/* Not an AlertDialogClose: closing is deferred until the API accepts the value, so a
              422 on the bound is rendered inside the dialog rather than flashing past it. */}
          <Button onClick={() => void save()} disabled={isPending || !valid}>
            {isPending ? (
              <>
                <Loader2Icon className="animate-spin" data-icon="inline-start" />
                Saving
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
