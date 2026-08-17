"use client";

import Link from "next/link";
import {
  ArrowLeftIcon,
  HistoryIcon,
  Loader2Icon,
  PencilIcon,
  RefreshCwIcon,
  TagIcon,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { DetailItem, DetailList } from "@/components/layout/detail-list";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows, QueryError } from "@/components/layout/query-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useBrandIndex } from "@/features/registry-brands/hooks";
import { useVendorIndex } from "@/features/vendors/hooks";
import { useSubmit } from "@/hooks/use-submit";
import { hasContractValue } from "@/lib/api/types";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  BILLING_FREQUENCY_LABELS,
  CONTRACT_CATEGORY_LABELS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_TONES,
  RENEWAL_TYPE_LABELS,
  RENEWAL_TYPE_TONES,
} from "@/lib/labels";

import { useContract, useContractMutations } from "../hooks";
import { ContractForm } from "./contract-form";
import { ContractExtractionReview } from "./contract-extraction-review";
import { DecisionActions, needsDecision } from "./contract-lifecycle";
import { DocumentsCard } from "./documents-card";

/**
 * One contract: the record, the brands it is held for, its documents and its lifecycle.
 *
 * **Three cards shorter than it was.** Coverage, Service schedule and Visits all hung off a
 * `(contract, outlet)` pair, and a marketing agreement does not name an outlet — so the page
 * that answered "did the vendor turn up at Marina" no longer has a question to answer. What
 * replaced Coverage is `BrandsCard`, which is the same editor one dimension over.
 */
export function ContractDetail({ contractId }: { contractId: string }) {
  const { data: contract, error, isLoading } = useContract(contractId);
  const { byId: vendorById } = useVendorIndex();
  const [editOpen, setEditOpen] = React.useState(false);

  if (error) {
    return (
      <>
        <BackLink />
        <QueryError error={error} />
      </>
    );
  }
  if (isLoading || !contract) {
    return (
      <>
        <BackLink />
        <LoadingRows rows={4} />
      </>
    );
  }

  const vendor = vendorById.get(contract.vendor_id);

  return (
    <>
      <BackLink />

      <PageHeader
        title={contract.title}
        actions={
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            <PencilIcon data-icon="inline-start" />
            Edit
          </Button>
        }
      />

      <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={CONTRACT_STATUS_TONES[contract.status]}>
            {CONTRACT_STATUS_LABELS[contract.status]}
          </Badge>
          <Badge variant="outline">{CONTRACT_CATEGORY_LABELS[contract.category]}</Badge>
          <Badge variant={RENEWAL_TYPE_TONES[contract.renewal_type]}>
            {RENEWAL_TYPE_LABELS[contract.renewal_type]}
          </Badge>
        </div>

        {contract.status === "draft" && contract.renewed_from_id ? (
          <RenewalDraftBanner predecessorId={contract.renewed_from_id} />
        ) : null}

        {needsDecision(contract) ? <LifecycleCard contract={contract} /> : null}

        <Card>
          <CardHeader>
            <CardTitle>Record</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList>
              <DetailItem label="Vendor">
                {vendor ? (
                  <Link
                    href={`/vendors?q=${encodeURIComponent(vendor.name)}`}
                    className="text-ink hover:text-brand hover:underline"
                  >
                    {vendor.name}
                  </Link>
                ) : null}
              </DetailItem>
              <DetailItem label="Term">
                {contract.start_date || contract.end_date
                  ? `${formatDate(contract.start_date)} — ${formatDate(contract.end_date)}`
                  : null}
              </DetailItem>
              <DetailItem label="Renewal">
                {RENEWAL_TYPE_LABELS[contract.renewal_type]}
                {contract.renewal_type === "auto"
                  ? contract.notice_period_days != null
                    ? ` — ${contract.notice_period_days}-day notice to exit`
                    : " — no notice period recorded, so no deadline can be generated"
                  : ""}
              </DetailItem>
              <DetailItem label="Value">
                {hasContractValue(contract) ? (
                  contract.value != null ? (
                    <span data-numeric>S${contract.value}</span>
                  ) : null
                ) : contract.has_value ? (
                  // The restricted shape: a figure exists, this caller cannot see it.
                  <span className="text-ink-secondary">On file — restricted</span>
                ) : null}
              </DetailItem>
              <DetailItem label="Billing">
                {contract.billing_frequency
                  ? BILLING_FREQUENCY_LABELS[contract.billing_frequency]
                  : null}
              </DetailItem>
              {contract.scope_description ? (
                <DetailItem label="Scope" span>
                  {contract.scope_description}
                </DetailItem>
              ) : null}
              {contract.notes ? (
                <DetailItem label="Notes" span>
                  {contract.notes}
                </DetailItem>
              ) : null}
              {contract.closed_at ? (
                <DetailItem label="Closed off" span>
                  {formatDateTime(contract.closed_at)}
                  {contract.closed_reason ? ` — ${contract.closed_reason}` : ""}
                </DetailItem>
              ) : null}
            </DetailList>
          </CardContent>
        </Card>

        {contract.renewed_from_id || contract.renewed_by_id ? (
          <VersionHistoryCard contract={contract} />
        ) : null}

        <DocumentsCard
          subjectType="contract"
          subjectId={contract.id}
          defaultDocType="contract"
          extraction={{
            // The button follows `hasContractValue` — the response includes the value, so the
            // gate mirrors the backend's rather than discovering it as a 403.
            docType: "contract",
            enabled: hasContractValue(contract),
            renderReview: ({ attachment, open, onOpenChange }) => (
              <ContractExtractionReview
                contract={contract}
                attachment={attachment}
                open={open}
                onOpenChange={onOpenChange}
              />
            ),
          }}
        />

        <BrandsCard contractId={contract.id} brandIds={contract.brand_ids} />
      </div>

      <ContractForm contract={contract} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}

function BackLink() {
  return (
    <div className="px-6 pt-6 md:px-8 md:pt-8">
      <Link
        href="/contracts"
        className="-mx-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-helper text-ink-secondary hover:text-brand"
      >
        <ArrowLeftIcon aria-hidden className="size-3.5" />
        All contracts
      </Link>
    </div>
  );
}

/** A draft created by Renew announces what it is and what to do next. The extraction
 * flow (drop the signed PDF, apply the proposed terms) lands on the documents card. */
function RenewalDraftBanner({ predecessorId }: { predecessorId: string }) {
  const { data: predecessor } = useContract(predecessorId);

  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-info-tint p-3 text-sm text-ink">
      <RefreshCwIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-tertiary" />
      <p>
        Draft renewal of{" "}
        {predecessor ? (
          <Link
            href={`/contracts/${predecessorId}`}
            className="font-medium text-ink hover:text-brand hover:underline"
          >
            {predecessor.title}
          </Link>
        ) : (
          "its predecessor"
        )}
        {" — "}drop the signed contract into Documents below and use &ldquo;Extract
        details&rdquo; to propose the new terms, or fill them in by hand; then set the
        status to active.
      </p>
    </div>
  );
}

/**
 * The card that exists for exactly one state: expired with no decision recorded.
 *
 * The two controls are `DecisionActions` in its full-size form — the same component the
 * contracts table now puts on the row, so the page and the list can never offer different ways
 * out of the same state. What stays here is the *prose*: a card has room to say what the
 * decision costs and a table cell does not, which is the whole difference between the two
 * surfaces. Renew is this view's one accent button (the page header's Edit is secondary);
 * Close off confirms first, because it records a decision someone will rely on later.
 */
function LifecycleCard({ contract }: { contract: { id: string; end_date?: string | null } }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Needs a decision</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-ink-secondary">
          This contract expired {formatDate(contract.end_date)} and has no decision
          recorded. Renew it — with the same vendor or a different one — or close it off
          if it is not being replaced. Until then it sits on the dashboard as an overdue
          decision.
        </p>

        <DecisionActions contract={contract} />
      </CardContent>
    </Card>
  );
}

/** The chain, one link each way — annual contracts renew once a year, so a chain is a
 * handful of links walked page by page rather than a tree fetched at once. */
function VersionHistoryCard({
  contract,
}: {
  contract: { renewed_from_id?: string | null; renewed_by_id?: string | null };
}) {
  const { data: predecessor } = useContract(contract.renewed_from_id ?? undefined);
  const { data: successor } = useContract(contract.renewed_by_id ?? undefined);
  const { byId: vendorById } = useVendorIndex();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HistoryIcon aria-hidden className="size-4 text-ink-tertiary" />
          Version history
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {contract.renewed_by_id ? (
          <VersionRow
            relation="Renewed by"
            record={successor}
            vendorName={successor ? vendorById.get(successor.vendor_id)?.name : undefined}
          />
        ) : null}
        {contract.renewed_from_id ? (
          <VersionRow
            relation="Renews"
            record={predecessor}
            vendorName={predecessor ? vendorById.get(predecessor.vendor_id)?.name : undefined}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function VersionRow({
  relation,
  record,
  vendorName,
}: {
  relation: string;
  record:
    | {
        id: string;
        title: string;
        status: "draft" | "active" | "expired" | "terminated";
        start_date?: string | null;
        end_date?: string | null;
      }
    | undefined;
  vendorName: string | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
      <span className="flex min-w-0 flex-col">
        <span className="text-eyebrow text-ink-tertiary">{relation}</span>
        {record ? (
          <Link
            href={`/contracts/${record.id}`}
            className="font-medium text-ink hover:text-brand hover:underline"
          >
            {record.title}
          </Link>
        ) : (
          <span className="text-ink-tertiary">…</span>
        )}
        {record ? (
          <span className="text-helper text-ink-tertiary">
            {vendorName ?? "…"}
            {record.start_date || record.end_date
              ? ` · ${formatDate(record.start_date)} — ${formatDate(record.end_date)}`
              : ""}
          </span>
        ) : null}
      </span>
      {record ? (
        <Badge variant={CONTRACT_STATUS_TONES[record.status]}>
          {CONTRACT_STATUS_LABELS[record.status]}
        </Badge>
      ) : null}
    </div>
  );
}


/**
 * The brands editor — the AttributesCard pattern: draft locally, save the whole set.
 *
 * `CoverageCard` one dimension over, and the two things it inherits are the two that matter.
 * **The save is a PUT of the complete set, not a patch**, so unticking every box is a real
 * instruction rather than a no-op — which it has to be, because "held at group level" is a
 * state a reader must be able to *reach*, not only one an agreement can be created in.
 * And nothing is optimistic: the server's answer is the only one worth rendering.
 *
 * The prose under the title is the create form's, deliberately word-for-word on the point
 * that matters — an empty set means group level. A reader who learns that on create and
 * finds a different explanation here has been told two things.
 */
function BrandsCard({ contractId, brandIds }: { contractId: string; brandIds: string[] }) {
  const { brands, isLoading } = useBrandIndex();
  const { replaceBrands } = useContractMutations();
  const { run, isPending, formError } = useSubmit();
  const [draft, setDraft] = React.useState(brandIds);

  const isDirty = [...draft].sort().join() !== [...brandIds].sort().join();

  async function save() {
    await run(async () => {
      await replaceBrands(contractId, draft);
      toast.success(draft.length === 0 ? "Held at group level" : "Brands updated");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TagIcon aria-hidden className="size-4 text-ink-tertiary" />
          Brands
        </CardTitle>
        <CardAction>
          <div className="flex items-center gap-2">
            {isDirty ? (
              <Button variant="ghost" size="sm" onClick={() => setDraft(brandIds)}>
                Discard
              </Button>
            ) : null}
            <Button size="sm" disabled={!isDirty || isPending} onClick={save}>
              {isPending ? (
                <>
                  <Loader2Icon className="animate-spin" data-icon="inline-start" />
                  Saving
                </>
              ) : (
                "Save brands"
              )}
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-helper text-ink-secondary">
          Which brands this agreement is held for. Leave every box clear for an agreement
          held at group level — a tool subscription or a press office retainer that belongs
          to no single brand.
        </p>

        {formError ? (
          <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
            {formError}
          </p>
        ) : null}

        {isLoading ? (
          <p className="text-helper text-ink-secondary">Loading brands…</p>
        ) : (
          <fieldset className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="sr-only">Brands this agreement is held for</legend>
            {brands.map((brand) => (
              <label
                key={brand.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink hover:bg-surface-hover"
              >
                <Checkbox
                  checked={draft.includes(brand.id)}
                  disabled={isPending}
                  onChange={(event) =>
                    setDraft(
                      event.target.checked
                        ? [...draft, brand.id]
                        : draft.filter((id) => id !== brand.id),
                    )
                  }
                />
                {brand.name}
              </label>
            ))}
          </fieldset>
        )}
      </CardContent>
    </Card>
  );
}
