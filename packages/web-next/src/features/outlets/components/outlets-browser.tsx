"use client";

import type { BrandSummary, Outlet } from "@brandfactory/shared";
import { outletDateOnShow } from "@brandfactory/shared";
import Link from "next/link";
import {
  ChevronDownIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  PencilIcon,
  PlusIcon,
} from "lucide-react";
import * as React from "react";

import {
  FilterBar,
  FilterSelect,
  FilterToolbar,
  SearchField,
  SegmentedControl,
} from "@/components/layout/filter-bar";
import { NEUTRAL_RAIL, railFor } from "@/components/layout/group-rail";
import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { TableCard, Value } from "@/components/layout/table-card";
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
import { useActiveBrand } from "@/features/brands/active-brand";
import { useQueryFilters } from "@/hooks/use-query-filters";
import { formatAddress, formatDate, PENDING } from "@/lib/format";
import {
  OUTLET_STATUS_LABELS,
  OUTLET_STATUS_OPTIONS,
  OUTLET_STATUS_TONES,
  OUTLET_TYPE_LABELS,
  OUTLET_TYPE_OPTIONS,
} from "@/lib/labels";
import { outletHref } from "@/lib/outlet-href";
import { cn } from "@/lib/utils";

import { useOutlets } from "../hooks";
import { OutletForm } from "./outlet-form";

/** Module-level so the memo inside `useQueryFilters` has a stable dependency. */
const FILTER_KEYS = ["status", "outletType", "brandId", "q"] as const;

/**
 * The group-by dimension — a **view control, not a filter**, so it survives
 * "Clear filters" and lives on its own `useQueryFilters` instance keyed `?by=`.
 */
const VIEW_KEYS = ["by"] as const;
type GroupBy = "flat" | "brand";

/**
 * The outlets table, its filters and the create sheet.
 *
 * Filters are held in the URL so a filtered view can be pasted into a chat.
 *
 * **Everything narrows client-side, and there is no pagination.**
 * `GET /workspaces/:id/outlets` returns the whole set in name order, so the
 * client holds every row it is filtering. That is what makes the counts and the
 * groups below honest: `4 outlets` is a total rather than "four so far", and a
 * brand's band holds all of that brand's outlets rather than the ones that
 * happened to be on page one. The Operations Hub's version of this screen had to
 * do the opposite — cursor pages, server-side filters, and a grouped view that
 * read a *second*, exhaustive endpoint precisely because grouping a page is a
 * lie. One exhaustive list removes the whole problem.
 *
 * The cost is stated rather than hidden: this fetches every outlet on every
 * visit, which is fine at tens of rows and is not fine at thousands. When the
 * estate outgrows one response, the cursor and the SQL filters arrive together —
 * see `listOutletsByWorkspace`.
 *
 * **There is still no column sorting.** Rows come back in name order and that is
 * the order they are read in; a sortable header would be a second ordering rule
 * to keep in step with the server's for no question anybody is asking of a
 * directory.
 *
 * **The primary action is the sync, not the create.** Outlets are going to arrive
 * from the system that already holds the estate, so `SyncOutletsButton` takes the
 * page header. Adding one by hand survives as a secondary control here, because
 * until that sync exists it is the only way to put an outlet in — and because a
 * screen that can edit a record but never create one is a screen with a hole in
 * it.
 */
export function OutletsBrowser() {
  const { filters, setFilter, clearAll, activeCount } = useQueryFilters(FILTER_KEYS);
  // View control on its own instance so "Clear filters" leaves it alone.
  const { filters: viewFilters, setFilter: setViewFilter } = useQueryFilters(VIEW_KEYS);
  const by: GroupBy = viewFilters.by === "brand" ? "brand" : "flat";

  const { outlets, isLoading, error } = useOutlets();
  const { brands } = useActiveBrand();

  const brandsById = React.useMemo(() => {
    const map = new Map<string, BrandSummary>();
    for (const brand of brands) map.set(brand.id, brand);
    return map;
  }, [brands]);

  const brandOptions = React.useMemo(
    () => brands.map((brand) => ({ value: brand.id, label: brand.name })),
    [brands],
  );

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Outlet | undefined>();

  const openCreate = React.useCallback(() => {
    setEditing(undefined);
    setFormOpen(true);
  }, []);
  const openEdit = React.useCallback((outlet: Outlet) => {
    setEditing(outlet);
    setFormOpen(true);
  }, []);

  /**
   * The one narrowing pass, shared by both views.
   *
   * **No debounce on `q`.** The Ops screen debounced because every keystroke was
   * a request; this filters an array already in memory, so a debounce would only
   * make the table lag behind the box.
   *
   * Search covers the outlet's own name plus its address — the thing it is called
   * and where it is, which is how somebody looks for a site they can picture. Not
   * its brand: that has a filter of its own beside the box, and a search that
   * silently doubles as a brand filter makes the two disagree about what is on
   * screen. The placeholder says exactly this much.
   */
  const filtered = React.useMemo(() => {
    const q = filters.q?.trim().toLowerCase();
    return outlets.filter((outlet) => {
      if (filters.status && outlet.status !== filters.status) return false;
      if (filters.outletType && outlet.outletType !== filters.outletType) return false;
      if (filters.brandId && outlet.brandId !== filters.brandId) return false;
      if (q) {
        const haystack = `${outlet.name} ${outlet.address ?? ""} ${outlet.unit ?? ""} ${
          outlet.postalCode ?? ""
        }`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [outlets, filters]);

  const brandNameFor = React.useCallback(
    (brandId: string | null): string | undefined => {
      if (!brandId) return undefined;
      // A real foreign key absent from the index is a fetch in flight or one that
      // failed — never a missing fact. `PENDING` whatever the reason, because
      // `brandsLoading` is false on a *failed* request too, and falling through to
      // `undefined` there hid the brand line on a row that has one. The group rail
      // above already reads this way; this is the row catching up with it.
      return brandsById.get(brandId)?.name ?? PENDING;
    },
    [brandsById],
  );

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      <FilterToolbar
        actions={
          <>
            <SegmentedControl
              label="Group outlets by"
              value={by}
              options={[
                { value: "flat", label: "Flat" },
                { value: "brand", label: "By brand" },
              ]}
              // "Flat" clears the key, so the default link stays clean.
              onChange={(value) => setViewFilter("by", value === "flat" ? undefined : value)}
            />
            <Button variant="secondary" onClick={openCreate}>
              <PlusIcon data-icon="inline-start" />
              Add outlet
            </Button>
          </>
        }
      >
        <FilterBar activeCount={activeCount} onClear={clearAll}>
          <SearchField
            label="Search outlets by name or address"
            placeholder="Name or address"
            value={filters.q}
            onChange={(value) => setFilter("q", value)}
          />
          <FilterSelect
            label="Filter by status"
            allLabel="All statuses"
            value={filters.status}
            options={OUTLET_STATUS_OPTIONS}
            onChange={(value) => setFilter("status", value)}
          />
          <FilterSelect
            label="Filter by type"
            allLabel="All types"
            value={filters.outletType}
            options={OUTLET_TYPE_OPTIONS}
            onChange={(value) => setFilter("outletType", value)}
          />
          <FilterSelect
            label="Filter by brand"
            allLabel="All brands"
            value={filters.brandId}
            options={brandOptions}
            onChange={(value) => setFilter("brandId", value)}
          />
        </FilterBar>
      </FilterToolbar>

      {error ? (
        <QueryError error={error} />
      ) : isLoading ? (
        <LoadingRows rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          message={activeCount > 0 ? "No outlets match these filters" : "No outlets yet"}
          hint={
            activeCount > 0
              ? "Clear a filter to widen the search."
              : "Add the first one. A site that has not opened is still an outlet — record it as pipeline and its target date is the plan."
          }
        />
      ) : by === "flat" ? (
        <FlatOutlets
          outlets={filtered}
          total={outlets.length}
          brandNameFor={brandNameFor}
          onFilterBrand={(brandId) => setFilter("brandId", brandId)}
          onEdit={openEdit}
        />
      ) : (
        <GroupedOutlets
          outlets={filtered}
          brandsById={brandsById}
          brandNameFor={brandNameFor}
          onFilterBrand={(brandId) => setFilter("brandId", brandId)}
          onEdit={openEdit}
        />
      )}

      {/* One instance for both modes, `editing` choosing between them. **It
          carries no `key`**, deliberately: the obvious `key={editing?.id ?? "new"}`
          would change *mid-dismissal*, because this parent clears `editing` when
          the sheet closes — the wedge AGENTS.md records twice, where the overlay
          stays mounted and eats every click. `OutletForm` resets its draft during
          render instead. */}
      <OutletForm
        outlet={editing}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(undefined);
        }}
      />
    </div>
  );
}

const COLUMNS = 6;

function OutletTableHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="pl-5">Name</TableHead>
        <TableHead>Type</TableHead>
        <TableHead>Status</TableHead>
        {/* Shown from 1440 up — see the OutletRow docblock. */}
        <TableHead className="hidden min-[1440px]:table-cell">Address</TableHead>
        <TableHead>Opening</TableHead>
        <TableHead className="pr-5 text-right">
          <span className="sr-only">Actions</span>
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

function FlatOutlets({
  outlets,
  total,
  brandNameFor,
  onFilterBrand,
  onEdit,
}: {
  outlets: Outlet[];
  total: number;
  brandNameFor: (brandId: string | null) => string | undefined;
  onFilterBrand: (brandId: string) => void;
  onEdit: (outlet: Outlet) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <TableCard>
        <Table>
          <OutletTableHeader />
          <TableBody>
            {outlets.map((outlet) => (
              <OutletRow
                key={outlet.id}
                outlet={outlet}
                brandName={brandNameFor(outlet.brandId)}
                onFilterBrand={onFilterBrand}
                onEdit={onEdit}
              />
            ))}
          </TableBody>
        </Table>
      </TableCard>

      {/* A **total**, and it is allowed to be one here — the exception to the
          product's "never claim a total" rule, which exists because the Ops API
          returns a cursor and no count. This route returns every row, so the
          number below is the whole set rather than a page of it. */}
      <p className="px-1 text-helper text-ink-secondary">
        {outlets.length === total
          ? `${total} ${total === 1 ? "outlet" : "outlets"}`
          : `${outlets.length} of ${total} outlets`}
      </p>
    </div>
  );
}

/** The band's collapse key for the null bucket ("No brand"). */
const NONE_KEY = "__none__";

/**
 * Outlets under the brand they trade as.
 *
 * Buckets key off the row's own `brandId`, so a count is always a count of rows
 * and can never be a count of names that happen to have resolved. Labels resolve
 * through the brand list with `PENDING` and **never "Unknown"** — an id absent
 * from a loaded index is a fetch in flight, not a missing fact. The null bucket is
 * a real absence ("No brand"), which is a different thing and says so.
 *
 * Collapse state is `useState`, not the URL: it is a reading posture, and a dozen
 * ids would swamp the link `useQueryFilters` works to keep pasteable.
 */
function GroupedOutlets({
  outlets,
  brandsById,
  brandNameFor,
  onFilterBrand,
  onEdit,
}: {
  outlets: Outlet[];
  brandsById: Map<string, BrandSummary>;
  brandNameFor: (brandId: string | null) => string | undefined;
  onFilterBrand: (brandId: string) => void;
  onEdit: (outlet: Outlet) => void;
}) {
  const groups = React.useMemo(() => {
    const buckets = new Map<string | null, Outlet[]>();
    for (const outlet of outlets) {
      const key = outlet.brandId ?? null;
      const bucket = buckets.get(key) ?? [];
      bucket.push(outlet);
      buckets.set(key, bucket);
    }
    return [...buckets.entries()]
      .map(([key, items]) => ({
        key,
        label: key === null ? "No brand" : (brandsById.get(key)?.name ?? PENDING),
        outlets: items,
      }))
      .sort((a, b) => {
        // The null bucket sinks to the bottom whatever it is called.
        if (a.key === null) return 1;
        if (b.key === null) return -1;
        return a.label.localeCompare(b.label);
      });
  }, [outlets, brandsById]);

  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(() => new Set<string>());
  const toggleGroup = React.useCallback((key: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);
  const allCollapsed = groups.length > 0 && collapsed.size === groups.length;
  const toggleAll = React.useCallback(() => {
    setCollapsed(
      allCollapsed ? new Set<string>() : new Set(groups.map((group) => group.key ?? NONE_KEY)),
    );
  }, [allCollapsed, groups]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <p className="text-helper text-ink-secondary">
          {groups.length} {groups.length === 1 ? "group" : "groups"} · {outlets.length}{" "}
          {outlets.length === 1 ? "outlet" : "outlets"}
        </p>
        <Button variant="ghost" size="sm" onClick={toggleAll}>
          {allCollapsed ? (
            <ChevronsUpDownIcon data-icon="inline-start" />
          ) : (
            <ChevronsDownUpIcon data-icon="inline-start" />
          )}
          {allCollapsed ? "Expand all" : "Collapse all"}
        </Button>
      </div>

      <TableCard>
        <Table>
          <OutletTableHeader />
          <TableBody>
            {groups.map((group) => {
              const key = group.key ?? NONE_KEY;
              const rail = group.key === null ? NEUTRAL_RAIL : railFor(key);
              const isCollapsed = collapsed.has(key);
              return (
                <React.Fragment key={key}>
                  <TableRow className="border-t border-border bg-surface-sunken hover:bg-surface-sunken">
                    <TableCell colSpan={COLUMNS} className={cn("h-11 border-l-4 p-0", rail.band)}>
                      <button
                        type="button"
                        onClick={() => toggleGroup(key)}
                        aria-expanded={!isCollapsed}
                        className="flex h-11 w-full items-center gap-2 pr-5 pl-4 text-left"
                      >
                        <ChevronDownIcon
                          aria-hidden
                          className={cn(
                            "size-4 shrink-0 text-ink-tertiary transition-transform duration-[120ms]",
                            isCollapsed && "-rotate-90",
                          )}
                        />
                        <span className="font-medium text-ink">{group.label}</span>
                        <Badge variant="outline" className="bg-surface">
                          {group.outlets.length}
                        </Badge>
                        <span className="sr-only">
                          {isCollapsed ? "Expand group" : "Collapse group"}
                        </span>
                      </button>
                    </TableCell>
                  </TableRow>

                  {isCollapsed
                    ? null
                    : group.outlets.map((outlet) => (
                        <OutletRow
                          key={outlet.id}
                          outlet={outlet}
                          brandName={brandNameFor(outlet.brandId)}
                          onFilterBrand={onFilterBrand}
                          onEdit={onEdit}
                          rail={rail.rows}
                        />
                      ))}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}

/**
 * Two width decisions, both inherited from the Operations Hub's measurements and
 * both protecting one thing: **the edit button in the last cell has to be on
 * screen.** It is the point of the column and the first casualty of a table that
 * is too wide, because it is last.
 *
 * *The text columns are capped.* A table's natural width is its longest cell, so
 * an uncapped text column is as wide as the worst record in it — one 54-character
 * outlet name ran the name column to 388px.
 *
 * *Address then appears only from 1440 up.* Capping alone still overflowed at
 * 1280, and no cap tight enough to fix that leaves a readable address, so the
 * column is the one that yields. The breakpoint is a viewport query while the
 * real constraint is the container, which is narrower with the sidebar expanded;
 * a container query would be exact, and this errs toward hiding rather than
 * clipping.
 *
 * This table carries one column fewer than the Ops one — Holding entity is gone
 * with the entities dimension — so it has ~22ch more room than the measurements
 * above were taken against. The breakpoint stays anyway: it is now conservative
 * rather than wrong, and re-measuring belongs in a browser pass.
 */
function OutletRow({
  outlet,
  brandName,
  onFilterBrand,
  onEdit,
  rail,
}: {
  outlet: Outlet;
  /** The resolved name, `PENDING` while the list is in flight, `undefined` for none. */
  brandName?: string;
  onFilterBrand: (brandId: string) => void;
  onEdit: (outlet: Outlet) => void;
  /** Rail classes continuing a group's colour down the row's first cell. Absent when flat. */
  rail?: string;
}) {
  // A site that is still a plan shows its target date; anything else shows when
  // it opened. Different columns, different kinds of fact — so the cell says
  // which one it is showing rather than merging them under "Opening".
  const { date, label } = outletDateOnShow(outlet);

  return (
    <TableRow>
      <TableCell className={cn("max-w-[28ch]", rail ? cn("border-l-4 pl-4", rail) : "pl-5")}>
        {/* The link fills the cell so the whole name is a target. Rows are not
            clickable as a whole: a row-level onClick makes text unselectable and
            cannot be opened in a new tab. */}
        <Link
          href={outletHref(outlet)}
          className="-mx-2 -my-1 block truncate rounded-md px-2 py-1 font-medium text-ink hover:text-brand hover:underline"
        >
          {outlet.name}
        </Link>
        {outlet.brandId && brandName ? (
          <button
            type="button"
            onClick={() => onFilterBrand(outlet.brandId!)}
            className="-mx-2 block max-w-full truncate rounded-md px-2 text-helper text-ink-secondary hover:text-brand hover:underline"
          >
            {brandName}
            <span className="sr-only"> — show only this brand</span>
          </button>
        ) : null}
      </TableCell>

      <TableCell className="text-ink-secondary">{OUTLET_TYPE_LABELS[outlet.outletType]}</TableCell>

      <TableCell>
        <Badge variant={OUTLET_STATUS_TONES[outlet.status]}>
          {OUTLET_STATUS_LABELS[outlet.status]}
        </Badge>
      </TableCell>

      {/* `formatAddress` takes the Ops snake_case shape, so the three parts are
          named here rather than the record being handed over whole. */}
      <TableCell className="hidden max-w-[24ch] truncate text-ink-secondary min-[1440px]:table-cell">
        <Value>
          {formatAddress({
            address: outlet.address,
            unit: outlet.unit,
            postal_code: outlet.postalCode,
          })}
        </Value>
      </TableCell>

      <TableCell>
        <Value>{date ? formatDate(date) : null}</Value>
        {date ? <span className="block text-helper text-ink-tertiary">{label}</span> : null}
      </TableCell>

      <TableCell className="pr-5 text-right">
        <Button variant="ghost" size="icon-sm" onClick={() => onEdit(outlet)}>
          <PencilIcon />
          <span className="sr-only">Edit {outlet.name}</span>
        </Button>
      </TableCell>
    </TableRow>
  );
}
