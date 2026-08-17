"use client";

import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
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
import type {
  ServiceCategory,
  Vendor,
  VendorContactInput,
  VendorKind,
  VendorStatus,
} from "@/lib/api/types";
import {
  SERVICE_CATEGORY_OPTIONS,
  VENDOR_KIND_OPTIONS,
  VENDOR_STATUS_OPTIONS,
} from "@/lib/labels";

import { useVendorMutations } from "../hooks";

/**
 * Create or edit a vendor, contacts included.
 *
 * The contact list is one editable set with a single radio column for the primary —
 * submitting it PUTs the whole set, which is what lets a primary swap be one click
 * instead of a two-request dance with the partial unique index refusing the second.
 */
export function VendorForm({
  vendor,
  open,
  onOpenChange,
  onCreated,
}: {
  vendor?: Vendor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Fired with the newly created vendor, before the sheet closes. Lets a caller that opened
   * this form inline (the New Contract sheet) select the vendor it just created back into its
   * own field. Absent for the ordinary `/vendors` create, which has nothing to hand it to.
   * This does **not** fork the create path — it is still the one `useVendorMutations().create`.
   */
  onCreated?: (vendor: Vendor) => void;
}) {
  const isEdit = Boolean(vendor);
  const { create, update, replaceContacts } = useVendorMutations();
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();

  const [form, setForm] = React.useState(() => initialState(vendor));

  // Reset the draft per open — the sheet's content survives its close (see
  // license-form.tsx for the full story). Render-time adjustment, not an effect.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(initialState(vendor));
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const setContact = (index: number, patch: Partial<ContactDraft>) =>
    setForm((current) => ({
      ...current,
      contacts: current.contacts.map((contact, i) =>
        i === index
          ? { ...contact, ...patch }
          : // A radio group in spirit: marking one primary unmarks the rest.
            patch.is_primary
            ? { ...contact, is_primary: false }
            : contact,
      ),
    }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const contacts: VendorContactInput[] = form.contacts
      .filter((contact) => contact.name.trim())
      .map((contact) => ({
        name: contact.name.trim(),
        role: toNullable(contact.role),
        email: toNullable(contact.email),
        phone: toNullable(contact.phone),
        is_primary: contact.is_primary,
      }));

    const base = {
      name: form.name.trim(),
      kind: form.kind,
      uen: toNullable(form.uen),
      // `|| null`, not `toNullable`: that helper trims and returns `string`, which widens
      // the literal union back to free text and puts this field one careless call from
      // sending a value the API would 422. A select's value needs no trimming anyway —
      // it is one of the options or it is the empty one.
      category: form.category || null,
      website: toNullable(form.website),
      status: form.status,
      notes: toNullable(form.notes),
    };

    const ok = await run(async () => {
      if (vendor) {
        await update(vendor.id, base);
        await replaceContacts(vendor.id, contacts);
        toast.success(`${base.name} updated`);
      } else {
        const created = await create({ ...base, contacts });
        toast.success(`${base.name} created`);
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
          <SheetTitle>{isEdit ? `Edit ${vendor!.name}` : "New vendor"}</SheetTitle>
          <SheetDescription>
            The company we pay, and who to call when the work is not done.
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
              <Field label="Name" required error={fieldErrors.name}>
                {(field) => (
                  <Input
                    {...field}
                    required
                    maxLength={200}
                    value={form.name}
                    onChange={(event) => set("name", event.target.value)}
                    placeholder="CoolFlow Aircon Services Pte Ltd"
                  />
                )}
              </Field>

              <Field
                label="Kind"
                hint="A landlord is filed here too, so its contacts live in the address book. Landlords are not chased for a service category."
                error={fieldErrors.kind}
              >
                {(field) => (
                  <Select
                    {...field}
                    value={form.kind}
                    onChange={(event) => set("kind", event.target.value as VendorKind)}
                  >
                    {VENDOR_KIND_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <FieldGrid>
                <Field label="UEN" error={fieldErrors.uen}>
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={20}
                      className="font-mono text-helper"
                      value={form.uen}
                      onChange={(event) => set("uen", event.target.value)}
                    />
                  )}
                </Field>
                {/*
                 * A select, not free text, since 0.16.0 — this is the same closed
                 * vocabulary `contract.category` uses, so a vendor and its contracts now
                 * say the same word for the same trade. Typing here used to write whatever
                 * was typed into a column filtered by exact match, which is how a value
                 * with a trailing space becomes a bucket nobody can see.
                 *
                 * The empty option is not decoration and must not be dropped: the column
                 * is nullable and "nobody has said" is a different fact from "stated, none
                 * of these" — which is what `other` means. Its `""` becomes `null` on
                 * submit via `form.category || null`, **not** `toNullable` — see the
                 * comment on that line for why this one field is the exception.
                 */}
                <Field
                  label="Category"
                  hint="The trade they mostly work. Shared with contracts."
                  error={fieldErrors.category}
                >
                  {(field) => (
                    <Select
                      {...field}
                      value={form.category}
                      onChange={(event) =>
                        set("category", event.target.value as ServiceCategory | "")
                      }
                    >
                      <option value="">Not set</option>
                      {SERVICE_CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </FieldGrid>

              <FieldGrid>
                <Field label="Website" error={fieldErrors.website}>
                  {(field) => (
                    <Input
                      {...field}
                      type="url"
                      value={form.website}
                      onChange={(event) => set("website", event.target.value)}
                      placeholder="https://…"
                    />
                  )}
                </Field>
                <Field
                  label="Status"
                  hint="Blacklisted means do not re-engage — put the reason in notes."
                  error={fieldErrors.status}
                >
                  {(field) => (
                    <Select
                      {...field}
                      value={form.status}
                      onChange={(event) => set("status", event.target.value as VendorStatus)}
                    >
                      {VENDOR_STATUS_OPTIONS.map((option) => (
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
              title="Contacts"
              description="One can be primary — the first person to call. Saving replaces the whole list."
            >
              <div className="flex flex-col gap-3">
                {form.contacts.map((contact, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-2 rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-helper text-ink-secondary">
                        <input
                          type="radio"
                          name="primary-contact"
                          checked={contact.is_primary}
                          onChange={() => setContact(index, { is_primary: true })}
                        />
                        Primary contact
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            contacts: current.contacts.filter((_, i) => i !== index),
                          }))
                        }
                      >
                        <Trash2Icon />
                        <span className="sr-only">Remove contact</span>
                      </Button>
                    </div>
                    <FieldGrid>
                      <Input
                        aria-label="Contact name"
                        placeholder="Name"
                        maxLength={200}
                        value={contact.name}
                        onChange={(event) => setContact(index, { name: event.target.value })}
                      />
                      <Input
                        aria-label="Contact role"
                        placeholder="Role"
                        maxLength={100}
                        value={contact.role}
                        onChange={(event) => setContact(index, { role: event.target.value })}
                      />
                    </FieldGrid>
                    <FieldGrid>
                      <Input
                        aria-label="Contact email"
                        type="email"
                        placeholder="Email"
                        value={contact.email}
                        onChange={(event) => setContact(index, { email: event.target.value })}
                      />
                      <Input
                        aria-label="Contact phone"
                        placeholder="Phone"
                        maxLength={50}
                        value={contact.phone}
                        onChange={(event) => setContact(index, { phone: event.target.value })}
                      />
                    </FieldGrid>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      contacts: [...current.contacts, emptyContact()],
                    }))
                  }
                >
                  <PlusIcon data-icon="inline-start" />
                  Add contact
                </Button>
              </div>
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
                "Create vendor"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

type ContactDraft = {
  name: string;
  role: string;
  email: string;
  phone: string;
  is_primary: boolean;
};

type FormState = {
  name: string;
  kind: VendorKind;
  uen: string;
  // `""` is the empty option — the draft's spelling of NULL, converted by
  // `form.category || null` on submit. Every other optional field here goes through
  // `toNullable`; this one cannot, because that helper returns `string` and would widen
  // the literal union back to free text.
  category: ServiceCategory | "";
  website: string;
  status: VendorStatus;
  notes: string;
  contacts: ContactDraft[];
};

function emptyContact(): ContactDraft {
  return { name: "", role: "", email: "", phone: "", is_primary: false };
}

function initialState(vendor?: Vendor): FormState {
  return {
    name: vendor?.name ?? "",
    kind: vendor?.kind ?? "service_provider",
    uen: vendor?.uen ?? "",
    category: vendor?.category ?? "",
    website: vendor?.website ?? "",
    status: vendor?.status ?? "active",
    notes: vendor?.notes ?? "",
    contacts:
      vendor?.contacts.map((contact) => ({
        name: contact.name,
        role: contact.role ?? "",
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        is_primary: contact.is_primary,
      })) ?? [],
  };
}
