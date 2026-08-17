"use client";

import Link from "next/link";
import { FileTextIcon, PlusIcon, WrenchIcon } from "lucide-react";
import * as React from "react";

import { QueryError } from "@/components/layout/query-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RecordRepairSheet } from "@/features/expenses/components/record-repair-sheet";
import { useExpenses } from "@/features/expenses/hooks";
import { FileReportSheet } from "@/features/service-reports/components/file-report-sheet";
import { formatDate, formatMoney } from "@/lib/format";
import { REPAIR_CATEGORY_LABELS, VISIT_STATUS_LABELS, VISIT_STATUS_TONES } from "@/lib/labels";

import { useContractIndex, useServiceHealth, useVisits } from "../hooks";

/**
 * Recent service at this site, and any cadence the vendors currently owe against.
 *
 * **This card used to say "visits are recorded on the contract's page, where the schedule lives",
 * and that stopped being true in the same change that added the button above.** It was accurate
 * and it was also the shape of the problem: the person standing at the outlet with the paper in
 * their hand was sent somewhere else to file it. Filing now starts here, prefilled with this
 * outlet, and the sheet asks which of its contracts the service was under.
 */
export function OutletServiceCard({ outletId }: { outletId: string }) {
  const { data, error, isLoading } = useVisits({ outlet_id: outletId, limit: 10 });
  const { data: health } = useServiceHealth({ outlet_id: outletId, overdue_only: true });
  const { byId: contractById } = useContractIndex();
  const { data: repairsPage } = useExpenses({ outlet_id: outletId });
  const [filing, setFiling] = React.useState(false);
  const [recording, setRecording] = React.useState(false);

  const visits = data?.items ?? [];
  const overdue = health ?? [];
  const repairs = React.useMemo(() => repairsPage?.items ?? [], [repairsPage]);

  // Spend-to-date, **per currency** — never a cross-currency sum, the same rule the summary holds.
  const spendByCurrency = React.useMemo(() => {
    const totals = new Map<string, number>();
    for (const repair of repairs) {
      totals.set(repair.currency, (totals.get(repair.currency) ?? 0) + Number(repair.amount));
    }
    return [...totals.entries()];
  }, [repairs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <WrenchIcon aria-hidden className="size-4 text-ink-tertiary" />
          Service
        </CardTitle>
        <CardAction>
          <Button size="sm" onClick={() => setFiling(true)}>
            <FileTextIcon data-icon="inline-start" />
            File report
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {overdue.length > 0 ? (
          <div
            role="alert"
            className="flex flex-col gap-1 rounded-lg bg-warning-tint p-3 text-warning"
          >
            {overdue.map((h) => (
              <p key={`${h.contract_id}:${h.outlet_id}`} className="text-helper">
                {contractById.get(h.contract_id)?.title ?? "A contract"} is{" "}
                {h.days_overdue} days overdue for service here.
              </p>
            ))}
          </div>
        ) : null}

        {error ? (
          <QueryError error={error} />
        ) : isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : visits.length === 0 ? (
          <p className="text-ink-secondary">
            No service visits recorded at this outlet yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visits.map((visit) => (
              <li
                key={visit.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
              >
                <span className="flex min-w-0 flex-col">
                  <Link
                    href={`/contracts/${visit.contract_id}`}
                    className="font-medium text-ink hover:text-brand hover:underline"
                  >
                    {contractById.get(visit.contract_id)?.title ?? "…"}
                  </Link>
                  <span className="text-helper text-ink-tertiary">
                    {visit.actual_date
                      ? `Attended ${formatDate(visit.actual_date)}`
                      : visit.scheduled_date
                        ? `Scheduled ${formatDate(visit.scheduled_date)}`
                        : "No date recorded"}
                    {visit.technician_name ? ` · ${visit.technician_name}` : ""}
                  </span>
                </span>
                <Badge variant={VISIT_STATUS_TONES[visit.status]}>
                  {VISIT_STATUS_LABELS[visit.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        {/* Repairs — the ad-hoc `expense` log for this site, kept beside the scheduled service it
            is not part of. Spend-to-date is shown per currency, never summed across them. */}
        <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-baseline gap-2">
              <span className="font-medium text-ink">Repairs</span>
              {spendByCurrency.length > 0 ? (
                <span className="text-helper text-ink-tertiary">
                  {spendByCurrency
                    .map(([currency, total]) => formatMoney(total, currency))
                    .join(" · ")}{" "}
                  to date
                </span>
              ) : null}
            </span>
            <Button size="sm" variant="secondary" onClick={() => setRecording(true)}>
              <PlusIcon data-icon="inline-start" />
              Record repair
            </Button>
          </div>

          {repairs.length === 0 ? (
            <p className="text-helper text-ink-tertiary">No repairs recorded here yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {repairs.slice(0, 5).map((repair) => (
                <li
                  key={repair.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium text-ink">
                      {repair.category ? REPAIR_CATEGORY_LABELS[repair.category] : "Repair"}
                    </span>
                    <span className="text-helper text-ink-tertiary">
                      Incurred {formatDate(repair.incurred_on)}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium text-ink">
                    {formatMoney(repair.amount, repair.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>

      {/* Prefilled with the outlet and nothing else, so the sheet opens on the list of this
          site's live contracts — most-overdue first, which is usually the one being filed. */}
      <FileReportSheet
        open={filing}
        onOpenChange={setFiling}
        prefill={{ outletId }}
      />
      <RecordRepairSheet open={recording} onOpenChange={setRecording} prefill={{ outletId }} />
    </Card>
  );
}
