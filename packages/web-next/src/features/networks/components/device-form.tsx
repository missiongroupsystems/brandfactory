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
import { toNullable, useSubmit } from "@/hooks/use-submit";
import type { DeviceType, NetworkDevice } from "@/lib/api/types";
import { DEVICE_TYPE_OPTIONS } from "@/lib/labels";

import { useDeviceMutations } from "../hooks";
import { OutletField, type OutletBinding } from "./outlet-field";

/**
 * A piece of network hardware at an outlet.
 *
 * `warranty_expiry` is the field to notice: spec §4.5 feeds it into the same obligation engine as
 * licence expiries and contract notice windows, so it is not a trivia field — it is the reason a
 * router gets replaced before it dies rather than after. The hint says so, because a form that
 * asks for a date without saying what it drives gets left blank.
 *
 * Where the outlet comes from is `OutletBinding`'s business, shared with `NetworkForm`: fixed by
 * the outlet page, or asked for on the Networks page. Unlike a network, an outlet holds as many
 * devices as it has hardware, so there is no uniqueness rule here and nothing for the selector to
 * warn about.
 */
export function DeviceForm({
  outletId,
  defaultOutletId,
  device,
  open,
  onOpenChange,
}: OutletBinding & {
  device?: NetworkDevice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = Boolean(device);
  const { create, update } = useDeviceMutations();
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();

  // Creating, with no outlet handed down — the one state in which the form has to ask.
  const asksForOutlet = !outletId && !device;

  const [form, setForm] = React.useState(() => initialState(device, defaultOutletId));

  // Reset the draft per open — the sheet's content survives its close, and the `key`
  // this form used to carry changed mid-close (the parent clears `device` then), which
  // wedges Base UI's dismissal. Render-time adjustment, not an effect: see license-form.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(initialState(device, defaultOutletId));
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const payload = {
      device_type: form.device_type,
      make: toNullable(form.make),
      model: toNullable(form.model),
      serial_number: toNullable(form.serial_number),
      management_ip: toNullable(form.management_ip),
      physical_location: toNullable(form.physical_location),
      purchase_date: toNullable(form.purchase_date),
      warranty_expiry: toNullable(form.warranty_expiry),
    };

    const ok = await run(async () => {
      if (device) {
        await update(device.id, payload);
        toast.success("Device updated");
      } else {
        // The prop wins when the page settled it; otherwise the selector did, and `required`
        // on the control means it cannot be empty by the time a submit gets this far.
        await create({ ...payload, outlet_id: outletId ?? form.outlet_id });
        toast.success("Device added");
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
          <SheetTitle>{isEdit ? "Edit device" : "Add device"}</SheetTitle>
          <SheetDescription>
            Hardware on site — what it is, where it is, and when its warranty runs out.
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
                error={fieldErrors.outlet_id}
              />
            ) : null}

            <FieldSection title="Hardware">
              <FieldGrid>
                <Field label="Type" required error={fieldErrors.device_type}>
                  {(field) => (
                    <Select
                      {...field}
                      value={form.device_type}
                      onChange={(event) =>
                        set("device_type", event.target.value as DeviceType)
                      }
                    >
                      {DEVICE_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Make" error={fieldErrors.make}>
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={100}
                      value={form.make}
                      onChange={(event) => set("make", event.target.value)}
                      placeholder="Ubiquiti"
                    />
                  )}
                </Field>
              </FieldGrid>

              <FieldGrid>
                <Field label="Model" error={fieldErrors.model}>
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={100}
                      value={form.model}
                      onChange={(event) => set("model", event.target.value)}
                      placeholder="UniFi U6 Pro"
                    />
                  )}
                </Field>
                <Field label="Serial number" error={fieldErrors.serial_number}>
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={100}
                      className="font-mono text-helper"
                      value={form.serial_number}
                      onChange={(event) => set("serial_number", event.target.value)}
                    />
                  )}
                </Field>
              </FieldGrid>
            </FieldSection>

            <FieldSection title="Location">
              <FieldGrid>
                <Field
                  label="Management IP"
                  error={fieldErrors.management_ip}
                >
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={100}
                      className="font-mono text-helper"
                      value={form.management_ip}
                      onChange={(event) => set("management_ip", event.target.value)}
                      placeholder="192.168.1.1"
                    />
                  )}
                </Field>
                <Field
                  label="Physical location"
                  hint="Where someone will find it at 7pm on a Friday."
                  error={fieldErrors.physical_location}
                >
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={200}
                      value={form.physical_location}
                      onChange={(event) => set("physical_location", event.target.value)}
                      placeholder="Back office rack"
                    />
                  )}
                </Field>
              </FieldGrid>
            </FieldSection>

            <FieldSection title="Dates">
              <FieldGrid>
                <Field label="Purchased" error={fieldErrors.purchase_date}>
                  {(field) => (
                    <Input
                      {...field}
                      type="date"
                      value={form.purchase_date}
                      onChange={(event) => set("purchase_date", event.target.value)}
                    />
                  )}
                </Field>
                <Field
                  label="Warranty expires"
                  hint="Feeds the same obligation engine as licence expiries (spec §4.5)."
                  error={fieldErrors.warranty_expiry}
                >
                  {(field) => (
                    <Input
                      {...field}
                      type="date"
                      value={form.warranty_expiry}
                      onChange={(event) => set("warranty_expiry", event.target.value)}
                    />
                  )}
                </Field>
              </FieldGrid>
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
                "Add device"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

type FormState = {
  /** Create-mode only, and only when the page did not settle it — see `OutletBinding`. */
  outlet_id: string;
  device_type: DeviceType;
  make: string;
  model: string;
  serial_number: string;
  management_ip: string;
  physical_location: string;
  purchase_date: string;
  warranty_expiry: string;
};

function initialState(device?: NetworkDevice, defaultOutletId?: string): FormState {
  return {
    // Re-seeded on every open, so a filter changed between two creates is honoured on the second.
    outlet_id: defaultOutletId ?? "",
    device_type: device?.device_type ?? "router",
    make: device?.make ?? "",
    model: device?.model ?? "",
    serial_number: device?.serial_number ?? "",
    management_ip: device?.management_ip ?? "",
    physical_location: device?.physical_location ?? "",
    purchase_date: device?.purchase_date ?? "",
    warranty_expiry: device?.warranty_expiry ?? "",
  };
}
