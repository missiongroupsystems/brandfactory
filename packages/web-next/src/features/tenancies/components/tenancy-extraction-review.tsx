"use client";

import { Loader2Icon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { QueryError } from "@/components/layout/query-states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useVendorIndex } from "@/features/registry-vendors/hooks";
import { useSubmit } from "@/hooks/use-submit";
import {
  hasTenancyRent,
  type Attachment,
  type TenancyExtractionResponse,
  type TenancyUpdate,
} from "@/lib/api/types";
import { formatDate, formatMoney } from "@/lib/format";
import {
  BILLING_FREQUENCY_LABELS,
  DEPOSIT_FORM_LABELS,
  TENANCY_KIND_LABELS,
} from "@/lib/labels";

import { tenancyService, type TenancyRecord } from "../api";
import { useTenancyMutations } from "../hooks";

/**
 * Extracted-vs-current for a lease, with accept toggles — the tenancy sibling of
 * `ContractExtractionReview`. The model's answer is a proposal; nothing reaches the database
 * except through the ordinary PATCH built from what the reviewer accepted. Dark until
 * `OPENROUTER_API_KEY` is set, in which case the fetch answers 503 and this sheet says so.
 */
export function TenancyExtractionReview({
  tenancy,
  attachment,
  open,
  onOpenChange,
}: {
  tenancy: TenancyRecord;
  attachment: Attachment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, error, isLoading } = useSWR(
    open && attachment ? ["tenancy-extract", tenancy.id, attachment.id] : null,
    () => tenancyService.extract(tenancy.id, attachment!.id),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      shouldRetryOnError: false,
    },
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="wide">
        <SheetHeader>
          <SheetTitle>Extracted terms</SheetTitle>
          <SheetDescription>
            Read from {attachment?.filename ?? "the document"}. Nothing is saved until you
            apply — accept the fields that look right; the rest stay as they are.
          </SheetDescription>
        </SheetHeader>

        {error ? (
          <SheetBody>
            <QueryError error={error} />
          </SheetBody>
        ) : isLoading || !data ? (
          <SheetBody className="flex items-center gap-2 text-ink-secondary">
            <Loader2Icon aria-hidden className="size-4 animate-spin" />
            Reading the lease — this can take a minute.
          </SheetBody>
        ) : (
          <ReviewForm
            key={`${attachment?.id}`}
            tenancy={tenancy}
            extraction={data}
            onDone={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

type ProposalRow = {
  key: string;
  label: string;
  current: string;
  proposed: string;
  apply: (patch: TenancyUpdate) => void;
};

function ReviewForm({
  tenancy,
  extraction,
  onDone,
}: {
  tenancy: TenancyRecord;
  extraction: TenancyExtractionResponse;
  onDone: () => void;
}) {
  const { update } = useTenancyMutations();
  const { run, isPending, formError } = useSubmit();
  const { byId: vendorById } = useVendorIndex();
  const canSeeRent = hasTenancyRent(tenancy);

  const fields = extraction.fields;
  const rows: ProposalRow[] = [];
  const push = <T,>(
    key: string,
    label: string,
    proposed: T | null | undefined,
    current: string,
    display: (value: T) => string,
    apply: (patch: TenancyUpdate, value: T) => void,
  ) => {
    if (proposed == null) return;
    rows.push({ key, label, current, proposed: display(proposed), apply: (p) => apply(p, proposed) });
  };

  const bool = (v: boolean) => (v ? "Yes" : "No");

  push("kind", "Kind", fields.kind, TENANCY_KIND_LABELS[tenancy.kind], (v) => TENANCY_KIND_LABELS[v], (p, v) => (p.kind = v));
  push("premises_description", "Premises", fields.premises_description, tenancy.premises_description ?? "—", (v) => v, (p, v) => (p.premises_description = v));
  push("floor_area_sqft", "Floor area (sqft)", fields.floor_area_sqft, tenancy.floor_area_sqft ?? "—", (v) => v, (p, v) => (p.floor_area_sqft = v));
  push("start_date", "Starts", fields.start_date, formatDate(tenancy.start_date), (v) => formatDate(v), (p, v) => (p.start_date = v));
  push("end_date", "Ends", fields.end_date, formatDate(tenancy.end_date), (v) => formatDate(v), (p, v) => (p.end_date = v));
  push("handover_date", "Handover", fields.handover_date, formatDate(tenancy.handover_date), (v) => formatDate(v), (p, v) => (p.handover_date = v));
  push("rent_commencement_date", "Rent commences", fields.rent_commencement_date, formatDate(tenancy.rent_commencement_date), (v) => formatDate(v), (p, v) => (p.rent_commencement_date = v));
  push("has_option_to_renew", "Option to renew", fields.has_option_to_renew, bool(tenancy.has_option_to_renew), bool, (p, v) => (p.has_option_to_renew = v));
  push("option_notice_days", "Notice period (days)", fields.option_notice_days, tenancy.option_notice_days != null ? `${tenancy.option_notice_days}` : "—", (v) => `${v}`, (p, v) => (p.option_notice_days = v));
  push("option_notice_window_days", "Window (days)", fields.option_notice_window_days, tenancy.option_notice_window_days != null ? `${tenancy.option_notice_window_days}` : "—", (v) => `${v}`, (p, v) => (p.option_notice_window_days = v));
  push("option_term_months", "Further term (months)", fields.option_term_months, tenancy.option_term_months != null ? `${tenancy.option_term_months}` : "—", (v) => `${v}`, (p, v) => (p.option_term_months = v));
  if (canSeeRent) {
    push("base_rent", "Base rent", fields.base_rent, tenancy.base_rent != null ? formatMoney(tenancy.base_rent) : "—", (v) => formatMoney(v), (p, v) => (p.base_rent = v));
    push("rent_frequency", "Frequency", fields.rent_frequency, tenancy.rent_frequency ? BILLING_FREQUENCY_LABELS[tenancy.rent_frequency] : "—", (v) => BILLING_FREQUENCY_LABELS[v], (p, v) => (p.rent_frequency = v));
    push("service_charge", "Service charge", fields.service_charge, tenancy.service_charge != null ? formatMoney(tenancy.service_charge) : "—", (v) => formatMoney(v), (p, v) => (p.service_charge = v));
    push("turnover_rent_percent", "Turnover rent (%)", fields.turnover_rent_percent, tenancy.turnover_rent_percent != null ? `${tenancy.turnover_rent_percent}%` : "—", (v) => `${v}%`, (p, v) => (p.turnover_rent_percent = v));
    push("security_deposit", "Security deposit", fields.security_deposit, tenancy.security_deposit != null ? formatMoney(tenancy.security_deposit) : "—", (v) => formatMoney(v), (p, v) => (p.security_deposit = v));
  }
  push("deposit_form", "Deposit held as", fields.deposit_form, tenancy.deposit_form ? DEPOSIT_FORM_LABELS[tenancy.deposit_form] : "—", (v) => DEPOSIT_FORM_LABELS[v], (p, v) => (p.deposit_form = v));
  push("permitted_use", "Permitted use", fields.permitted_use, tenancy.permitted_use ?? "—", (v) => v, (p, v) => (p.permitted_use = v));
  push("reinstatement_required", "Reinstatement", fields.reinstatement_required, tenancy.reinstatement_required == null ? "Not read yet" : bool(tenancy.reinstatement_required), (v) => (v ? "Required" : "Not required"), (p, v) => (p.reinstatement_required = v));

  const landlordMatch = extraction.matches.landlord_id;
  const landlordChanges = landlordMatch != null && landlordMatch !== tenancy.landlord_id;
  const extractedLandlord = [fields.landlord_name, fields.landlord_uen].filter(Boolean).join(" · ");

  const [accepted, setAccepted] = React.useState<Record<string, boolean>>(() => ({
    ...Object.fromEntries(rows.map((row) => [row.key, row.proposed !== row.current])),
    landlord: landlordChanges,
  }));

  async function apply() {
    const patch: TenancyUpdate = {};
    for (const row of rows) if (accepted[row.key]) row.apply(patch);
    if (accepted.landlord && landlordChanges) patch.landlord_id = landlordMatch;

    const ok = await run(async () => {
      if (Object.keys(patch).length > 0) await update(tenancy.id, patch);
      toast.success("Extracted terms applied");
    });
    if (ok) onDone();
  }

  const anythingAccepted =
    rows.some((row) => accepted[row.key]) || (accepted.landlord && landlordChanges);

  return (
    <>
      <SheetBody className="flex flex-col gap-4">
        {formError ? (
          <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
            {formError}
          </p>
        ) : null}

        {extractedLandlord ? (
          <p className="rounded-lg bg-surface-sunken p-3 text-helper text-ink-secondary">
            The lease names <span className="font-medium text-ink">{extractedLandlord}</span>
            {landlordMatch === tenancy.landlord_id && landlordMatch ? (
              <> — this tenancy&apos;s landlord.</>
            ) : landlordMatch ? (
              <>
                {" "}
                — which matches the landlord{" "}
                <span className="font-medium text-ink">
                  {vendorById.get(landlordMatch)?.name ?? "on file"}
                </span>
                . Accept below to set it.
              </>
            ) : (
              <> — no matching landlord found. Add it from the tenancy, then re-read.</>
            )}
          </p>
        ) : null}

        {rows.length === 0 && !landlordChanges ? (
          <p className="text-ink-secondary">The model could not read any terms off this lease.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {landlordChanges ? (
              <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                <span className="flex min-w-0 flex-col">
                  <span className="text-helper text-ink-tertiary">Landlord</span>
                  <span className="text-sm text-ink">
                    {vendorById.get(landlordMatch!)?.name ?? "matched landlord"}
                  </span>
                </span>
                <label className="flex items-center gap-1.5 text-helper text-ink-secondary">
                  <Checkbox
                    checked={accepted.landlord ?? false}
                    disabled={isPending}
                    onChange={(event) =>
                      setAccepted((current) => ({ ...current, landlord: event.target.checked }))
                    }
                  />
                  Accept
                </label>
              </li>
            ) : null}
            {rows.map((row) => (
              <li
                key={row.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-helper text-ink-tertiary">{row.label}</span>
                  <span className="text-sm text-ink">
                    {row.proposed}
                    {row.proposed !== row.current ? (
                      <span className="text-ink-tertiary"> (now {row.current})</span>
                    ) : (
                      <span className="text-ink-tertiary"> — unchanged</span>
                    )}
                  </span>
                </span>
                <label className="flex items-center gap-1.5 text-helper text-ink-secondary">
                  <Checkbox
                    checked={accepted[row.key] ?? false}
                    disabled={isPending}
                    onChange={(event) =>
                      setAccepted((current) => ({ ...current, [row.key]: event.target.checked }))
                    }
                  />
                  Accept
                </label>
              </li>
            ))}
          </ul>
        )}
      </SheetBody>

      <SheetFooter>
        <Button type="button" variant="secondary" disabled={isPending} onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" disabled={isPending || !anythingAccepted} onClick={apply}>
          {isPending ? (
            <>
              <Loader2Icon className="animate-spin" data-icon="inline-start" />
              Applying
            </>
          ) : (
            "Apply accepted fields"
          )}
        </Button>
      </SheetFooter>
    </>
  );
}
