"use client";

import { PencilIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { AddMenuButton } from "@/components/layout/add-menu-button";
import {
  FilterBar,
  FilterSelect,
  SearchField,
  SegmentedControl,
} from "@/components/layout/filter-bar";
import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { LoadMore, TableCard, Value } from "@/components/layout/table-card";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyableUen } from "@/components/ui/copyable-uen";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { filterIdentity, useQueryFilters } from "@/hooks/use-query-filters";
import { useSubmit } from "@/hooks/use-submit";
import type { VendorKind, VendorListItem, VendorStatus } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import {
  SERVICE_CATEGORY_LABELS,
  VENDOR_KIND_OPTIONS,
  VENDOR_STATUS_LABELS,
  VENDOR_STATUS_OPTIONS,
  VENDOR_STATUS_TONES,
} from "@/lib/labels";

import { useVendorMutations, useVendorPages } from "../hooks";
import { VendorForm } from "./vendor-form";

/** `q` and `status`, matching every other list screen.
 *
 * They were `vq` and `vstatus` while this table was a tab on `/contracts`, where three
 * views shared one URL and `q` was already the contracts table's. On a page of its own
 * that prefix buys nothing, and the redirect in `/contracts/page.tsx` translates old
 * links so nothing pasted before 0.13.0 stops working. */
const FILTER_KEYS = ["q", "status", "kind"] as const;

/** Which counterparty kind the list shows. A **view control, not a filter** — the default is
 * `service_provider`, shown on screen, so a landlord never silently disappears from an
 * unfiltered `/vendors` (tas.md §2.2). Selecting "Service providers" clears the param to keep
 * the default link clean; "Landlords" and "All" set it explicitly. */
const KIND_VIEW_OPTIONS = [...VENDOR_KIND_OPTIONS, { value: "all", label: "All" }] as const;

/** The counterparties. Service providers by default; landlords are one segment away. The
 * primary contact rides in the table — "who do I call" without opening anything. */
export function VendorsView() {
  const { filters, setFilter, setFilters } = useQueryFilters(FILTER_KEYS);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<VendorListItem | undefined>();

  // Absent means the default, `service_provider` — not "all". That is the whole point: the
  // filter is visible and defaulted, never a hidden WHERE.
  const kind = filters.kind ?? "service_provider";

  // `kind` is a view control, so it is excluded from the filter count and survives Clear —
  // the same split the review queue and contracts make for their view controls.
  const activeCount = ["q", "status"].filter((key) => filters[key as "q" | "status"]).length;

  // Debounced *here*, above the remount boundary — see filterIdentity's docstring.
  const debouncedQ = useDebouncedValue(filters.q, 250);
  const resultsFilters = React.useMemo(
    () => ({ ...filters, kind, q: debouncedQ }),
    [filters, kind, debouncedQ],
  );
  const resultsKey = filterIdentity(FILTER_KEYS, resultsFilters);

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <FilterBar
          activeCount={activeCount}
          // `setFilters`, not `clearAll`: clearing the *filters* must not throw the reader out
          // of the counterparty view they chose, exactly as the review queue keeps its view.
          onClear={() => setFilters({ q: undefined, status: undefined })}
        >
          <SearchField
            label="Search vendors by name"
            placeholder="Vendor name"
            value={filters.q}
            onChange={(value) => setFilter("q", value)}
          />
          <FilterSelect
            label="Filter by status"
            allLabel="All statuses"
            value={filters.status}
            options={VENDOR_STATUS_OPTIONS}
            onChange={(value) => setFilter("status", value)}
          />
        </FilterBar>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="Which vendors to show"
            value={kind}
            options={KIND_VIEW_OPTIONS}
            onChange={(value) =>
              setFilter("kind", value === "service_provider" ? undefined : value)
            }
          />
          {/* F3: the primary action is now a split button — Manual add (this form) or Upload
              (a drop-a-PDF popup, UI only). */}
          <AddMenuButton
            label="New vendor"
            noun="vendor"
            className="w-full sm:w-auto"
            onManualAdd={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          />
        </div>
      </div>

      <VendorResults
        key={resultsKey}
        filters={resultsFilters}
        onEdit={(vendor) => {
          setEditing(vendor);
          setFormOpen(true);
        }}
      />

      <VendorForm
        vendor={editing}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(undefined);
        }}
      />
    </div>
  );
}

function VendorResults({
  filters,
  onEdit,
}: {
  filters: Partial<Record<(typeof FILTER_KEYS)[number], string>>;
  onEdit: (vendor: VendorListItem) => void;
}) {
  const { remove } = useVendorMutations();
  const { run, reset, isPending, formError } = useSubmit();
  const [deleting, setDeleting] = React.useState<VendorListItem | undefined>();

  const { items, error, isLoading, hasMore, isLoadingMore, loadMore } = useVendorPages({
    // "all" is the one segment that sends no `kind` — it is the absence of the filter, not a
    // value the API knows. `service_provider` and `landlord` go through verbatim.
    kind: filters.kind === "all" ? undefined : (filters.kind as VendorKind | undefined),
    status: filters.status as VendorStatus | undefined,
    q: filters.q, // already debounced by the parent, which keys this component on it
  });

  async function handleDelete() {
    if (!deleting) return;
    const ok = await run(async () => {
      await remove(deleting.id);
      toast.success(`${deleting.name} deleted`);
    });
    if (ok) setDeleting(undefined);
  }

  if (error) return <QueryError error={error} />;
  if (isLoading) return <LoadingRows rows={4} />;

  if (items.length === 0) {
    // `kind` is always set (it defaults to `service_provider`), so it cannot go in a
    // truthiness sweep — the default view with no rows is "No vendors yet", not "no match".
    // A non-default segment (landlords / all) or a real filter counts as filtered.
    const filtered =
      Boolean(filters.q || filters.status) || filters.kind !== "service_provider";
    return (
      <EmptyState
        message={filtered ? "No vendors match these filters" : "No vendors yet"}
        hint={
          filtered
            ? "Clear a filter to widen the search."
            : "Add the service companies first — every contract hangs off one."
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Vendor</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Contracts</TableHead>
              {/* Was "Coverage" and counted outlets. A contract names brands now, so the
                  column counts what it can actually count — see `VendorListItem`. */}
              <TableHead>Brands</TableHead>
              <TableHead>Next end</TableHead>
              <TableHead>Primary contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-5 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((vendor) => {
              const primary = vendor.contacts.find((c) => c.is_primary);
              return (
                <TableRow key={vendor.id}>
                  {/* 24ch, truncating, for the reason the contracts title carries the same cap:
                      a table is as wide as its longest cell, and uncapped this column measured
                      **323px** on 47 rows — set by one 44-character name
                      ("Refrigeration Engineering Industries Pte Ltd") on behalf of every other
                      row. The distinguishing part of a company name is at the front and the
                      "Pte Ltd" suffix is on most of them, so the front is what survives. Full
                      text on hover, and one click away on the detail page. */}
                  <TableCell className="max-w-[24ch] pl-5">
                    {/* A link, not a button opening a sheet — which also makes it
                        middle-clickable and its address copyable, as a sheet never was. */}
                    <Link
                      href={`/vendors/${vendor.id}`}
                      title={vendor.name}
                      className="-mx-2 -my-1 block truncate rounded-md px-2 py-1 text-left font-medium text-ink hover:text-brand hover:underline"
                    >
                      {vendor.name}
                    </Link>
                    {vendor.uen ? <CopyableUen uen={vendor.uen} className="mt-0.5" /> : null}
                  </TableCell>
                  {/* 20ch — the cap was set when this column held raw Lark strings and
                      "Dishwashing Machine / Chemical" (30 chars) was driving a 236px column for
                      one row. 0.16.0 closed the column onto `ServiceCategory`, whose longest
                      label is "Equipment maintenance" at 21, so the cap now bites on one value
                      by a single character. Kept rather than removed: it costs nothing, and the
                      truncation is still lossless because `title` carries the full label.

                      **The label, not the stored value.** The column holds `pest_control` now,
                      not "Pest Control" — rendering it raw would put a slug on screen, which is
                      what the migration would otherwise have shipped and what no typecheck can
                      see. */}
                  <TableCell className="max-w-[20ch] text-ink-secondary">
                    {vendor.category ? (
                      <span
                        className="block truncate"
                        title={SERVICE_CATEGORY_LABELS[vendor.category]}
                      >
                        {SERVICE_CATEGORY_LABELS[vendor.category]}
                      </span>
                    ) : (
                      <Value>{null}</Value>
                    )}
                  </TableCell>
                  <TableCell className="text-ink-secondary">
                    {vendor.contracts_total > 0 ? (
                      `${vendor.contracts_active}/${vendor.contracts_total}`
                    ) : (
                      <Value>{null}</Value>
                    )}
                  </TableCell>
                  <TableCell className="text-ink-secondary">
                    {/* Zero is a real answer here and not a gap — a vendor whose only live
                        agreement is held at group level works on no *named* brand — so it is
                        worded rather than left to the em dash, which this table reads as
                        "not recorded". */}
                    {vendor.brands_covered > 0 ? (
                      `${vendor.brands_covered} ${vendor.brands_covered === 1 ? "brand" : "brands"}`
                    ) : vendor.contracts_active > 0 ? (
                      <span className="text-ink-tertiary">Group level</span>
                    ) : (
                      <Value>{null}</Value>
                    )}
                  </TableCell>
                  <TableCell className="text-ink-secondary">
                    <Value>
                      {vendor.next_contract_end ? formatDate(vendor.next_contract_end) : null}
                    </Value>
                  </TableCell>
                  {/* 18ch is the longest primary contact in the data today ("Homeworks
                      accounts"), so nothing truncates on this dataset. Capped anyway, and for
                      the reason the contracts Brand column is: it is free text, and one long
                      one typed next week would otherwise widen the table on behalf of a single
                      row. A cap that bites on no current row is the cheap half of this fix. */}
                  <TableCell className="max-w-[18ch] text-ink-secondary">
                    {primary ? (
                      <>
                        <span className="block truncate" title={primary.name}>
                          {primary.name}
                        </span>
                        {primary.phone ? (
                          <span className="mt-0.5 block truncate font-mono text-helper text-ink-tertiary">
                            {primary.phone}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <Value>{null}</Value>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={VENDOR_STATUS_TONES[vendor.status]}>
                      {VENDOR_STATUS_LABELS[vendor.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <span className="inline-flex items-center gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => onEdit(vendor)}>
                        <PencilIcon />
                        <span className="sr-only">Edit {vendor.name}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          reset();
                          setDeleting(vendor);
                        }}
                      >
                        <Trash2Icon />
                        <span className="sr-only">Delete {vendor.name}</span>
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>

      <LoadMore
        loadedCount={items.length}
        noun="vendor"
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={`Delete ${deleting?.name ?? "this vendor"}?`}
        description="For a row created in error. A vendor we stopped using should be set inactive — its contracts keep their history that way."
        onConfirm={handleDelete}
        isPending={isPending}
        error={formError}
      />
    </div>
  );
}
