"use client";

import { ArrowLeftIcon, BellRingIcon, KeyRoundIcon, MapPinIcon, PencilIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { DetailItem, DetailList } from "@/components/layout/detail-list";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows, PageState, QueryError } from "@/components/layout/query-states";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentsCard } from "@/features/contracts/components/documents-card";
import {
  useEntityIndex,
  useOutlet,
  useOutletIndex,
  useOutletMutations,
} from "@/features/registry/hooks";
import { useVendorIndex } from "@/features/vendors/hooks";
import { useSubmit } from "@/hooks/use-submit";
import { hasTenancyRent } from "@/lib/api/types";
import { formatDate, formatMoney } from "@/lib/format";
import {
  BILLING_FREQUENCY_LABELS,
  DEPOSIT_FORM_LABELS,
  OBLIGATION_KIND_LABELS,
  OBLIGATION_STATUS_LABELS,
  OBLIGATION_STATUS_TONES,
  TENANCY_KIND_LABELS,
  TENANCY_STATUS_LABELS,
  TENANCY_STATUS_TONES,
} from "@/lib/labels";

import { type TenancyRecord } from "../api";
import { useTenancy, useTenancyObligations } from "../hooks";
import { TenancyExtractionReview } from "./tenancy-extraction-review";
import { TenancyForm } from "./tenancy-form";

export function TenancyDetail({ tenancyId }: { tenancyId: string }) {
  const { data: tenancy, error, isLoading } = useTenancy(tenancyId);
  const { byId: outletById } = useOutletIndex();
  const [editOpen, setEditOpen] = React.useState(false);

  if (error) {
    return (
      <>
        <BackLink />
        <PageState>
          <QueryError error={error} />
        </PageState>
      </>
    );
  }
  if (isLoading || !tenancy) {
    return (
      <>
        <BackLink />
        <PageState>
          <LoadingRows rows={4} />
        </PageState>
      </>
    );
  }

  const outletName = outletById.get(tenancy.outlet_id)?.name;

  return (
    <>
      <BackLink />

      <PageHeader
        title={outletName ?? "Tenancy"}
        description={tenancy.premises_description ?? undefined}
        actions={
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            <PencilIcon data-icon="inline-start" />
            Edit
          </Button>
        }
      />

      <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={TENANCY_STATUS_TONES[tenancy.status]}>
            {TENANCY_STATUS_LABELS[tenancy.status]}
          </Badge>
          <Badge variant="outline">{TENANCY_KIND_LABELS[tenancy.kind]}</Badge>
        </div>

        <RecordCard tenancy={tenancy} />
        <AddressAdoption tenancy={tenancy} />
        <OptionCard tenancy={tenancy} />
        {hasTenancyRent(tenancy) || tenancy.has_base_rent ? (
          <RentCard tenancy={tenancy} />
        ) : null}
        <ObligationsCard tenancyId={tenancy.id} />
        <DocumentsCard
          subjectType="tenancy_agreement"
          subjectId={tenancy.id}
          defaultDocType="tenancy_agreement"
          extraction={{
            // The response includes the rent, so the button follows `hasTenancyRent` — the
            // caller's role gate, mirroring the backend's rather than discovering it as a 403.
            // When extraction is dark the review sheet answers 503 and says so honestly.
            docType: "tenancy_agreement",
            enabled: hasTenancyRent(tenancy),
            renderReview: ({ attachment, open, onOpenChange }) => (
              <TenancyExtractionReview
                tenancy={tenancy}
                attachment={attachment}
                open={open}
                onOpenChange={onOpenChange}
              />
            ),
          }}
        />
      </div>

      <TenancyForm tenancy={tenancy} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}

function RecordCard({ tenancy }: { tenancy: TenancyRecord }) {
  const { byId: entityById } = useEntityIndex();
  const { byId: vendorById } = useVendorIndex();
  const landlord = tenancy.landlord_id ? vendorById.get(tenancy.landlord_id) : undefined;
  const entity = tenancy.tenant_entity_id ? entityById.get(tenancy.tenant_entity_id) : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record</CardTitle>
      </CardHeader>
      <CardContent>
        <DetailList>
          <DetailItem label="Landlord">
            {landlord ? (
              <Link
                href={`/vendors/${landlord.id}`}
                className="text-ink hover:text-brand hover:underline"
              >
                {landlord.name}
              </Link>
            ) : null}
          </DetailItem>
          <DetailItem label="Signed by">{entity?.name ?? null}</DetailItem>
          <DetailItem label="Term">
            {tenancy.start_date || tenancy.end_date
              ? `${formatDate(tenancy.start_date)} — ${formatDate(tenancy.end_date)}`
              : null}
          </DetailItem>
          <DetailItem label="Handover">
            {tenancy.handover_date ? formatDate(tenancy.handover_date) : null}
          </DetailItem>
          <DetailItem label="Rent commences">
            {tenancy.rent_commencement_date
              ? formatDate(tenancy.rent_commencement_date)
              : null}
          </DetailItem>
          <DetailItem label="Floor area">
            {tenancy.floor_area_sqft ? `${tenancy.floor_area_sqft} sqft` : null}
          </DetailItem>
          <DetailItem label="Reference">{tenancy.reference ?? null}</DetailItem>
          <DetailItem label="Permitted use">{tenancy.permitted_use ?? null}</DetailItem>
          <DetailItem label="Reinstatement">
            {tenancy.reinstatement_required == null
              ? null
              : tenancy.reinstatement_required
                ? "Required"
                : "Not required"}
          </DetailItem>
          <DetailItem label="Notes">{tenancy.notes ?? null}</DetailItem>
        </DetailList>
      </CardContent>
    </Card>
  );
}

/**
 * "Use as this outlet's address" (§5.2). The lease states where the premises is; on the alpha no
 * outlet has an address at all. **Offered, never written silently, and never overwriting a value
 * already there without saying so** — the licence library's advisory rule applied one table over.
 * Nothing renders when there is no premises text or when the outlet's address already matches it.
 */
function AddressAdoption({ tenancy }: { tenancy: TenancyRecord }) {
  const { data: outlet } = useOutlet(tenancy.outlet_id);
  const { update } = useOutletMutations();
  const { run, isPending } = useSubmit();
  const [confirming, setConfirming] = React.useState(false);

  const premises = tenancy.premises_description?.trim();
  if (!premises || !outlet) return null;
  const current = outlet.address?.trim() ?? "";
  if (current === premises) return null; // already adopted — nothing to offer

  async function adopt() {
    if (!outlet) return;
    const ok = await run(async () => {
      await update(outlet.id, { address: premises });
      toast.success("Outlet address set from the lease");
    });
    if (ok) setConfirming(false);
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <span className="flex min-w-0 items-start gap-2">
          <MapPinIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-tertiary" />
          <span className="flex flex-col">
            <span className="text-sm text-ink">Use the premises as this outlet&apos;s address?</span>
            <span className="text-helper text-ink-secondary">
              {current
                ? `The outlet's address is currently “${current}”.`
                : "This outlet has no address on file."}{" "}
              The lease reads “{premises}”.
            </span>
          </span>
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={isPending}
          onClick={() => (current ? setConfirming(true) : void adopt())}
        >
          Use as address
        </Button>
      </CardContent>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Replace the outlet's address?"
        description={`The outlet's address is currently “${current}”. Replace it with “${premises}” from the lease?`}
        confirmLabel="Replace address"
        onConfirm={adopt}
        isPending={isPending}
      />
    </Card>
  );
}

function OptionCard({ tenancy }: { tenancy: TenancyRecord }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon aria-hidden className="size-4 text-ink-tertiary" />
          Option to renew
        </CardTitle>
      </CardHeader>
      <CardContent>
        {tenancy.has_option_to_renew ? (
          <DetailList>
            <DetailItem label="Notice deadline">
              {tenancy.option_deadline ? formatDate(tenancy.option_deadline) : "No date yet"}
            </DetailItem>
            <DetailItem label="Window opens">
              {tenancy.option_window_opens
                ? formatDate(tenancy.option_window_opens)
                : "No earliest bound"}
            </DetailItem>
            <DetailItem label="Notice period">
              {tenancy.option_notice_days != null ? `${tenancy.option_notice_days} days` : null}
            </DetailItem>
            <DetailItem label="Further term">
              {tenancy.option_term_months != null
                ? `${tenancy.option_term_months} months`
                : null}
            </DetailItem>
          </DetailList>
        ) : (
          <p className="text-helper text-ink-secondary">
            No option to renew recorded — this lease ends at its term unless a new one is signed.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function RentCard({ tenancy }: { tenancy: TenancyRecord }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rent</CardTitle>
      </CardHeader>
      <CardContent>
        {hasTenancyRent(tenancy) ? (
          <DetailList>
            <DetailItem label="Base rent">
              {tenancy.base_rent != null
                ? `${formatMoney(tenancy.base_rent)}${
                    tenancy.rent_frequency
                      ? ` · ${BILLING_FREQUENCY_LABELS[tenancy.rent_frequency]}`
                      : ""
                  }`
                : null}
            </DetailItem>
            <DetailItem label="Service charge">
              {tenancy.service_charge != null ? formatMoney(tenancy.service_charge) : null}
            </DetailItem>
            <DetailItem label="Turnover rent">
              {tenancy.turnover_rent_percent != null
                ? `${tenancy.turnover_rent_percent}%`
                : null}
            </DetailItem>
            <DetailItem label="Security deposit">
              {tenancy.security_deposit != null
                ? `${formatMoney(tenancy.security_deposit)}${
                    tenancy.deposit_form
                      ? ` · ${DEPOSIT_FORM_LABELS[tenancy.deposit_form]}`
                      : ""
                  }`
                : null}
            </DetailItem>
            <DetailItem label="Guarantee expiry">
              {tenancy.deposit_expiry_date ? formatDate(tenancy.deposit_expiry_date) : null}
            </DetailItem>
          </DetailList>
        ) : (
          <p className="text-helper text-ink-secondary">
            A rent is on file, but viewing rent figures is restricted to the operations team.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ObligationsCard({ tenancyId }: { tenancyId: string }) {
  const { data, isLoading } = useTenancyObligations(tenancyId);
  const obligations = data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRingIcon aria-hidden className="size-4 text-ink-tertiary" />
          Obligations
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-helper text-ink-secondary">Loading…</p>
        ) : obligations.length === 0 ? (
          <p className="text-helper text-ink-secondary">
            Nothing due. The engine raises the option-to-renew deadline, an expiry decision and a
            banker&apos;s-guarantee renewal here when the dates warrant — run a recheck from the
            dashboard if you have just edited the lease.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {obligations.map((obligation) => (
              <li
                key={obligation.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium text-ink">{obligation.title}</span>
                  <span className="text-helper text-ink-tertiary">
                    {OBLIGATION_KIND_LABELS[obligation.kind]} · due{" "}
                    {formatDate(obligation.due_date)}
                  </span>
                </span>
                <Badge variant={OBLIGATION_STATUS_TONES[obligation.status]}>
                  {OBLIGATION_STATUS_LABELS[obligation.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function BackLink() {
  return (
    <div className="px-6 pt-6 md:px-8">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/tenancies" />}>
        <ArrowLeftIcon data-icon="inline-start" />
        All tenancies
      </Button>
    </div>
  );
}
