"use client";

import { Loader2Icon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldSection } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toNullable, useSubmit } from "@/hooks/use-submit";
import type { Brand, BrandStatus } from "@/lib/api/types";
import { BRAND_STATUS_OPTIONS } from "@/lib/labels";

import { useBrandMutations } from "../hooks";

/**
 * Create or edit a brand. Three fields, and the important one is the name.
 *
 * **Renaming here is the single most valuable thing this sheet does** — one atomic `PATCH` that
 * every outlet row, every badge and every filter follows, with an `updated_at` recording that it
 * happened. Against the free-text column this replaced, the same operation was
 * `UPDATE outlet SET brand=… WHERE brand=…`: no transaction boundary anyone could inspect, no
 * record it happened, and no way to know it caught every row.
 *
 * A duplicate name is refused by the API case-insensitively and the message names the brand, so
 * nothing is checked here — the server's answer is the only one worth rendering.
 */
export function BrandForm({
  brand,
  open,
  onOpenChange,
}: {
  brand?: Brand;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = Boolean(brand);
  const { create, update } = useBrandMutations();
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();

  const [form, setForm] = React.useState(() => initialState(brand));

  // Reset the draft per open — the sheet's content survives its close, so a create form reopened
  // straight after a successful create still holds the previous draft. Adjusted **during render**
  // rather than in an effect, and `SheetContent` is deliberately not keyed on anything: a key
  // that changes mid-dismissal jams the overlay. Both traps are in AGENTS.md and both have bitten
  // this repo.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(initialState(brand));
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const payload = {
      name: form.name.trim(),
      status: form.status,
      notes: toNullable(form.notes),
    };

    const ok = await run(async () => {
      if (brand) {
        await update(brand.id, payload);
        toast.success(
          payload.name === brand.name
            ? `${payload.name} updated`
            : `${brand.name} renamed to ${payload.name}`,
        );
      } else {
        await create(payload);
        toast.success(`${payload.name} created`);
      }
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
          <SheetTitle>{isEdit ? `Edit ${brand!.name}` : "New brand"}</SheetTitle>
          <SheetDescription>
            A name several premises share. Outlets and companies are assigned one from their own
            records, or from this brand&rsquo;s page.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="contents">
          <SheetBody className="flex flex-col gap-8">
            {formError ? (
              <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
                {formError}
              </p>
            ) : null}

            <FieldSection title="Brand">
              <Field
                label="Name"
                required
                hint={
                  isEdit
                    ? "Renaming changes it everywhere at once — every outlet, every badge, every filter."
                    : undefined
                }
                error={fieldErrors.name}
              >
                {(field) => (
                  <Input
                    {...field}
                    required
                    maxLength={100}
                    value={form.name}
                    onChange={(event) => set("name", event.target.value)}
                    placeholder="Casa Vostra"
                  />
                )}
              </Field>

              <Field
                label="Status"
                hint="Retired is the normal end of a brand's life — its outlets keep it, and past reports still say what they said. Deleting is only for a row created in error."
                error={fieldErrors.status}
              >
                {(field) => (
                  <Select
                    {...field}
                    value={form.status}
                    onChange={(event) => set("status", event.target.value as BrandStatus)}
                  >
                    {BRAND_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </FieldSection>

            <FieldSection title="Notes">
              <Field label="Notes" error={fieldErrors.notes}>
                {(field) => (
                  <Textarea
                    {...field}
                    value={form.notes}
                    onChange={(event) => set("notes", event.target.value)}
                  />
                )}
              </Field>
            </FieldSection>
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
              ) : isEdit ? (
                "Save changes"
              ) : (
                "Create brand"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

type FormState = {
  name: string;
  status: BrandStatus;
  notes: string;
};

/** `?? ""` throughout: these are controlled inputs, and a `null` value makes React drop the
 * input to uncontrolled with a warning, after which typing works but the state does not. */
function initialState(brand?: Brand): FormState {
  return {
    name: brand?.name ?? "",
    status: brand?.status ?? "active",
    notes: brand?.notes ?? "",
  };
}
