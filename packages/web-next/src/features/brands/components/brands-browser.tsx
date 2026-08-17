"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { FilterBar, FilterSelect, SearchField } from "@/components/layout/filter-bar";
import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { LoadMore, TableCard, Value } from "@/components/layout/table-card";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { filterIdentity, useQueryFilters } from "@/hooks/use-query-filters";
import { useSubmit } from "@/hooks/use-submit";
import type { Brand, BrandStatus } from "@/lib/api/types";
import { BRAND_STATUS_LABELS, BRAND_STATUS_OPTIONS, BRAND_STATUS_TONES } from "@/lib/labels";

import { useBrandMutations, useBrandPages } from "../hooks";
import { BrandForm } from "./brand-form";

const FILTER_KEYS = ["q", "status"] as const;

/** The catalogue. Two filters, which keeps `FilterBar` well inside the four it handles. */
export function BrandsBrowser() {
  const { filters, setFilter, clearAll, activeCount } = useQueryFilters(FILTER_KEYS);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Brand | undefined>();

  // Debounced *here*, above the remount boundary — see filterIdentity's docstring.
  const debouncedQ = useDebouncedValue(filters.q, 250);
  const resultsFilters = React.useMemo(
    () => ({ ...filters, q: debouncedQ }),
    [filters, debouncedQ],
  );
  const resultsKey = filterIdentity(FILTER_KEYS, resultsFilters);

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <FilterBar activeCount={activeCount} onClear={clearAll}>
          <SearchField
            label="Search brands by name"
            placeholder="Brand name"
            value={filters.q}
            onChange={(value) => setFilter("q", value)}
          />
          <FilterSelect
            label="Filter by status"
            allLabel="All statuses"
            value={filters.status}
            options={BRAND_STATUS_OPTIONS}
            onChange={(value) => setFilter("status", value)}
          />
        </FilterBar>

        <Button
          className="w-full sm:w-auto"
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <PlusIcon data-icon="inline-start" />
          New brand
        </Button>
      </div>

      <BrandResults
        key={resultsKey}
        filters={resultsFilters}
        onEdit={(brand) => {
          setEditing(brand);
          setFormOpen(true);
        }}
      />

      <BrandForm
        brand={editing}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(undefined);
        }}
      />
    </div>
  );
}

function BrandResults({
  filters,
  onEdit,
}: {
  filters: Partial<Record<(typeof FILTER_KEYS)[number], string>>;
  onEdit: (brand: Brand) => void;
}) {
  const { remove } = useBrandMutations();
  const { run, reset, isPending, formError } = useSubmit();
  const [deleting, setDeleting] = React.useState<Brand | undefined>();

  const { items, error, isLoading, hasMore, isLoadingMore, loadMore } = useBrandPages({
    status: filters.status as BrandStatus | undefined,
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
    const filtered = Object.values(filters).some(Boolean);
    return (
      <EmptyState
        message={filtered ? "No brands match these filters" : "No brands yet"}
        hint={
          filtered
            ? "Clear a filter to widen the search."
            : "A brand is a name several premises share. One that is only over one door is that outlet's name, not a brand — and a brand with no premises yet is fine, if the concept exists before the site does."
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
              <TableHead className="pl-5">Brand</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Outlets</TableHead>
              <TableHead>Companies</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="pr-5 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((brand) => (
              <TableRow key={brand.id}>
                <TableCell className="max-w-[28ch] pl-5">
                  {/* A link, not a button opening a sheet — middle-clickable, and its address
                      is copyable, which is the whole reason a brand needed an id. */}
                  <Link
                    href={`/brands/${brand.id}`}
                    title={brand.name}
                    className="-mx-2 -my-1 block truncate rounded-md px-2 py-1 font-medium text-ink hover:text-brand hover:underline"
                  >
                    {brand.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={BRAND_STATUS_TONES[brand.status]}>
                    {BRAND_STATUS_LABELS[brand.status]}
                  </Badge>
                </TableCell>
                {/* Both counts come off the row, not from a client-side index — so they are
                    never a derived "0" standing in for a request that has not arrived, and
                    they are scoped server-side to the outlets this caller may see. */}
                <TableCell className="text-ink-secondary">
                  {brand.outlet_count > 0 ? brand.outlet_count : <Value>{null}</Value>}
                </TableCell>
                <TableCell className="text-ink-secondary">
                  {brand.entity_count > 0 ? brand.entity_count : <Value>{null}</Value>}
                </TableCell>
                <TableCell className="max-w-[40ch] truncate text-ink-secondary">
                  <Value>{brand.notes}</Value>
                </TableCell>
                <TableCell className="pr-5 text-right">
                  <span className="inline-flex items-center gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => onEdit(brand)}>
                      <PencilIcon />
                      <span className="sr-only">Edit {brand.name}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        reset();
                        setDeleting(brand);
                      }}
                    >
                      <Trash2Icon />
                      <span className="sr-only">Delete {brand.name}</span>
                    </Button>
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>

      {/* "3 brands loaded", never "3 brands" — the API returns `next_cursor` and no count. */}
      <LoadMore
        loadedCount={items.length}
        noun="brand"
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={`Delete ${deleting?.name ?? "this brand"}?`}
        description="For a row created in error. A brand that closed should be retired — its outlets keep it that way, and every past report grouped by brand still says what it said."
        onConfirm={handleDelete}
        isPending={isPending}
        error={formError}
      />
    </div>
  );
}
