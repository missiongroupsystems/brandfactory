"use client";

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
import { toNullable, useSubmit } from "@/hooks/use-submit";
import type { Outlet, OutletCreate, OutletStatus, OutletType } from "@/lib/api/types";
import { OUTLET_STATUS_OPTIONS, OUTLET_TYPE_OPTIONS } from "@/lib/labels";

import { useBrandIndex } from "@/features/registry-brands/hooks";

import { useEntityIndex, useOutletMutations, useOutletRelatedContracts } from "../hooks";
import { AttributePicker } from "./attribute-picker";
import { OutletCloseDialog } from "./close-dialogs";

/**
 * Create or edit an outlet.
 *
 * One component for both, because the fields are the same and two components diverge. The mode
 * is `outlet ? "edit" : "create"`, and the only real difference is **attributes**, which appear
 * on create and not on edit.
 *
 * That asymmetry follows the API rather than fighting it: `POST /outlets` accepts an attribute
 * list so requirement suggestions can run the moment a pipeline outlet exists, while `PATCH`
 * does not — the set is replaced wholesale through `PUT /outlets/{id}/attributes`, since what a
 * user means by ticking boxes is "these are the attributes" and not a delta. On an existing
 * outlet that editor lives on the detail page next to the record it changes, where the result is
 * visible. Duplicating it here would mean one form issuing two writes that can half-fail.
 */
export function OutletForm({
  outlet,
  open,
  onOpenChange,
  onCreated,
}: {
  outlet?: Outlet;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new record so a list can jump to it. Create mode only. */
  onCreated?: (outlet: Outlet) => void;
}) {
  const isEdit = Boolean(outlet);
  const { create, update } = useOutletMutations();
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();
  const { entities, isLoading: entitiesLoading } = useEntityIndex();
  const { brands, isLoading: brandsLoading } = useBrandIndex();

  const [form, setForm] = React.useState(() => initialState(outlet));

  // Reset the draft per open — the sheet's content survives its close, and the `key`
  // this form used to carry changed mid-close (the parent clears `outlet` then), which
  // wedges Base UI's dismissal. Render-time adjustment, not an effect: see license-form.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(initialState(outlet));
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  // Retiring an outlet (`status → closed`) is not a silent PATCH: the contracts covering it need
  // dispositions. Fetch the related open contracts the moment the user picks "closed" so the
  // decision is ready by the time they save; open the pop-up in place of the PATCH when there
  // are any (else close directly). Cluster D — `docs/plans/contract-retire.md`.
  const closingOutlet =
    isEdit && form.status === "closed" && Boolean(outlet) && outlet!.status !== "closed";
  const { data: relatedContracts } = useOutletRelatedContracts(
    outlet?.id,
    open && closingOutlet,
  );
  const [closeDialogOpen, setCloseDialogOpen] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (closingOutlet && relatedContracts && relatedContracts.length > 0) {
      setCloseDialogOpen(true);
      return;
    }

    const payload: OutletCreate = {
      name: form.name.trim(),
      outlet_type: form.outlet_type,
      status: form.status,
      brand_id: toNullable(form.brand_id),
      entity_id: toNullable(form.entity_id),
      address: toNullable(form.address),
      unit: toNullable(form.unit),
      postal_code: toNullable(form.postal_code),
      target_opening_date: toNullable(form.target_opening_date),
      opening_date: toNullable(form.opening_date),
      closing_date: toNullable(form.closing_date),
      notes: toNullable(form.notes),
    };

    const ok = await run(async () => {
      if (outlet) {
        await update(outlet.id, payload);
        toast.success(`${payload.name} updated`);
      } else {
        const created = await create({ ...payload, attributes: form.attributes });
        toast.success(`${payload.name} created`);
        onCreated?.(created);
      }
    });

    if (ok) onOpenChange(false);
  }

  /**
   * `key` resets every field when the sheet is opened for a different record — or reopened for a
   * new one after a cancelled draft. Remounting is the whole reset: no effect syncing props into
   * state, which is the pattern that already broke this build once (`hooks/use-mobile.ts`).
   */
  return (
    <>
      {/* The retire pop-up, portalled above this sheet. Rendered outside the <form> so its
          buttons never associate with the form's submit. */}
      {outlet ? (
        <OutletCloseDialog
          outlet={outlet}
          contracts={relatedContracts ?? []}
          open={closeDialogOpen}
          onOpenChange={setCloseDialogOpen}
          onClosed={() => onOpenChange(false)}
        />
      ) : null}
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) reset();
          onOpenChange(next);
        }}
      >
        <SheetContent size="wide">
        <SheetHeader>
          <SheetTitle>{isEdit ? `Edit ${outlet!.name}` : "New outlet"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Attributes are edited on the outlet's own page, where the licence requirements they drive are visible."
              : "A pipeline outlet needs only a name and a type. Everything else can follow as the project firms up."}
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
                {/* Was a free-text input, and that is what this change is for: nothing validated
                    it, nothing offered what already existed, and the filter it fed is an
                    exact-match WHERE — so `"Casa Vostra "` with a trailing space was a fourth
                    brand, invisible on screen and matching nothing. The backfill found exactly
                    that in the live data.

                    Creating a brand from here is deliberately not offered. Brands are made on
                    the Brands page; a create-inside-a-picker is how three spellings of one name
                    get typed by somebody in a hurry, which is the thing being fixed. Every brand
                    is listed whatever its status — a retired brand is still assignable on the
                    API, and refusing here would invent a rule the domain does not have. */}
                <Field
                  label="Brand"
                  hint="Shared by several outlets. Left empty for a one-off site."
                  error={fieldErrors.brand_id}
                >
                  {(field) => (
                    <Select
                      {...field}
                      disabled={brandsLoading}
                      value={form.brand_id}
                      onChange={(event) => set("brand_id", event.target.value)}
                    >
                      <option value="">No brand</option>
                      {/* While the catalogue is in flight, keep the outlet's own brand in the
                          list as a placeholder. A native select whose `value` matches no option
                          falls back to showing the first one — "No brand" — which reads as a
                          fact about this outlet rather than as a request that has not arrived.
                          The saved value is safe either way (nothing calls `set` until the user
                          picks), so this is about what the reader is told. */}
                      {form.brand_id && !brands.some((brand) => brand.id === form.brand_id) ? (
                        <option value={form.brand_id}>…</option>
                      ) : null}
                      {brands.map((brand) => (
                        <option key={brand.id} value={brand.id}>
                          {brand.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field label="Type" required error={fieldErrors.outlet_type}>
                  {(field) => (
                    <Select
                      {...field}
                      value={form.outlet_type}
                      onChange={(event) =>
                        set("outlet_type", event.target.value as OutletType)
                      }
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

              <FieldGrid>
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

                <Field
                  label="Holding entity"
                  hint="Can be left undecided on an early-stage project."
                  error={fieldErrors.entity_id}
                >
                  {(field) => (
                    <Select
                      {...field}
                      disabled={entitiesLoading}
                      value={form.entity_id}
                      onChange={(event) => set("entity_id", event.target.value)}
                    >
                      <option value="">Not decided</option>
                      {entities.map((entity) => (
                        <option key={entity.id} value={entity.id}>
                          {entity.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </FieldGrid>
            </FieldSection>

            <FieldSection title="Address">
              <Field label="Street address" error={fieldErrors.address}>
                {(field) => (
                  <Input
                    {...field}
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

                <Field
                  label="Postal code"
                  hint="Six digits."
                  error={fieldErrors.postal_code}
                >
                  {(field) => (
                    <Input
                      {...field}
                      inputMode="numeric"
                      maxLength={6}
                      value={form.postal_code}
                      onChange={(event) => set("postal_code", event.target.value)}
                      placeholder="089137"
                    />
                  )}
                </Field>
              </FieldGrid>
            </FieldSection>

            <FieldSection
              title="Dates"
              description="A target date is the plan; an opening date is what happened."
            >
              <FieldGrid>
                <Field label="Target opening" error={fieldErrors.target_opening_date}>
                  {(field) => (
                    <Input
                      {...field}
                      type="date"
                      value={form.target_opening_date}
                      onChange={(event) => set("target_opening_date", event.target.value)}
                    />
                  )}
                </Field>

                <Field label="Opened" error={fieldErrors.opening_date}>
                  {(field) => (
                    <Input
                      {...field}
                      type="date"
                      value={form.opening_date}
                      onChange={(event) => set("opening_date", event.target.value)}
                    />
                  )}
                </Field>
              </FieldGrid>

              <Field
                label="Closed"
                hint="Cannot be before the opening date."
                error={fieldErrors.closing_date}
              >
                {(field) => (
                  <Input
                    {...field}
                    type="date"
                    value={form.closing_date}
                    onChange={(event) => set("closing_date", event.target.value)}
                  />
                )}
              </Field>
            </FieldSection>

            {!isEdit ? (
              <FieldSection
                title="Attributes"
                description="What the site does. These drive the licence requirements the system will propose, which is the reason to set them on a pipeline outlet before it opens."
              >
                <AttributePicker
                  selected={form.attributes}
                  onChange={(attributes) => set("attributes", attributes)}
                />
              </FieldSection>
            ) : null}

            <FieldSection title="Notes">
              <Field label="Notes" error={fieldErrors.notes}>
                {(field) => (
                  <Textarea
                    {...field}
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
            <Button
              type="submit"
              disabled={isPending || (closingOutlet && relatedContracts === undefined)}
            >
              {isPending ? (
                <>
                  <Loader2Icon className="animate-spin" data-icon="inline-start" />
                  Saving
                </>
              ) : isEdit ? (
                "Save changes"
              ) : (
                "Create outlet"
              )}
            </Button>
          </SheetFooter>
        </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

type FormState = {
  name: string;
  brand_id: string;
  outlet_type: OutletType;
  status: OutletStatus;
  entity_id: string;
  address: string;
  unit: string;
  postal_code: string;
  target_opening_date: string;
  opening_date: string;
  closing_date: string;
  notes: string;
  attributes: string[];
};

/**
 * `?? ""` throughout: these are controlled inputs, and a `null` value makes React drop the input
 * to uncontrolled with a warning, after which typing works but the state does not update.
 */
function initialState(outlet?: Outlet): FormState {
  return {
    name: outlet?.name ?? "",
    brand_id: outlet?.brand_id ?? "",
    // A new outlet defaults to `pipeline`, matching the API's own default: the planning case is
    // the one worth optimising for, and an outlet that is already open is the rarer entry.
    outlet_type: outlet?.outlet_type ?? "restaurant",
    status: outlet?.status ?? "pipeline",
    entity_id: outlet?.entity_id ?? "",
    address: outlet?.address ?? "",
    unit: outlet?.unit ?? "",
    postal_code: outlet?.postal_code ?? "",
    target_opening_date: outlet?.target_opening_date ?? "",
    opening_date: outlet?.opening_date ?? "",
    closing_date: outlet?.closing_date ?? "",
    notes: outlet?.notes ?? "",
    attributes: outlet?.attributes ?? [],
  };
}
