"use client";

import { CheckIcon, FileTextIcon, PlusIcon, WrenchIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { QueryError } from "@/components/layout/query-states";
import { Value } from "@/components/layout/table-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useOutletIndex } from "@/features/registry/hooks";
import {
  FileReportSheet,
  type FileReportPrefill,
} from "@/features/service-reports/components/file-report-sheet";
import { toNullable, useSubmit } from "@/hooks/use-submit";
import type { ServiceVisit, VisitStatus } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { VISIT_STATUS_LABELS, VISIT_STATUS_OPTIONS, VISIT_STATUS_TONES } from "@/lib/labels";

import { useReports, useServiceMutations, useVisits } from "../hooks";

/**
 * The visit log for one contract. Scheduled and actual dates are separate columns —
 * the gap between them is the thing worth reporting on, and lateness is the complaint
 * that starts most of these conversations.
 */
export function VisitsCard({
  contractId,
  outletIds,
}: {
  contractId: string;
  outletIds: string[];
}) {
  const { data, error, isLoading } = useVisits({ contract_id: contractId, limit: 200 });
  const { byId: outletById } = useOutletIndex();
  const [visitFormOpen, setVisitFormOpen] = React.useState(false);
  const [filing, setFiling] = React.useState<FileReportPrefill | null>(null);

  const visits = data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <WrenchIcon aria-hidden className="size-4 text-ink-tertiary" />
          Visits
        </CardTitle>
        <CardAction>
          {/* **File report is the primary of the two now, and Record visit is the exception.**
              A visit with no paper is the rarer act — somebody logging an attendance they know
              about ahead of the report — where filing is the thing this contract exists to
              produce. The sheet is prefilled with the contract and settles the outlet itself
              whenever the coverage is one, which is 147 of 158. */}
          <span className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={outletIds.length === 0}
              onClick={() => setVisitFormOpen(true)}
            >
              <PlusIcon data-icon="inline-start" />
              Record visit
            </Button>
            <Button
              size="sm"
              disabled={outletIds.length === 0}
              onClick={() => setFiling({ contractId })}
            >
              <FileTextIcon data-icon="inline-start" />
              File report
            </Button>
          </span>
        </CardAction>
      </CardHeader>

      <CardContent className={visits.length > 0 ? "px-0" : undefined}>
        {error ? (
          <QueryError error={error} />
        ) : isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : visits.length === 0 ? (
          <p className="text-ink-secondary">
            No visits recorded under this contract yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Outlet</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Actual</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Technician</TableHead>
                <TableHead className="pr-5 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visits.map((visit) => (
                <VisitRow
                  key={visit.id}
                  visit={visit}
                  outletName={outletById.get(visit.outlet_id)?.name ?? "…"}
                  // Today's behaviour, through the one sheet: `visitId` makes the filing land on
                  // *this* attendance rather than creating a second, and the date comes off the
                  // visit — a report attached to a visit from three weeks ago is dated by the
                  // visit, not by the day somebody got round to filing it.
                  onAttachReport={() =>
                    setFiling({
                      contractId,
                      outletId: visit.outlet_id,
                      visitId: visit.id,
                      reportDate: visit.actual_date ?? visit.scheduled_date ?? undefined,
                    })
                  }
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <VisitForm
        contractId={contractId}
        outletIds={outletIds}
        open={visitFormOpen}
        onOpenChange={setVisitFormOpen}
      />
      {/* **`ReportForm` is gone from this file**, replaced by the one sheet the whole product
          files through. It was a second form for the same act, and the two had already begun to
          differ — it could not take a document at all, which is the half of a service report
          that matters most. */}
      <FileReportSheet
        open={filing !== null}
        onOpenChange={(open) => !open && setFiling(null)}
        prefill={filing ?? undefined}
      />
    </Card>
  );
}

function VisitRow({
  visit,
  outletName,
  onAttachReport,
}: {
  visit: ServiceVisit;
  outletName: string;
  onAttachReport: () => void;
}) {
  const { updateVisit } = useServiceMutations();
  const { run, isPending } = useSubmit();
  const [showReports, setShowReports] = React.useState(false);

  async function markCompleted() {
    await run(async () => {
      await updateVisit(visit.id, {
        status: "completed",
        // Completing without a date would be refused; today is the honest default for
        // "the technician just left".
        actual_date: visit.actual_date ?? new Date().toISOString().slice(0, 10),
      });
      toast.success("Visit marked completed");
    });
  }

  return (
    <>
      <TableRow>
        <TableCell className="pl-5 font-medium text-ink">{outletName}</TableCell>
        <TableCell className="text-ink-secondary">
          {formatDate(visit.scheduled_date)}
        </TableCell>
        <TableCell className="text-ink-secondary">{formatDate(visit.actual_date)}</TableCell>
        <TableCell>
          <Badge variant={VISIT_STATUS_TONES[visit.status]}>
            {VISIT_STATUS_LABELS[visit.status]}
          </Badge>
        </TableCell>
        <TableCell className="text-ink-secondary">
          <Value>{visit.technician_name}</Value>
        </TableCell>
        <TableCell className="pr-5 text-right">
          <span className="inline-flex items-center gap-1">
            {visit.status === "scheduled" ? (
              <Button variant="ghost" size="sm" disabled={isPending} onClick={markCompleted}>
                <CheckIcon data-icon="inline-start" />
                Completed
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={onAttachReport}>
              <FileTextIcon data-icon="inline-start" />
              Report
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowReports((s) => !s)}>
              {showReports ? "Hide reports" : "Reports"}
            </Button>
          </span>
        </TableCell>
      </TableRow>
      {showReports ? <ReportsRow visitId={visit.id} /> : null}
    </>
  );
}

function ReportsRow({ visitId }: { visitId: string }) {
  const { data, isLoading } = useReports(visitId);
  const reports = data?.items ?? [];

  return (
    <TableRow>
      <TableCell colSpan={6} className="bg-surface-sunken pl-5">
        {isLoading ? (
          <span className="text-helper text-ink-secondary">Loading reports…</span>
        ) : reports.length === 0 ? (
          <span className="text-helper text-ink-secondary">
            No reports attached to this visit.
          </span>
        ) : (
          <ul className="flex flex-col gap-2 py-1">
            {reports.map((report) => (
              <li key={report.id} className="flex flex-col gap-0.5 whitespace-normal">
                <span className="text-sm text-ink">
                  {report.findings || "Report"}{" "}
                  <span className="text-ink-tertiary">
                    · {formatDate(report.report_date ?? report.created_at.slice(0, 10))}
                  </span>
                </span>
                {report.issues_raised ? (
                  <span className="text-helper text-ink-secondary">
                    Issues: {report.issues_raised}
                  </span>
                ) : null}
                {report.follow_up_required ? (
                  <span className="text-helper text-warning">
                    Follow-up{" "}
                    {report.follow_up_due
                      ? `due ${formatDate(report.follow_up_due)}`
                      : "required — no date set, so nothing will chase it"}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </TableCell>
    </TableRow>
  );
}

/** Record an attendance. Completed requires the actual date — the form pairs them. */
function VisitForm({
  contractId,
  outletIds,
  open,
  onOpenChange,
}: {
  contractId: string;
  outletIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { byId: outletById } = useOutletIndex();
  const { recordVisit } = useServiceMutations();
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();

  const empty = React.useMemo(
    () => ({
      outlet_id: outletIds[0] ?? "",
      scheduled_date: "",
      actual_date: "",
      status: "completed" as VisitStatus,
      technician_name: "",
      summary: "",
    }),
    [outletIds],
  );
  const [form, setForm] = React.useState(empty);

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(empty);
  }

  const set = <K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const ok = await run(async () => {
      await recordVisit({
        contract_id: contractId,
        outlet_id: form.outlet_id,
        scheduled_date: toNullable(form.scheduled_date),
        actual_date: toNullable(form.actual_date),
        status: form.status,
        technician_name: toNullable(form.technician_name),
        summary: toNullable(form.summary),
      });
      toast.success("Visit recorded");
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
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Record visit</SheetTitle>
          <SheetDescription>
            Scheduled and actual are separate on purpose — the gap between them is
            whether the vendor came late.
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
                  {outletIds.map((id) => (
                    <option key={id} value={id}>
                      {outletById.get(id)?.name ?? id}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <FieldGrid>
              <Field label="Scheduled" error={fieldErrors.scheduled_date}>
                {(field) => (
                  <Input
                    {...field}
                    type="date"
                    value={form.scheduled_date}
                    onChange={(event) => set("scheduled_date", event.target.value)}
                  />
                )}
              </Field>
              <Field
                label="Actually happened"
                hint="Required for a completed visit."
                error={fieldErrors.actual_date}
              >
                {(field) => (
                  <Input
                    {...field}
                    type="date"
                    value={form.actual_date}
                    onChange={(event) => set("actual_date", event.target.value)}
                  />
                )}
              </Field>
            </FieldGrid>

            <FieldGrid>
              <Field label="Status" required error={fieldErrors.status}>
                {(field) => (
                  <Select
                    {...field}
                    value={form.status}
                    onChange={(event) => set("status", event.target.value as VisitStatus)}
                  >
                    {VISIT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Technician" error={fieldErrors.technician_name}>
                {(field) => (
                  <Input
                    {...field}
                    maxLength={200}
                    value={form.technician_name}
                    onChange={(event) => set("technician_name", event.target.value)}
                  />
                )}
              </Field>
            </FieldGrid>

            <Field label="Summary" error={fieldErrors.summary}>
              {(field) => (
                <Textarea
                  {...field}
                  value={form.summary}
                  onChange={(event) => set("summary", event.target.value)}
                  placeholder="What was done, what was found."
                />
              )}
            </Field>
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
              Record visit
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
