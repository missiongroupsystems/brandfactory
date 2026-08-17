"use client";

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
  ActiveFilterChips,
  type FilterChip,
  FilterPopover,
  FilterToolbar,
  PanelFilter,
  SearchField,
  SegmentedControl,
} from "@/components/layout/filter-bar";
import { NEUTRAL_RAIL, railFor } from "@/components/layout/group-rail";
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { filterIdentity, useQueryFilters } from "@/hooks/use-query-filters";
import type { Outlet, OutletStatus, OutletType } from "@/lib/api/types";
import { formatAddress, formatDate, PENDING } from "@/lib/format";
import { outletHref } from "@/lib/outlet-href";
import { cn } from "@/lib/utils";
import {
  OUTLET_STATUS_LABELS,
  OUTLET_STATUS_OPTIONS,
  OUTLET_STATUS_TONES,
  OUTLET_TYPE_LABELS,
  OUTLET_TYPE_OPTIONS,
} from "@/lib/labels";

import { useBrandIndex } from "@/features/brands/hooks";

import { useEntityIndex, useOutletIndex, useOutletPages } from "../hooks";
import { OutletForm } from "./outlet-form";

/** Module-level so the memo inside `useQueryFilters` has a stable dependency. */
const FILTER_KEYS = ["status", "outlet_type", "entity_id", "brand_id", "q"] as const;

/**
 * The group-by dimension — a **view control, not a filter**, so it survives "Clear filters"
 * and lives on its own `useQueryFilters` instance keyed `?by=`. Three exclusive states, which
 * is why it is a `SegmentedControl` and not two `ToggleButton`s: two toggles would permit an
 * invalid both-on `?by=brand&by=entity`.
 */
const VIEW_KEYS = ["by"] as const;
type GroupBy = "flat" | "brand" | "entity";

/**
 * The four that live in the Filters panel — `q` stays on the row, because search is what people
 * reach for first and a search box behind a click is a search box nobody uses.
 *
 * Also the set the trigger counts and the chips describe, which is why `activeCount` from
 * `useQueryFilters` is the wrong number: it includes `q`, and a "Filters ①" badge for a term
 * already visible in the search box is a miscount.
 */
const PANEL_KEYS = ["status", "outlet_type", "entity_id", "brand_id"] as const;

/**
 * The outlets table, its filters and the create panel.
 *
 * Filters are held in the URL (`useQueryFilters`) so a filtered view can be pasted into a chat,
 * which spec §6 asks for. Everything else here follows from the API's shape.
 *
 * **There is no column sorting**, and its absence is deliberate. The list endpoint takes no sort
 * parameter — it returns rows in UUIDv7 order, which is insertion order — so a sortable header
 * could only reorder the rows already fetched. On a paginated list that is a lie: sorting by name
 * would put "Zephyr" at the top of page one and leave "Alma" unfetched on page three. Sorting
 * belongs on the backend, and until it is there the honest thing is not to offer it.
 *
 * **The filters moved to the overflow form when brand made them five** (`FilterToolbar` +
 * `FilterPopover` + `ActiveFilterChips`, the shape `/contracts` uses). That was a measurement
 * rather than a preference, and the measurement is worth keeping because it contradicted the
 * expectation twice: at 1280 the *four* controls already wrapped to two rows — 875px of controls
 * in an 824px bar, so this had been two rows for some time — and the fifth made 1440 wrap too,
 * `All brands` landing alone on a second line with the width empty beside it. That is the exact
 * shape `AGENTS.md` gives as the reason `/contracts` needed this form: the filter group grows
 * while the action group stays pinned right.
 *
 * The chips are not optional decoration. Collapsing filters behind a trigger is only acceptable
 * if the *set* ones stay on screen — otherwise a shared link opens on a filtered table with no
 * visible reason for the missing rows, which is the "it got lost" failure this product exists to
 * fix.
 */
export function OutletsBrowser() {
  const { filters, setFilter, setFilters, clearAll } = useQueryFilters(FILTER_KEYS);
  // View control on its own instance so "Clear filters" leaves it alone, exactly as
  // `/contracts` keeps its group/show controls apart from its filters.
  const { filters: viewFilters, setFilter: setViewFilter } = useQueryFilters(VIEW_KEYS);
  const by: GroupBy =
    viewFilters.by === "brand" || viewFilters.by === "entity" ? viewFilters.by : "flat";
  const { entities } = useEntityIndex();
  const { brands } = useBrandIndex();

  const entityOptions = React.useMemo(
    () => entities.map((entity) => ({ value: entity.id, label: entity.name })),
    [entities],
  );
  const brandOptions = React.useMemo(
    () => brands.map((brand) => ({ value: brand.id, label: brand.name })),
    [brands],
  );

  /** Clears the panel's four and leaves the search term alone — one write, because two
   *  back-to-back `setFilter` calls both build from the same rendered params and the second
   *  drops the first (see `setFilters`' docstring). */
  const clearPanel = React.useCallback(() => {
    setFilters(Object.fromEntries(PANEL_KEYS.map((key) => [key, null])));
  }, [setFilters]);

  // A chip per set panel filter, naming the dimension and the chosen option. The option lists
  // are the same ones the panel renders, so a chip can never disagree with the control behind
  // it — and an id whose record has not loaded yet reads as the raw value rather than vanishing.
  const chips: FilterChip[] = React.useMemo(() => {
    const dimensions: {
      key: (typeof PANEL_KEYS)[number];
      label: string;
      options: readonly { value: string; label: string }[];
    }[] = [
      { key: "status", label: "Status", options: OUTLET_STATUS_OPTIONS },
      { key: "outlet_type", label: "Type", options: OUTLET_TYPE_OPTIONS },
      { key: "entity_id", label: "Holding entity", options: entityOptions },
      { key: "brand_id", label: "Brand", options: brandOptions },
    ];

    return dimensions.flatMap(({ key, label, options }) => {
      const value = filters[key];
      if (!value) return [];
      return [
        {
          key,
          label,
          value: options.find((option) => option.value === value)?.label ?? value,
          onRemove: () => setFilter(key, undefined),
        },
      ];
    });
  }, [filters, entityOptions, brandOptions, setFilter]);

  /** What the trigger's badge counts — `chips.length`, so the badge and the chips can never be
   *  two expressions of one idea that drift apart. */
  const panelCount = chips.length;

  /**
   * One `OutletForm` instance for both modes, `editing` choosing between them — the same shape
   * as the entities, contacts and vendors tables.
   *
   * **It carries no `key`, and that is deliberate.** The obvious reading of "reset the draft per
   * record" is `key={editing?.id ?? "new"}`, but this parent clears `editing` when the sheet
   * closes, so that key would change *mid-dismissal* — the exact wedge `AGENTS.md` records twice
   * (the overlay stays mounted and eats every click). `OutletForm` already resets its draft
   * during render when `open` flips true, which is the fix that replaced the key it used to have.
   */
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Outlet | undefined>();

  // Debounced *here*, above the remount boundary — see filterIdentity's docstring.
  const debouncedQ = useDebouncedValue(filters.q, 250);
  const resultsFilters = React.useMemo(
    () => ({ ...filters, q: debouncedQ }),
    [filters, debouncedQ],
  );
  const resultsKey = filterIdentity(FILTER_KEYS, resultsFilters);

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      {/* Toolbar and chips are one block — the chips describe the row above them, so they sit at
          gap-3 from it rather than at the page's gap-4 from everything. */}
      <div className="flex flex-col gap-3">
        <FilterToolbar
          actions={
            <>
              {/* Flat / by Brand / by Entity — the two org dimensions the org-chart board
                  already draws, brought to the table. Writes `?by=`; "Flat" clears the key
                  to keep the default link clean. */}
              <SegmentedControl
                label="Group outlets by"
                value={by}
                options={[
                  { value: "flat", label: "Flat" },
                  { value: "brand", label: "By brand" },
                  { value: "entity", label: "By entity" },
                ]}
                onChange={(value) => setViewFilter("by", value === "flat" ? undefined : value)}
              />
              <Button
                onClick={() => {
                  setEditing(undefined);
                  setFormOpen(true);
                }}
              >
                <PlusIcon data-icon="inline-start" />
                New outlet
              </Button>
            </>
          }
        >
          {/* "Outlet name", precisely: `q` is an ILIKE on `outlet.name` and nothing else
              (`outlet_operations.list_outlets`). A placeholder promising brand or address would
              be a lie the user only catches after searching for a street they can see on screen. */}
          <SearchField
            label="Search outlets by name, address, brand or company"
            placeholder="Name, address, brand or company"
            value={filters.q}
            onChange={(value) => setFilter("q", value)}
          />
          <FilterPopover activeCount={panelCount} onClear={clearPanel}>
            <PanelFilter
              label="Status"
              allLabel="All statuses"
              value={filters.status}
              options={OUTLET_STATUS_OPTIONS}
              onChange={(value) => setFilter("status", value)}
            />
            <PanelFilter
              label="Type"
              allLabel="All types"
              value={filters.outlet_type}
              options={OUTLET_TYPE_OPTIONS}
              onChange={(value) => setFilter("outlet_type", value)}
            />
            <PanelFilter
              label="Holding entity"
              allLabel="All entities"
              value={filters.entity_id}
              options={entityOptions}
              onChange={(value) => setFilter("entity_id", value)}
            />
            {/* An ordinary filter, at last. It replaces a chip that existed only because there
                was no brand catalogue to build a select from — brand was a free-text string, and
                spec open question 3 was whether it was a real dimension at all. It is, and it is
                a table (`app/models/brand.py`). Still click-to-filter from the row as well; the
                two write the same key, so they are two controls over one filter rather than a
                second narrowing mechanism. */}
            <PanelFilter
              label="Brand"
              allLabel="All brands"
              value={filters.brand_id}
              options={brandOptions}
              onChange={(value) => setFilter("brand_id", value)}
            />
          </FilterPopover>
        </FilterToolbar>

        <ActiveFilterChips chips={chips} onClear={clearAll} />
      </div>

      {/* Flat paginates over the list endpoint; grouped reads the **exhaustive index** — you
          cannot group the fetched page only (the "Zephyr alone on page 1" hazard the repo bans
          for sorting), and the org-chart/brand boards already group over the same index. */}
      {by === "flat" ? (
        // Remounting on filter change resets the accumulated page count — see `filterKey`.
        <OutletResults
          key={resultsKey}
          filters={resultsFilters}
          onFilterBrand={(brandId) => setFilter("brand_id", brandId)}
          onEdit={(outlet) => {
            setEditing(outlet);
            setFormOpen(true);
          }}
        />
      ) : (
        <GroupedOutletResults
          // Remount on the brand↔entity switch so `collapsed` starts fresh — otherwise the
          // previous dimension's group keys linger and the Collapse-all label miscounts.
          key={by}
          by={by}
          filters={resultsFilters}
          onFilterBrand={(brandId) => setFilter("brand_id", brandId)}
          onEdit={(outlet) => {
            setEditing(outlet);
            setFormOpen(true);
          }}
        />
      )}

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

function OutletResults({
  filters,
  onFilterBrand,
  onEdit,
}: {
  filters: Partial<Record<(typeof FILTER_KEYS)[number], string>>;
  onFilterBrand: (brandId: string) => void;
  onEdit: (outlet: Outlet) => void;
}) {
  const { byId: entitiesById, isLoading: entitiesLoading } = useEntityIndex();
  const { byId: brandsById, isLoading: brandsLoading } = useBrandIndex();

  const { items, error, isLoading, hasMore, isLoadingMore, loadMore } = useOutletPages({
    status: filters.status as OutletStatus | undefined,
    outlet_type: filters.outlet_type as OutletType | undefined,
    entity_id: filters.entity_id,
    brand_id: filters.brand_id,
    q: filters.q, // already debounced by the parent, which keys this component on it
  });

  if (error) return <QueryError error={error} />;
  if (isLoading) return <LoadingRows rows={6} />;

  if (items.length === 0) {
    const filtered = Object.values(filters).some(Boolean);
    return (
      <EmptyState
        message={filtered ? "No outlets match these filters" : "No outlets yet"}
        hint={
          filtered
            ? "Clear a filter to widen the search."
            : "Add the first one. A site that has not opened is still an outlet — record it as pipeline and its licence requirements can be planned against a target date."
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
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Holding entity</TableHead>
              {/* Shown from 1440 up — see the OutletRow docblock. */}
              <TableHead className="hidden min-[1440px]:table-cell">Address</TableHead>
              <TableHead>Opening</TableHead>
              <TableHead className="pr-5 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((outlet) => (
              <OutletRow
                key={outlet.id}
                outlet={outlet}
                // `undefined` means "this outlet has none"; `PENDING` means "the index has not
                // arrived". Both used to collapse to `undefined`, which `Value` renders as an em
                // dash reading "Not recorded" — a false statement about a real foreign key, and
                // the trap AGENTS.md names. Passed as two distinct values rather than fixed
                // inside the row, because only the caller knows whether a fetch is in flight.
                entityName={
                  outlet.entity_id
                    ? (entitiesById.get(outlet.entity_id)?.name ??
                      (entitiesLoading ? PENDING : undefined))
                    : undefined
                }
                brandName={
                  outlet.brand_id
                    ? (brandsById.get(outlet.brand_id)?.name ??
                      (brandsLoading ? PENDING : undefined))
                    : undefined
                }
                onFilterBrand={onFilterBrand}
                onEdit={onEdit}
              />
            ))}
          </TableBody>
        </Table>
      </TableCard>

      <LoadMore
        loadedCount={items.length}
        noun="outlet"
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
      />
    </div>
  );
}

/** The band's collapse key for the null bucket ("No brand" / "No holding entity"). */
const NONE_KEY = "__none__";

/**
 * The grouped table — outlets under their brand or their holding company.
 *
 * **Over `useOutletIndex`, the exhaustive whole-set** (plan §3): grouping the fetched page
 * only is the "Zephyr alone on page 1" hazard the repo bans for sorting, and the org-chart and
 * brand boards already group over this same index. The flat view keeps `useOutletPages`.
 *
 * The index is filter-less, so the status/type/entity/brand/q filters narrow **client-side**
 * here — a deliberate choice, fine at 23 rows (plan §3). Buckets key off the row's own
 * `brand_id`/`entity_id` (so counts are off rows and always safe); labels resolve through
 * `useBrandIndex`/`useEntityIndex` with `PENDING`, **never "Unknown"** — an id absent from a
 * loaded index is a fetch in flight, not a missing fact (AGENTS.md). The null bucket is a real
 * absence ("No brand"), which is a different thing and says so.
 */
function GroupedOutletResults({
  by,
  filters,
  onFilterBrand,
  onEdit,
}: {
  by: "brand" | "entity";
  filters: Partial<Record<(typeof FILTER_KEYS)[number], string>>;
  onFilterBrand: (brandId: string) => void;
  onEdit: (outlet: Outlet) => void;
}) {
  const { outlets, isLoading, error, hasMore } = useOutletIndex();
  const { byId: entitiesById, isLoading: entitiesLoading } = useEntityIndex();
  const { byId: brandsById, isLoading: brandsLoading } = useBrandIndex();

  const filtered = React.useMemo(() => {
    const q = filters.q?.trim().toLowerCase();
    return outlets.filter((outlet) => {
      if (filters.status && outlet.status !== filters.status) return false;
      if (filters.outlet_type && outlet.outlet_type !== filters.outlet_type) return false;
      if (filters.entity_id && outlet.entity_id !== filters.entity_id) return false;
      if (filters.brand_id && outlet.brand_id !== filters.brand_id) return false;
      if (q && !outlet.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [outlets, filters]);

  const groups = React.useMemo(() => {
    const buckets = new Map<string | null, Outlet[]>();
    for (const outlet of filtered) {
      const key = (by === "brand" ? outlet.brand_id : outlet.entity_id) ?? null;
      const bucket = buckets.get(key) ?? [];
      bucket.push(outlet);
      buckets.set(key, bucket);
    }
    const labelFor = (key: string | null): string => {
      if (key === null) return by === "brand" ? "No brand" : "No holding entity";
      const record = by === "brand" ? brandsById.get(key) : entitiesById.get(key);
      // A real FK absent from a loaded index is a pending fetch, never "Unknown".
      return record?.name ?? PENDING;
    };
    return [...buckets.entries()]
      .map(([key, items]) => ({ key, label: labelFor(key), outlets: items }))
      .sort((a, b) => {
        if (a.key === null) return 1;
        if (b.key === null) return -1;
        return a.label.localeCompare(b.label);
      });
  }, [filtered, by, brandsById, entitiesById]);

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
      allCollapsed
        ? new Set<string>()
        : new Set(groups.map((group) => group.key ?? NONE_KEY)),
    );
  }, [allCollapsed, groups]);

  if (error) return <QueryError error={error} />;
  if (isLoading) return <LoadingRows rows={6} />;

  if (filtered.length === 0) {
    const isFiltered = Object.values(filters).some(Boolean);
    return (
      <EmptyState
        message={isFiltered ? "No outlets match these filters" : "No outlets yet"}
        hint={isFiltered ? "Clear a filter to widen the search." : "Add the first one."}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        {/* "loaded", never a total (AGENTS.md) — the index is exhaustive, so this is the whole
            filtered set, but the word stays honest for the day the estate outgrows the cap. */}
        <p className="text-helper text-ink-secondary">
          {groups.length} {groups.length === 1 ? "group" : "groups"} · {filtered.length} loaded
          {hasMore ? " (more than the index cap — showing a subset)" : ""}
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
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Holding entity</TableHead>
              <TableHead className="hidden min-[1440px]:table-cell">Address</TableHead>
              <TableHead>Opening</TableHead>
              <TableHead className="pr-5 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => {
              const key = group.key ?? NONE_KEY;
              const rail = group.key === null ? NEUTRAL_RAIL : railFor(key);
              const isCollapsed = collapsed.has(key);
              return (
                <React.Fragment key={key}>
                  <TableRow className="border-t border-border bg-surface-sunken hover:bg-surface-sunken">
                    <TableCell colSpan={7} className={cn("h-11 border-l-4 p-0", rail.band)}>
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
                          entityName={
                            outlet.entity_id
                              ? (entitiesById.get(outlet.entity_id)?.name ??
                                (entitiesLoading ? PENDING : undefined))
                              : undefined
                          }
                          brandName={
                            outlet.brand_id
                              ? (brandsById.get(outlet.brand_id)?.name ??
                                (brandsLoading ? PENDING : undefined))
                              : undefined
                          }
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
 * Two width decisions, both measured rather than guessed, and both there to protect one thing:
 * **the edit button in the last cell has to be on screen.** It is the whole point of the column,
 * and it is the first casualty of a table that is too wide, because it is last.
 *
 * *The text columns are capped.* A table's natural width is its longest cell, so an uncapped text
 * column is as wide as the worst record in it — the name column ran to **388px** on one
 * 54-character outlet name and holding entity to 296px on one long company, 684px of a 954px card
 * at 1280. That is why this table was already ~89px too wide at 1280 before this stage and fitted
 * 1440 only by luck. `/contracts` carries the same seven columns and fits at both widths for the
 * opposite reason: every one of its cells is a count, a date or a badge. Capping trades wrapped
 * rows for an ellipsis, and the full value of anything clipped is one click away on the outlet's
 * own page.
 *
 * *Address then appears only from 1440 up.* Capping alone left 185px of overflow at 1280 — enough
 * to take the actions cell off the edge — and no cap tight enough to fix that leaves a readable
 * address. So the column is the one that yields, which is what the plan allows ("drop the column
 * below a breakpoint only if it actually breaks"). Measured: 1440 and 1600 fit with it, 1280 fits
 * without it.
 *
 * The breakpoint is a viewport query and the constraint is really the *container*, which is 326px
 * narrower than the viewport with the sidebar expanded. They part company when the sidebar is
 * collapsed — the table then has room for Address at 1280 and will not show it. A container query
 * would be exact; this is the cheap version, and it errs toward hiding rather than clipping.
 */
function OutletRow({
  outlet,
  entityName,
  brandName,
  onFilterBrand,
  onEdit,
  rail,
}: {
  outlet: Outlet;
  /** The resolved name, `PENDING` while the index is in flight, or `undefined` for none. */
  entityName?: string;
  brandName?: string;
  onFilterBrand: (brandId: string) => void;
  onEdit: (outlet: Outlet) => void;
  /** Rail classes continuing a group's colour down the row's first cell. Absent when flat. */
  rail?: string;
}) {
  /**
   * A pipeline or fitting-out site shows its *target* date; anything else shows when it opened.
   * They are different columns in the schema and mean different things — a target is a plan and
   * can move, an opening date is a fact — so the cell says which one it is showing rather than
   * silently merging them into "Opening".
   */
  const planning = outlet.status === "pipeline" || outlet.status === "fitting_out";
  const date = planning ? outlet.target_opening_date : outlet.opening_date;

  return (
    <TableRow>
      {/* The width cap on this and the next two text columns is what keeps the table — and so the
          edit button in the last cell — on screen. See this component's docblock. The first cell
          carries the group rail when grouped (`border-l-4 pl-4` = 20px, matching the `pl-5`
          header and band), and the plain `pl-5` when flat. */}
      <TableCell className={cn("max-w-[24ch]", rail ? cn("border-l-4 pl-4", rail) : "pl-5")}>
        {/* The link fills the cell so the whole name is a target, rather than a click that has to
            land exactly on the text. Rows are not clickable as a whole: a row-level onClick makes
            text unselectable and cannot be opened in a new tab. */}
        <Link
          href={outletHref(outlet)}
          className="-mx-2 -my-1 block truncate rounded-md px-2 py-1 font-medium text-ink hover:text-brand hover:underline"
        >
          {outlet.name}
        </Link>
        {/* Still click-to-filter, now writing the id. It and the dropdown above are two
            controls over one filter rather than two narrowing mechanisms — the same property
            `?category=` has on the contracts table. */}
        {outlet.brand_id && brandName ? (
          <button
            type="button"
            onClick={() => onFilterBrand(outlet.brand_id!)}
            className="-mx-2 block max-w-full truncate rounded-md px-2 text-helper text-ink-secondary hover:text-brand hover:underline"
          >
            {brandName}
            <span className="sr-only"> — show only this brand</span>
          </button>
        ) : null}
      </TableCell>

      <TableCell className="text-ink-secondary">
        {OUTLET_TYPE_LABELS[outlet.outlet_type]}
      </TableCell>

      <TableCell>
        <Badge variant={OUTLET_STATUS_TONES[outlet.status]}>
          {OUTLET_STATUS_LABELS[outlet.status]}
        </Badge>
      </TableCell>

      <TableCell className="max-w-[22ch] truncate text-ink-secondary">
        <Value>{entityName}</Value>
      </TableCell>

      {/* Most of the imported rows have no address — the Lark export never carried one — so this
          column is mostly em dashes today, and that is the point of adding it: the gap is only
          fillable once somebody can see it. `formatAddress` returns EMPTY for an empty address,
          which `Value` recognises and renders with the "Not recorded" phrase behind it. */}
      <TableCell className="hidden max-w-[22ch] truncate text-ink-secondary min-[1440px]:table-cell">
        <Value>{formatAddress(outlet)}</Value>
      </TableCell>

      <TableCell>
        <Value>{date ? formatDate(date) : null}</Value>
        {date ? (
          <span className="block text-helper text-ink-tertiary">
            {planning ? "Target" : "Opened"}
          </span>
        ) : null}
      </TableCell>

      {/* Editing has existed since Phase 0 but only from the detail page, which is how it went
          unnoticed. Same sheet, one click closer. */}
      <TableCell className="pr-5 text-right">
        <Button variant="ghost" size="icon-sm" onClick={() => onEdit(outlet)}>
          <PencilIcon />
          <span className="sr-only">Edit {outlet.name}</span>
        </Button>
      </TableCell>
    </TableRow>
  );
}
