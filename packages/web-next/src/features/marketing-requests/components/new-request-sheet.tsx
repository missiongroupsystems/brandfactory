"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useOutletIndex } from "@/features/registry/hooks";
import type { FormSubmission } from "@/lib/api/types";

import { MARKETING_REQUEST_FORM } from "../fixture";
import { useRequestMutations } from "../hooks";
import { FormFiller } from "./form-fields";

/**
 * The request form, in a sheet — the button on the inbox rather than the panel under it.
 *
 * This is the whole of what moved when the screen was inverted. The form is unchanged, the
 * outlet list is still resolved from the registry, and the payload posted is the same
 * `{label: value}` the public page sends. What changed is that raising a request is now an
 * action you take on the queue, which is where the rest of this screen's work happens.
 */
export function NewRequestSheet({
  open,
  onOpenChange,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The created row, so the caller can open it. Called after the toast, before the sheet closes. */
  onSubmitted: (created: FormSubmission) => void;
}) {
  const { outlets } = useOutletIndex();
  const outletNames = React.useMemo(
    () => (outlets ?? []).map((outlet) => outlet.name).sort((a, b) => a.localeCompare(b)),
    [outlets],
  );

  const { submit } = useRequestMutations();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* No `key`. A sheet's content survives its close, so a form reopened straight after a
          successful submit would still hold the previous draft — but the fix here is
          `FormFiller`'s own remount below, keyed on `open`, rather than a key on
          `SheetContent`. Keying the content on anything that changes as the sheet dismisses
          jams Base UI's exit animation and leaves the overlay eating clicks. See AGENTS.md. */}
      <SheetContent size="wide">
        <SheetHeader>
          <SheetTitle>{MARKETING_REQUEST_FORM.name}</SheetTitle>
          <SheetDescription>{MARKETING_REQUEST_FORM.description}</SheetDescription>
        </SheetHeader>

        <SheetBody>
          <FormFiller
            // Remount on each opening, which is what clears the draft. `open` is a boolean and
            // flips *before* the exit animation runs, so the remount lands on a sheet that is
            // already closing — harmless — rather than mid-dismissal on a value derived from
            // state that clears.
            key={open ? "open" : "closed"}
            form={MARKETING_REQUEST_FORM}
            outletNames={outletNames}
            submitLabel="Send request"
            onSubmit={async (payload) => {
              const created = await submit(payload);
              toast.success(`Sent — your reference is ${created.reference}`);
              onSubmitted(created);
            }}
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
