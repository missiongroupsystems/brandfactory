"use client";

import Link from "next/link";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
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
import { useBrandIndex } from "@/features/brands/hooks";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { filterIdentity, useQueryFilters } from "@/hooks/use-query-filters";
import { useSubmit } from "@/hooks/use-submit";
import type { Entity, EntityStatus } from "@/lib/api/types";
import { PENDING } from "@/lib/format";
import {
  ENTITY_STATUS_LABELS,
  ENTITY_STATUS_OPTIONS,
  ENTITY_STATUS_TONES,
  ENTITY_TYPE_LABELS,
} from "@/lib/labels";

import { useEntityMutations, useEntityPages } from "../hooks";
import { EntityForm } from "./entity-form";

const FILTER_KEYS = ["status", "brand_id", "q"] as const;

/**
 * The entities table.
 *
 * Three filters, which `FilterBar` handles comfortably — unlike `/outlets`, which went to the
 * overflow form when brand took it to five.
 *
 * Still fewer than outlets, and still because the API offers fewer: `status`, `brand_id` and a
 * name search. There is deliberately no **type** filter, because `GET /entities` has no such
 * parameter — adding one here would mean fetching everything and filtering in the browser, which
 * is correct only until the list outgrows one page and then silently stops being correct.
 */
export function EntitiesBrowser() {
  const { filters, setFilter, clearAll, activeCount } = useQueryFilters(FILTER_KEYS);
  const { brands } = useBrandIndex();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Entity | undefined>();

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
            label="Search entities by name or UEN"
            placeholder="Company name or UEN"
            value={filters.q}
            onChange={(value) => setFilter("q", value)}
          />
          <FilterSelect
            label="Filter by status"
            allLabel="All statuses"
            value={filters.status}
            options={ENTITY_STATUS_OPTIONS}
            onChange={(value) => setFilter("status", value)}
          />
          <FilterSelect
            label="Filter by brand"
            allLabel="All brands"
            value={filters.brand_id}
            options={brands.map((brand) => ({ value: brand.id, label: brand.name }))}
            onChange={(value) => setFilter("brand_id", value)}
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
          New entity
        </Button>
      </div>

      <EntityResults
        key={resultsKey}
        filters={resultsFilters}
        onEdit={(entity) => {
          setEditing(entity);
          setFormOpen(true);
        }}
      />

      <EntityForm
        entity={editing}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(undefined);
        }}
      />
    </div>
  );
}

function EntityResults({
  filters,
  onEdit,
}: {
  filters: Partial<Record<(typeof FILTER_KEYS)[number], string>>;
  onEdit: (entity: Entity) => void;
}) {
  const { remove } = useEntityMutations();
  const { byId: brandsById, isLoading: brandsLoading } = useBrandIndex();
  const { run, reset, isPending, formError } = useSubmit();
  const [deleting, setDeleting] = React.useState<Entity | undefined>();

  const { items, error, isLoading, hasMore, isLoadingMore, loadMore } = useEntityPages({
    status: filters.status as EntityStatus | undefined,
    brand_id: filters.brand_id,
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
        message={filtered ? "No entities match these filters" : "No entities yet"}
        hint={
          filtered
            ? "Clear a filter to widen the search."
            : "Add the operating companies first — outlets, licences and contracts all hang off them."
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
              <TableHead className="pl-5">Name</TableHead>
              <TableHead>UEN</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-5 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((entity) => (
              <TableRow key={entity.id}>
                <TableCell className="pl-5">
                  {/* There is no entity detail page — everything an entity has is on this row
                      plus the outlets it holds, so the name links to those rather than to a
                      page that would only repeat this table. */}
                  <Link
                    href={`/outlets?entity_id=${entity.id}`}
                    className="-mx-2 -my-1 block rounded-md px-2 py-1 font-medium text-ink hover:text-brand hover:underline"
                  >
                    {entity.name}
                    <span className="sr-only"> — show this entity&rsquo;s outlets</span>
                  </Link>
                </TableCell>

                <TableCell>
                  <Value mono>{entity.uen}</Value>
                </TableCell>

                <TableCell className="text-ink-secondary">
                  {ENTITY_TYPE_LABELS[entity.entity_type]}
                </TableCell>

                {/* The name resolved through the index, and a link to the brand — the same
                    treatment the outlet detail badge gets. `PENDING` while the fetch is in
                    flight: `brand_id` is a real foreign key, so an em dash here would say this
                    company names no brand, which is a different and false thing. */}
                <TableCell className="max-w-[20ch] truncate text-ink-secondary">
                  {entity.brand_id ? (
                    brandsById.has(entity.brand_id) ? (
                      <Link
                        href={`/brands/${entity.brand_id}`}
                        className="-mx-2 -my-1 inline-block max-w-full truncate rounded-md px-2 py-1 hover:text-brand hover:underline"
                      >
                        {brandsById.get(entity.brand_id)!.name}
                      </Link>
                    ) : (
                      <Value>{brandsLoading ? PENDING : null}</Value>
                    )
                  ) : (
                    <Value>{null}</Value>
                  )}
                </TableCell>

                <TableCell>
                  <Badge variant={ENTITY_STATUS_TONES[entity.status]}>
                    {ENTITY_STATUS_LABELS[entity.status]}
                  </Badge>
                </TableCell>

                <TableCell className="pr-5 text-right">
                  <span className="inline-flex items-center gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => onEdit(entity)}>
                      <PencilIcon />
                      <span className="sr-only">Edit {entity.name}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        reset();
                        setDeleting(entity);
                      }}
                    >
                      <Trash2Icon />
                      <span className="sr-only">Delete {entity.name}</span>
                    </Button>
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>

      <LoadMore
        loadedCount={items.length}
        noun="entity"
        plural="entities"
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
      />

      {/* The API refuses to delete an entity that anything still points at, and that refusal is
          the useful message — it names what is in the way. `ConfirmDialog` keeps the panel open
          on failure so it is readable rather than a toast behind a closing dialog. */}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={`Delete ${deleting?.name ?? "this entity"}?`}
        description="For a row created in error. A company that has held a licence is history — set it to struck off or closed instead, and the record stays attached to what it held."
        onConfirm={handleDelete}
        isPending={isPending}
        error={formError}
      />
    </div>
  );
}
