"use client";

import type { CreateOutletInput, Outlet, OutletStatus, OutletType } from "@brandfactory/shared";
import { Loader2Icon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldGrid, FieldSection } from "@/components/ui/field";
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
import { useActiveBrand } from "@/features/brands/active-brand";
import { toNullable, useSubmit } from "@/hooks/use-submit";
import { OUTLET_STATUS_OPTIONS, OUTLET_TYPE_OPTIONS } from "@/lib/labels";

import { useOutletMutations } from "../hooks";
import { AttributePicker } from "./attribute-picker";

/**
 * Create or edit an outlet.
 *
 * One component for both, because the fields are the same and two components
 * diverge. The mode is `outlet ? "edit" : "create"`.
 *
 * **Attributes appear in both modes**, unlike the Operations Hub's version of
 * this form, which showed them on create only. That asymmetry existed because
 * `POST /outlets` took an attribute list and `PATCH` did not — the set was
 * replaced through a third endpoint, so one form issuing two writes could
 * half-fail. Our `PATCH` takes `attributes` like any other key, so the split has
 * nothing left to protect and the second editor it forced onto the detail page is
 * gone with it.
 *
 * **The brand picker offers this workspace's brands and no create.** Brands are
 * made on the brand screens; a create-inside-a-picker is how three spellings of
 * one name get typed by somebody in a hurry.
 */
export function OutletForm({
  outlet,
  defaultBrandId,
  open,
  onOpenChange,
  onCreated,
}: {
  outlet?: Outlet;
  /**
   * Which brand a *new* outlet starts on — the brand whose page the form was opened from. Ignored
   * when editing, where the record's own brand is the answer and overriding it would be the form
   * silently reassigning a location the reader only meant to rename.
   *
   * The field stays editable rather than being locked: a seed is a sensible default, and a locked
   * control on a form that can reach every brand in the workspace would be a dead end the first
   * time somebody added the wrong one.
   */
  defaultBrandId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new record so a caller can jump to it. Create mode only. */
  onCreated?: (outlet: Outlet) => void;
}) {
  const isEdit = Boolean(outlet);
  const { create, update } = useOutletMutations();
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();
  const { brands, isLoading: brandsLoading } = useActiveBrand();

  const [form, setForm] = React.useState(() => initialState(outlet, defaultBrandId));

  // Reset the draft per open. The sheet's content survives its close, so a form
  // reopened straight after a save still holds the previous draft — and keying
  // `SheetContent` is not the fix: a key that changes mid-dismissal wedges Base
  // UI's overlay (AGENTS.md records this twice). Render-time adjustment, which is
  // also not the effect pattern that broke this build once.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(initialState(outlet, defaultBrandId));
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    // One payload shape for both verbs. `CreateOutletInput` is the wider of the
    // two — every key it holds is also a patch key — so a create sends it whole
    // and a patch sends the same object, which `UpdateOutletInputSchema` accepts
    // field for field. `toNullable` turns a cleared input into `null` rather than
    // `""`: an empty string is truthy, sorts before every real value and is
    // invisible on screen.
    const payload: CreateOutletInput = {
      name: form.name.trim(),
      outletType: form.outletType,
      status: form.status,
      brandId: toNullable(form.brandId) as CreateOutletInput["brandId"],
      address: toNullable(form.address),
      unit: toNullable(form.unit),
      postalCode: toNullable(form.postalCode),
      attributes: form.attributes,
      targetOpeningDate: toNullable(form.targetOpeningDate),
      openingDate: toNullable(form.openingDate),
      closingDate: toNullable(form.closingDate),
      notes: toNullable(form.notes),
    };

    const ok = await run(async () => {
      if (outlet) {
        await update(outlet.id, payload);
        toast.success(`${payload.name} updated`);
      } else {
        const created = await create(payload);
        toast.success(`${payload.name} added`);
        onCreated?.(created);
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
      <SheetContent size="wide">
        <SheetHeader>
          <SheetTitle>{isEdit ? `Edit ${outlet!.name}` : "Add an outlet"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "The web address of this outlet does not change when its name does — the link you shared last month still works."
              : "A pipeline outlet needs only a name and a type. Everything else can follow as the site firms up."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="contents">
          <SheetBody className="flex flex-col gap-8">
            {formError ? (
              <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
                {formError}
              </p>
            ) : null}

            <FieldSection title="Identity">
              <Field label="Name" required error={fieldErrors.name}>
                {(field) => (
                  <Input
                    {...field}
                    required
                    maxLength={200}
                    value={form.name}
                    onChange={(event) => set("name", event.target.value)}
                    placeholder="Kiln Kitchen & Bar"
                  />
                )}
              </Field>

              <FieldGrid>
                <Field
                  label="Brand"
                  hint="What this site trades as. Left empty until it is decided."
                  error={fieldErrors.brandId}
                >
                  {(field) => (
                    <Select
                      {...field}
                      disabled={brandsLoading}
                      value={form.brandId}
                      onChange={(event) => set("brandId", event.target.value)}
                    >
                      <option value="">No brand</option>
                      {/* While the list is in flight, keep the outlet's own brand
                          as a placeholder option. A native select whose `value`
                          matches nothing falls back to showing the first option —
                          "No brand" — which reads as a fact about this outlet
                          rather than as a request that has not arrived. */}
                      {form.brandId && !brands.some((brand) => brand.id === form.brandId) ? (
                        <option value={form.brandId}>…</option>
                      ) : null}
                      {brands.map((brand) => (
                        <option key={brand.id} value={brand.id}>
                          {brand.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field label="Type" required error={fieldErrors.outletType}>
                  {(field) => (
                    <Select
                      {...field}
                      value={form.outletType}
                      onChange={(event) => set("outletType", event.target.value as OutletType)}
                    >
                      {OUTLET_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </FieldGrid>

              <Field label="Status" required error={fieldErrors.status}>
                {(field) => (
                  <Select
                    {...field}
                    value={form.status}
                    onChange={(event) => set("status", event.target.value as OutletStatus)}
                  >
                    {OUTLET_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </FieldSection>

            <FieldSection title="Address">
              <Field label="Street address" error={fieldErrors.address}>
                {(field) => (
                  <Input
                    {...field}
                    maxLength={300}
                    value={form.address}
                    onChange={(event) => set("address", event.target.value)}
                    placeholder="31 Keong Saik Road"
                  />
                )}
              </Field>

              <FieldGrid>
                <Field label="Unit" error={fieldErrors.unit}>
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={50}
                      value={form.unit}
                      onChange={(event) => set("unit", event.target.value)}
                      placeholder="#01-02"
                    />
                  )}
                </Field>

                <Field label="Postal code" error={fieldErrors.postalCode}>
                  {(field) => (
                    <Input
                      {...field}
                      inputMode="numeric"
                      maxLength={20}
                      value={form.postalCode}
                      onChange={(event) => set("postalCode", event.target.value)}
                      placeholder="089137"
                    />
                  )}
                </Field>
              </FieldGrid>
            </FieldSection>

            <FieldSection
              title="Dates"
              description="A target date is the plan; an opening date is what happened. The table shows whichever one the status calls for."
            >
              <FieldGrid>
                <Field label="Target opening" error={fieldErrors.targetOpeningDate}>
                  {(field) => (
                    <Input
                      {...field}
                      type="date"
                      value={form.targetOpeningDate}
                      onChange={(event) => set("targetOpeningDate", event.target.value)}
                    />
                  )}
                </Field>

                <Field label="Opened" error={fieldErrors.openingDate}>
                  {(field) => (
                    <Input
                      {...field}
                      type="date"
                      value={form.openingDate}
                      onChange={(event) => set("openingDate", event.target.value)}
                    />
                  )}
                </Field>
              </FieldGrid>

              <Field label="Closed" error={fieldErrors.closingDate}>
                {(field) => (
                  <Input
                    {...field}
                    type="date"
                    value={form.closingDate}
                    onChange={(event) => set("closingDate", event.target.value)}
                  />
                )}
              </Field>
            </FieldSection>

            <FieldSection
              title="Attributes"
              description="What the site does. Read by people rather than by rules, so nothing here changes what the outlet is allowed to be."
            >
              <AttributePicker
                selected={form.attributes}
                onChange={(attributes) => set("attributes", attributes)}
              />
            </FieldSection>

            <FieldSection title="Notes">
              <Field label="Notes" error={fieldErrors.notes}>
                {(field) => (
                  <Textarea
                    {...field}
                    maxLength={5000}
                    value={form.notes}
                    onChange={(event) => set("notes", event.target.value)}
                    placeholder="Anything the next person reading this record needs to know."
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
                "Add outlet"
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
  brandId: string;
  outletType: OutletType;
  status: OutletStatus;
  address: string;
  unit: string;
  postalCode: string;
  targetOpeningDate: string;
  openingDate: string;
  closingDate: string;
  notes: string;
  attributes: string[];
};

/**
 * `?? ""` throughout: these are controlled inputs, and a `null` value drops the
 * input to uncontrolled with a warning, after which typing works and the state
 * does not update.
 */
function initialState(outlet?: Outlet, defaultBrandId?: string): FormState {
  return {
    name: outlet?.name ?? "",
    // The record's brand, then the page's, then none. `??` rather than `||` on the first step is
    // deliberate: an outlet with `brandId: null` is one somebody has deliberately left unassigned,
    // and reopening its edit sheet must not quietly fill that in from the page it was opened on.
    brandId: outlet ? (outlet.brandId ?? "") : (defaultBrandId ?? ""),
    outletType: outlet?.outletType ?? "restaurant",
    // A new outlet defaults to `pipeline`, matching the API's own default: a site
    // still being planned is the one worth optimising for, and one already
    // trading is the rarer thing to be entering by hand.
    status: outlet?.status ?? "pipeline",
    address: outlet?.address ?? "",
    unit: outlet?.unit ?? "",
    postalCode: outlet?.postalCode ?? "",
    targetOpeningDate: outlet?.targetOpeningDate ?? "",
    openingDate: outlet?.openingDate ?? "",
    closingDate: outlet?.closingDate ?? "",
    notes: outlet?.notes ?? "",
    attributes: outlet?.attributes ?? [],
  };
}
