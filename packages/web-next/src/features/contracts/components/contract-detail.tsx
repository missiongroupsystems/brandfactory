"use client";

import Link from "next/link";
import {
  ArrowLeftIcon,
  CalendarCheckIcon,
  HistoryIcon,
  Loader2Icon,
  MapPinIcon,
  PencilIcon,
  RefreshCwIcon,
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
import { Select } from "@/components/ui/select";
import { useOutletIndex } from "@/features/registry/hooks";
import { useVendorIndex } from "@/features/vendors/hooks";
import { useSubmit } from "@/hooks/use-submit";
import { hasContractValue, type ServiceFrequency } from "@/lib/api/types";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  BILLING_FREQUENCY_LABELS,
  SERVICE_CATEGORY_LABELS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_TONES,
  RENEWAL_TYPE_LABELS,
  RENEWAL_TYPE_TONES,
  SERVICE_FREQUENCY_OPTIONS,
} from "@/lib/labels";

import {
  useContract,
  useContractMutations,
  useSchedules,
  useServiceHealth,
  useServiceMutations,
} from "../hooks";
import { ContractForm } from "./contract-form";
import { ContractExtractionReview } from "./contract-extraction-review";
import { DecisionActions, needsDecision } from "./contract-lifecycle";
import { DocumentsCard } from "./documents-card";
import { VisitsCard } from "./visits-card";

/** One contract: the record, its coverage, the promised cadences, and what actually
 * happened. The page the missed-service question is answered on. */
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
          <Badge variant="outline">{SERVICE_CATEGORY_LABELS[contract.category]}</Badge>
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

        <CoverageCard contractId={contract.id} outletIds={contract.outlet_ids} />

        <SchedulesCard contractId={contract.id} outletIds={contract.outlet_ids} />

        <VisitsCard contractId={contract.id} outletIds={contract.outlet_ids} />
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

/** The coverage editor — the AttributesCard pattern: draft locally, save the whole set. */
function CoverageCard({ contractId, outletIds }: { contractId: string; outletIds: string[] }) {
  const { outlets, isLoading } = useOutletIndex();
  const { replaceOutlets } = useContractMutations();
  const { run, isPending, formError } = useSubmit();
  const [draft, setDraft] = React.useState(outletIds);

  const isDirty = [...draft].sort().join() !== [...outletIds].sort().join();

  async function save() {
    await run(async () => {
      await replaceOutlets(contractId, draft);
      toast.success("Coverage updated");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPinIcon aria-hidden className="size-4 text-ink-tertiary" />
          Coverage
        </CardTitle>
        <CardAction>
          <div className="flex items-center gap-2">
            {isDirty ? (
              <Button variant="ghost" size="sm" onClick={() => setDraft(outletIds)}>
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
                "Save coverage"
              )}
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-helper text-ink-secondary">
          Which outlets this contract covers. Schedules and visits can only be recorded
          against covered outlets.
        </p>

        {formError ? (
          <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
            {formError}
          </p>
        ) : null}

        {isLoading ? (
          <p className="text-helper text-ink-secondary">Loading outlets…</p>
        ) : (
          <fieldset className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="sr-only">Outlets covered</legend>
            {outlets.map((outlet) => (
              <label
                key={outlet.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink hover:bg-surface-hover"
              >
                <Checkbox
                  checked={draft.includes(outlet.id)}
                  disabled={isPending}
                  onChange={(event) =>
                    setDraft(
                      event.target.checked
                        ? [...draft, outlet.id]
                        : draft.filter((id) => id !== outlet.id),
                    )
                  }
                />
                {outlet.name}
              </label>
            ))}
          </fieldset>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The promised cadence, one row per covered outlet. PUT upserts against the pair, so
 * saving a row edits the existing schedule rather than duplicating it.
 */
function SchedulesCard({ contractId, outletIds }: { contractId: string; outletIds: string[] }) {
  const { byId: outletById } = useOutletIndex();
  const { data: schedules } = useSchedules({ contract_id: contractId });
  const { data: health } = useServiceHealth({ contract_id: contractId });

  const byOutlet = new Map(
    (schedules?.items ?? []).map((schedule) => [schedule.outlet_id, schedule]),
  );
  const healthByOutlet = new Map((health ?? []).map((h) => [h.outlet_id, h]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarCheckIcon aria-hidden className="size-4 text-ink-tertiary" />
          Service schedule
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-helper text-ink-secondary">
          The cadence the contract promises, per outlet. Modelling the expectation is
          what makes a missed visit detectable — a visit that never happened leaves no
          row of its own to notice.
        </p>

        {outletIds.length === 0 ? (
          <p className="text-ink-secondary">
            No outlets covered yet — set the coverage above first.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {outletIds.map((outletId) => {
              const schedule = byOutlet.get(outletId);
              return (
                <ScheduleRow
                  // The saved cadence is in the key: the row's draft initialises
                  // before the schedules have loaded, and remounting when they arrive
                  // (or change on save) is what re-seeds the controls — the same
                  // remount-not-effect reset the filter tables use.
                  key={`${outletId}:${schedule?.frequency ?? ""}:${schedule?.active ?? ""}`}
                  contractId={contractId}
                  outletId={outletId}
                  outletName={outletById.get(outletId)?.name ?? "…"}
                  schedule={schedule}
                  health={healthByOutlet.get(outletId)}
                />
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ScheduleRow({
  contractId,
  outletId,
  outletName,
  schedule,
  health,
}: {
  contractId: string;
  outletId: string;
  outletName: string;
  schedule?: { frequency: ServiceFrequency; active: boolean };
  health?: { overdue: boolean; days_overdue: number; next_expected?: string | null };
}) {
  const { setSchedule } = useServiceMutations();
  const { run, isPending, formError } = useSubmit();
  const [frequency, setFrequency] = React.useState<ServiceFrequency | "">(
    schedule?.frequency ?? "",
  );
  const [active, setActive] = React.useState(schedule?.active ?? true);

  const isDirty =
    frequency !== (schedule?.frequency ?? "") || active !== (schedule?.active ?? true);

  async function save() {
    if (!frequency) return;
    await run(async () => {
      await setSchedule(contractId, outletId, { frequency, active });
      toast.success(`Schedule saved for ${outletName}`);
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <Link
            href={`/outlets/${outletId}`}
            className="font-medium text-ink hover:text-brand hover:underline"
          >
            {outletName}
          </Link>
          {schedule && health ? (
            <span
              className={
                health.overdue ? "text-helper text-warning" : "text-helper text-ink-tertiary"
              }
            >
              {health.overdue
                ? `${health.days_overdue} days overdue`
                : health.next_expected
                  ? `Next expected ${formatDate(health.next_expected)}`
                  : "No baseline yet — record a visit or set the contract's start date"}
            </span>
          ) : !schedule ? (
            <span className="text-helper text-ink-tertiary">No cadence set</span>
          ) : null}
        </span>

        <span className="flex items-center gap-2">
          <Select
            aria-label={`Cadence for ${outletName}`}
            value={frequency}
            disabled={isPending}
            onChange={(event) => setFrequency(event.target.value as ServiceFrequency | "")}
            containerClassName="w-36"
          >
            <option value="">No schedule</option>
            {SERVICE_FREQUENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-1.5 text-helper text-ink-secondary">
            <Checkbox
              checked={active}
              disabled={isPending}
              onChange={(event) => setActive(event.target.checked)}
            />
            Active
          </label>
          <Button size="sm" disabled={!isDirty || !frequency || isPending} onClick={save}>
            Save
          </Button>
        </span>
      </div>
      {schedule && !active ? (
        <p className="text-helper text-ink-tertiary">
          Inactive — the cadence is paused and this pair is ignored by overdue detection.
        </p>
      ) : null}
      {formError ? (
        <p role="alert" className="rounded-lg bg-error-tint p-2 text-helper text-error">
          {formError}
        </p>
      ) : null}
    </li>
  );
}
