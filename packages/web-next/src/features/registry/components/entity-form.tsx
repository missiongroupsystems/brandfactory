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
import { useBrandIndex } from "@/features/registry-brands/hooks";
import { toNullable, useSubmit } from "@/hooks/use-submit";
import type { Entity, EntityStatus, EntityType } from "@/lib/api/types";
import { ENTITY_STATUS_OPTIONS, ENTITY_TYPE_OPTIONS } from "@/lib/labels";

import { useEntityMutations, useOutletIndex } from "../hooks";
import { EntityCloseDialog } from "./close-dialogs";

/** A legal operating company — create or edit. */
export function EntityForm({
  entity,
  open,
  onOpenChange,
}: {
  entity?: Entity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = Boolean(entity);
  const { create, update } = useEntityMutations();
  const { brands, isLoading: brandsLoading } = useBrandIndex();
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();

  const [form, setForm] = React.useState(() => initialState(entity));

  // Reset the draft per open — the sheet's content survives its close, and the `key`
  // this form used to carry changed mid-close (the parent clears `entity` then), which
  // wedges Base UI's dismissal. Render-time adjustment, not an effect: see license-form.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(initialState(entity));
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  // Retiring a company (`status → closed`) opens the two-level pop-up when it still holds open
  // outlets: each is transferred to another company or closed (disposing its contracts). Else a
  // plain PATCH closes it. Cluster D — `docs/plans/contract-retire.md`.
  const { outlets, isLoading: outletsLoading } = useOutletIndex();
  const openOutlets = React.useMemo(
    () => outlets.filter((o) => o.entity_id === entity?.id && o.status !== "closed"),
    [outlets, entity],
  );
  const closingEntity =
    isEdit && form.status === "closed" && Boolean(entity) && entity!.status !== "closed";
  const [closeDialogOpen, setCloseDialogOpen] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (closingEntity && openOutlets.length > 0) {
      setCloseDialogOpen(true);
      return;
    }

    const payload = {
      name: form.name.trim(),
      uen: toNullable(form.uen),
      entity_type: form.entity_type,
      status: form.status,
      brand_id: toNullable(form.brand_id),
      registered_address: toNullable(form.registered_address),
      notes: toNullable(form.notes),
    };

    const ok = await run(async () => {
      if (entity) {
        await update(entity.id, payload);
        toast.success(`${payload.name} updated`);
      } else {
        await create(payload);
        toast.success(`${payload.name} created`);
      }
    });

    if (ok) onOpenChange(false);
  }

  return (
    <>
      {/* The two-level retire pop-up, portalled above this sheet and outside the <form>. */}
      {entity ? (
        <EntityCloseDialog
          entity={entity}
          outlets={openOutlets}
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
          <SheetTitle>{isEdit ? `Edit ${entity!.name}` : "New entity"}</SheetTitle>
          <SheetDescription>
            The company that holds licences and signs contracts. Outlets hang off it.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="contents">
          <SheetBody className="flex flex-col gap-8">
            {formError ? (
              <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
                {formError}
              </p>
            ) : null}

            <FieldSection title="Company">
              <Field label="Registered name" required error={fieldErrors.name}>
                {(field) => (
                  <Input
                    {...field}
                    required
                    maxLength={200}
                    value={form.name}
                    onChange={(event) => set("name", event.target.value)}
                    placeholder="Mission Hospitality Pte Ltd"
                  />
                )}
              </Field>

              <FieldGrid>
                <Field
                  label="UEN"
                  hint="ACRA's unique entity number."
                  error={fieldErrors.uen}
                >
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={20}
                      // Mono: a UEN is an identifier, not prose (§5.4).
                      className="font-mono text-helper"
                      value={form.uen}
                      onChange={(event) => set("uen", event.target.value)}
                      placeholder="201812345K"
                    />
                  )}
                </Field>

                <Field label="Type" required error={fieldErrors.entity_type}>
                  {(field) => (
                    <Select
                      {...field}
                      value={form.entity_type}
                      onChange={(event) =>
                        set("entity_type", event.target.value as EntityType)
                      }
                    >
                      {ENTITY_TYPE_OPTIONS.map((option) => (
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
                      onChange={(event) => set("status", event.target.value as EntityStatus)}
                    >
                      {ENTITY_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                {/* A directory label — *"this company exists to run this brand"* — and the hint
                    says the one thing somebody setting it needs to know, because it is the
                    natural place to expect inheritance and there is none. The outlets a company
                    holds keep their own brand, which is what stops a drag on the org chart from
                    silently rewriting a brand-grouped report. */}
                <Field
                  label="Brand"
                  hint="What this company exists to run. It does not set the brand on the outlets it holds — those carry their own."
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
                      {/* The same loading placeholder as the outlet form: a native select whose
                          `value` matches no option falls back to showing the first — "No brand" —
                          which reads as a fact about this company rather than a request that has
                          not arrived. */}
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
              </FieldGrid>

              <Field label="Registered address" error={fieldErrors.registered_address}>
                {(field) => (
                  <Textarea
                    {...field}
                    value={form.registered_address}
                    onChange={(event) => set("registered_address", event.target.value)}
                  />
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
            <Button
              type="submit"
              disabled={isPending || (closingEntity && outletsLoading)}
            >
              {isPending ? (
                <>
                  <Loader2Icon className="animate-spin" data-icon="inline-start" />
                  Saving
                </>
              ) : isEdit ? (
                "Save changes"
              ) : (
                "Create entity"
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
  uen: string;
  entity_type: EntityType;
  status: EntityStatus;
  brand_id: string;
  registered_address: string;
  notes: string;
};

function initialState(entity?: Entity): FormState {
  return {
    name: entity?.name ?? "",
    uen: entity?.uen ?? "",
    entity_type: entity?.entity_type ?? "private_limited",
    status: entity?.status ?? "active",
    brand_id: entity?.brand_id ?? "",
    registered_address: entity?.registered_address ?? "",
    notes: entity?.notes ?? "",
  };
}
