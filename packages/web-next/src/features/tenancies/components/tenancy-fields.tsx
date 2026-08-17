"use client";

import * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGrid, FieldSection } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toNullable } from "@/hooks/use-submit";
import { hasTenancyRent, type TenancyKind, type TenancyStatus, type TenancyUpdate } from "@/lib/api/types";
import {
  BILLING_FREQUENCY_OPTIONS,
  DEPOSIT_FORM_OPTIONS,
  TENANCY_KIND_OPTIONS,
  TENANCY_STATUS_OPTIONS,
} from "@/lib/labels";

import { type TenancyRecord } from "../api";

/**
 * The tenancy field state, its seed, its payload builder, and the field sections themselves —
 * shared by the plain create/edit form (`tenancy-form.tsx`) and the four-step intake sheet
 * (`tenancy-intake-sheet.tsx`), so the 33 columns are described once. The rent section is gated
 * on `canSeeRent`; the caller omits the money keys from the payload when it is false.
 */

export type FormState = {
  outlet_id: string;
  kind: TenancyKind;
  status: TenancyStatus;
  tenant_entity_id: string;
  landlord_id: string;
  reference: string;
  premises_description: string;
  floor_area_sqft: string;
  start_date: string;
  end_date: string;
  handover_date: string;
  rent_commencement_date: string;
  has_option_to_renew: boolean;
  option_term_months: string;
  option_notice_days: string;
  option_notice_window_days: string;
  base_rent: string;
  rent_frequency: string;
  service_charge: string;
  turnover_rent_percent: string;
  security_deposit: string;
  deposit_form: string;
  deposit_expiry_date: string;
  permitted_use: string;
  reinstatement_required: "" | "yes" | "no";
  notes: string;
};

export type SetField = <K extends keyof FormState>(key: K, value: FormState[K]) => void;

export function initialState(tenancy?: TenancyRecord, defaultOutletId?: string): FormState {
  const rent = tenancy && hasTenancyRent(tenancy) ? tenancy : undefined;
  return {
    outlet_id: tenancy?.outlet_id ?? defaultOutletId ?? "",
    kind: tenancy?.kind ?? "lease",
    status: tenancy?.status ?? "draft",
    tenant_entity_id: tenancy?.tenant_entity_id ?? "",
    landlord_id: tenancy?.landlord_id ?? "",
    reference: tenancy?.reference ?? "",
    premises_description: tenancy?.premises_description ?? "",
    floor_area_sqft: tenancy?.floor_area_sqft ?? "",
    start_date: tenancy?.start_date ?? "",
    end_date: tenancy?.end_date ?? "",
    handover_date: tenancy?.handover_date ?? "",
    rent_commencement_date: tenancy?.rent_commencement_date ?? "",
    has_option_to_renew: tenancy?.has_option_to_renew ?? false,
    option_term_months: numToStr(tenancy?.option_term_months),
    option_notice_days: numToStr(tenancy?.option_notice_days),
    option_notice_window_days: numToStr(tenancy?.option_notice_window_days),
    base_rent: rent?.base_rent ?? "",
    rent_frequency: tenancy?.rent_frequency ?? "",
    service_charge: rent?.service_charge ?? "",
    turnover_rent_percent: rent?.turnover_rent_percent ?? "",
    security_deposit: rent?.security_deposit ?? "",
    deposit_form: tenancy?.deposit_form ?? "",
    deposit_expiry_date: tenancy?.deposit_expiry_date ?? "",
    permitted_use: tenancy?.permitted_use ?? "",
    reinstatement_required:
      tenancy?.reinstatement_required == null
        ? ""
        : tenancy.reinstatement_required
          ? "yes"
          : "no",
    notes: tenancy?.notes ?? "",
  };
}

export function numToStr(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

export function numOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** The editable fields as a `TenancyUpdate`. Option terms are forced null when the option is off
 * (mirrors the DB CHECK, so turning it off cannot leave a stray number), and the four money keys
 * are included only when `canSeeRent` — a caller who cannot read a figure cannot blank it. */
export function buildTenancyPayload(form: FormState, canSeeRent: boolean): TenancyUpdate {
  const option = form.has_option_to_renew;
  const base = {
    kind: form.kind,
    status: form.status,
    tenant_entity_id: form.tenant_entity_id || null,
    landlord_id: form.landlord_id || null,
    reference: toNullable(form.reference),
    premises_description: toNullable(form.premises_description),
    floor_area_sqft: toNullable(form.floor_area_sqft),
    start_date: toNullable(form.start_date),
    end_date: toNullable(form.end_date),
    handover_date: toNullable(form.handover_date),
    rent_commencement_date: toNullable(form.rent_commencement_date),
    has_option_to_renew: option,
    option_term_months: option ? numOrNull(form.option_term_months) : null,
    option_notice_days: option ? numOrNull(form.option_notice_days) : null,
    option_notice_window_days: option ? numOrNull(form.option_notice_window_days) : null,
    rent_frequency: (form.rent_frequency || null) as TenancyUpdate["rent_frequency"],
    deposit_form: (form.deposit_form || null) as TenancyUpdate["deposit_form"],
    deposit_expiry_date: toNullable(form.deposit_expiry_date),
    permitted_use: toNullable(form.permitted_use),
    reinstatement_required:
      form.reinstatement_required === "" ? null : form.reinstatement_required === "yes",
    notes: toNullable(form.notes),
  } satisfies TenancyUpdate;
  const rent: TenancyUpdate = canSeeRent
    ? {
        base_rent: toNullable(form.base_rent),
        service_charge: toNullable(form.service_charge),
        turnover_rent_percent: toNullable(form.turnover_rent_percent),
        security_deposit: toNullable(form.security_deposit),
      }
    : {};
  return { ...base, ...rent };
}

type Named = { id: string; name: string };

export function TenancyFields({
  form,
  set,
  fieldErrors,
  canSeeRent,
  isEdit,
  outlets,
  entities,
  landlords,
}: {
  form: FormState;
  set: SetField;
  fieldErrors: Record<string, string>;
  canSeeRent: boolean;
  isEdit: boolean;
  outlets: readonly Named[];
  entities: readonly Named[];
  landlords: readonly Named[];
}) {
  return (
    <>
      <FieldSection title="Premises">
        <FieldGrid>
          <Field label="Outlet" required error={fieldErrors.outlet_id}>
            {(field) => (
              <Select
                {...field}
                required
                value={form.outlet_id}
                disabled={isEdit}
                onChange={(event) => set("outlet_id", event.target.value)}
              >
                <option value="">Choose an outlet</option>
                {outlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Kind" required error={fieldErrors.kind}>
            {(field) => (
              <Select
                {...field}
                value={form.kind}
                onChange={(event) => set("kind", event.target.value as TenancyKind)}
              >
                {TENANCY_KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </FieldGrid>
        <FieldGrid>
          <Field label="Landlord" error={fieldErrors.landlord_id}>
            {(field) => (
              <Select
                {...field}
                value={form.landlord_id}
                onChange={(event) => set("landlord_id", event.target.value)}
              >
                <option value="">Not set</option>
                {landlords.map((landlord) => (
                  <option key={landlord.id} value={landlord.id}>
                    {landlord.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Signed by"
            hint="Which of our companies signed — a fact about the signature page."
            error={fieldErrors.tenant_entity_id}
          >
            {(field) => (
              <Select
                {...field}
                value={form.tenant_entity_id}
                onChange={(event) => set("tenant_entity_id", event.target.value)}
              >
                <option value="">Not set</option>
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </FieldGrid>
        <Field label="Premises as the document spells it" error={fieldErrors.premises_description}>
          {(field) => (
            <Input
              {...field}
              value={form.premises_description}
              onChange={(event) => set("premises_description", event.target.value)}
              placeholder="#01-23, 350 Joo Chiat Road"
            />
          )}
        </Field>
        <FieldGrid>
          <Field label="Reference" error={fieldErrors.reference}>
            {(field) => (
              <Input
                {...field}
                maxLength={120}
                value={form.reference}
                onChange={(event) => set("reference", event.target.value)}
              />
            )}
          </Field>
          <Field label="Floor area (sqft)" error={fieldErrors.floor_area_sqft}>
            {(field) => (
              <Input
                {...field}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.floor_area_sqft}
                onChange={(event) => set("floor_area_sqft", event.target.value)}
              />
            )}
          </Field>
        </FieldGrid>
        <Field label="Status" required error={fieldErrors.status}>
          {(field) => (
            <Select
              {...field}
              value={form.status}
              onChange={(event) => set("status", event.target.value as TenancyStatus)}
            >
              {TENANCY_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </FieldSection>

      <FieldSection title="Term">
        <FieldGrid>
          <Field label="Starts" error={fieldErrors.start_date}>
            {(field) => (
              <Input
                {...field}
                type="date"
                value={form.start_date}
                onChange={(event) => set("start_date", event.target.value)}
              />
            )}
          </Field>
          <Field label="Ends" error={fieldErrors.end_date}>
            {(field) => (
              <Input
                {...field}
                type="date"
                value={form.end_date}
                onChange={(event) => set("end_date", event.target.value)}
              />
            )}
          </Field>
        </FieldGrid>
        <FieldGrid>
          <Field label="Keys handed over" error={fieldErrors.handover_date}>
            {(field) => (
              <Input
                {...field}
                type="date"
                value={form.handover_date}
                onChange={(event) => set("handover_date", event.target.value)}
              />
            )}
          </Field>
          <Field
            label="Rent commences"
            hint="Distinct from the start by the rent-free fit-out period."
            error={fieldErrors.rent_commencement_date}
          >
            {(field) => (
              <Input
                {...field}
                type="date"
                value={form.rent_commencement_date}
                onChange={(event) => set("rent_commencement_date", event.target.value)}
              />
            )}
          </Field>
        </FieldGrid>
      </FieldSection>

      <FieldSection
        title="Option to renew"
        description="The window you must give notice inside to keep the premises. Missing it loses the site."
      >
        <label className="flex items-center gap-2 text-sm text-ink">
          <Checkbox
            checked={form.has_option_to_renew}
            onChange={(event) => set("has_option_to_renew", event.target.checked)}
          />
          This lease has an option to renew
        </label>
        {form.has_option_to_renew ? (
          <FieldGrid>
            <Field
              label="Notice period (days)"
              hint="Days before the end date notice must be given by."
              error={fieldErrors.option_notice_days}
            >
              {(field) => (
                <Input
                  {...field}
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={form.option_notice_days}
                  onChange={(event) => set("option_notice_days", event.target.value)}
                />
              )}
            </Field>
            <Field
              label="Window (days)"
              hint="How many days earlier the window opens. Too early is as invalid as too late."
              error={fieldErrors.option_notice_window_days}
            >
              {(field) => (
                <Input
                  {...field}
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={form.option_notice_window_days}
                  onChange={(event) => set("option_notice_window_days", event.target.value)}
                />
              )}
            </Field>
            <Field label="Further term (months)" error={fieldErrors.option_term_months}>
              {(field) => (
                <Input
                  {...field}
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={form.option_term_months}
                  onChange={(event) => set("option_term_months", event.target.value)}
                />
              )}
            </Field>
          </FieldGrid>
        ) : null}
      </FieldSection>

      {canSeeRent ? (
        <FieldSection title="Rent">
          <FieldGrid>
            <Field label="Base rent (SGD)" error={fieldErrors.base_rent}>
              {(field) => (
                <Input
                  {...field}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.base_rent}
                  onChange={(event) => set("base_rent", event.target.value)}
                />
              )}
            </Field>
            <Field label="Frequency" error={fieldErrors.rent_frequency}>
              {(field) => (
                <Select
                  {...field}
                  value={form.rent_frequency}
                  onChange={(event) => set("rent_frequency", event.target.value)}
                >
                  <option value="">Not set</option>
                  {BILLING_FREQUENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </FieldGrid>
          <FieldGrid>
            <Field label="Service charge (SGD)" error={fieldErrors.service_charge}>
              {(field) => (
                <Input
                  {...field}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.service_charge}
                  onChange={(event) => set("service_charge", event.target.value)}
                />
              )}
            </Field>
            <Field
              label="Turnover rent (%)"
              hint="A percentage of gross sales, if the lease has one."
              error={fieldErrors.turnover_rent_percent}
            >
              {(field) => (
                <Input
                  {...field}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                  value={form.turnover_rent_percent}
                  onChange={(event) => set("turnover_rent_percent", event.target.value)}
                />
              )}
            </Field>
            <Field label="Security deposit (SGD)" error={fieldErrors.security_deposit}>
              {(field) => (
                <Input
                  {...field}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.security_deposit}
                  onChange={(event) => set("security_deposit", event.target.value)}
                />
              )}
            </Field>
          </FieldGrid>
        </FieldSection>
      ) : null}

      <FieldSection title="Deposit &amp; use">
        <FieldGrid>
          <Field label="Deposit held as" error={fieldErrors.deposit_form}>
            {(field) => (
              <Select
                {...field}
                value={form.deposit_form}
                onChange={(event) => set("deposit_form", event.target.value)}
              >
                <option value="">Not set</option>
                {DEPOSIT_FORM_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Guarantee expiry"
            hint="A banker's guarantee's expiry — chased before it lapses."
            error={fieldErrors.deposit_expiry_date}
          >
            {(field) => (
              <Input
                {...field}
                type="date"
                value={form.deposit_expiry_date}
                onChange={(event) => set("deposit_expiry_date", event.target.value)}
              />
            )}
          </Field>
        </FieldGrid>
        <Field label="Permitted use" error={fieldErrors.permitted_use}>
          {(field) => (
            <Input
              {...field}
              value={form.permitted_use}
              onChange={(event) => set("permitted_use", event.target.value)}
              placeholder="Restaurant and ancillary use"
            />
          )}
        </Field>
        <Field
          label="Reinstatement"
          hint="Whether the lease requires handing the unit back as found."
          error={fieldErrors.reinstatement_required}
        >
          {(field) => (
            <Select
              {...field}
              value={form.reinstatement_required}
              onChange={(event) =>
                set("reinstatement_required", event.target.value as "" | "yes" | "no")
              }
            >
              <option value="">Not read yet</option>
              <option value="yes">Required</option>
              <option value="no">Not required</option>
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
    </>
  );
}
