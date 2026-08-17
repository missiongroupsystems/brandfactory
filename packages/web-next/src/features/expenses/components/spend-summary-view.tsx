"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import * as React from "react";

import { SegmentedControl } from "@/components/layout/filter-bar";
import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { TableCard } from "@/components/layout/table-card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQueryFilters } from "@/hooks/use-query-filters";
import type { SpendBucket, SpendGranularity, SpendGroupBy } from "@/lib/api/types";
import { formatMoney } from "@/lib/format";
import { REPAIR_CATEGORY_LABELS } from "@/lib/labels";

import { useExpenseSummary } from "../hooks";

const FILTER_KEYS = ["group_by", "granularity", "from", "to"] as const;

const GROUP_BY_OPTIONS = [
  { value: "outlet", label: "Outlet" },
  { value: "entity", label: "Company" },
  { value: "vendor", label: "Vendor" },
  { value: "category", label: "Category" },
] as const;

const GRANULARITY_OPTIONS = [
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "quarter", label: "Quarterly" },
] as const;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const pad = (n: number) => String(n).padStart(2, "0");

/** A default window of the last six months, computed from today. `new Date()` here is only for a
 * default — it never touches an API business date, which `formatDate` is the one that must not. */
function defaultWindow(): { from: string; to: string } {
  const now = new Date();
  const to = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const from = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-01`;
  return { from, to };
}

/** A compact period label parsed straight from the ISO string — no `new Date()`, so no timezone
 * shift on a business date (the `formatDate` rule). */
function periodLabel(startIso: string, granularity: SpendGranularity): string {
  const [y, m, d] = startIso.split("-").map(Number);
  if (granularity === "month") return `${MONTHS[m - 1]} ${y}`;
  if (granularity === "quarter") return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
  return `${d} ${MONTHS[m - 1]}`;
}

function rowLabel(bucket: SpendBucket, groupBy: SpendGroupBy): string {
  // "Unclassified" for a missing category (matching the Repairs list and the sheet), "Unassigned"
  // for a missing vendor/company — one word per concept, never three.
  if (bucket.key === null) return groupBy === "category" ? "Unclassified" : "Unassigned";
  if (groupBy === "category") {
    return REPAIR_CATEGORY_LABELS[bucket.key as keyof typeof REPAIR_CATEGORY_LABELS] ?? bucket.key;
  }
  return bucket.key_label ?? bucket.key;
}

/**
 * **The monthly overview** — a periodic destination (`?view=summary`), not a dashboard tile: a
 * rollup is something you go and read, not an attention item. Two `SegmentedControl`s pick the
 * axes (group-by and granularity — view controls, not filters), and the window is two required
 * dates.
 *
 * **Below `sm` it is not a 2-D pivot** — a cross-tab does not cardify. It collapses to the latest
 * period as a flat list, "Outlet — S$X · N repairs" sorted desc, which is the literal answer to
 * "which outlet spent how much".
 */
export function SpendSummaryView() {
  const { filters, setFilter, setFilters } = useQueryFilters(FILTER_KEYS);
  const defaults = React.useMemo(() => defaultWindow(), []);

  const groupBy = (filters.group_by ?? "outlet") as SpendGroupBy;
  const granularity = (filters.granularity ?? "month") as SpendGranularity;
  const from = filters.from ?? defaults.from;
  const to = filters.to ?? defaults.to;

  // Persist the resolved window to the URL so a shared `?view=summary` link renders the sender's
  // window, not the recipient's today-based default (spec §6, "filters live in the URL"). Writes
  // once — once both are set the condition is false, so no loop. This is a URL write
  // (`history.replaceState`), not React state, so it is not the set-state-in-effect trap.
  React.useEffect(() => {
    if (!filters.from || !filters.to) setFilters({ from, to });
  }, [filters.from, filters.to, from, to, setFilters]);

  const { data, error, isLoading } = useExpenseSummary({
    group_by: groupBy,
    granularity,
    from,
    to,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="Group repairs by"
            value={groupBy}
            options={GROUP_BY_OPTIONS}
            onChange={(value) => setFilter("group_by", value === "outlet" ? undefined : value)}
          />
          <SegmentedControl
            label="Period width"
            value={granularity}
            options={GRANULARITY_OPTIONS}
            onChange={(value) => setFilter("granularity", value === "month" ? undefined : value)}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-helper font-medium text-ink-secondary">From</span>
            <Input
              type="date"
              value={from}
              max={to}
              onChange={(event) => setFilter("from", event.target.value || undefined)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-helper font-medium text-ink-secondary">To</span>
            <Input
              type="date"
              value={to}
              min={from}
              onChange={(event) => setFilter("to", event.target.value || undefined)}
            />
          </label>
        </div>
      </div>

      {error ? (
        <QueryError error={error} />
      ) : isLoading || !data ? (
        <LoadingRows rows={5} />
      ) : data.buckets.length === 0 ? (
        <EmptyState
          message="No repair spend in this period"
          hint="Widen the window, or clear a filter, to see more."
        />
      ) : (
        <>
          {data.currency_split ? (
            <p className="text-helper text-ink-tertiary">
              Amounts are in more than one currency and are never summed across them — each
              currency is its own row.
            </p>
          ) : null}
          {/* Below sm: the latest period as a flat list. Above sm: the full pivot. */}
          <FlatList
            className="sm:hidden"
            buckets={data.buckets}
            groupBy={groupBy}
            granularity={granularity}
          />
          <PivotTable
            className="hidden sm:block"
            buckets={data.buckets}
            groupBy={groupBy}
            granularity={granularity}
          />
        </>
      )}
    </div>
  );
}

/** One period at a time, flattened — the phone view. A cross-tab does not cardify, so instead of
 * dropping every period but the latest, a stepper walks the window (the fix for the period trap
 * the built-work review caught: the phone could only ever see the newest month). */
function FlatList({
  buckets,
  groupBy,
  granularity,
  className,
}: {
  buckets: SpendBucket[];
  groupBy: SpendGroupBy;
  granularity: SpendGranularity;
  className?: string;
}) {
  const periods = React.useMemo(
    () => [...new Set(buckets.map((b) => b.period_start))].sort(),
    [buckets],
  );
  // 0 = latest; increasing steps back in time. Clamped in render so a filter change that shrinks
  // the window never strands the index past the end.
  const [stepsBack, setStepsBack] = React.useState(0);
  const idx = Math.max(0, periods.length - 1 - Math.min(stepsBack, periods.length - 1));
  const active = periods[idx] ?? "";

  const rows = buckets
    .filter((b) => b.period_start === active)
    .sort((a, b) => Number(b.total) - Number(a.total));

  const hasEarlier = idx > 0;
  const hasLater = idx < periods.length - 1;

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Earlier period"
          disabled={!hasEarlier}
          onClick={() => setStepsBack((s) => s + 1)}
          className="rounded-md p-1 text-ink-secondary hover:bg-surface-sunken disabled:opacity-30"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <span className="text-helper font-medium text-ink-secondary">
          {active ? periodLabel(active, granularity) : ""}
        </span>
        <button
          type="button"
          aria-label="Later period"
          disabled={!hasLater}
          onClick={() => setStepsBack((s) => Math.max(0, s - 1))}
          className="rounded-md p-1 text-ink-secondary hover:bg-surface-sunken disabled:opacity-30"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((bucket, index) => (
          <li
            key={`${bucket.key ?? "null"}-${bucket.currency}-${index}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-e1"
          >
            <span className="min-w-0 truncate text-sm font-medium text-ink">
              {rowLabel(bucket, groupBy)}
            </span>
            <span className="shrink-0 text-right text-sm text-ink tabular-nums">
              {formatMoney(bucket.total, bucket.currency)}
              <span className="block text-helper text-ink-tertiary">
                {bucket.count} {bucket.count === 1 ? "repair" : "repairs"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The full cross-tab — rows are keys (a key is split per currency when currencies mix), columns
 * are periods, cells are single-currency totals. */
function PivotTable({
  buckets,
  groupBy,
  granularity,
  className,
}: {
  buckets: SpendBucket[];
  groupBy: SpendGroupBy;
  granularity: SpendGranularity;
  className?: string;
}) {
  const periods = React.useMemo(
    () => [...new Set(buckets.map((b) => b.period_start))].sort(),
    [buckets],
  );

  // A row is (key, currency) — one currency per row, so a total across a row's periods is always
  // in one currency and never a cross-currency sum.
  const rows = React.useMemo(() => {
    const byRow = new Map<
      string,
      { label: string; currency: string; cells: Map<string, SpendBucket>; total: number }
    >();
    for (const bucket of buckets) {
      const rowId = `${bucket.key ?? " null"}::${bucket.currency}`;
      let row = byRow.get(rowId);
      if (!row) {
        row = {
          label: rowLabel(bucket, groupBy),
          currency: bucket.currency,
          cells: new Map(),
          total: 0,
        };
        byRow.set(rowId, row);
      }
      row.cells.set(bucket.period_start, bucket);
      row.total += Number(bucket.total);
    }
    return [...byRow.values()].sort((a, b) => b.total - a.total);
  }, [buckets, groupBy]);

  return (
    <TableCard className={className}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">
                {GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label ?? "Group"}
              </TableHead>
              {periods.map((period) => (
                <TableHead key={period} className="text-right whitespace-nowrap">
                  {periodLabel(period, granularity)}
                </TableHead>
              ))}
              <TableHead className="pr-5 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={`${row.label}-${row.currency}-${index}`}>
                <TableCell className="pl-5 font-medium text-ink">{row.label}</TableCell>
                {periods.map((period) => {
                  const cell = row.cells.get(period);
                  return (
                    <TableCell key={period} className="text-right whitespace-nowrap text-ink-secondary tabular-nums">
                      {cell ? (
                        formatMoney(cell.total, cell.currency)
                      ) : (
                        <span className="text-ink-tertiary">—</span>
                      )}
                    </TableCell>
                  );
                })}
                <TableCell className="pr-5 text-right font-medium text-ink whitespace-nowrap tabular-nums">
                  {formatMoney(row.total, row.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </TableCard>
  );
}
