"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";

import { FilterBar, FilterSelect } from "@/components/layout/filter-bar";
import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { LoadMore, TableCard } from "@/components/layout/table-card";
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
import { useQueryFilters } from "@/hooks/use-query-filters";
import { useSpaces } from "@/features/spaces/hooks";
import { WelcomeDialog } from "@/features/spaces/components/welcome-dialog";

/**
 * The `/spaces` index — a list OpenSpace never had.
 *
 * Upstream it was a single-scheme application that opened straight into the workspace on
 * a demo unit. Inside the Ops Hub a scheme is a record like any other, so it needs the
 * screen every other record has: filtered, paginated, and saying which outlet each one
 * belongs to.
 *
 * The four numbers per row are derived server-side from the payload
 * (`space_operations._summary`) rather than shipped as documents — a page of 50 schemes
 * carrying 50 boundary polygons to render a table of names is the thing that avoids.
 */
export function SpacesBrowser() {
  const router = useRouter();
  const { filters, setFilter, activeCount, clearAll } = useQueryFilters(["outlet"]);
  const [creating, setCreating] = React.useState(false);
  const { outlets, byId } = useOutletIndex();

  const query = React.useMemo(
    () => ({ outlet_id: filters.outlet || undefined }),
    [filters.outlet],
  );

  const { items, error, isLoading, hasMore, isLoadingMore, loadMore } = useSpaces(query);

  return (
    <div className="flex flex-col gap-4 px-6 pb-10 md:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <FilterBar activeCount={activeCount} onClear={clearAll}>
          <FilterSelect
            label="Filter by outlet"
            allLabel="All outlets"
            value={filters.outlet}
            onChange={(value) => setFilter("outlet", value)}
            options={outlets.map((outlet) => ({ value: outlet.id, label: outlet.name }))}
          />
        </FilterBar>
        <Button onClick={() => setCreating(true)} className="shrink-0">
          <PlusIcon className="size-4" aria-hidden />
          New space
        </Button>
      </div>

      {error ? (
        <QueryError error={error} />
      ) : isLoading ? (
        <LoadingRows />
      ) : items.length === 0 ? (
        <EmptyState
          message="No spaces yet"
          hint="Drop in a landlord PDF or lease drawing and it becomes a to-scale plan you can lay out, walk through and cost."
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Scheme</TableHead>
                <TableHead>Outlet</TableHead>
                {/* Right-aligned because they are quantities read down a column. */}
                <TableHead className="text-right">Area</TableHead>
                <TableHead className="text-right">Covers</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">References</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((scheme) => (
                <TableRow key={scheme.id}>
                  <TableCell className="pl-5">
                    <Link
                      href={`/spaces/${scheme.id}`}
                      className="font-medium text-ink hover:text-link hover:underline"
                    >
                      {scheme.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {scheme.outlet_id ? (
                      byId.get(scheme.outlet_id)?.name ?? "—"
                    ) : (
                      // Not a gap to fill: planning before an outlet record exists is
                      // the case `outlet_id` is nullable for.
                      <Badge variant="outline">Unassigned</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right" data-numeric>
                    {scheme.area_m2 == null ? "—" : `${scheme.area_m2} m²`}
                  </TableCell>
                  <TableCell className="text-right" data-numeric>
                    {scheme.covers}
                  </TableCell>
                  <TableCell className="text-right" data-numeric>
                    {scheme.item_count}
                  </TableCell>
                  <TableCell className="text-right" data-numeric>
                    {scheme.reference_count}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {/* "loaded", never a total — the API returns `next_cursor` and no count. */}
          <LoadMore
            loadedCount={items.length}
            noun="space"
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={loadMore}
          />
        </TableCard>
      )}

      {creating && (
        <WelcomeDialog
          mode="create"
          outletId={filters.outlet || null}
          onClose={() => setCreating(false)}
          onCreated={(id) => router.push(`/spaces/${id}`)}
        />
      )}
    </div>
  );
}
