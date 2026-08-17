"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { useEntityIndex, useOutletIndex } from "@/features/registry/hooks";
import { toNullable, useSubmit } from "@/hooks/use-submit";
import type { License, LicenseCreate, LicenseStatus } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { LICENSE_STATUS_OPTIONS } from "@/lib/labels";

import { useLicenseMutations, useLicenseTypeIndex } from "../hooks";
import { familyLabel } from "../family";

/**
 * Record or edit a held licence.
 *
 * The library is advisory here and nowhere stronger: when a type and an issue date are
 * chosen, the typical validity pre-fills a **suggested** expiry the user can take or
 * ignore. If the submitted expiry is more than 31 days from that suggestion the API
 * refuses with both figures, and this form renders the choice — keep the certificate's
 * date (resubmit confirmed) or take the library's. Neither side is ever corrected
 * silently; the discrepancy panel exists precisely because the system cannot know
 * whether the library is stale or the typist slipped.
 *
 * That applies to **edits as much as creates**. A date moved during an edit is if
 * anything more likely to be a slip, because the person is correcting one field rather
 * than reading the certificate through — so `confirm_expiry` rides on both payloads.
 */
export function LicenseForm({
  license,
  defaultOutletId,
  defaultTypeId,
  open,
  onOpenChange,
}: {
  license?: License;
  defaultOutletId?: string;
  defaultTypeId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = Boolean(license);
  const router = useRouter();
  const { create, update } = useLicenseMutations();
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();
  const { types } = useLicenseTypeIndex();
  const { entities, isLoading: entitiesLoading } = useEntityIndex();
  const { outlets, isLoading: outletsLoading } = useOutletIndex();

  const [form, setForm] = React.useState(() =>
    initialState(license, defaultOutletId, defaultTypeId),
  );

  // Reset the draft on each open, during render — the React-documented way to adjust
  // state when a prop changes, and not an effect (the pattern that broke this build
  // once). Needed because the sheet's content survives a close through the exit
  // animation: without this, a create form reopened straight after a successful
  // create still holds the previous draft, and the last certificate's issue date
  // silently leaks into the next record.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(initialState(license, defaultOutletId, defaultTypeId));
  }

  // Derived, not state: the discrepancy panel is just the 409 that mentions the
  // resolution flag, rendered differently. Changing a date clears the submit error
  // (via `reset()`), because the refusal was about the figures as they stood.
  const discrepancy =
    formError && formError.includes("confirm_expiry") ? formError : null;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "issue_date" || key === "expiry_date" || key === "license_type_id") {
      reset();
    }
  };

  const selectedType = types.find((t) => t.id === form.license_type_id);
  const suggestedExpiry = suggestExpiry(
    form.issue_date,
    selectedType?.typical_validity_months,
  );

  async function submit(confirmExpiry: boolean) {
    const base = {
      outlet_id: toNullable(form.outlet_id),
      holder_person_name: toNullable(form.holder_person_name),
      license_number: toNullable(form.license_number),
      issue_date: toNullable(form.issue_date),
      expiry_date: toNullable(form.expiry_date),
      status: form.status,
      conditions: toNullable(form.conditions),
      notes: toNullable(form.notes),
      // Both paths carry the flag: the API runs the discrepancy check on create *and*
      // on any edit that moves a date, so the panel below has to be able to resolve
      // either one. Without this an edit could only ever be refused, never confirmed.
      confirm_expiry: confirmExpiry,
    };

    const ok = await run(async () => {
      if (license) {
        await update(license.id, base);
        toast.success("Licence updated");
      } else {
        const payload: LicenseCreate = {
          ...base,
          license_type_id: form.license_type_id,
          holder_entity_id: form.holder_entity_id,
        };
        const created = await create(payload);
        // Manika asked from this sheet — but the certificate attaches on the licence's own page
        // (an attachment needs a subject id). Hand the user straight there rather than leaving
        // them to find it.
        toast.success("Licence recorded", {
          description: "Attach the certificate on the licence page.",
          action: {
            label: "Open",
            onClick: () => router.push(`/licenses/${created.id}`),
          },
        });
      }
    });
    if (ok) onOpenChange(false);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await submit(false);
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
          <SheetTitle>{isEdit ? "Edit licence" : "Record a licence"}</SheetTitle>
          <SheetDescription>
            The certificate is authoritative. The library only suggests an expiry — the
            date on the paper always wins.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="contents">
          <SheetBody className="flex flex-col gap-8">
            {discrepancy ? (
              <div
                role="alert"
                className="flex flex-col gap-3 rounded-lg bg-warning-tint p-4 text-warning"
              >
                <p className="text-sm font-medium">
                  The expiry disagrees with the library
                </p>
                <p className="text-helper">{discrepancy}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={isPending}
                    onClick={() => submit(true)}
                  >
                    Keep {form.expiry_date ? formatDate(form.expiry_date) : "my date"} —
                    the certificate says so
                  </Button>
                  {suggestedExpiry ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => set("expiry_date", suggestedExpiry)}
                    >
                      Change to {formatDate(suggestedExpiry)}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : formError ? (
              <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
                {formError}
              </p>
            ) : null}

            <FieldSection title="What and whose">
              <Field label="Licence type" required error={fieldErrors.license_type_id}>
                {(field) => (
                  <Select
                    {...field}
                    required
                    disabled={isEdit}
                    value={form.license_type_id}
                    onChange={(event) => set("license_type_id", event.target.value)}
                  >
                    <option value="">Choose a type</option>
                    {types.map((type) => (
                      <option key={type.id} value={type.id}>
                        {familyLabel(type.family)} — {type.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <FieldGrid>
                <Field
                  label="Holder entity"
                  required
                  hint="Licences are held by a company, not a building."
                  error={fieldErrors.holder_entity_id}
                >
                  {(field) => (
                    <Select
                      {...field}
                      required
                      disabled={entitiesLoading || isEdit}
                      value={form.holder_entity_id}
                      onChange={(event) => set("holder_entity_id", event.target.value)}
                    >
                      <option value="">Choose an entity</option>
                      {entities.map((entity) => (
                        <option key={entity.id} value={entity.id}>
                          {entity.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field
                  label="Outlet"
                  hint="Left empty for an entity-level licence not tied to one premises."
                  error={fieldErrors.outlet_id}
                >
                  {(field) => (
                    <Select
                      {...field}
                      disabled={outletsLoading}
                      value={form.outlet_id}
                      onChange={(event) => set("outlet_id", event.target.value)}
                    >
                      <option value="">Entity-level — no outlet</option>
                      {outlets.map((outlet) => (
                        <option key={outlet.id} value={outlet.id}>
                          {outlet.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </FieldGrid>

              {selectedType?.holder_level === "person" ? (
                <Field
                  label="Certificate holder"
                  required
                  hint="This type attaches to a person — the cook or manager whose certificate it is."
                  error={fieldErrors.holder_person_name}
                >
                  {(field) => (
                    <Input
                      {...field}
                      required
                      maxLength={200}
                      value={form.holder_person_name}
                      onChange={(event) => set("holder_person_name", event.target.value)}
                      placeholder="Tan Wei Ming"
                    />
                  )}
                </Field>
              ) : null}
            </FieldSection>

            <FieldSection
              title="The certificate"
              description={
                isEdit
                  ? "The certificate file is attached on the licence page."
                  : "The certificate file attaches on the licence page once this is saved."
              }
            >
              <FieldGrid>
                <Field label="Licence number" error={fieldErrors.license_number}>
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={100}
                      value={form.license_number}
                      onChange={(event) => set("license_number", event.target.value)}
                      placeholder="As printed on the certificate"
                    />
                  )}
                </Field>

                <Field label="Status" required error={fieldErrors.status}>
                  {(field) => (
                    <Select
                      {...field}
                      value={form.status}
                      onChange={(event) => set("status", event.target.value as LicenseStatus)}
                    >
                      {LICENSE_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </FieldGrid>

              <FieldGrid>
                <Field label="Issued" error={fieldErrors.issue_date}>
                  {(field) => (
                    <Input
                      {...field}
                      type="date"
                      value={form.issue_date}
                      onChange={(event) => set("issue_date", event.target.value)}
                    />
                  )}
                </Field>

                <Field
                  label="Expires"
                  hint={
                    suggestedExpiry && !form.expiry_date
                      ? `The library suggests ${formatDate(suggestedExpiry)} (${selectedType?.typical_validity_months} months, confidence: ${selectedType?.confidence}). The certificate wins.`
                      : undefined
                  }
                  error={fieldErrors.expiry_date}
                >
                  {(field) => (
                    <div className="flex items-center gap-2">
                      <Input
                        {...field}
                        type="date"
                        value={form.expiry_date}
                        onChange={(event) => set("expiry_date", event.target.value)}
                      />
                      {suggestedExpiry && !form.expiry_date ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="shrink-0"
                          onClick={() => set("expiry_date", suggestedExpiry)}
                        >
                          Use suggestion
                        </Button>
                      ) : null}
                    </div>
                  )}
                </Field>
              </FieldGrid>

              <Field label="Conditions" error={fieldErrors.conditions}>
                {(field) => (
                  <Textarea
                    {...field}
                    value={form.conditions}
                    onChange={(event) => set("conditions", event.target.value)}
                    placeholder="Conditions printed on the licence, if any."
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
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2Icon className="animate-spin" data-icon="inline-start" />
                  Saving
                </>
              ) : isEdit ? (
                "Save changes"
              ) : (
                "Record licence"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

type FormState = {
  license_type_id: string;
  holder_entity_id: string;
  outlet_id: string;
  holder_person_name: string;
  license_number: string;
  issue_date: string;
  expiry_date: string;
  status: LicenseStatus;
  conditions: string;
  notes: string;
};

function initialState(
  license?: License,
  defaultOutletId?: string,
  defaultTypeId?: string,
): FormState {
  return {
    license_type_id: license?.license_type_id ?? defaultTypeId ?? "",
    holder_entity_id: license?.holder_entity_id ?? "",
    outlet_id: license?.outlet_id ?? defaultOutletId ?? "",
    holder_person_name: license?.holder_person_name ?? "",
    license_number: license?.license_number ?? "",
    issue_date: license?.issue_date ?? "",
    expiry_date: license?.expiry_date ?? "",
    status: license?.status ?? "active",
    conditions: license?.conditions ?? "",
    notes: license?.notes ?? "",
  };
}

/**
 * `issue date + typical validity months`, clamped to the target month's end — the same
 * arithmetic the backend uses, on strings rather than `Date` (a date-only string parsed
 * by `new Date` is midnight UTC, and this is a business date — see lib/format.ts).
 */
function suggestExpiry(
  issueDate: string,
  validityMonths: number | null | undefined,
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(issueDate);
  if (!match || validityMonths == null) return null;

  const [, year, month, day] = match;
  const monthIndex = Number(month) - 1 + validityMonths;
  const targetYear = Number(year) + Math.floor(monthIndex / 12);
  const targetMonth = (monthIndex % 12) + 1;
  // Day 0 of the next month = last day of the target month, in UTC to avoid DST edges.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const targetDay = Math.min(Number(day), lastDay);

  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}
