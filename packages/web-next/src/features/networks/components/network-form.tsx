"use client";

import { Loader2Icon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldGrid, FieldSection } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { hasSensitiveFields } from "@/lib/api/types";

import { useNetworkMutations } from "../hooks";
import type { NetworkRead } from "../api";
import { OutletField, type OutletBinding } from "./outlet-field";

/**
 * The wifi record for one outlet — create or edit.
 *
 * Two things about passwords here, both following from the backend rather than invented:
 *
 *   - **The fields only render for a caller who can see them.** On the restricted response shape
 *     the password properties do not exist, and `PATCH` with a password field from a caller
 *     without the ops role is a **403, not a silent drop** — deliberately, so somebody who cannot
 *     read a credential also cannot blank one. Rendering an empty box that would 403 on save is
 *     an invitation to that error.
 *   - **They are `type="text"`, not `type="password"`.** This is a record *of* a credential, not
 *     a login: the person filling it in is copying from an installer's sheet and needs to see
 *     what they typed. Concealment belongs where the value is displayed (`PasswordValue`), which
 *     is where shoulder-surfing actually happens.
 *
 * `outlet_id` is absent from the edit form because `OutletNetworkUpdate` has no such field —
 * moving a network record between outlets is a data-entry error being covered up rather than an
 * edit. Delete and recreate.
 *
 * In **create** mode the outlet comes from one of two places, which is what `OutletBinding`
 * encodes: the outlet page passes `outletId` and no selector renders, while the Networks page
 * passes none and the form asks (see `OutletField`). The two props are alternatives rather than
 * a value and its override, so passing both is a type error rather than a question about which
 * one wins.
 */
export function NetworkForm({
  outletId,
  defaultOutletId,
  network,
  open,
  onOpenChange,
}: OutletBinding & {
  network?: NetworkRead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = Boolean(network);
  const { create, update } = useNetworkMutations();
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();

  // On create there is no record yet, so nothing has told us whether this caller may set
  // passwords. The stub admin can; a restricted caller's POST would 403 on those fields, which is
  // the same answer the API gives and the honest place to find out.
  const canSeePasswords = network ? hasSensitiveFields(network) : true;

  // The selector renders only where the page cannot answer for itself: creating, with no outlet
  // handed down. That condition is the honest form of "either a prop or a field" — there is no
  // state in which both a fixed outlet and a chooser exist.
  const asksForOutlet = !outletId && !network;

  const [form, setForm] = React.useState(() => initialState(network, defaultOutletId));

  // Reset the draft per open — the sheet's content survives its close, and the `key`
  // this form used to carry changed mid-close (the parent clears `network` then), which
  // wedges Base UI's dismissal. Render-time adjustment, not an effect: see license-form.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(initialState(network, defaultOutletId));
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const base = {
      provider: toNullable(form.provider),
      account_number: toNullable(form.account_number),
      plan: toNullable(form.plan),
      bandwidth: toNullable(form.bandwidth),
      installation_date: toNullable(form.installation_date),
      contract_id: toNullable(form.contract_id),
      ssid_guest: toNullable(form.ssid_guest),
      ssid_staff: toNullable(form.ssid_staff),
      support_contact: toNullable(form.support_contact),
      notes: toNullable(form.notes),
    };

    // Password keys are omitted entirely rather than sent as null when this caller cannot see
    // them: `null` is a value, and sending it would clear a credential nobody was shown.
    const payload = canSeePasswords
      ? {
          ...base,
          password_guest: toNullable(form.password_guest),
          password_staff: toNullable(form.password_staff),
        }
      : base;

    const ok = await run(async () => {
      if (network) {
        await update(network.id, payload);
        toast.success("Network updated");
      } else {
        // The prop wins when the page settled it; otherwise the selector did, and `required`
        // on the control means it cannot be empty by the time a submit gets this far.
        await create({ ...payload, outlet_id: outletId ?? form.outlet_id });
        toast.success("Network recorded");
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
          <SheetTitle>{isEdit ? "Edit network" : "Record network"}</SheetTitle>
          <SheetDescription>
            The connection, its SSIDs and who to call when it goes down.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="contents">
          <SheetBody className="flex flex-col gap-8">
            {formError ? (
              <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
                {formError}
              </p>
            ) : null}

            {asksForOutlet ? (
              <OutletField
                value={form.outlet_id}
                onChange={(value) => set("outlet_id", value)}
                hint="One record per outlet — choosing an outlet that already has one will be refused."
                error={fieldErrors.outlet_id}
              />
            ) : null}

            <FieldSection title="Connection">
              <FieldGrid>
                <Field label="Provider" error={fieldErrors.provider}>
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={100}
                      value={form.provider}
                      onChange={(event) => set("provider", event.target.value)}
                      placeholder="Singtel"
                    />
                  )}
                </Field>
                <Field label="Account number" error={fieldErrors.account_number}>
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={100}
                      className="font-mono text-helper"
                      value={form.account_number}
                      onChange={(event) => set("account_number", event.target.value)}
                    />
                  )}
                </Field>
              </FieldGrid>

              <FieldGrid>
                <Field label="Plan" error={fieldErrors.plan}>
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={100}
                      value={form.plan}
                      onChange={(event) => set("plan", event.target.value)}
                      placeholder="Business Fibre 1Gbps"
                    />
                  )}
                </Field>
                <Field label="Bandwidth" error={fieldErrors.bandwidth}>
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={50}
                      value={form.bandwidth}
                      onChange={(event) => set("bandwidth", event.target.value)}
                      placeholder="1 Gbps"
                    />
                  )}
                </Field>
              </FieldGrid>

              <FieldGrid>
                <Field label="Installed" error={fieldErrors.installation_date}>
                  {(field) => (
                    <Input
                      {...field}
                      type="date"
                      value={form.installation_date}
                      onChange={(event) => set("installation_date", event.target.value)}
                    />
                  )}
                </Field>
                <Field
                  label="Support contact"
                  hint="The number to call, not an account manager's mobile."
                  error={fieldErrors.support_contact}
                >
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={200}
                      value={form.support_contact}
                      onChange={(event) => set("support_contact", event.target.value)}
                    />
                  )}
                </Field>
              </FieldGrid>

              {/* The ISP contract link is gone — see the note where `IspContractField`
                  used to be. `contract_id` stays on the record and on `FormState`, so a
                  network that already carries one keeps it through a save. */}
            </FieldSection>

            <FieldSection
              title="Networks"
              description={
                canSeePasswords
                  ? "Passwords are stored as typed so they can be read back — that is the point of the record. Access is what protects them."
                  : undefined
              }
            >
              <FieldGrid>
                <Field label="Guest SSID" error={fieldErrors.ssid_guest}>
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={100}
                      value={form.ssid_guest}
                      onChange={(event) => set("ssid_guest", event.target.value)}
                    />
                  )}
                </Field>
                {canSeePasswords ? (
                  <Field label="Guest password" error={fieldErrors.password_guest}>
                    {(field) => (
                      <Input
                        {...field}
                        maxLength={200}
                        className="font-mono text-helper"
                        value={form.password_guest}
                        onChange={(event) => set("password_guest", event.target.value)}
                      />
                    )}
                  </Field>
                ) : null}
              </FieldGrid>

              <FieldGrid>
                <Field label="Staff SSID" error={fieldErrors.ssid_staff}>
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={100}
                      value={form.ssid_staff}
                      onChange={(event) => set("ssid_staff", event.target.value)}
                    />
                  )}
                </Field>
                {canSeePasswords ? (
                  <Field label="Staff password" error={fieldErrors.password_staff}>
                    {(field) => (
                      <Input
                        {...field}
                        maxLength={200}
                        className="font-mono text-helper"
                        value={form.password_staff}
                        onChange={(event) => set("password_staff", event.target.value)}
                      />
                    )}
                  </Field>
                ) : null}
              </FieldGrid>
            </FieldSection>

            <FieldSection title="Notes">
              <Field label="Notes" error={fieldErrors.notes}>
                {(field) => (
                  <Textarea
                    {...field}
                    value={form.notes}
                    onChange={(event) => set("notes", event.target.value)}
                    placeholder="Where the router lives, what the installer left undone."
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
                "Record network"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/*
 * `IspContractField` stood here — a picker narrowed to `category === "internet"`, so a wifi
 * connection could name the contract that pays for it.
 *
 * It is removed rather than re-pointed because there is nothing to re-point it *to*. This
 * product's contracts register holds marketing agreements, and `ContractCategory` has no
 * member an ISP line could honestly be filed under. Narrowing to `tooling` would offer a
 * scheduling subscription as the thing behind the router; narrowing to nothing would leave a
 * select whose only option is "Not linked", which reads as a broken control rather than an
 * absent one.
 *
 * `contract_id` is untouched on the record and in `FormState`, so an existing link survives a
 * save. Restore this field with the picker it deserves if a facilities contracts register
 * ever exists here.
 */

type FormState = {
  /** Create-mode only, and only when the page did not settle it — see `OutletBinding`. */
  outlet_id: string;
  provider: string;
  account_number: string;
  plan: string;
  bandwidth: string;
  installation_date: string;
  contract_id: string;
  ssid_guest: string;
  ssid_staff: string;
  password_guest: string;
  password_staff: string;
  support_contact: string;
  notes: string;
};

function initialState(network?: NetworkRead, defaultOutletId?: string): FormState {
  const sensitive = network && hasSensitiveFields(network) ? network : undefined;

  return {
    // Re-seeded on every open, so a filter changed between two creates is honoured on the second.
    outlet_id: defaultOutletId ?? "",
    provider: network?.provider ?? "",
    account_number: network?.account_number ?? "",
    plan: network?.plan ?? "",
    bandwidth: network?.bandwidth ?? "",
    installation_date: network?.installation_date ?? "",
    contract_id: network?.contract_id ?? "",
    ssid_guest: network?.ssid_guest ?? "",
    ssid_staff: network?.ssid_staff ?? "",
    password_guest: sensitive?.password_guest ?? "",
    password_staff: sensitive?.password_staff ?? "",
    support_contact: network?.support_contact ?? "",
    notes: network?.notes ?? "",
  };
}
