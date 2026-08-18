"use client";

import { Loader2Icon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useEntityIndex, useOutletIndex } from "@/features/registry/hooks";
import { useVendorIndex } from "@/features/registry-vendors/hooks";
import { useSubmit } from "@/hooks/use-submit";
import { hasTenancyRent, type TenancyCreate } from "@/lib/api/types";

import { type TenancyRecord } from "../api";
import { useTenancyMutations } from "../hooks";
import { buildTenancyPayload, initialState, TenancyFields, type FormState } from "./tenancy-fields";

/**
 * Create or edit a tenancy by hand — the keyboard-first path, and what edits an intake's result.
 * The document-first four-step flow (draft → upload → read → save) is `TenancyIntakeSheet`, which
 * the list's "Add tenancy" opens; both share `TenancyFields` so the 33 columns are described once.
 *
 * Rent follows the wifi-password discipline: shown only when `hasTenancyRent` (on create there is
 * no record and a restricted caller's POST 403s — the API's honest answer), and omitted from the
 * payload entirely otherwise.
 */
export function TenancyForm({
  tenancy,
  defaultOutletId,
  open,
  onOpenChange,
}: {
  tenancy?: TenancyRecord;
  defaultOutletId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = Boolean(tenancy);
  const canSeeRent = tenancy ? hasTenancyRent(tenancy) : true;
  const { create, update } = useTenancyMutations();
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();
  const { outlets } = useOutletIndex();
  const { entities } = useEntityIndex();
  const { vendors } = useVendorIndex();
  const landlords = React.useMemo(
    () => vendors.filter((vendor) => vendor.kind === "landlord"),
    [vendors],
  );

  const [form, setForm] = React.useState(() => initialState(tenancy, defaultOutletId));

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(initialState(tenancy, defaultOutletId));
  }

  const set = React.useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) =>
      setForm((current) => ({ ...current, [key]: value })),
    [],
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = buildTenancyPayload(form, canSeeRent);

    const ok = await run(async () => {
      if (tenancy) {
        await update(tenancy.id, payload);
        toast.success("Tenancy updated");
      } else {
        await create({ ...payload, outlet_id: form.outlet_id, kind: form.kind } as TenancyCreate);
        toast.success("Tenancy created");
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
          <SheetTitle>{isEdit ? "Edit tenancy" : "New tenancy"}</SheetTitle>
          <SheetDescription>
            The lease behind one outlet&apos;s door — its term, the option to renew, and what it
            costs.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="contents">
          <SheetBody className="flex flex-col gap-8">
            {formError ? (
              <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
                {formError}
              </p>
            ) : null}

            <TenancyFields
              form={form}
              set={set}
              fieldErrors={fieldErrors}
              canSeeRent={canSeeRent}
              isEdit={isEdit}
              outlets={outlets}
              entities={entities}
              landlords={landlords}
            />
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
                "Create tenancy"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
