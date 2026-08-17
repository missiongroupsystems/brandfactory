"use client";

import Link from "next/link";
import { PencilIcon } from "lucide-react";
import * as React from "react";

import { AddMenuButton } from "@/components/layout/add-menu-button";
import { FilterBar, FilterSelect, SearchField } from "@/components/layout/filter-bar";
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
import { useEntityIndex, useOutletIndex } from "@/features/registry/hooks";
import { useQueryFilters } from "@/hooks/use-query-filters";
import type { License, LicenseStatus } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { LICENSE_STATUS_LABELS, LICENSE_STATUS_OPTIONS, LICENSE_STATUS_TONES } from "@/lib/labels";

import { useLicensePages, useLicenseTypeIndex } from "../hooks";
import { LicenseForm } from "./license-form";

const FILTER_KEYS = ["q", "status", "outlet_id", "entity_id", "type_id"] as const;

/** What we actually hold, across every outlet and entity. Capability (C). */
export function HeldView() {
  const { filters, setFilter, clearAll, activeCount, filterKey } =
    useQueryFilters(FILTER_KEYS);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<License | undefined>();

  const { outlets } = useOutletIndex();
  const { entities } = useEntityIndex();
  const { types } = useLicenseTypeIndex();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <FilterBar activeCount={activeCount} onClear={clearAll}>
          {/* A held licence has no name of its own, so this searches the licence-type name
              (what a person actually types — "Food Shop"), the holder, the premises and the
              certificate number. See the domain `q` branch and the rule in AGENTS.md. */}
          <SearchField
            label="Search licences by type, holder, outlet or number"
            placeholder="Type, holder, outlet or number"
            value={filters.q}
            onChange={(value) => setFilter("q", value)}
          />
          <FilterSelect
            label="Filter by status"
            allLabel="All statuses"
            value={filters.status}
            options={LICENSE_STATUS_OPTIONS}
            onChange={(value) => setFilter("status", value)}
          />
          <FilterSelect
            label="Filter by outlet"
            allLabel="All outlets"
            value={filters.outlet_id}
            options={outlets.map((o) => ({ value: o.id, label: o.name }))}
            onChange={(value) => setFilter("outlet_id", value)}
          />
          <FilterSelect
            label="Filter by holder entity"
            allLabel="All entities"
            value={filters.entity_id}
            options={entities.map((e) => ({ value: e.id, label: e.name }))}
            onChange={(value) => setFilter("entity_id", value)}
          />
          <FilterSelect
            label="Filter by licence type"
            allLabel="All types"
            value={filters.type_id}
            options={types.map((t) => ({ value: t.id, label: t.name }))}
            onChange={(value) => setFilter("type_id", value)}
          />
        </FilterBar>

        {/* F3: the primary action is now a split button — Manual add (this form) or Upload
            (a drop-a-PDF popup, UI only). */}
        <AddMenuButton
          label="Record licence"
          noun="licence"
          className="w-full sm:w-auto"
          onManualAdd={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        />
      </div>

      <HeldResults
        key={filterKey}
        filters={filters}
        onEdit={(license) => {
          setEditing(license);
          setFormOpen(true);
        }}
      />

      <LicenseForm
        license={editing}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(undefined);
        }}
      />
    </div>
  );
}

function HeldResults({
  filters,
  onEdit,
}: {
  filters: Partial<Record<(typeof FILTER_KEYS)[number], string>>;
  onEdit: (license: License) => void;
}) {
  const { byId: typeById } = useLicenseTypeIndex();
  const { byId: outletById } = useOutletIndex();
  const { byId: entityById } = useEntityIndex();

  const { items, error, isLoading, hasMore, isLoadingMore, loadMore } = useLicensePages({
    status: filters.status as LicenseStatus | undefined,
    outlet_id: filters.outlet_id,
    entity_id: filters.entity_id,
    license_type_id: filters.type_id,
    q: filters.q,
  });

  if (error) return <QueryError error={error} />;
  if (isLoading) return <LoadingRows rows={5} />;

  if (items.length === 0) {
    const activeKeys = Object.entries(filters)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key);
    const filtered = activeKeys.length > 0;
    // Echo the term only when search is the sole active filter (mirrors the contracts list).
    const onlyQ = Boolean(filters.q) && activeKeys.every((key) => key === "q");
    return (
      <EmptyState
        message={
          onlyQ
            ? `No licences match “${filters.q}”`
            : filtered
              ? "No licences match these filters"
              : "No licences recorded yet"
        }
        hint={
          onlyQ
            ? "Search covers licence type, holder, outlet and certificate number."
            : filtered
              ? "Clear a filter to widen the search."
              : "Record what each site holds — expiry tracking and renewal reminders start from here."
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
              <TableHead className="pl-5">Licence</TableHead>
              <TableHead>Where</TableHead>
              <TableHead>Number</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-5 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((license) => {
              const type = typeById.get(license.license_type_id);
              const outlet = license.outlet_id
                ? outletById.get(license.outlet_id)
                : undefined;
              const entity = entityById.get(license.holder_entity_id);
              return (
                <TableRow key={license.id}>
                  <TableCell className="pl-5">
                    <Link
                      href={`/licenses/${license.id}`}
                      className="font-medium text-ink hover:text-brand hover:underline"
                    >
                      {type?.name ?? "Unknown type"}
                    </Link>
                    {license.holder_person_name ? (
                      <span className="mt-0.5 block text-helper text-ink-tertiary">
                        Held by {license.holder_person_name}
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
                      // Entity-level, deliberately: 3 of the 29 types are held by the
                      // company rather than a premises.
                      <span>{entity?.name ?? "Entity-level"}</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <Value mono>{license.license_number}</Value>
                  </TableCell>

                  <TableCell className="text-ink-secondary">
                    {formatDate(license.expiry_date)}
                  </TableCell>

                  <TableCell>
                    <Badge variant={LICENSE_STATUS_TONES[license.status]}>
                      {LICENSE_STATUS_LABELS[license.status]}
                    </Badge>
                  </TableCell>

                  <TableCell className="pr-5 text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => onEdit(license)}>
                      <PencilIcon />
                      <span className="sr-only">Edit {type?.name ?? "licence"}</span>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>

      <LoadMore
        loadedCount={items.length}
        noun="licence"
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
      />
    </div>
  );
}
