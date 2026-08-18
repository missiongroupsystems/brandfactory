"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import {
  FilterBar,
  FilterSelect,
  SegmentedControl,
  ToggleButton,
} from "@/components/layout/filter-bar";
import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { LoadMore, TableCard, Value } from "@/components/layout/table-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOutletIndex } from "@/features/registry/hooks";
import { useVendorIndex } from "@/features/registry-vendors/hooks";
import { FLAG_ON, filterIdentity, isFlagOn, useQueryFilters } from "@/hooks/use-query-filters";
import { hasTenancyRent, type TenancyStatus } from "@/lib/api/types";
import { formatDate, formatMonthYear, formatMoney } from "@/lib/format";
import {
  TENANCY_KIND_LABELS,
  TENANCY_STATUS_LABELS,
  TENANCY_STATUS_OPTIONS,
  TENANCY_STATUS_TONES,
} from "@/lib/labels";

import { type TenancyRecord } from "../api";
import { useTenancyPages } from "../hooks";
import { TenancyIntakeSheet } from "./tenancy-intake-sheet";

const FILTER_KEYS = ["outlet", "status", "landlord", "option_gap", "view"] as const;

/** The leases behind the doors. Rent rides behind the sensitive gate; the option-to-renew
 * deadline — the date that loses the site if missed — rides in its own column. */
export function TenanciesView() {
  const { filters, setFilter, setFilters } = useQueryFilters(FILTER_KEYS);
  const { outlets } = useOutletIndex();
  const { vendors } = useVendorIndex();
  const [formOpen, setFormOpen] = React.useState(false);

  const view = filters.view === "all" ? "all" : "current";
  const optionGap = isFlagOn(filters.option_gap);

  // `view` is a view control, not a filter — excluded from the count and kept through Clear.
  // `option_gap` is a boolean flag: count it by the one reading of the URL (`isFlagOn`), never
  // raw truthiness, or `?option_gap=false` reads active in the badge while the toggle reads off.
  const activeCount =
    ["outlet", "status", "landlord"].filter(
      (key) => filters[key as (typeof FILTER_KEYS)[number]],
    ).length + (optionGap ? 1 : 0);

  const resultsKey = filterIdentity(FILTER_KEYS, filters);

  const outletOptions = React.useMemo(
    () => outlets.map((outlet) => ({ value: outlet.id, label: outlet.name })),
    [outlets],
  );
  const landlordOptions = React.useMemo(
    () =>
      vendors
        .filter((vendor) => vendor.kind === "landlord")
        .map((vendor) => ({ value: vendor.id, label: vendor.name })),
    [vendors],
  );

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <FilterBar
          activeCount={activeCount}
          onClear={() =>
            setFilters({
              outlet: undefined,
              status: undefined,
              landlord: undefined,
              option_gap: undefined,
            })
          }
        >
          <FilterSelect
            label="Filter by outlet"
            allLabel="All outlets"
            value={filters.outlet}
            options={outletOptions}
            onChange={(value) => setFilter("outlet", value)}
          />
          <FilterSelect
            label="Filter by status"
            allLabel="All statuses"
            value={filters.status}
            options={TENANCY_STATUS_OPTIONS}
            onChange={(value) => setFilter("status", value)}
          />
          <FilterSelect
            label="Filter by landlord"
            allLabel="All landlords"
            value={filters.landlord}
            options={landlordOptions}
            onChange={(value) => setFilter("landlord", value)}
          />
          {/* A worklist toggle, not a select — the option-to-renew gap is the sharpest thing
              this list surfaces, so it gets a one-tap on/off rather than a menu for a boolean. */}
          <ToggleButton
            pressed={optionGap}
            onPressedChange={(next) => setFilter("option_gap", next ? FLAG_ON : undefined)}
          >
            Option gap
          </ToggleButton>
        </FilterBar>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="Which tenancies to show"
            value={view}
            options={[
              { value: "current", label: "Current" },
              { value: "all", label: "All" },
            ]}
            onChange={(value) => setFilter("view", value === "current" ? undefined : value)}
          />
          <Button className="w-full sm:w-auto" onClick={() => setFormOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Add tenancy
          </Button>
        </div>
      </div>

      <TenancyResults key={resultsKey} filters={filters} />

      <TenancyIntakeSheet open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}

function TenancyResults({
  filters,
}: {
  filters: Partial<Record<(typeof FILTER_KEYS)[number], string>>;
}) {
  const { outlets } = useOutletIndex();
  const { vendors } = useVendorIndex();
  const outletById = React.useMemo(
    () => new Map(outlets.map((outlet) => [outlet.id, outlet.name])),
    [outlets],
  );
  const landlordById = React.useMemo(
    () => new Map(vendors.map((vendor) => [vendor.id, vendor.name])),
    [vendors],
  );

  const { items, error, isLoading, hasMore, isLoadingMore, loadMore } = useTenancyPages({
    outlet_id: filters.outlet,
    status: filters.status as TenancyStatus | undefined,
    landlord_id: filters.landlord,
    option_gap: isFlagOn(filters.option_gap) ? true : undefined,
    view: filters.view === "all" ? "all" : "current",
  });

  if (error) return <QueryError error={error} />;
  if (isLoading) return <LoadingRows rows={4} />;

  if (items.length === 0) {
    const filtered = Boolean(
      filters.outlet || filters.status || filters.landlord || isFlagOn(filters.option_gap),
    );
    return (
      <EmptyState
        message={filtered ? "No tenancies match these filters" : "No tenancies yet"}
        hint={
          filtered
            ? "Clear a filter to widen the search."
            : "Add the lease behind each outlet — its rent, its renewal window and its landlord."
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Below sm the table becomes cards — the 0.17.0 rule. Seven columns clipped to a
          column and a half is not a mobile view. */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {items.map((tenancy) => (
          <TenancyCard
            key={tenancy.id}
            tenancy={tenancy}
            outletName={outletById.get(tenancy.outlet_id)}
            landlordName={
              tenancy.landlord_id ? landlordById.get(tenancy.landlord_id) : undefined
            }
          />
        ))}
      </ul>

      <TableCard className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Outlet</TableHead>
              <TableHead>Landlord</TableHead>
              <TableHead>Kind</TableHead>
              {/* Term carries the end date; a separate Expiry column repeated it and cost the
                  table 100px it did not have — dropped, per the compression rule. */}
              <TableHead>Term</TableHead>
              <TableHead>Option by</TableHead>
              <TableHead className="text-right">Rent</TableHead>
              <TableHead className="pr-5">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((tenancy) => (
              <TableRow key={tenancy.id}>
                <TableCell className="max-w-[18ch] pl-5">
                  <Link
                    href={`/tenancies/${tenancy.id}`}
                    title={outletById.get(tenancy.outlet_id) ?? undefined}
                    className="-mx-2 -my-1 block truncate rounded-md px-2 py-1 font-medium text-ink hover:text-brand hover:underline"
                  >
                    {outletById.get(tenancy.outlet_id) ?? "…"}
                  </Link>
                  {tenancy.premises_description ? (
                    <span
                      className="block max-w-[18ch] truncate text-helper text-ink-tertiary"
                      title={tenancy.premises_description}
                    >
                      {tenancy.premises_description}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="max-w-[12ch] text-ink-secondary">
                  {tenancy.landlord_id ? (
                    <span
                      className="block truncate"
                      title={landlordById.get(tenancy.landlord_id) ?? undefined}
                    >
                      {landlordById.get(tenancy.landlord_id) ?? "…"}
                    </span>
                  ) : (
                    <Value>{null}</Value>
                  )}
                </TableCell>
                <TableCell className="text-ink-secondary">
                  {TENANCY_KIND_LABELS[tenancy.kind]}
                </TableCell>
                <TableCell className="text-ink-secondary whitespace-nowrap">
                  {tenancy.start_date || tenancy.end_date
                    ? `${formatMonthYear(tenancy.start_date)} — ${formatMonthYear(tenancy.end_date)}`
                    : "—"}
                </TableCell>
                <TableCell className="text-ink-secondary whitespace-nowrap">
                  <Value>
                    {tenancy.option_deadline ? formatDate(tenancy.option_deadline) : null}
                  </Value>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <RentCell tenancy={tenancy} />
                </TableCell>
                <TableCell className="pr-5">
                  <Badge variant={TENANCY_STATUS_TONES[tenancy.status]}>
                    {TENANCY_STATUS_LABELS[tenancy.status]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>

      <LoadMore
        loadedCount={items.length}
        noun="tenancy"
        plural="tenancies"
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
      />
    </div>
  );
}

/** The sub-`sm` card for one lease — the mobile face of the table, the same swap `filed-view`
 * makes. Rent rides behind the same gate; the option-to-renew date keeps its own line. */
function TenancyCard({
  tenancy,
  outletName,
  landlordName,
}: {
  tenancy: TenancyRecord;
  outletName: string | undefined;
  landlordName: string | undefined;
}) {
  const term =
    tenancy.start_date || tenancy.end_date
      ? `${formatDate(tenancy.start_date)} — ${formatDate(tenancy.end_date)}`
      : "—";

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-e1">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/tenancies/${tenancy.id}`}
            className="block truncate text-sm font-medium text-ink hover:text-brand hover:underline"
          >
            {outletName ?? "…"}
          </Link>
          {tenancy.premises_description ? (
            <span className="mt-0.5 block truncate text-helper text-ink-tertiary">
              {tenancy.premises_description}
            </span>
          ) : null}
        </div>
        <Badge variant={TENANCY_STATUS_TONES[tenancy.status]}>
          {TENANCY_STATUS_LABELS[tenancy.status]}
        </Badge>
      </div>
      <p className="text-helper text-ink-tertiary">
        {tenancy.landlord_id ? (landlordName ?? "…") : "—"} · {TENANCY_KIND_LABELS[tenancy.kind]}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="flex flex-col">
          <dt className="text-helper text-ink-tertiary">Term</dt>
          <dd className="text-ink-secondary">{term}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-helper text-ink-tertiary">Option by</dt>
          <dd className="text-ink-secondary">
            {tenancy.option_deadline ? formatDate(tenancy.option_deadline) : "—"}
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-helper text-ink-tertiary">Rent</dt>
          <dd>
            <RentCell tenancy={tenancy} />
          </dd>
        </div>
      </dl>
    </li>
  );
}

/** "A rent is on file, you cannot see it" is a real, distinct state from "no rent recorded" —
 * `has_base_rent` (on both shapes) is what tells them apart. */
function RentCell({ tenancy }: { tenancy: TenancyRecord }) {
  if (hasTenancyRent(tenancy)) {
    return <span className="text-ink-secondary">{formatMoney(tenancy.base_rent)}</span>;
  }
  if (tenancy.has_base_rent) {
    return <span className="text-helper text-ink-tertiary">Restricted</span>;
  }
  return <Value>{null}</Value>;
}
