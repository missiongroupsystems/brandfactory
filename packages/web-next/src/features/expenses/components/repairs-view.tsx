"use client";

import { FileTextIcon, Loader2Icon, PaperclipIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { FilterBar, FilterSelect } from "@/components/layout/filter-bar";
import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { LoadMore, TableCard, Value } from "@/components/layout/table-card";
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
import { useVendorIndex } from "@/features/vendors/hooks";
import { filterIdentity, useQueryFilters } from "@/hooks/use-query-filters";
import type { Expense, RepairCategory } from "@/lib/api/types";
import { formatDate, formatMoney, PENDING } from "@/lib/format";
import {
  REPAIR_CATEGORY_ICONS,
  REPAIR_CATEGORY_LABELS,
  REPAIR_CATEGORY_OPTIONS,
} from "@/lib/labels";

import { useExpensePages, useOpenExpenseDocument } from "../hooks";

const FILTER_KEYS = ["outlet_id", "category", "vendor_id"] as const;

type Filters = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

/**
 * **Repairs** — the `expense` log, `purpose = repair`. Its own view in the Servicing & Repairs
 * area, never intermixed with the Filed service reports: a repair has no cadence and no contract
 * of its own, so it would have no display identity spliced into that log.
 *
 * Three filters — outlet, category, vendor — so a `FilterBar` is the right form (four is its
 * ceiling; the date window is the summary view's job). Row identity is the expense's **own**:
 * category + outlet, with no contract indirection and therefore no permanent `…`.
 */
export function RepairsView() {
  const { filters, setFilter, setFilters } = useQueryFilters(FILTER_KEYS);
  const { outlets } = useOutletIndex();
  const { vendors } = useVendorIndex();

  const outletOptions = React.useMemo(
    () => outlets.map((outlet) => ({ value: outlet.id, label: outlet.name })),
    [outlets],
  );
  const vendorOptions = React.useMemo(
    () => vendors.map((vendor) => ({ value: vendor.id, label: vendor.name })),
    [vendors],
  );

  const activeCount = FILTER_KEYS.filter((key) => filters[key]).length;
  const resultsKey = filterIdentity(FILTER_KEYS, filters);

  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        activeCount={activeCount}
        onClear={() =>
          setFilters({ outlet_id: undefined, category: undefined, vendor_id: undefined })
        }
      >
        <FilterSelect
          label="Filter by outlet"
          allLabel="All outlets"
          value={filters.outlet_id}
          options={outletOptions}
          onChange={(value) => setFilter("outlet_id", value)}
        />
        <FilterSelect
          label="Filter by category"
          allLabel="All categories"
          value={filters.category}
          options={REPAIR_CATEGORY_OPTIONS}
          onChange={(value) => setFilter("category", value)}
        />
        <FilterSelect
          label="Filter by vendor"
          allLabel="All vendors"
          value={filters.vendor_id}
          options={vendorOptions}
          onChange={(value) => setFilter("vendor_id", value)}
        />
      </FilterBar>

      <RepairsResults key={resultsKey} filters={filters} />
    </div>
  );
}

function RepairsResults({ filters }: { filters: Filters }) {
  const { byId: outletById } = useOutletIndex();
  const { byId: vendorById } = useVendorIndex();

  const { items, error, isLoading, hasMore, isLoadingMore, loadMore } = useExpensePages({
    outlet_id: filters.outlet_id,
    category: filters.category as RepairCategory | undefined,
    vendor_id: filters.vendor_id,
  });

  if (error) return <QueryError error={error} />;
  if (isLoading) return <LoadingRows rows={5} />;

  if (items.length === 0) {
    const filtered = Object.values(filters).some(Boolean);
    return filtered ? (
      <EmptyState
        message="No repairs match these filters"
        hint="Clear a filter to widen the search."
      />
    ) : (
      <EmptyState
        message="No repairs recorded yet"
        hint="Record one here — an outlet's repair, its cost, and a photo of the invoice."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Below sm, cards — six columns clipped to a column and a half is not a mobile view
          (the 0.17.0 rule). */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {items.map((expense) => (
          <RepairCard
            key={expense.id}
            expense={expense}
            outletName={outletById.get(expense.outlet_id)?.name}
            vendorName={expense.vendor_id ? vendorById.get(expense.vendor_id)?.name : undefined}
          />
        ))}
      </ul>

      <TableCard className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Outlet</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Incurred</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="pr-5">Document</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((expense) => {
              const outlet = outletById.get(expense.outlet_id);
              return (
                <TableRow key={expense.id}>
                  <TableCell className="max-w-[18ch] pl-5">
                    {outlet ? (
                      <Link
                        href={`/outlets/${outlet.id}`}
                        title={outlet.name}
                        className="block truncate font-medium text-ink hover:text-brand hover:underline"
                      >
                        {outlet.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{PENDING}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-ink-secondary">
                    <CategoryLabel category={expense.category} />
                  </TableCell>
                  <TableCell className="max-w-[16ch] text-ink-secondary">
                    <VendorName expense={expense} name={vendorNameOf(expense, vendorById)} />
                  </TableCell>
                  <TableCell className="text-ink-secondary whitespace-nowrap">
                    {formatDate(expense.incurred_on)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap font-medium text-ink tabular-nums">
                    {formatMoney(expense.amount, expense.currency)}
                  </TableCell>
                  <TableCell className="pr-5">
                    <DocumentCell expense={expense} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>

      <LoadMore
        loadedCount={items.length}
        noun="repair"
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
      />
    </div>
  );
}

function vendorNameOf(expense: Expense, byId: Map<string, { name: string }>): string | null {
  // A null `vendor_id` is a **real** "no vendor" (a one-off tradesman), not a pending fetch — so
  // it renders as an em dash, while an id not yet in the index renders `…`.
  if (!expense.vendor_id) return null;
  return byId.get(expense.vendor_id)?.name ?? PENDING;
}

function VendorName({ expense, name }: { expense: Expense; name: string | null }) {
  if (expense.vendor_id && name && name !== PENDING) {
    return (
      <Link
        href={`/vendors/${expense.vendor_id}`}
        title={name}
        className="block truncate hover:text-brand hover:underline"
      >
        {name}
      </Link>
    );
  }
  return <Value>{name}</Value>;
}

/** The trade, as a glyph plus its word. `other`/null render the label alone — the escape-hatch
 * category is deliberately the absence of a symbol, not a symbol for "other". */
function CategoryLabel({ category }: { category: RepairCategory | null | undefined }) {
  if (!category) return <span className="text-ink-tertiary">Unclassified</span>;
  const Icon = REPAIR_CATEGORY_ICONS[category];
  return (
    <span className="inline-flex items-center gap-2">
      {category !== "other" ? (
        <Icon aria-hidden className="size-4 shrink-0 text-ink-tertiary" />
      ) : null}
      {REPAIR_CATEGORY_LABELS[category]}
    </span>
  );
}

/**
 * The invoice/receipt photo, and the absence of one.
 *
 * A repair with no document renders visibly incomplete, in words and in ochre — a filing without
 * paper is a legitimate outcome the sheet offers on purpose ("without document"), and it is what
 * Ops chases. One document opens in one request; the row carries only the count, so the id is
 * fetched on click.
 */
function DocumentCell({ expense }: { expense: Expense }) {
  const { open, pendingId } = useOpenExpenseDocument();
  const pending = pendingId === expense.id;

  if (expense.attachment_count === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-helper text-warning">
        <PaperclipIcon aria-hidden className="size-3.5 shrink-0" />
        No document
      </span>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        void open(expense.id).catch((cause: unknown) => {
          toast.error(cause instanceof Error ? cause.message : "Could not open the document.");
        });
      }}
    >
      {pending ? (
        <Loader2Icon data-icon="inline-start" className="animate-spin" />
      ) : (
        <FileTextIcon data-icon="inline-start" />
      )}
      Open
    </Button>
  );
}

/** One repair, on a phone. Nothing truncated — a card is its own width. */
function RepairCard({
  expense,
  outletName,
  vendorName,
}: {
  expense: Expense;
  outletName: string | undefined;
  vendorName: string | undefined;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-e1">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/outlets/${expense.outlet_id}`}
          className="text-sm font-medium text-ink hover:text-brand hover:underline"
        >
          {outletName ?? PENDING}
        </Link>
        <span className="shrink-0 font-medium text-ink tabular-nums">
          {formatMoney(expense.amount, expense.currency)}
        </span>
      </div>

      <p className="text-helper text-ink-tertiary">
        <CategoryLabel category={expense.category} />
        {vendorName ? ` · ${vendorName}` : ""}
        <span className="mt-0.5 block">Incurred {formatDate(expense.incurred_on)}</span>
      </p>

      <DocumentCell expense={expense} />
    </li>
  );
}
