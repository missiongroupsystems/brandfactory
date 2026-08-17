"use client";

import { Loader2Icon } from "lucide-react";
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
import { useVendorIndex } from "@/features/vendors/hooks";
import { toNullable, useSubmit } from "@/hooks/use-submit";
import type { Contact } from "@/lib/api/types";

import { useContactMutations } from "../hooks";

/**
 * Create or edit one contact. The other door onto these rows is the vendor sheet, which
 * replaces a vendor's whole list at once — this form edits a single person, and is the
 * only place a standalone contact (no vendor) can be made.
 */
export function ContactForm({
  contact,
  open,
  onOpenChange,
}: {
  contact?: Contact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = Boolean(contact);
  const { create, update } = useContactMutations();
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();
  const { vendors } = useVendorIndex();

  const [form, setForm] = React.useState(() => initialState(contact));

  // Reset the draft per open — the sheet's content survives its close (see
  // license-form.tsx for the full story). Render-time adjustment, not an effect.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(initialState(contact));
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const payload = {
      name: form.name.trim(),
      role: toNullable(form.role),
      email: toNullable(form.email),
      phone: toNullable(form.phone),
      vendor_id: form.vendor_id || null,
      // A primary needs a vendor — the backend refuses the combination, so clearing the
      // vendor quietly un-primaries rather than serving the user a 422 for a state the
      // form itself created.
      is_primary: form.vendor_id ? form.is_primary : false,
    };

    const ok = await run(async () => {
      if (contact) {
        await update(contact.id, payload);
        toast.success(`${payload.name} updated`);
      } else {
        await create(payload);
        toast.success(`${payload.name} added`);
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
          <SheetTitle>{isEdit ? `Edit ${contact!.name}` : "New contact"}</SheetTitle>
          <SheetDescription>
            A person Ops HQ calls. Link a vendor to make them part of its contact list, or
            leave it empty for a landlord, building management or an agency officer.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="contents">
          <SheetBody className="flex flex-col gap-8">
            {formError ? (
              <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
                {formError}
              </p>
            ) : null}

            <FieldSection title="Person">
              <Field label="Name" required error={fieldErrors.name}>
                {(field) => (
                  <Input
                    {...field}
                    required
                    maxLength={200}
                    value={form.name}
                    onChange={(event) => set("name", event.target.value)}
                    placeholder="Alice Tan"
                  />
                )}
              </Field>

              <Field
                label="Role"
                hint="Free text — account manager, landlord, technician."
                error={fieldErrors.role}
              >
                {(field) => (
                  <Input
                    {...field}
                    maxLength={100}
                    value={form.role}
                    onChange={(event) => set("role", event.target.value)}
                  />
                )}
              </Field>

              <FieldGrid>
                <Field label="Email" error={fieldErrors.email}>
                  {(field) => (
                    <Input
                      {...field}
                      type="email"
                      maxLength={320}
                      value={form.email}
                      onChange={(event) => set("email", event.target.value)}
                    />
                  )}
                </Field>
                <Field label="Phone" error={fieldErrors.phone}>
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={50}
                      value={form.phone}
                      onChange={(event) => set("phone", event.target.value)}
                      placeholder="+65 …"
                    />
                  )}
                </Field>
              </FieldGrid>
            </FieldSection>

            <FieldSection
              title="Vendor"
              description="Optional. A linked contact also appears in the vendor's sheet — and that sheet's Save replaces the vendor's whole list, this row included."
            >
              <Field label="Vendor" error={fieldErrors.vendor_id}>
                {(field) => (
                  <Select
                    {...field}
                    value={form.vendor_id}
                    onChange={(event) => set("vendor_id", event.target.value)}
                  >
                    <option value="">No vendor — standalone contact</option>
                    {/* A linked vendor the index has not resolved (still loading, or
                        beyond the index's 200-row page) must not display as the first
                        option — a native select falls back to it, and "No vendor" on a
                        linked contact is a lie the save would then not even commit. */}
                    {form.vendor_id && !vendors.some((v) => v.id === form.vendor_id) ? (
                      <option value={form.vendor_id}>Current vendor</option>
                    ) : null}
                    {vendors.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              {form.vendor_id ? (
                <label className="flex items-center gap-2 text-sm text-ink-secondary">
                  <Checkbox
                    checked={form.is_primary}
                    onChange={(event) => set("is_primary", event.target.checked)}
                  />
                  Primary contact — the first person to call at this vendor
                </label>
              ) : null}
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
                "Add contact"
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
  role: string;
  email: string;
  phone: string;
  vendor_id: string;
  is_primary: boolean;
};

function initialState(contact?: Contact): FormState {
  return {
    name: contact?.name ?? "",
    role: contact?.role ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    vendor_id: contact?.vendor_id ?? "",
    is_primary: contact?.is_primary ?? false,
  };
}
