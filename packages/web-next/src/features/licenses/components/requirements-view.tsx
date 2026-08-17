"use client";

import Link from "next/link";

import { FilterBar, FilterSelect } from "@/components/layout/filter-bar";
import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { LoadMore, TableCard, Value } from "@/components/layout/table-card";
import { Badge } from "@/components/ui/badge";
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
import type { Necessity, RequirementStatus } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import {
  NECESSITY_LABELS,
  NECESSITY_OPTIONS,
  NECESSITY_TONES,
  REQUIREMENT_STATUS_LABELS,
  REQUIREMENT_STATUS_OPTIONS,
  REQUIREMENT_STATUS_TONES,
} from "@/lib/labels";

import { useLicenseTypeIndex, useRequirementPages } from "../hooks";

const FILTER_KEYS = ["status", "necessity", "outlet_id"] as const;

/**
 * Every requirement across the group — the cross-outlet answer to "what do we still
 * need anywhere". Editing happens on the outlet's own page, next to the attributes
 * that proposed it and the accept/dismiss controls; this view is for finding, and each
 * row links there.
 */
export function RequirementsView() {
  const { filters, setFilter, clearAll, activeCount, filterKey } =
    useQueryFilters(FILTER_KEYS);
  const { outlets } = useOutletIndex();

  return (
    <div className="flex flex-col gap-4">
      <FilterBar activeCount={activeCount} onClear={clearAll}>
        <FilterSelect
          label="Filter by status"
          allLabel="All statuses"
          value={filters.status}
          options={REQUIREMENT_STATUS_OPTIONS}
          onChange={(value) => setFilter("status", value)}
        />
        <FilterSelect
          label="Filter by necessity"
          allLabel="All necessities"
          value={filters.necessity}
          options={NECESSITY_OPTIONS}
          onChange={(value) => setFilter("necessity", value)}
        />
        <FilterSelect
          label="Filter by outlet"
          allLabel="All outlets"
          value={filters.outlet_id}
          options={outlets.map((o) => ({ value: o.id, label: o.name }))}
          onChange={(value) => setFilter("outlet_id", value)}
        />
      </FilterBar>

      <RequirementResults key={filterKey} filters={filters} />
    </div>
  );
}

function RequirementResults({
  filters,
}: {
  filters: Partial<Record<(typeof FILTER_KEYS)[number], string>>;
}) {
  const { byId: typeById } = useLicenseTypeIndex();
  const { byId: outletById } = useOutletIndex();
  const { byId: entityById } = useEntityIndex();

  const { items, error, isLoading, hasMore, isLoadingMore, loadMore } =
    useRequirementPages({
      status: filters.status as RequirementStatus | undefined,
      necessity: filters.necessity as Necessity | undefined,
      outlet_id: filters.outlet_id,
    });

  if (error) return <QueryError error={error} />;
  if (isLoading) return <LoadingRows rows={5} />;

  if (items.length === 0) {
    const filtered = Object.values(filters).some(Boolean);
    return (
      <EmptyState
        message={
          filtered ? "No requirements match these filters" : "No requirements recorded yet"
        }
        hint={
          filtered
            ? "Clear a filter to widen the search."
            : "Requirements are raised on an outlet's own page — tick its attributes and accept what the library proposes."
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
              <TableHead className="pl-5">Requirement</TableHead>
              <TableHead>Where</TableHead>
              <TableHead>Necessity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-5">Target date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((requirement) => {
              const type = typeById.get(requirement.license_type_id);
              const outlet = requirement.outlet_id
                ? outletById.get(requirement.outlet_id)
                : undefined;
              const entity = requirement.entity_id
                ? entityById.get(requirement.entity_id)
                : undefined;
              // Past-target on a still-required row is the "meeting two months later"
              // case, surfaced where it can be seen.
              const overdue =
                requirement.status === "required" &&
                Boolean(
                  requirement.target_date &&
                    requirement.target_date < new Date().toISOString().slice(0, 10),
                );
              return (
                <TableRow key={requirement.id}>
                  <TableCell className="pl-5">
                    <span className="font-medium text-ink">
                      {type?.name ?? "Unknown type"}
                    </span>
                    {requirement.rationale ? (
                      <span className="mt-0.5 block text-helper text-ink-tertiary">
                        {requirement.rationale}
                      </span>
                    ) : null}
                  </TableCell>

                  <TableCell className="text-ink-secondary">
                    {outlet ? (
                      <Link
                        href={`/outlets/${outlet.id}`}
                        className="hover:text-brand hover:underline"
                      >
                        {outlet.name}
                      </Link>
                    ) : (
                      <span>{entity?.name ?? "Entity-level"}</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <Badge variant={NECESSITY_TONES[requirement.necessity]}>
                      {NECESSITY_LABELS[requirement.necessity]}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <Badge variant={REQUIREMENT_STATUS_TONES[requirement.status]}>
                      {REQUIREMENT_STATUS_LABELS[requirement.status]}
                    </Badge>
                  </TableCell>

                  <TableCell className="pr-5">
                    <span className={overdue ? "text-warning" : "text-ink-secondary"}>
                      <Value>
                        {requirement.target_date ? formatDate(requirement.target_date) : null}
                      </Value>
                      {overdue ? (
                        <span className="block text-helper">Past target</span>
                      ) : null}
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
        noun="requirement"
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
      />
    </div>
  );
}
