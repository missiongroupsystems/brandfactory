"use client";

import type { CreateDeckInput } from "@brandfactory/shared";
import { Loader2Icon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSubmit } from "@/hooks/use-submit";

import { useDeckMutations } from "../hooks";

/**
 * Create a deck — name only, matching `CreateDeckInputSchema` exactly. **The only creation surface
 * this phase owns.** A deck needs to exist before a version history means anything, so this screen
 * would be inert without some way to start one; recording an actual version — especially Canva's
 * two-part write, sized around decision 3's required-snapshot CHECK — is Phase 2F's job and stays
 * out of this file.
 *
 * No `deck` prop and no edit mode, unlike `ResourceForm`: `routes/decks.ts` has no `PATCH` at all
 * (its own docstring: a deck carries only `name` beyond what the path and server already own), so
 * there is nothing an edit here could write.
 */
export function DeckForm({
  brandId,
  open,
  onOpenChange,
}: {
  brandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { create } = useDeckMutations(brandId);
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();

  const [name, setName] = React.useState("");

  // The draft resets *during render* when `open` flips true, not in an effect — the pattern
  // `AGENTS.md` records twice: a `SheetContent` keyed on anything that changes on close jams
  // Base UI's dismissal.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setName("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const payload: CreateDeckInput = { name: name.trim() };

    const ok = await run(async () => {
      await create(payload);
      toast.success(`${payload.name} added`);
    });

    if (ok) onOpenChange(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Add a deck</SheetTitle>
          <SheetDescription>
            A named folder to hang versions off — a pitch deck, a one-pager. Add its first version
            afterwards.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="contents">
          <SheetBody className="flex flex-col gap-4">
            {formError ? (
              <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
                {formError}
              </p>
            ) : null}

            <Field label="Name" required error={fieldErrors.name}>
              {(field) => (
                <Input
                  {...field}
                  required
                  maxLength={200}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Investor pitch deck"
                />
              )}
            </Field>
          </SheetBody>

          <SheetFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2Icon className="animate-spin" data-icon="inline-start" />
                  Saving
                </>
              ) : (
                "Add deck"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
