"use client";

import { Loader2Icon, PlusIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { VendorForm } from "@/features/registry-vendors/components/vendor-form";
import { useVendorIndex } from "@/features/registry-vendors/hooks";
import { toNullable, useSubmit } from "@/hooks/use-submit";
import {
  hasContractValue,
  type BillingFrequency,
  type ContractCategory,
  type ContractStatus,
  type RenewalType,
  type Vendor,
} from "@/lib/api/types";
import {
  BILLING_FREQUENCY_OPTIONS,
  CONTRACT_CATEGORY_OPTIONS,
  CONTRACT_STATUS_OPTIONS,
  RENEWAL_TYPE_OPTIONS,
} from "@/lib/labels";

import type { ContractRecord } from "../api";
import { useContractMutations } from "../hooks";

/**
 * Create or edit a contract.
 *
 * `value` follows the wifi-password discipline exactly: the field renders only for a
 * caller who can see it (on edit, that is `hasContractValue` on the record; on create
 * there is no record, and a restricted caller's POST would 403 — the API's answer and
 * the honest place to find out), and it is **omitted from the payload entirely** when
 * hidden. Sending null would blank a figure nobody was shown.
 *
 * **The brands are on the create form and edited on the contract's own page afterwards.**
 * That asymmetry is inherited from the coverage section this replaces, and the reason it
 * survives the change is unchanged: what an agreement is *for* is the first thing anyone
 * knows about it, so it belongs on create; changing it later reassigns a signed agreement,
 * which is a decision that deserves a page rather than a checkbox in a sheet.
 */
export function ContractForm({
  contract,
  defaultBrandId,
  open,
  onOpenChange,
}: {
  contract?: ContractRecord;
  defaultBrandId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = Boolean(contract);
  const { create, update } = useContractMutations();
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();
  const { vendors, isLoading: vendorsLoading } = useVendorIndex();
  const { brands, isLoading: brandsLoading } = useBrandIndex();

  const canSeeValue = contract ? hasContractValue(contract) : true;

  const [form, setForm] = React.useState(() => initialState(contract, defaultBrandId));

  // The nested "New vendor" sheet, opened from the vendor select, and the vendor it creates.
  // `justCreatedVendor` is kept as a stopgap <option> so the native select cannot render blank
  // in the tick between selecting the new id and the vendor index revalidating to include it.
  const [vendorFormOpen, setVendorFormOpen] = React.useState(false);
  const [justCreatedVendor, setJustCreatedVendor] = React.useState<Vendor | null>(null);

  // Reset per open — sheet content survives its close; see license-form.tsx.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(initialState(contract, defaultBrandId));
      setJustCreatedVendor(null);
      setVendorFormOpen(false);
    }
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const base = {
      title: form.title.trim(),
      category: form.category,
      start_date: toNullable(form.start_date),
      end_date: toNullable(form.end_date),
      renewal_type: form.renewal_type,
      notice_period_days: form.notice_period_days
        ? Number(form.notice_period_days)
        : null,
      billing_frequency: form.billing_frequency || null,
      status: form.status,
      scope_description: toNullable(form.scope_description),
      notes: toNullable(form.notes),
    };
    const withValue = canSeeValue ? { ...base, value: toNullable(form.value) } : base;

    const ok = await run(async () => {
      if (contract) {
        await update(contract.id, withValue);
        toast.success(`${base.title} updated`);
      } else {
        await create({
          ...withValue,
          vendor_id: form.vendor_id,
          brand_ids: form.brand_ids,
        });
        toast.success(`${base.title} created`);
      }
    });
    if (ok) onOpenChange(false);
  }

  return (
    <>
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent size="wide">
        <SheetHeader>
          <SheetTitle>{isEdit ? `Edit ${contract!.title}` : "New contract"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "The brands this agreement is held for are edited on the contract's own page."
              : "An auto-renewing contract with a notice period gets a deadline on the dashboard — the single most expensive thing a spreadsheet fails to surface."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="contents">
          <SheetBody className="flex flex-col gap-8">
            {formError ? (
              <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
                {formError}
              </p>
            ) : null}

            <FieldSection title="Agreement">
              {!isEdit ? (
                // A native <select> has no room for a "+ New vendor" footer row, so the
                // affordance is a button beneath it (mirrors the "Add contact" pattern). It
                // opens the real VendorForm as a nested sheet; on create the new vendor is
                // selected back here with every other field preserved.
                <div className="flex flex-col gap-1.5">
                  <Field label="Vendor" required error={fieldErrors.vendor_id}>
                    {(field) => (
                      <Select
                        {...field}
                        required
                        disabled={vendorsLoading}
                        value={form.vendor_id}
                        onChange={(event) => set("vendor_id", event.target.value)}
                      >
                        <option value="">Choose a vendor</option>
                        {/* Stopgap option: a just-created vendor the index has not yet
                            revalidated to include, so its id always has a matching option. */}
                        {justCreatedVendor &&
                        !vendors.some((vendor) => vendor.id === justCreatedVendor.id) ? (
                          <option value={justCreatedVendor.id}>{justCreatedVendor.name}</option>
                        ) : null}
                        {vendors.map((vendor) => (
                          <option key={vendor.id} value={vendor.id}>
                            {vendor.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="self-start"
                    onClick={() => setVendorFormOpen(true)}
                  >
                    <PlusIcon data-icon="inline-start" />
                    New vendor
                  </Button>
                </div>
              ) : null}

              <Field label="Title" required error={fieldErrors.title}>
                {(field) => (
                  <Input
                    {...field}
                    required
                    maxLength={200}
                    value={form.title}
                    onChange={(event) => set("title", event.target.value)}
                    placeholder="Quarterly AC servicing 2026"
                  />
                )}
              </Field>

              <FieldGrid>
                <Field label="Category" required error={fieldErrors.category}>
                  {(field) => (
                    <Select
                      {...field}
                      value={form.category}
                      onChange={(event) =>
                        set("category", event.target.value as ContractCategory)
                      }
                    >
                      {CONTRACT_CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Status" required error={fieldErrors.status}>
                  {(field) => (
                    <Select
                      {...field}
                      value={form.status}
                      onChange={(event) => set("status", event.target.value as ContractStatus)}
                    >
                      {CONTRACT_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </FieldGrid>
            </FieldSection>

            <FieldSection
              title="Term and renewal"
              description="Auto-renewing with a notice period is the combination the dashboard chases: the deadline to give notice is end date minus the notice period."
            >
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
                <Field label="Renewal" required error={fieldErrors.renewal_type}>
                  {(field) => (
                    <Select
                      {...field}
                      value={form.renewal_type}
                      onChange={(event) =>
                        set("renewal_type", event.target.value as RenewalType)
                      }
                    >
                      {RENEWAL_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field
                  label="Notice period (days)"
                  hint="How long before the end date notice must be given."
                  error={fieldErrors.notice_period_days}
                >
                  {(field) => (
                    <Input
                      {...field}
                      type="number"
                      min={0}
                      value={form.notice_period_days}
                      onChange={(event) => set("notice_period_days", event.target.value)}
                    />
                  )}
                </Field>
              </FieldGrid>
            </FieldSection>

            <FieldSection title="Money">
              <FieldGrid>
                {canSeeValue ? (
                  <Field
                    label="Value (SGD)"
                    hint="Sensitive — visible to the operations team only."
                    error={fieldErrors.value}
                  >
                    {(field) => (
                      <Input
                        {...field}
                        inputMode="decimal"
                        value={form.value}
                        onChange={(event) => set("value", event.target.value)}
                        placeholder="4800.00"
                      />
                    )}
                  </Field>
                ) : null}
                <Field label="Billing" error={fieldErrors.billing_frequency}>
                  {(field) => (
                    <Select
                      {...field}
                      value={form.billing_frequency}
                      onChange={(event) =>
                        set(
                          "billing_frequency",
                          event.target.value as BillingFrequency | "",
                        )
                      }
                    >
                      <option value="">Not recorded</option>
                      {BILLING_FREQUENCY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </FieldGrid>
            </FieldSection>

            {!isEdit ? (
              <FieldSection
                title="Brands"
                // Says what leaving it empty *means*, rather than only what ticking a box
                // does. An unticked set of checkboxes is ambiguous between "held for
                // everybody" and "I have not got to this yet", and the table renders the
                // first of those as a stated fact — so the form has to be the place that
                // difference is explained, not the place it is created by accident.
                description="Which brands this agreement is held for. Leave every box clear for an agreement held at group level — a tool subscription or a press office retainer that belongs to no single brand."
              >
                <fieldset className="grid gap-2 sm:grid-cols-2">
                  <legend className="sr-only">Brands this agreement is held for</legend>
                  {brandsLoading ? (
                    <p className="text-helper text-ink-secondary">Loading brands…</p>
                  ) : (
                    brands.map((brand) => (
                      <label
                        key={brand.id}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink hover:bg-surface-hover"
                      >
                        <Checkbox
                          checked={form.brand_ids.includes(brand.id)}
                          onChange={(event) =>
                            set(
                              "brand_ids",
                              event.target.checked
                                ? [...form.brand_ids, brand.id]
                                : form.brand_ids.filter((id) => id !== brand.id),
                            )
                          }
                        />
                        {brand.name}
                      </label>
                    ))
                  )}
                </fieldset>
              </FieldSection>
            ) : null}

            <FieldSection title="Scope and notes">
              <Field label="Scope" error={fieldErrors.scope_description}>
                {(field) => (
                  <Textarea
                    {...field}
                    value={form.scope_description}
                    onChange={(event) => set("scope_description", event.target.value)}
                    placeholder="What the vendor actually promised to do."
                  />
                )}
              </Field>
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
                "Create contract"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>

      {/* The nested create-vendor sheet. Stacks over the contract sheet, which stays mounted —
          so on cancel or create the contract draft is exactly as the user left it. Rendered
          outside the outer <form> so its own <form> never nests. */}
      {!isEdit ? (
        <VendorForm
          open={vendorFormOpen}
          onOpenChange={setVendorFormOpen}
          onCreated={(vendor) => {
            setJustCreatedVendor(vendor);
            set("vendor_id", vendor.id);
          }}
        />
      ) : null}
    </>
  );
}

type FormState = {
  vendor_id: string;
  title: string;
  category: ContractCategory;
  status: ContractStatus;
  start_date: string;
  end_date: string;
  renewal_type: RenewalType;
  notice_period_days: string;
  value: string;
  billing_frequency: BillingFrequency | "";
  scope_description: string;
  notes: string;
  brand_ids: string[];
};

function initialState(contract?: ContractRecord, defaultBrandId?: string): FormState {
  return {
    vendor_id: contract?.vendor_id ?? "",
    title: contract?.title ?? "",
    // `retainer`, because it is the commonest marketing agreement and the first option in
    // the list — a default the reader can see is selected rather than one they have to
    // scroll to find. It was `aircon`, which was the first *trade* and had the same
    // property for a different product.
    category: contract?.category ?? "retainer",
    status: contract?.status ?? "active",
    start_date: contract?.start_date ?? "",
    end_date: contract?.end_date ?? "",
    renewal_type: contract?.renewal_type ?? "manual",
    notice_period_days: contract?.notice_period_days?.toString() ?? "",
    value: (contract && hasContractValue(contract) && contract.value) || "",
    billing_frequency: contract?.billing_frequency ?? "",
    scope_description: contract?.scope_description ?? "",
    notes: contract?.notes ?? "",
    brand_ids: contract?.brand_ids ?? (defaultBrandId ? [defaultBrandId] : []),
  };
}
