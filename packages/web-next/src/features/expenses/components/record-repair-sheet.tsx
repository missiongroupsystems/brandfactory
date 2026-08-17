"use client";

import { Loader2Icon, PaperclipIcon, XIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldGrid } from "@/components/ui/field";
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
import { useContractIndex } from "@/features/contracts/hooks";
import { useOutletIndex } from "@/features/registry/hooks";
import { useVendorIndex } from "@/features/vendors/hooks";
import { useSubmit } from "@/hooks/use-submit";
import { REPAIR_CATEGORY_OPTIONS } from "@/lib/labels";

import { useRecordRepair } from "../hooks";

const today = () => new Date().toISOString().slice(0, 10);

/** What the sheet is opened knowing — the outlet card supplies its own outlet, the toolbar action
 * supplies nothing. */
export type RecordRepairPrefill = { outletId?: string };

const emptyForm = () => ({
  outlet_id: "",
  contract_id: "",
  vendor_id: "",
  category: "",
  amount: "",
  currency: "SGD",
  incurred_on: today(),
});

/**
 * **Record repair** — the door onto the `expense` log, for `purpose = repair`.
 *
 * Reuses the file-report sheet's *shape* — one form, an optional photo, a stacked footer whose
 * submit label names the outcome — but shares no cadence, findings or follow-up: a repair is a
 * fact about an outlet, not a scheduled attendance. The draft resets **during render** when `open`
 * flips true (never a `key` on `SheetContent`, the trap `AGENTS.md` names), and the sheet does
 * not close on the 201: the photo is a second round trip, and closing between them would toast a
 * document that never arrived.
 *
 * **Coverage is not required.** The contract is optional and may be a one-off comprehensive-works
 * contract that does not list this outlet — the backend accepts exactly that, so this offers every
 * contract rather than only the outlet's coverage.
 */
export function RecordRepairSheet({
  open,
  onOpenChange,
  prefill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: RecordRepairPrefill;
}) {
  const { recordRepair, reset: resetCreated } = useRecordRepair();
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();
  const { outlets } = useOutletIndex();
  const { contracts } = useContractIndex();
  const { vendors } = useVendorIndex();

  const [file, setFile] = React.useState<File | null>(null);
  const [form, setForm] = React.useState(emptyForm);
  const fileInput = React.useRef<HTMLInputElement>(null);

  // Reset per open, during render — the documented adjust-state-on-prop-change pattern.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFile(null);
      setForm({ ...emptyForm(), outlet_id: prefill?.outletId ?? "" });
      resetCreated(); // drop any half-filed row from a previous open so this is a fresh repair
    }
  }

  const set = <K extends keyof ReturnType<typeof emptyForm>>(
    key: K,
    value: ReturnType<typeof emptyForm>[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const outletOptions = React.useMemo(
    () => outlets.map((outlet) => ({ value: outlet.id, label: outlet.name })),
    [outlets],
  );
  const contractOptions = React.useMemo(
    () => contracts.map((contract) => ({ value: contract.id, label: contract.title })),
    [contracts],
  );
  const vendorOptions = React.useMemo(
    () => vendors.map((vendor) => ({ value: vendor.id, label: vendor.name })),
    [vendors],
  );

  const ready = Boolean(form.outlet_id && form.amount && form.incurred_on);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;

    const ok = await run(async () => {
      await recordRepair(
        {
          outlet_id: form.outlet_id,
          contract_id: form.contract_id || undefined,
          vendor_id: form.vendor_id || undefined,
          // `RepairCategory | undefined` — the select's "" empty option means "not classified".
          category: (form.category || undefined) as never,
          amount: form.amount,
          incurred_on: form.incurred_on,
          currency: form.currency || "SGD",
        },
        file,
      );
      const where = outlets.find((outlet) => outlet.id === form.outlet_id)?.name;
      toast.success(`Repair recorded${where ? ` for ${where}` : ""}.`);
    });

    if (ok) onOpenChange(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      {/* No `key` on the content — see the docstring. */}
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Record repair</SheetTitle>
          <SheetDescription>
            A repair against an outlet — its cost, and a photo of the invoice or receipt.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="contents">
          <SheetBody className="flex flex-col gap-5">
            {formError ? (
              <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
                {formError}
              </p>
            ) : null}

            <Field label="Outlet" required error={fieldErrors.outlet_id}>
              {(field) => (
                <Select
                  {...field}
                  required
                  value={form.outlet_id}
                  onChange={(event) => set("outlet_id", event.target.value)}
                >
                  <option value="">Which outlet?</option>
                  {outletOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field
              label="Category"
              hint="The trade that did the work."
              error={fieldErrors.category}
            >
              {(field) => (
                <Select
                  {...field}
                  value={form.category}
                  onChange={(event) => set("category", event.target.value)}
                >
                  <option value="">Unclassified</option>
                  {REPAIR_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <FieldGrid>
              {/* `inputMode="decimal"` brings up the number pad on a phone, where most of these
                  are filed. The currency sits beside it because a bare number is ambiguous the
                  moment one repair is billed in USD (the Lark import found some). */}
              <Field label="Amount" required error={fieldErrors.amount}>
                {(field) => (
                  <Input
                    {...field}
                    required
                    inputMode="decimal"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(event) => set("amount", event.target.value)}
                  />
                )}
              </Field>
              <Field label="Currency" hint="3-letter code, e.g. SGD, USD" error={fieldErrors.currency}>
                {(field) => (
                  <Input
                    {...field}
                    value={form.currency}
                    maxLength={3}
                    className="uppercase"
                    onChange={(event) => set("currency", event.target.value.toUpperCase())}
                  />
                )}
              </Field>
            </FieldGrid>

            <Field
              label="Date incurred"
              required
              hint="The invoice date, or the receipt date if that is all you have."
              error={fieldErrors.incurred_on}
            >
              {(field) => (
                <Input
                  {...field}
                  type="date"
                  required
                  value={form.incurred_on}
                  onChange={(event) => set("incurred_on", event.target.value)}
                />
              )}
            </Field>

            <Field
              label="Contract"
              hint="Optional — the one-off contract this repair completes, if any."
              error={fieldErrors.contract_id}
            >
              {(field) => (
                <Select
                  {...field}
                  value={form.contract_id}
                  onChange={(event) => set("contract_id", event.target.value)}
                >
                  <option value="">No contract</option>
                  {contractOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field
              label="Vendor"
              hint="Optional — a one-off tradesman needs no vendor record."
              error={fieldErrors.vendor_id}
            >
              {(field) => (
                <Select
                  {...field}
                  value={form.vendor_id}
                  onChange={(event) => set("vendor_id", event.target.value)}
                >
                  <option value="">No vendor</option>
                  {vendorOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <FilePicker file={file} inputRef={fileInput} onPick={setFile} disabled={isPending} />
          </SheetBody>

          <SheetFooter className="flex-col items-stretch gap-2 sm:flex-col sm:items-stretch">
            {!file ? (
              <p className="text-helper text-ink-tertiary">
                Ops will be asked to chase the invoice.
              </p>
            ) : null}
            {/* Stacked below `sm`, so the longer *without document* label cannot overflow at
                390px — the exact regression `AGENTS.md` names this sheet's sibling for. */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                disabled={isPending}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={file ? "default" : "secondary"}
                disabled={isPending || !ready}
              >
                {isPending ? (
                  <>
                    <Loader2Icon className="animate-spin" data-icon="inline-start" />
                    Recording
                  </>
                ) : file ? (
                  "Record repair"
                ) : (
                  "Record repair without document"
                )}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The file, and the camera. `capture="environment"` asks a phone for the rear camera rather than
 * the gallery — half these artifacts are a paper invoice photographed on site. Desktop browsers
 * ignore the attribute, so it costs nothing there. Copied in shape from the file-report sheet's
 * own picker, which is local to that file.
 */
function FilePicker({
  file,
  inputRef,
  onPick,
  disabled,
}: {
  file: File | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (file: File | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-helper font-medium text-ink-secondary">Invoice or receipt</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="sr-only"
        onChange={(event) => onPick(event.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2">
          <PaperclipIcon aria-hidden className="size-4 shrink-0 text-ink-tertiary" />
          <span className="min-w-0 flex-1 truncate text-helper text-ink">{file.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={disabled}
            onClick={() => {
              onPick(null);
              // The input keeps its value after a clear, so re-picking the same file would fire
              // no change event and the row would stay empty.
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            <XIcon />
            <span className="sr-only">Remove {file.name}</span>
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="w-fit"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <PaperclipIcon data-icon="inline-start" />
          Photograph or attach
        </Button>
      )}
    </div>
  );
}
