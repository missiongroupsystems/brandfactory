"use client";

import Link from "next/link";
import type * as React from "react";
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  CheckIcon,
  ConstructionIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  WrenchIcon,
} from "lucide-react";
import { toast } from "sonner";

import { FilterBar, FilterSelect } from "@/components/layout/filter-bar";
import { LoadingRows, QueryError } from "@/components/layout/query-states";
import { TableCard } from "@/components/layout/table-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useEntityIndex, useOutletIndex } from "@/features/registry/hooks";
import { useQueryFilters } from "@/hooks/use-query-filters";
import { useSubmit } from "@/hooks/use-submit";
import type { DashboardObligation } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { OBLIGATION_KIND_LABELS } from "@/lib/labels";

import { useDashboard, useObligationMutations } from "../hooks";

const FILTER_KEYS = ["outlet_id", "entity_id"] as const;

/**
 * "What needs attention" — the answer to the meeting-two-months-later problem, and
 * the single consumer of the obligation engine.
 *
 * Filters live in the URL so a filtered dashboard is shareable (spec §6/§5). The
 * accent budget is spent on exactly one card: Overdue, the number this screen exists
 * to make impossible to miss.
 *
 * Every panel here **says when it is empty** rather than rendering as blank. A panel
 * with no rows and no sentence reads as "nothing wrong", which is indistinguishable
 * from "not built" and from "the query failed" — and on the one screen whose whole job
 * is surfacing what would otherwise go unnoticed, that is the worst thing it could do.
 * Service health carries the same treatment (it said "arrives with Phase 2" until the
 * generators landed, and now says no vendor currently owes a visit).
 */
export function DashboardView() {
  const { filters, setFilter, clearAll, activeCount } = useQueryFilters(FILTER_KEYS);
  const { outlets } = useOutletIndex();
  const { entities } = useEntityIndex();
  const { data, error, isLoading } = useDashboard({
    outlet_id: filters.outlet_id,
    entity_id: filters.entity_id,
  });
  const { generate } = useObligationMutations();
  const { run, isPending } = useSubmit();

  async function regenerate() {
    await run(async () => {
      const report = await generate();
      const changed = report.generators.reduce(
        (sum, g) => sum + g.created + g.updated + g.reopened + g.removed,
        0,
      );
      toast.success(
        changed === 0
          ? "Everything already up to date"
          : `Obligations recomputed — ${changed} change${changed === 1 ? "" : "s"}`,
      );
    });
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <FilterBar activeCount={activeCount} onClear={clearAll}>
          <FilterSelect
            label="Filter by outlet"
            allLabel="All outlets"
            value={filters.outlet_id}
            options={outlets.map((o) => ({ value: o.id, label: o.name }))}
            onChange={(value) => setFilter("outlet_id", value)}
          />
          <FilterSelect
            label="Filter by entity"
            allLabel="All entities"
            value={filters.entity_id}
            options={entities.map((e) => ({ value: e.id, label: e.name }))}
            onChange={(value) => setFilter("entity_id", value)}
          />
        </FilterBar>

        <Button
          variant="secondary"
          size="sm"
          disabled={isPending}
          onClick={regenerate}
          className="w-full sm:w-auto"
        >
          <RefreshCwIcon data-icon="inline-start" className={isPending ? "animate-spin" : undefined} />
          Recompute
        </Button>
      </div>

      {error ? (
        <QueryError error={error} />
      ) : isLoading || !data ? (
        <LoadingRows rows={6} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* The one accent-filled card on this screen — the accent budget, spent
                on the number that must not be missable. */}
            <StatCard
              label="Overdue"
              value={data.counts.overdue}
              tone="accent"
              caption={
                data.counts.overdue === 0
                  ? "Nothing past due"
                  : "Past due and still open"
              }
            />
            <StatCard
              label="Next 30 days"
              value={data.counts.due_30}
              caption="Due within a month"
            />
            <StatCard
              label="31–60 days"
              value={data.counts.due_60}
              caption="Due in one to two months"
            />
            <StatCard
              label="61–90 days"
              value={data.counts.due_90}
              caption="Due in two to three months"
            />
          </div>

          {data.overdue.length > 0 ? (
            <Panel
              icon={<AlertTriangleIcon aria-hidden className="size-4 text-ink-tertiary" />}
              title="Overdue"
            >
              <ObligationTable items={data.overdue} />
            </Panel>
          ) : null}

          <Panel
            icon={<CalendarClockIcon aria-hidden className="size-4 text-ink-tertiary" />}
            title="Due in the next 90 days"
          >
            {data.due_soon.length === 0 ? (
              <p className="text-ink-secondary">
                Nothing due in the next 90 days
                {data.counts.open_obligations > 0
                  ? ` — ${data.counts.open_obligations} open obligation${data.counts.open_obligations === 1 ? "" : "s"} further out.`
                  : "."}
              </p>
            ) : (
              <ObligationTable items={data.due_soon} />
            )}
          </Panel>

          {data.gaps.length > 0 ? (
            <Panel
              icon={<ShieldAlertIcon aria-hidden className="size-4 text-ink-tertiary" />}
              title="Gaps — operating outlets missing required licences"
            >
              <ul className="flex flex-col gap-2">
                {data.gaps.map((gap) => (
                  <li
                    key={gap.outlet_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
                  >
                    <Link
                      href={`/outlets/${gap.outlet_id}`}
                      className="font-medium text-ink hover:text-brand hover:underline"
                    >
                      {gap.outlet_name}
                    </Link>
                    <span className="flex items-center gap-2 text-helper text-ink-secondary">
                      {gap.outstanding} unmet requirement{gap.outstanding === 1 ? "" : "s"}
                      {gap.mandatory_outstanding > 0 ? (
                        <Badge variant="warning">
                          {gap.mandatory_outstanding} mandatory
                        </Badge>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {data.pipeline.length > 0 ? (
            <Panel
              icon={<ConstructionIcon aria-hidden className="size-4 text-ink-tertiary" />}
              title="Pipeline — licensing readiness"
            >
              <ul className="flex flex-col gap-2">
                {data.pipeline.map((project) => (
                  <li
                    key={project.outlet_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
                  >
                    <span className="flex min-w-0 flex-col">
                      <Link
                        href={`/outlets/${project.outlet_id}`}
                        className="font-medium text-ink hover:text-brand hover:underline"
                      >
                        {project.outlet_name}
                      </Link>
                      <span className="text-helper text-ink-tertiary">
                        {project.target_opening_date
                          ? `Target opening ${formatDate(project.target_opening_date)}`
                          : "No target opening date"}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-helper text-ink-secondary">
                      {project.required === 0 ? (
                        // An empty plan is a finding, not a blank.
                        <Badge variant="warning">No requirements planned</Badge>
                      ) : (
                        <>
                          {project.met} of {project.required} met
                          {project.past_target > 0 ? (
                            <Badge variant="warning">
                              {project.past_target} past target
                            </Badge>
                          ) : null}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {data.unscheduled.length > 0 ? (
            <Panel
              icon={<CalendarClockIcon aria-hidden className="size-4 text-ink-tertiary" />}
              title="No renewal schedule"
            >
              <p className="mb-3 text-helper text-ink-secondary">
                Held licences the engine cannot chase — the library records no renewal
                cadence for the type, or the certificate has no expiry recorded. Often
                correct (one-off permits do not renew), but worth a look rather than
                silence.
              </p>
              <ul className="flex flex-col gap-2">
                {data.unscheduled.map((item) => (
                  <li
                    key={item.license_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium text-ink">{item.license_type_name}</span>
                      <span className="text-helper text-ink-tertiary">
                        {item.outlet_name ?? "Entity-level"}
                      </span>
                    </span>
                    <span className="text-helper text-ink-secondary">
                      {item.reason === "no_expiry_date"
                        ? "No expiry recorded"
                        : item.expiry_date
                          ? `Expires ${formatDate(item.expiry_date)} — no lead time in the library`
                          : "No lead time in the library"}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {data.service_health.length > 0 ? (
            <Panel
              icon={<WrenchIcon aria-hidden className="size-4 text-ink-tertiary" />}
              title="Service health — vendors owing a visit"
            >
              <ul className="flex flex-col gap-2">
                {data.service_health.map((health) => (
                  <li
                    key={`${health.contract_id}:${health.outlet_id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
                  >
                    <span className="flex min-w-0 flex-col">
                      <Link
                        href={`/contracts/${health.contract_id}`}
                        className="font-medium text-ink hover:text-brand hover:underline"
                      >
                        {health.contract_title}
                      </Link>
                      <span className="text-helper text-ink-tertiary">
                        {health.vendor_name} at{" "}
                        <Link
                          href={`/outlets/${health.outlet_id}`}
                          className="hover:text-brand hover:underline"
                        >
                          {health.outlet_name}
                        </Link>
                        {health.last_completed
                          ? ` · last visit ${formatDate(health.last_completed)}`
                          : " · no completed visit yet"}
                      </span>
                    </span>
                    {/* Ochre and words together, never colour alone. */}
                    <Badge variant="warning">{health.days_overdue} days overdue</Badge>
                  </li>
                ))}
              </ul>
              {/* The panel shows the worst of them; this is where they all are, and where each
                  one carries the control that closes it. A dashboard row that names a problem
                  and does not say where the work happens is how the work does not happen. */}
              <Link
                href="/service-reports?view=expected"
                className="mt-3 inline-block text-helper text-ink-secondary hover:text-brand hover:underline"
              >
                File a report, or see every expected service →
              </Link>
            </Panel>
          ) : (
            <p className="text-helper text-ink-tertiary">
              Service health: no vendor currently owes a visit against an active schedule.
              The full per-contract picture is under{" "}
              <Link
                href="/service-reports?view=expected"
                className="hover:text-brand hover:underline"
              >
                Service reports
              </Link>
              .
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Panel({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/**
 * Obligation rows, each linking to its record and completable in place. "Its record"
 * is the outlet page for anything outlet-tied (that is where the licence and device
 * panels live) and the licences list otherwise.
 */
function ObligationTable({ items }: { items: DashboardObligation[] }) {
  const { complete } = useObligationMutations();
  const { run, isPending } = useSubmit();
  const { byId: outletById } = useOutletIndex();

  async function markDone(item: DashboardObligation) {
    await run(async () => {
      await complete(item.id);
      toast.success("Marked done");
    });
  }

  return (
    <TableCard className="border-0 shadow-none">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>What</TableHead>
            <TableHead>Where</TableHead>
            <TableHead>Due</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const outlet = item.outlet_id ? outletById.get(item.outlet_id) : undefined;
            const overdue = item.days_until_due < 0;
            return (
              <TableRow key={item.id}>
                {/* w-full + whitespace-normal: the title column absorbs the spare width and
                    wraps, so the table fits the card instead of forcing a sideways scroll. */}
                <TableCell className="w-full whitespace-normal">
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">{OBLIGATION_KIND_LABELS[item.kind]}</Badge>
                    <span className="font-medium text-ink">{item.title}</span>
                  </span>
                </TableCell>
                <TableCell className="text-ink-secondary">
                  {outlet ? (
                    <Link
                      href={`/outlets/${outlet.id}`}
                      className="hover:text-brand hover:underline"
                    >
                      {outlet.name}
                    </Link>
                  ) : item.subject_type === "license" ? (
                    <Link href="/licenses" className="hover:text-brand hover:underline">
                      Entity-level licence
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <span className={overdue ? "text-error" : "text-ink-secondary"}>
                    {formatDate(item.due_date)}
                    <span className="block text-helper">
                      {overdue
                        ? `${-item.days_until_due} day${item.days_until_due === -1 ? "" : "s"} overdue`
                        : item.days_until_due === 0
                          ? "Due today"
                          : `in ${item.days_until_due} day${item.days_until_due === 1 ? "" : "s"}`}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => markDone(item)}
                  >
                    <CheckIcon data-icon="inline-start" />
                    Done
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableCard>
  );
}
