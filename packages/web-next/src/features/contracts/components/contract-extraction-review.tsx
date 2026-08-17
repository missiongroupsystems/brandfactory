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
import { useBrandIndex } from "@/features/registry-brands/hooks";
import { useVendorIndex } from "@/features/vendors/hooks";
import { useSubmit } from "@/hooks/use-submit";
import {
  hasContractValue,
  type Attachment,
  type ContractExtractionResponse,
  type ContractUpdate,
} from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import {
  BILLING_FREQUENCY_LABELS,
  CONTRACT_CATEGORY_LABELS,
  RENEWAL_TYPE_LABELS,
} from "@/lib/labels";

import { contractService, type ContractRecord } from "../api";
import { useContractMutations } from "../hooks";

/**
 * Extracted-vs-current, per field, with accept toggles. The model's answer is a proposal:
 * nothing reaches the database except through the ordinary PATCH (and brands PUT) built from
 * what the reviewer accepted. Lifted out of `documents-card.tsx` when that card became generic,
 * because this half is contract-shaped and the tenancy one is a different sheet.
 */
export function ContractExtractionReview({
  contract,
  attachment,
  open,
  onOpenChange,
}: {
  contract: ContractRecord;
  attachment: Attachment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // SWR with a conditional key rather than an effect: one fetch per attachment, cached across a
  // close-and-reopen (extraction is the expensive call here). All four flags are needed for that
  // to be true — leaving `revalidateIfStale` default buys a second model call on reopen.
  const { data, error, isLoading } = useSWR(
    open && attachment ? ["contract-extract", contract.id, attachment.id] : null,
    () => contractService.extract(contract.id, attachment!.id),
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
            Reading the document — this can take a minute for a long contract.
          </SheetBody>
        ) : (
          <ReviewForm
            key={`${attachment?.id}`}
            contract={contract}
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
  apply: (patch: ContractUpdate) => void;
};

function ReviewForm({
  contract,
  extraction,
  onDone,
}: {
  contract: ContractRecord;
  extraction: ContractExtractionResponse;
  onDone: () => void;
}) {
  const { update, replaceBrands } = useContractMutations();
  const { run, isPending, formError } = useSubmit();
  const { byId: vendorById } = useVendorIndex();
  const { byId: brandById } = useBrandIndex();

  const fields = extraction.fields;
  const rows: ProposalRow[] = [];
  const push = <T,>(
    key: string,
    label: string,
    proposed: T | null | undefined,
    current: string,
    display: (value: T) => string,
    apply: (patch: ContractUpdate, value: T) => void,
  ) => {
    if (proposed == null) return;
    rows.push({
      key,
      label,
      current,
      proposed: display(proposed),
      apply: (patch) => apply(patch, proposed),
    });
  };

  push("title", "Title", fields.title, contract.title, (v) => v, (patch, v) => (patch.title = v));
  push(
    "start_date",
    "Starts",
    fields.start_date,
    formatDate(contract.start_date),
    (v) => formatDate(v),
    (patch, v) => (patch.start_date = v),
  );
  push(
    "end_date",
    "Ends",
    fields.end_date,
    formatDate(contract.end_date),
    (v) => formatDate(v),
    (patch, v) => (patch.end_date = v),
  );
  push(
    "renewal_type",
    "Renewal",
    fields.renewal_type,
    RENEWAL_TYPE_LABELS[contract.renewal_type],
    (v) => RENEWAL_TYPE_LABELS[v],
    (patch, v) => (patch.renewal_type = v),
  );
  push(
    "notice_period_days",
    "Notice period",
    fields.notice_period_days,
    contract.notice_period_days != null ? `${contract.notice_period_days} days` : "—",
    (v) => `${v} days`,
    (patch, v) => (patch.notice_period_days = v),
  );
  if (hasContractValue(contract)) {
    push(
      "value",
      "Value (SGD)",
      fields.value,
      contract.value != null ? `S$${contract.value}` : "—",
      (v) => `S$${v}`,
      (patch, v) => (patch.value = v),
    );
  }
  push(
    "billing_frequency",
    "Billing",
    fields.billing_frequency,
    contract.billing_frequency ? BILLING_FREQUENCY_LABELS[contract.billing_frequency] : "—",
    (v) => BILLING_FREQUENCY_LABELS[v],
    (patch, v) => (patch.billing_frequency = v),
  );
  push(
    "category",
    "Category",
    fields.category,
    CONTRACT_CATEGORY_LABELS[contract.category],
    (v) => CONTRACT_CATEGORY_LABELS[v],
    (patch, v) => (patch.category = v),
  );

  // The brand names lifted off the document, split into the ones the register recognised and
  // the ones it did not. An unmatched name is shown rather than dropped: it is usually a brand
  // nobody has created yet, and a proposal that silently ignored it would look complete.
  const matchedBrandIds = extraction.matches.brands
    .map((match) => match.brand_id)
    .filter((id): id is string => id != null);
  const unmatchedNames = extraction.matches.brands
    .filter((match) => match.brand_id == null)
    .map((match) => match.name);
  const currentBrands = contract.brand_ids
    .map((id) => brandById.get(id)?.name ?? "…")
    .join(", ");
  const proposedBrands = matchedBrandIds
    .map((id) => brandById.get(id)?.name ?? "…")
    .join(", ");
  const brandsChanged =
    matchedBrandIds.length > 0 &&
    [...matchedBrandIds].sort().join() !== [...contract.brand_ids].sort().join();

  const [accepted, setAccepted] = React.useState<Record<string, boolean>>(() => ({
    ...Object.fromEntries(rows.map((row) => [row.key, row.proposed !== row.current])),
    brands: brandsChanged,
  }));

  const vendorMatch = extraction.matches.vendor_id;
  const extractedVendor = [fields.vendor_name, fields.vendor_uen].filter(Boolean).join(" · ");

  async function apply() {
    const patch: ContractUpdate = {};
    for (const row of rows) if (accepted[row.key]) row.apply(patch);

    const ok = await run(async () => {
      if (Object.keys(patch).length > 0) {
        await update(contract.id, patch);
      }
      if (accepted.brands && brandsChanged) {
        await replaceBrands(contract.id, matchedBrandIds);
      }
      toast.success("Extracted terms applied");
    });
    if (ok) onDone();
  }

  const anythingAccepted =
    rows.some((row) => accepted[row.key]) || (accepted.brands && brandsChanged);

  return (
    <>
      <SheetBody className="flex flex-col gap-4">
        {formError ? (
          <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
            {formError}
          </p>
        ) : null}

        {extractedVendor ? (
          <p className="rounded-lg bg-surface-sunken p-3 text-helper text-ink-secondary">
            The document names <span className="font-medium text-ink">{extractedVendor}</span>
            {vendorMatch === contract.vendor_id ? (
              <> — this contract&apos;s vendor.</>
            ) : vendorMatch ? (
              <>
                {" "}
                — which matches{" "}
                <span className="font-medium text-ink">
                  {vendorById.get(vendorMatch)?.name ?? "another vendor"}
                </span>
                , not this contract&apos;s vendor. A renewal with a different vendor is created
                from the predecessor&apos;s Renew action, not by editing.
              </>
            ) : (
              <> — no matching vendor found in the registry.</>
            )}
          </p>
        ) : null}

        {rows.length === 0 && matchedBrandIds.length === 0 ? (
          <p className="text-ink-secondary">
            The model could not read any terms off this document.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
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

            {matchedBrandIds.length > 0 ? (
              <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                <span className="flex min-w-0 flex-col">
                  <span className="text-helper text-ink-tertiary">Brands</span>
                  <span className="text-sm text-ink">
                    {proposedBrands}
                    {brandsChanged ? (
                      <span className="text-ink-tertiary"> (now {currentBrands || "—"})</span>
                    ) : (
                      <span className="text-ink-tertiary"> — unchanged</span>
                    )}
                  </span>
                  {unmatchedNames.length > 0 ? (
                    <span className="text-helper text-warning">
                      Not matched to any brand: {unmatchedNames.join(", ")}
                    </span>
                  ) : null}
                </span>
                <label className="flex items-center gap-1.5 text-helper text-ink-secondary">
                  <Checkbox
                    checked={(accepted.brands ?? false) && brandsChanged}
                    disabled={isPending || !brandsChanged}
                    onChange={(event) =>
                      setAccepted((current) => ({ ...current, brands: event.target.checked }))
                    }
                  />
                  Accept
                </label>
              </li>
            ) : unmatchedNames.length > 0 ? (
              <li className="rounded-lg border border-border p-3 text-helper text-warning">
                The document names brands the register does not hold: {unmatchedNames.join(", ")}
              </li>
            ) : null}
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
