"use client";

import { FileTextIcon, Loader2Icon, SparklesIcon, UploadIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGrid, FieldSection } from "@/components/ui/field";
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
import { useAttachmentMutations } from "@/features/contracts/hooks";
import { useContactMutations } from "@/features/contacts/hooks";
import { useEntityIndex, useOutletIndex } from "@/features/registry/hooks";
import { useVendorIndex } from "@/features/registry-vendors/hooks";
import { useSubmit } from "@/hooks/use-submit";
import { ApiError } from "@/lib/api/client";
import { hasTenancyRent, type Attachment, type TenancyKind } from "@/lib/api/types";
import { TENANCY_KIND_OPTIONS } from "@/lib/labels";

import { tenancyService, type TenancyRecord } from "../api";
import { useTenancyMutations } from "../hooks";
import {
  buildTenancyPayload,
  initialState,
  numToStr,
  TenancyFields,
  type FormState,
  type SetField,
} from "./tenancy-fields";

type ProposedContact = {
  name: string;
  role: string;
  email: string;
  phone: string;
  accept: boolean;
};

const EMAIL_LIMIT = 320;
const PHONE_LIMIT = 50;

/**
 * The document-first intake, four steps in one sheet (tas.md §4.1). An attachment cannot be
 * repointed at a different parent, so the row exists from step 1: pick the outlet → a `draft` row
 * → upload the lease against it → read the document → fill and save, which flips it to `active`. An
 * abandoned intake leaves a `draft` with a PDF and no terms, which the list hides by default.
 *
 * The read step is an accelerator, not a prerequisite: when extraction is dark it 503s and the
 * form is filled by hand, which is the primary path.
 */
export function TenancyIntakeSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { create: createTenancy, update } = useTenancyMutations();
  const { create: createContact } = useContactMutations();
  const { upload } = useAttachmentMutations();
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();
  const { outlets } = useOutletIndex();
  const { entities } = useEntityIndex();
  const { vendors } = useVendorIndex();
  const landlords = React.useMemo(
    () => vendors.filter((vendor) => vendor.kind === "landlord"),
    [vendors],
  );

  const [outletId, setOutletId] = React.useState("");
  const [kind, setKind] = React.useState<TenancyKind>("lease");
  const [draft, setDraft] = React.useState<TenancyRecord | null>(null);
  const [form, setForm] = React.useState<FormState>(() => initialState());
  const [document, setDocument] = React.useState<Attachment | null>(null);
  const [contacts, setContacts] = React.useState<ProposedContact[]>([]);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isReading, setIsReading] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);

  // Reset everything each open — the sheet's content survives its close.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setOutletId("");
      setKind("lease");
      setDraft(null);
      setForm(initialState());
      setDocument(null);
      setContacts([]);
      reset();
    }
  }

  const set = React.useCallback<SetField>(
    (key, value) => setForm((current) => ({ ...current, [key]: value })),
    [],
  );

  const canSeeRent = draft ? hasTenancyRent(draft) : true;

  async function startDraft() {
    if (!outletId) return;
    const ok = await run(async () => {
      const created = await createTenancy({
        outlet_id: outletId,
        kind,
        status: "draft",
        has_option_to_renew: false,
      });
      setDraft(created);
      setForm(initialState(created));
    });
    if (!ok) return;
  }

  async function uploadDocument(file: File | null) {
    if (!file || !draft) return;
    setIsUploading(true);
    try {
      const attachment = await upload(file, "tenancy_agreement", draft.id, "tenancy_agreement");
      setDocument(attachment);
      toast.success(`${file.name} uploaded against the draft`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the document");
    } finally {
      setIsUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function readDocument() {
    if (!draft || !document) return;
    setIsReading(true);
    try {
      const proposal = await tenancyService.extract(draft.id, document.id);
      prefillFromProposal(proposal, setForm, canSeeRent);
      if (proposal.matches.landlord_id) {
        set("landlord_id", proposal.matches.landlord_id);
      }
      setContacts(
        (proposal.fields.contacts ?? [])
          .filter((contact) => contact.name)
          .map((contact) => ({
            name: contact.name ?? "",
            role: contact.role ?? "",
            email: contact.email ?? "",
            phone: contact.phone ?? "",
            accept: true,
          })),
      );
      toast.success("Read the lease — check the fields, then save");
    } catch (error) {
      if (error instanceof ApiError && error.status === 503) {
        toast.info("Extraction isn't configured on this deployment — fill the details by hand.");
      } else {
        toast.error(error instanceof Error ? error.message : "Could not read the document");
      }
    } finally {
      setIsReading(false);
    }
  }

  // The 0.16.0 trap: a proposed phone over 50 chars (or email over 320) is a 422 whose `detail`
  // is an array, which fills `fieldErrors` and makes `useSubmit` suppress `formError` — Save doing
  // nothing and saying nothing. Check the lengths before the request so it never gets there.
  const overLongContact = contacts.find(
    (contact) =>
      contact.accept &&
      (contact.email.trim().length > EMAIL_LIMIT || contact.phone.trim().length > PHONE_LIMIT),
  );

  async function saveAndActivate() {
    if (!draft) return;
    if (overLongContact) {
      toast.error("A proposed contact's email or phone is too long — trim it or untick it.");
      return;
    }
    const accepted = contacts.filter((contact) => contact.accept && contact.name.trim());
    if (accepted.length > 0 && !form.landlord_id) {
      toast.error("Set the landlord before adding its contacts — they hang off the landlord.");
      return;
    }

    const ok = await run(async () => {
      const payload = buildTenancyPayload({ ...form, status: "active" }, canSeeRent);
      await update(draft.id, payload);
      for (const contact of accepted) {
        await createContact({
          vendor_id: form.landlord_id,
          name: contact.name.trim(),
          role: contact.role.trim() || null,
          email: contact.email.trim() || null,
          phone: contact.phone.trim() || null,
          is_primary: false,
        });
      }
      toast.success("Tenancy filed");
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
          <SheetTitle>Add tenancy</SheetTitle>
          <SheetDescription>
            {draft
              ? "Upload the signed lease, read it, then fill in and file. The draft exists already — you can close and finish it later."
              : "Pick the outlet the lease is for. That creates a draft you attach the document to."}
          </SheetDescription>
        </SheetHeader>

        {!draft ? (
          <>
            <SheetBody className="flex flex-col gap-8">
              {formError ? (
                <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
                  {formError}
                </p>
              ) : null}
              <FieldSection title="Premises">
                <FieldGrid>
                  <Field label="Outlet" required error={fieldErrors.outlet_id}>
                    {(field) => (
                      <Select
                        {...field}
                        required
                        value={outletId}
                        onChange={(event) => setOutletId(event.target.value)}
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
                  <Field label="Kind" required>
                    {(field) => (
                      <Select
                        {...field}
                        value={kind}
                        onChange={(event) => setKind(event.target.value as TenancyKind)}
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
              </FieldSection>
            </SheetBody>
            <SheetFooter>
              <Button variant="secondary" disabled={isPending} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={isPending || !outletId} onClick={startDraft}>
                {isPending ? (
                  <>
                    <Loader2Icon className="animate-spin" data-icon="inline-start" />
                    Starting
                  </>
                ) : (
                  "Start intake"
                )}
              </Button>
            </SheetFooter>
          </>
        ) : (
          <>
            <SheetBody className="flex flex-col gap-8">
              {formError ? (
                <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
                  {formError}
                </p>
              ) : null}

              <FieldSection
                title="Document"
                description="Upload the signed lease, then read it to prefill the fields below. Reading is optional — fill by hand if you prefer or if extraction is off."
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isUploading}
                    onClick={() => fileInput.current?.click()}
                  >
                    {isUploading ? (
                      <Loader2Icon className="animate-spin" data-icon="inline-start" />
                    ) : (
                      <UploadIcon data-icon="inline-start" />
                    )}
                    {document ? "Replace document" : "Upload lease"}
                  </Button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="application/pdf"
                    className="sr-only"
                    aria-label="Upload the signed lease"
                    onChange={(event) => void uploadDocument(event.target.files?.[0] ?? null)}
                  />
                  {document ? (
                    <>
                      <span className="flex items-center gap-1.5 text-helper text-ink-secondary">
                        <FileTextIcon aria-hidden className="size-4 text-ink-tertiary" />
                        {document.filename}
                      </span>
                      <Button size="sm" disabled={isReading} onClick={readDocument}>
                        {isReading ? (
                          <Loader2Icon className="animate-spin" data-icon="inline-start" />
                        ) : (
                          <SparklesIcon data-icon="inline-start" />
                        )}
                        Read the lease
                      </Button>
                    </>
                  ) : null}
                </div>
              </FieldSection>

              <TenancyFields
                form={form}
                set={set}
                fieldErrors={fieldErrors}
                canSeeRent={canSeeRent}
                isEdit
                outlets={outlets}
                entities={entities}
                landlords={landlords}
              />

              {contacts.length > 0 ? (
                <FieldSection
                  title="Landlord contacts"
                  description="From the lease's notices clause. Ticked rows are added to the landlord — nothing is created without a tick."
                >
                  <ul className="flex flex-col gap-2">
                    {contacts.map((contact, index) => {
                      const tooLong =
                        contact.email.trim().length > EMAIL_LIMIT ||
                        contact.phone.trim().length > PHONE_LIMIT;
                      return (
                        <li
                          key={index}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="font-medium text-ink">
                              {contact.name}
                              {contact.role ? (
                                <span className="text-ink-tertiary"> — {contact.role}</span>
                              ) : null}
                            </span>
                            <span className="text-helper text-ink-tertiary">
                              {[contact.email, contact.phone].filter(Boolean).join(" · ") ||
                                "no method given"}
                            </span>
                            {tooLong ? (
                              <span className="text-helper text-error">
                                Email or phone is too long to save — untick this row.
                              </span>
                            ) : null}
                          </span>
                          <label className="flex items-center gap-1.5 text-helper text-ink-secondary">
                            <Checkbox
                              checked={contact.accept}
                              disabled={isPending}
                              onChange={(event) =>
                                setContacts((current) =>
                                  current.map((c, i) =>
                                    i === index ? { ...c, accept: event.target.checked } : c,
                                  ),
                                )
                              }
                            />
                            Add
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </FieldSection>
              ) : null}
            </SheetBody>

            <SheetFooter>
              <Button variant="secondary" disabled={isPending} onClick={() => onOpenChange(false)}>
                Finish later
              </Button>
              <Button disabled={isPending} onClick={saveAndActivate}>
                {isPending ? (
                  <>
                    <Loader2Icon className="animate-spin" data-icon="inline-start" />
                    Filing
                  </>
                ) : (
                  "Save & file"
                )}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function prefillFromProposal(
  proposal: Awaited<ReturnType<typeof tenancyService.extract>>,
  setForm: React.Dispatch<React.SetStateAction<FormState>>,
  canSeeRent: boolean,
) {
  const f = proposal.fields;
  setForm((current) => ({
    ...current,
    kind: f.kind ?? current.kind,
    premises_description: f.premises_description ?? current.premises_description,
    floor_area_sqft: f.floor_area_sqft ?? current.floor_area_sqft,
    start_date: f.start_date ?? current.start_date,
    end_date: f.end_date ?? current.end_date,
    handover_date: f.handover_date ?? current.handover_date,
    rent_commencement_date: f.rent_commencement_date ?? current.rent_commencement_date,
    has_option_to_renew: f.has_option_to_renew ?? current.has_option_to_renew,
    option_notice_days: numToStr(f.option_notice_days) || current.option_notice_days,
    option_notice_window_days:
      numToStr(f.option_notice_window_days) || current.option_notice_window_days,
    option_term_months: numToStr(f.option_term_months) || current.option_term_months,
    rent_frequency: f.rent_frequency ?? current.rent_frequency,
    deposit_form: f.deposit_form ?? current.deposit_form,
    permitted_use: f.permitted_use ?? current.permitted_use,
    reinstatement_required:
      f.reinstatement_required == null
        ? current.reinstatement_required
        : f.reinstatement_required
          ? "yes"
          : "no",
    // Rent only when the caller can see it — otherwise leave the (empty, unshown) fields alone.
    base_rent: canSeeRent ? (f.base_rent ?? current.base_rent) : current.base_rent,
    service_charge: canSeeRent ? (f.service_charge ?? current.service_charge) : current.service_charge,
    turnover_rent_percent: canSeeRent
      ? (f.turnover_rent_percent ?? current.turnover_rent_percent)
      : current.turnover_rent_percent,
    security_deposit: canSeeRent
      ? (f.security_deposit ?? current.security_deposit)
      : current.security_deposit,
  }));
}
