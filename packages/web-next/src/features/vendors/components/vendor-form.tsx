"use client";

import type {
  CreateVendorInput,
  Vendor,
  VendorCategory,
  VendorStatus,
} from "@brandfactory/shared";
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
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
import { useActiveBrand } from "@/features/brands/active-brand";
import { BrandPicker } from "@/features/influencers/components/brand-picker";
import { toNullable, useSubmit } from "@/hooks/use-submit";
import { VENDOR_CATEGORY_OPTIONS, VENDOR_STATUS_OPTIONS } from "@/lib/labels";

import { useVendorMutations } from "../hooks";

/**
 * Create or edit a vendor, contacts included.
 *
 * One component for both, because the fields are the same and two components diverge. The mode is
 * `vendor ? "edit" : "create"`.
 *
 * **Only the name is required**, which is one fewer than an outlet and four fewer than a creator,
 * and it is the shape of the record: a company you have just heard of has a name and nothing else
 * confirmed. Everything below it can be filled in later by the person who knows.
 *
 * **The contacts ride in the body.** The Operations Hub's version of this form saved a vendor with
 * two requests — a PATCH and then `PUT /vendors/:id/contacts` — because its backend held contacts
 * as addressable rows with a partial unique index that could refuse the second half of a primary
 * swap. This server has no such route: `contacts` is a full replacement on create and on patch,
 * the same call `brandIds` makes, so a primary swap is one request and a failed save leaves
 * nothing half-written.
 *
 * **The brand picker is `features/influencers`' component, imported rather than copied.** It is
 * the second caller; AGENTS.md's rule is to promote to `components/` on the *third*, and moving it
 * now would touch a file this phase has no other reason to open. Its behaviour is exactly right
 * here: `brandIds` is a full replacement on this record too, and the disabled `…` box for an
 * unresolved id is what stops a save silently deleting a link the picker could not name.
 */
export function VendorForm({
  vendor,
  open,
  onOpenChange,
}: {
  vendor?: Vendor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = Boolean(vendor);
  const { create, update } = useVendorMutations();
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();
  const { brands, isLoading: brandsLoading } = useActiveBrand();

  const [form, setForm] = React.useState(() => initialState(vendor));

  // Reset the draft per open. The sheet's content survives its close, so a form reopened straight
  // after a save still holds the previous draft — and keying `SheetContent` is not the fix: a key
  // that changes mid-dismissal wedges Base UI's overlay (AGENTS.md records this twice).
  // Render-time adjustment, which is also not the effect pattern that broke this build once.
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
          : // Exclusive in spirit: appointing one primary unappoints the rest.
            patch.isPrimary
            ? { ...contact, isPrimary: false }
            : contact,
      ),
    }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    // Rows with no name are dropped rather than refused. An empty card is somebody who pressed
    // "Add contact" and changed their mind, which is not a mistake worth blocking a save over —
    // and `VendorContactNameSchema` would refuse the body anyway, with a message about an index.
    const contacts = form.contacts
      .filter((contact) => contact.name.trim())
      .map((contact) => ({
        name: contact.name.trim(),
        role: toNullable(contact.role),
        email: toNullable(contact.email),
        phone: toNullable(contact.phone),
        isPrimary: contact.isPrimary,
      }));

    // One payload shape for both verbs. `CreateVendorInput` is the wider of the two — every key it
    // holds is also a patch key — so a create sends it whole and a patch sends the same object,
    // which `UpdateVendorInputSchema` accepts field for field.
    const payload: CreateVendorInput = {
      name: form.name.trim(),
      // `|| null`, not `toNullable`: that helper trims and returns `string`, which widens the
      // literal union back to free text and puts this field one careless call from sending a value
      // the server would refuse. A select's value needs no trimming anyway — it is one of the
      // options or it is the empty one.
      category: form.category || null,
      status: form.status,
      uen: toNullable(form.uen),
      website: toNullable(form.website),
      // A **full replacement**, which is what the picker's checkboxes mean: these are the brands.
      brandIds: form.brandIds as CreateVendorInput["brandIds"],
      contacts,
      notes: toNullable(form.notes),
    };

    const ok = await run(async () => {
      if (vendor) {
        await update(vendor.id, payload);
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
      <SheetContent size="wide">
        <SheetHeader>
          <SheetTitle>{isEdit ? `Edit ${vendor!.name}` : "Add a vendor"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "The web address of this company does not change when its name does — the link you shared last month still works."
              : "A company needs a name. Everything else can be filled in by whoever knows it."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="contents">
          <SheetBody className="flex flex-col gap-8">
            {/* **Where the 409 lands.** A UEN already on another vendor is the one refusal on this
                form that a person reads while looking at the box they typed into — `useSubmit`
                puts an `AppError`'s message straight here, and the server's message names the
                number and gives both ways forward. It is a form-level panel rather than a field
                error because the server answers a code and a sentence, not a field path. */}
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
                    placeholder="Northlight Talent Pte Ltd"
                  />
                )}
              </Field>

              <FieldGrid>
                {/*
                 * The empty option is not decoration and must not be dropped: the column is
                 * nullable and "nobody has said" is a different fact from "stated, none of
                 * these" — which is what `other` means. Its `""` becomes `null` on submit via
                 * `form.category || null`.
                 */}
                <Field
                  label="Category"
                  // **The hint 1.37.0 made false, rewritten.** It read "The trade they mostly
                  // work. Shared with contracts." — a promise that a vendor and a contract say the
                  // same word for the same thing, which stopped being true when `contract.category`
                  // took a marketing vocabulary and vendors kept thirteen building trades. They are
                  // two vocabularies over one domain on purpose: one names what the counterparty
                  // *is*, the other what an agreement *buys*.
                  hint="What the company is, not what a given agreement with them buys."
                  error={fieldErrors.category}
                >
                  {(field) => (
                    <Select
                      {...field}
                      value={form.category}
                      onChange={(event) =>
                        set("category", event.target.value as VendorCategory | "")
                      }
                    >
                      <option value="">Not set</option>
                      {VENDOR_CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
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

              <FieldGrid>
                <Field
                  label="UEN"
                  // The only field on this form that can collide, so the hint says what happens
                  // before the server has to. Two companies may share a name and both rows land;
                  // two rows may not share a registration number.
                  hint="One company, one registration number. Leave it empty if nobody has it."
                  error={fieldErrors.uen}
                >
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={50}
                      className="font-mono text-helper"
                      value={form.uen}
                      onChange={(event) => set("uen", event.target.value)}
                      placeholder="201933718E"
                    />
                  )}
                </Field>

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
              </FieldGrid>
            </FieldSection>

            <FieldSection
              title="Brands"
              description="Which of this workspace's brands the company works on. Ticking none says nobody has assigned them yet, which is an ordinary state for a company you have only just entered."
            >
              <BrandPicker
                selected={form.brandIds}
                brands={brands}
                isLoading={brandsLoading}
                onChange={(brandIds) => set("brandIds", brandIds)}
              />
            </FieldSection>

            <ContactsEditor
              contacts={form.contacts}
              onSetContact={setContact}
              onRemove={(index) =>
                setForm((current) => ({
                  ...current,
                  contacts: current.contacts.filter((_, i) => i !== index),
                }))
              }
              onAdd={() =>
                setForm((current) => ({
                  ...current,
                  contacts: [...current.contacts, emptyContact()],
                }))
              }
            />

            <FieldSection title="Notes">
              <Field label="Notes" error={fieldErrors.notes}>
                {(field) => (
                  <Textarea
                    {...field}
                    maxLength={5000}
                    value={form.notes}
                    onChange={(event) => set("notes", event.target.value)}
                    placeholder="Rates, how they invoice, what they are good at, anything the next person reading this record needs to know."
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
                "Add vendor"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The contact list — one card per person, and a save replaces the whole set.
 *
 * **The primary control is a checkbox and not a radio, and that is a correction.** The Operations
 * Hub's form used a native radio group named `primary-contact`, which cannot express *zero*: once
 * a radio in a group is checked there is no interaction that unchecks it. `VendorContactsSchema`
 * says **at most one** primary, not exactly one — and one of the nine seeded vendors carries a
 * person nobody has appointed, which is an ordinary state. A form that could reach that state on
 * the way in but never on the way out would be a one-way door in the middle of a record.
 *
 * So: checkboxes with exclusive behaviour. Ticking one unticks the rest, and unticking the last
 * one leaves the list with no primary, which is a thing the record can hold and the table renders
 * as a count rather than as a name.
 *
 * Each card is keyed on its **index**, which would be a bug almost anywhere else and is right
 * here: a contact is a value object with no id, and `(vendor_id, position)` is its key. There is
 * nothing stable to key on but where it sits.
 *
 * The four inputs carry `aria-label` rather than a `Field` each. A card of four labelled rows is
 * four times taller and the labels repeat down the list; the placeholders carry the same words
 * visually and the `aria-label` carries them to anyone who cannot see a placeholder.
 */
function ContactsEditor({
  contacts,
  onSetContact,
  onRemove,
  onAdd,
}: {
  contacts: ContactDraft[];
  onSetContact: (index: number, patch: Partial<ContactDraft>) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}) {
  return (
    <FieldSection
      title="Contacts"
      description="Who to call there. One can be the first person to try — or nobody, if there is no obvious one. Saving replaces the whole list."
    >
      <div className="flex flex-col gap-3">
        {contacts.map((contact, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-helper text-ink-secondary">
                <Checkbox
                  checked={contact.isPrimary}
                  onChange={(event) => onSetContact(index, { isPrimary: event.target.checked })}
                />
                Primary contact
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => onRemove(index)}
              >
                <Trash2Icon />
                {/* Named by position, because a card being removed may have no name typed into
                    it yet — "Remove contact" three times over is three identical buttons to
                    anyone listening rather than looking. */}
                <span className="sr-only">Remove contact {index + 1}</span>
              </Button>
            </div>
            <FieldGrid>
              <Input
                aria-label={`Contact ${index + 1} name`}
                placeholder="Name"
                maxLength={200}
                value={contact.name}
                onChange={(event) => onSetContact(index, { name: event.target.value })}
              />
              <Input
                aria-label={`Contact ${index + 1} role`}
                placeholder="Role"
                maxLength={120}
                value={contact.role}
                onChange={(event) => onSetContact(index, { role: event.target.value })}
              />
            </FieldGrid>
            <FieldGrid>
              <Input
                aria-label={`Contact ${index + 1} email`}
                type="email"
                placeholder="Email"
                maxLength={320}
                value={contact.email}
                onChange={(event) => onSetContact(index, { email: event.target.value })}
              />
              <Input
                aria-label={`Contact ${index + 1} phone`}
                placeholder="Phone"
                maxLength={50}
                value={contact.phone}
                onChange={(event) => onSetContact(index, { phone: event.target.value })}
              />
            </FieldGrid>
          </div>
        ))}

        {/* The cap is 20, and the button says so only when it bites. A disabled control with no
            explanation is worse than one that has not appeared yet. */}
        {contacts.length >= MAX_CONTACTS ? (
          <p className="text-helper text-ink-tertiary">
            Twenty contacts is the limit for one vendor.
          </p>
        ) : (
          <Button type="button" variant="secondary" size="sm" className="self-start" onClick={onAdd}>
            <PlusIcon data-icon="inline-start" />
            Add contact
          </Button>
        )}
      </div>
    </FieldSection>
  );
}

/** `VendorContactsSchema`'s `.max(20)`, restated so the button can stop before the server does. */
const MAX_CONTACTS = 20;

type ContactDraft = {
  name: string;
  role: string;
  email: string;
  phone: string;
  isPrimary: boolean;
};

type FormState = {
  name: string;
  /**
   * `""` is the empty option — the draft's spelling of NULL, converted by `form.category || null`
   * on submit. Every other optional field here goes through `toNullable`; this one cannot, because
   * that helper returns `string` and would widen the literal union back to free text.
   */
  category: VendorCategory | "";
  status: VendorStatus;
  uen: string;
  website: string;
  brandIds: string[];
  contacts: ContactDraft[];
  notes: string;
};

function emptyContact(): ContactDraft {
  return { name: "", role: "", email: "", phone: "", isPrimary: false };
}

/**
 * `?? ""` throughout: these are controlled inputs, and a `null` value drops the input to
 * uncontrolled with a warning, after which typing works and the state does not update.
 */
function initialState(vendor?: Vendor): FormState {
  return {
    name: vendor?.name ?? "",
    category: vendor?.category ?? "",
    // A new vendor defaults to `active`, matching the server's own default — and unlike a
    // creator's `prospect`. A company somebody enters into this book is one the business is
    // already buying from; there is no shortlist here to be on.
    status: vendor?.status ?? "active",
    uen: vendor?.uen ?? "",
    website: vendor?.website ?? "",
    brandIds: vendor?.brandIds ?? [],
    contacts:
      vendor?.contacts.map((contact) => ({
        name: contact.name,
        role: contact.role ?? "",
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        isPrimary: contact.isPrimary,
      })) ?? [],
    notes: vendor?.notes ?? "",
  };
}
