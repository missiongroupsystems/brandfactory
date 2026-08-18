"use client";

import Link from "next/link";
import {
  ChevronDownIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  Columns3Icon,
  LayersIcon,
  type LucideIcon,
  TagIcon,
} from "lucide-react";
import * as React from "react";

import { AddMenuButton } from "@/components/layout/add-menu-button";
import {
  ActiveFilterChips,
  type FilterChip,
  FilterPopover,
  FilterToolbar,
  PanelFilter,
  SearchField,
  SegmentedControl,
  ToggleButton,
} from "@/components/layout/filter-bar";
import { NEUTRAL_RAIL, railFor, type GroupRail } from "@/components/layout/group-rail";
import { HighlightMatch } from "@/components/layout/highlight-match";
import { NamesTooltip } from "@/components/layout/names-tooltip";
import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { LoadMore, TableCard, Value } from "@/components/layout/table-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BrandNamesCell,
  GROUP_LEVEL,
} from "@/features/registry-brands/components/brand-names-cell";
import { useBrandIndex } from "@/features/registry-brands/hooks";
import { useVendorIndex } from "@/features/registry-vendors/hooks";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { FLAG_ON, filterIdentity, isFlagOn, useQueryFilters } from "@/hooks/use-query-filters";
import {
  type Brand,
  type ContractCategory,
  type ContractStatus,
  hasContractValue,
  type RenewalType,
  type Vendor,
} from "@/lib/api/types";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatRelativeShort,
  PENDING,
} from "@/lib/format";
import { useTableDensityClasses } from "@/lib/table-density";
import { cn } from "@/lib/utils";
import {
  BILLING_FREQUENCY_LABELS,
  CONTRACT_CATEGORY_ICONS,
  CONTRACT_CATEGORY_LABELS,
  CONTRACT_CATEGORY_OPTIONS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_OPTIONS,
  CONTRACT_STATUS_TONES,
  RENEWAL_TYPE_ICONS,
  RENEWAL_TYPE_LABELS,
  RENEWAL_TYPE_OPTIONS,
  REVIEW_KIND_LABELS,
} from "@/lib/labels";

import type { ContractRecord } from "../api";
import { useContractPages } from "../hooks";
import { ContractForm } from "./contract-form";
import { DecisionActions, needsDecision } from "./contract-lifecycle";

const FILTER_KEYS = [
  "q",
  "category",
  "status",
  "renewal",
  "vendor_id",
  "brand_id",
  "notice_gap",
] as const;

/**
 * The five that live in the Filters panel — `q` is the one filter that stays on the row,
 * because search is what people reach for first and a search box behind a click is a
 * search box nobody uses. Also the set the trigger counts and the chips describe, which
 * is why counting `activeCount` from `useQueryFilters` would be wrong: it includes `q`,
 * and a "Filters ①" badge for a term already visible in the search box is a miscount.
 *
 * `outlet_id` is gone. It narrowed by *where the work happens*, which a marketing agreement
 * does not record — the brand it is held for is the question that replaced it.
 */
const PANEL_KEYS = [
  "category",
  "status",
  "renewal",
  "vendor_id",
  "brand_id",
  "notice_gap",
] as const;

/**
 * The only value this page ever *writes* into `?notice_gap=`. Reading is a separate rule —
 * `isFlagOn` — and collapsing the two is what let the control disagree with the URL.
 *
 * Both halves moved to `hooks/use-query-filters.ts` when `/service-reports` grew the product's
 * second boolean filter; the alias stays because this file reads better naming its own filter,
 * and because a page that writes `FLAG_ON` directly would be one rename away from writing a
 * value some other screen chose.
 */
const NOTICE_GAP_ON = FLAG_ON;

/**
 * The one dimension word read in more than one place, hoisted so it stays one word.
 *
 * `ContractColumn.header` promises the header, the `sr-only` label and the picker's checkbox are
 * one declaration; a glyph that names its own dimension is a further reader of the same word, and
 * a literal at the call site would be the drift that promise exists to prevent.
 *
 * This one **outlived its column**. Category is no longer a column at all — the glyph rides
 * inside the Contract cell — but the word is still what the filter chip, the legend heading and
 * the glyph's two accessible names are built from, so it stays a constant rather than becoming
 * four string literals the day one of them is reworded. `RENEWAL_HEADER` was its pair and is
 * gone: with the renewal cell no longer naming its own dimension, that word is read once, by
 * the column that owns it.
 */
const CATEGORY_HEADER = "Category";

/**
 * Whether the URL asks for the gap filter — the one reading behind the checkbox, the chip, the
 * trigger's count and the request. `isFlagOn` is that rule, shared since `/service-reports`.
 *
 * It was three readings, and they disagreed. The chip and the API call tested plain truthiness
 * while the checkbox tested the literal `"1"`, so **`?notice_gap=false` filtered the table**
 * (`"false"` is a non-empty string) while the checkbox sat unticked — and `?notice_gap=true`,
 * which is the API's own spelling and the form anyone writing the link by hand reaches for,
 * did the same. Clicking the box then looked broken, because it wrote the value already in
 * effect.
 *
 * The `false` half is the one that mattered: the backend is explicit that it means *do not
 * narrow* — `contract_operations.list_contracts` tests the parsed boolean, and
 * `test_notice_gap_false_and_absent_both_mean_do_not_narrow` pins it — so a table that filtered
 * on it was contradicting a rule the backend had written a test for.
 */
const noticeGapOn = isFlagOn;

// View options, held in the URL so they are shareable like any filter, but on their own
// instance so "Clear filters" leaves them alone. They differ in one way that matters:
// `group` stays *outside* `resultsKey` (it re-arranges the loaded rows), while `show`
// goes *inside* it (Current vs All changes the fetched set, so toggling must refetch).
// The URL key is `show` rather than the API's `view` because `?view=` already switches
// this page's tabs (contracts / vendors / health).
const VIEW_KEYS = ["group", "show"] as const;

/**
 * The value `?group=` takes when grouping is on.
 *
 * It was `outlet` and is `brand`, and an old link carrying `?group=outlet` therefore lands
 * ungrouped rather than grouped by a dimension that no longer exists. That is the honest
 * failure: silently reading any truthy value as "group by brand" would re-arrange a table
 * somebody linked to for a different reason, and the toggle is one click away.
 */
const GROUP_BY_BRAND = "brand";

/** The agreements. Auto-renewal is flagged in the table with its notice period — until
 * the generator's deadline lands on the dashboard, the table saying so is the warning. */
export function ContractsView() {
  const { filters, setFilter, setFilters, clearAll } = useQueryFilters(FILTER_KEYS);
  const { filters: viewFilters, setFilter: setViewFilter } = useQueryFilters(VIEW_KEYS);
  const [formOpen, setFormOpen] = React.useState(false);
  const { vendors } = useVendorIndex();
  // The index every brand name on this screen resolves through — the column, the group
  // bands and the filter's options, on one SWR key. It is load-bearing now in a way it was
  // not when brand was an off-by-default column: the grouping cannot draw a band without it.
  const { brands } = useBrandIndex();

  // Which columns are on screen. Held **here**, not in `ContractResults` — that component is
  // keyed on `resultsKey` and remounts on every filter change, so column state inside it would
  // silently snap back to the default the moment somebody narrowed the table they had just
  // arranged. Deliberately `useState` and not the URL: a reading posture is not a view worth
  // sharing, and `?cols=` on every pasted link would swamp the filters that are (§1.4 of the
  // plan). It resets on navigation away, which is the documented iteration-one behaviour.
  const [visibleColumns, setVisibleColumns] =
    React.useState<ReadonlySet<string>>(DEFAULT_COLUMN_IDS);

  const toggleColumn = React.useCallback((id: string) => {
    setVisibleColumns((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const resetColumns = React.useCallback(() => setVisibleColumns(DEFAULT_COLUMN_IDS), []);

  const showAll = viewFilters.show === "all";
  const grouped = viewFilters.group === GROUP_BY_BRAND;

  const vendorOptions = React.useMemo(
    () => vendors.map((v) => ({ value: v.id, label: v.name })),
    [vendors],
  );
  // Every brand, retired ones included. Retiring a brand does not un-sign the agreements
  // made for it — Eastside Kitchens is retired and is on three of them — so a filter that
  // hid them would answer "no contracts" about a brand with contracts, which is the reading
  // this page exists to prevent.
  const brandOptions = React.useMemo(
    () => brands.map((b) => ({ value: b.id, label: b.name })),
    [brands],
  );

  const noticeGap = noticeGapOn(filters.notice_gap);

  /**
   * What the category glyphs in the table write.
   *
   * A **toggle**, not a set: clicking the mop on a cleaning row narrows the table to cleaning,
   * and clicking any of them again widens it back. That second click is the half that has to be
   * deliberate — a filter you can turn on by clicking a row and can only turn off by finding a
   * chip somewhere else is a trap, and the reader's hand is already on the glyph.
   *
   * It writes the same `?category=` key the panel's select and the chip use, so all three are
   * one filter with three controls rather than a second narrowing mechanism the URL cannot
   * carry. Nothing here has its own state: the URL is the only place the answer lives.
   */
  const categoryFilter = React.useMemo(
    () => ({
      active: filters.category,
      toggle: (category: ContractCategory) =>
        setFilter("category", filters.category === category ? undefined : category),
    }),
    [filters.category, setFilter],
  );

  /** Clears the panel's five and leaves the search term alone — one write, because two
   *  back-to-back `setFilter` calls both build from the same rendered params and the
   *  second drops the first (see `setFilters`' docstring). */
  const clearPanel = React.useCallback(() => {
    setFilters(Object.fromEntries(PANEL_KEYS.map((key) => [key, null])));
  }, [setFilters]);

  // A chip per set panel filter, naming the dimension and the chosen option. The option
  // lists are the same ones the panel renders, so a chip can never disagree with the
  // control behind it — and an id whose record has not loaded yet reads as the raw value
  // rather than vanishing.
  const chips: FilterChip[] = React.useMemo(() => {
    const labelFor = (
      options: readonly { value: string; label: string }[],
      value: string,
    ) => options.find((option) => option.value === value)?.label ?? value;

    const dimensions: {
      key: (typeof PANEL_KEYS)[number];
      label: string;
      options: readonly { value: string; label: string }[];
    }[] = [
      { key: "category", label: "Category", options: CONTRACT_CATEGORY_OPTIONS },
      { key: "status", label: "Status", options: CONTRACT_STATUS_OPTIONS },
      { key: "renewal", label: "Renewal", options: RENEWAL_TYPE_OPTIONS },
      { key: "vendor_id", label: "Vendor", options: vendorOptions },
      { key: "brand_id", label: "Brand", options: brandOptions },
    ];

    const chips: FilterChip[] = dimensions.flatMap(({ key, label, options }) => {
      const value = filters[key];
      if (!value) return [];
      return [
        {
          key,
          label,
          value: labelFor(options, value),
          onRemove: () => setFilter(key, undefined),
        },
      ];
    });

    // Appended rather than folded into `dimensions`, because that shape is
    // {key, label, options} and a boolean has no option list — a one-option list faked to
    // fit would be a lie about the control behind the chip, which is the one thing this
    // pattern exists to prevent. "Missing" is the *value* half, so the chip reads as a
    // sentence in the same grammar as the others: "Notice period: Missing".
    if (noticeGap) {
      chips.push({
        key: "notice_gap",
        label: "Notice period",
        value: "Missing",
        onRemove: () => setFilter("notice_gap", undefined),
      });
    }

    return chips;
  }, [filters, noticeGap, vendorOptions, brandOptions, setFilter]);

  /**
   * What the trigger's badge counts — `chips.length`, not a second pass over `PANEL_KEYS`.
   *
   * The two are the same idea ("how many of the panel's filters are set") and were two
   * expressions, which is how `?notice_gap=false` came to be counted by one and ignored by
   * the other. `activeCount` from `useQueryFilters` is still the wrong number for a different
   * reason: it includes `q`, and a badge for a term already visible in the search box is the
   * miscount `FilterPopover` records.
   */
  const panelCount = chips.length;

  // Debounced *here*, above the remount boundary — see filterIdentity's docstring.
  const debouncedQ = useDebouncedValue(filters.q, 250);
  // `notice_gap` is **normalised** on the way down, not passed through: everything below this
  // line sees the canonical `"1"` or nothing, so the results component's plain truthiness test
  // is correct without repeating `noticeGapOn`. One boundary decides what the URL meant.
  const resultsFilters = React.useMemo(
    () => ({
      ...filters,
      q: debouncedQ,
      notice_gap: noticeGap ? NOTICE_GAP_ON : undefined,
    }),
    [filters, debouncedQ, noticeGap],
  );
  const resultsKey = `${filterIdentity(FILTER_KEYS, resultsFilters)}&show=${showAll ? "all" : ""}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar and chips are one block — the chips describe the row above them, so they
          sit at gap-3 from it rather than at the page's gap-4 from everything. */}
      <div className="flex flex-col gap-3">
        <FilterToolbar
          actions={
            <>
              {/* "Current" is live work: resolved history — terminated, and expired rows
                  already renewed or closed off — needs the explicit toggle. Unresolved
                  expiries are never hidden; hiding them is how decisions get lost. */}
              <SegmentedControl
                label="Which contracts to show"
                value={showAll ? "all" : "current"}
                options={[
                  { value: "current", label: "Current" },
                  { value: "all", label: "All" },
                ]}
                onChange={(value) =>
                  setViewFilter("show", value === "all" ? "all" : undefined)
                }
              />
              <ToggleButton
                pressed={grouped}
                onPressedChange={(next) =>
                  setViewFilter("group", next ? GROUP_BY_BRAND : undefined)
                }
              >
                <LayersIcon data-icon="inline-start" />
                Group by brand
              </ToggleButton>
              {/* F3: the primary action is now a split button — Manual add (this form) or
                  Upload (a drop-a-PDF popup, UI only). */}
              <AddMenuButton
                label="New contract"
                noun="contract"
                onManualAdd={() => setFormOpen(true)}
              />
            </>
          }
        >
          <SearchField
            label="Search contracts by title or vendor"
            placeholder="Title or vendor"
            value={filters.q}
            onChange={(value) => setFilter("q", value)}
          />
          <FilterPopover activeCount={panelCount} onClear={clearPanel}>
            {/* Brand leads the panel, because it is now the dimension the table is *about*
                — the grouping, the band and the column that no longer has to earn its width.
                It was last, beside Outlet, on the argument that both narrowed by where the
                work happens; that argument left with the outlet. */}
            <PanelFilter
              label="Brand"
              allLabel="All brands"
              value={filters.brand_id}
              options={brandOptions}
              onChange={(value) => setFilter("brand_id", value)}
            />
            <PanelFilter
              label="Category"
              allLabel="All categories"
              value={filters.category}
              options={CONTRACT_CATEGORY_OPTIONS}
              onChange={(value) => setFilter("category", value)}
            />
            <PanelFilter
              label="Status"
              allLabel="All statuses"
              value={filters.status}
              options={CONTRACT_STATUS_OPTIONS}
              onChange={(value) => setFilter("status", value)}
            />
            <PanelFilter
              label="Renewal"
              allLabel="All renewal types"
              value={filters.renewal}
              options={RENEWAL_TYPE_OPTIONS}
              onChange={(value) => setFilter("renewal", value)}
            />
            <PanelFilter
              label="Vendor"
              allLabel="All vendors"
              value={filters.vendor_id}
              options={vendorOptions}
              onChange={(value) => setFilter("vendor_id", value)}
            />
            {/* A checkbox, not a `PanelFilter` — a Select holding "All / Missing" is the
                "menu for a boolean" AGENTS.md calls out, and it would make the unset state
                a chooseable option rather than an absence. The label is the review queue's
                own words (`REVIEW_KIND_LABELS`), so the two places that gather these rows
                cannot describe them differently. */}
            <label className="flex items-start gap-2 border-t border-border-subtle pt-3">
              <Checkbox
                className="mt-0.5"
                checked={noticeGap}
                onChange={(event) =>
                  setFilter("notice_gap", event.target.checked ? NOTICE_GAP_ON : undefined)
                }
              />
              <span className="text-helper font-medium text-ink-secondary">
                {REVIEW_KIND_LABELS.contract_notice_period_missing}
              </span>
            </label>
          </FilterPopover>
          <ColumnsPopover
            visible={visibleColumns}
            onToggle={toggleColumn}
            onReset={resetColumns}
          />
        </FilterToolbar>

        <ActiveFilterChips chips={chips} onClear={clearAll} />
      </div>

      <ContractResults
        key={resultsKey}
        filters={resultsFilters}
        showAll={showAll}
        groupByBrand={grouped}
        visibleColumns={visibleColumns}
        categoryFilter={categoryFilter}
      />

      <ContractForm open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}

/**
 * The two cached indexes every derived cell reads.
 *
 * They are handed to the column rather than resolved by the caller because a column has to be
 * one declaration — a cell that needed its own prop threaded down from `ContractResults` could
 * not be added or hidden without editing three places, which is exactly what this model exists
 * to stop. Both are already loaded for the page; nothing here issues a request.
 *
 * **It was four.** `outletById` and `entityById` went with the Coverage column, and with them
 * went the two-hop resolution that made the brand cell the most fragile in the table: brand is
 * one hop off the row's own `brand_ids` now, so "the index has not arrived" has exactly one way
 * to be true rather than two.
 */
type ColumnLookups = {
  vendorById: Map<string, Vendor>;
  brandById: Map<string, Brand>;
};

/**
 * The category filter, as the one cell that can *write* it needs to see it.
 *
 * A cell has been a pure function of the row until now, which is why this is a named type rather
 * than two more loose props: the category glyph is the first cell in this table that is a
 * control, and a control needs to know whether it is on as well as how to flip it.
 */
type CategoryFilter = {
  /** The category the URL is currently narrowed to, if any. */
  active: string | undefined;
  /** Set it, or clear it when it is already the active one. */
  toggle: (category: ContractCategory) => void;
};

/**
 * What a cell is handed: the row, the lookups its derivation needs, **what else is on screen**,
 * and the one filter a cell can write.
 *
 * `visible` is the id set of the columns being rendered. Exactly one cell reads it — the
 * Contract cell drops its vendor subtext when the Vendor column is on — and that is a fact
 * about the *row*, not about the contract: the same title cell is correct with the subtext and
 * correct without it depending on a neighbour. The alternative is the vendor name printed twice
 * in one row, which is the mirror of the decision that keeps billing frequency inside the Value
 * cell instead of giving it a column.
 */
type ColumnContext = ColumnLookups & {
  contract: ContractRecord;
  visible: ReadonlySet<string>;
  category: CategoryFilter;
  /** The applied search term, so the two searchable cells (title, vendor) can mark the run
   *  that matched — search now spans title *and* vendor name, so the reader needs the why. */
  q?: string;
};

/**
 * One column of the contracts table.
 *
 * The table was seven hand-written `<TableCell>` pairs until this model, kept that way on
 * purpose while the awkward cells were being written — two-line Contract, three-way Coverage,
 * the Renewal branch where the dangerous value keeps its words. Generalising *after* those
 * exist is why they all fit; guessing at them first is how a column model ends up with an
 * escape hatch on every second entry.
 */
type ContractColumn = {
  id: string;
  /**
   * The column's word — **present on every column, `headerIcon` or not**. It is the header
   * text, the `sr-only` label behind a glyph header, the picker's checkbox label and the
   * legend's key: four things that must agree, so they are one declaration.
   */
  header: string;
  /** Renders instead of the word, with `header` carried as `sr-only` text and a tooltip. */
  headerIcon?: LucideIcon;
  /** In the set the table opens with. */
  defaultVisible: boolean;
  /** Cannot be hidden. A table whose first column can be turned off has no row identity. */
  alwaysOn?: boolean;
  /**
   * Alignment, applied to the header **and** the cell from one declaration. Two className
   * strings could disagree, and a right-aligned money column under a left-aligned header is
   * the kind of thing that survives review because each half looks fine on its own.
   */
  align?: "right";
  headClassName?: string;
  /**
   * Applied to every cell in the column, including the branches that do not need it. A cell
   * renders its *contents*; the row owns the `<TableCell>`, because the rail and the trailing
   * padding are positional (see `ContractRow`) and a cell that wrapped itself could not be
   * told where it sits.
   */
  cellClassName?: string;
  cell: (ctx: ColumnContext) => React.ReactNode;
};

const COLUMNS: readonly ContractColumn[] = [
  {
    id: "contract",
    header: "Contract",
    defaultVisible: true,
    alwaysOn: true,
    // 27ch, truncating — 24ch of title plus the ~3ch the category glyph and its gap now take
    // in front of it. The cap is the same idea it has been since 0.12.0 and for the same
    // reason: a table is as wide as its longest cell, and uncapped this column was **482px**,
    // a third of the whole table, driven by one 65-character title. Widening it by 3ch while
    // deleting a whole ~44px column is still a net narrowing. The full text stays reachable
    // through `title` and is one click away on the detail page.
    cellClassName: "max-w-[27ch]",
    cell: ({ contract, vendorById, visible, category, q }) => {
      const vendorName = vendorById.get(contract.vendor_id)?.name;
      return (
        // `items-start`, not `items-center`: with the vendor subtext on, this cell is two lines
        // and a centred glyph floats into the gap between them. It belongs on the title's line.
        <div className="flex items-start gap-2">
          <CategoryGlyph contract={contract} filter={category} />
          <div className="min-w-0 flex-1">
            <Link
              href={`/contracts/${contract.id}`}
              title={contract.title}
              className="-mx-2 -my-1 block truncate rounded-md px-2 py-1 font-medium text-ink hover:text-brand hover:underline"
            >
              <HighlightMatch text={contract.title} query={q} />
            </Link>
            {/* The vendor rides under the title only while it has nowhere better to be. With the
                Vendor column on, this is the same name twice in one row — noise, and one of the two
                is then sortable-by-eye down a column while the other is not. Highlighted here too,
                because a search now matches vendor name and this subtext is where that match shows. */}
            {visible.has("vendor") ? null : (
              <span className="mt-0.5 block truncate pl-0 text-helper text-ink-tertiary">
                {vendorName ? <HighlightMatch text={vendorName} query={q} /> : "…"}
              </span>
            )}
          </div>
        </div>
      );
    },
  },
  {
    // Its own column, for the reading Ops actually does: scanning *by vendor* down a list.
    // Subtext under a title cannot be scanned that way — it is indented, in helper ink, and
    // interleaved with titles of varying length. Off by default because on a narrow table the
    // subtext is the right answer; see the Contract cell for the other half of the trade.
    id: "vendor",
    header: "Vendor",
    defaultVisible: false,
    // 20ch — "Comprehensive Facilities Management Pte Ltd" is 43 characters and this column
    // would otherwise set the table's width on behalf of one row. Links to the vendor page
    // once `vendors-as-an-area` lands; text until then, because there is nowhere to link to.
    cellClassName: "max-w-[20ch] text-ink-secondary",
    cell: ({ contract, vendorById, q }) => {
      const name = vendorById.get(contract.vendor_id)?.name;
      // `PENDING` rather than the em dash while the index is still loading: every contract has
      // a vendor (`vendor_id` is NOT NULL), so an absent name is a pending request and never a
      // missing fact. Rendering `—` would state the opposite. The Coverage cell owes its
      // pending states to this argument.
      return name ? (
        <span className="block truncate" title={name}>
          <HighlightMatch text={name} query={q} />
        </span>
      ) : (
        PENDING
      );
    },
  },
  // Category was a column here — a `TagIcon` header over one glyph per row — and is not one
  // any more. Two arguments, and the second is the one that settled it:
  //
  //   - **A column costs a header, a picker row and ~44px to carry a 16px glyph** that is a
  //     *property of the contract*, not a measurement of it like a date or a figure. Riding in
  //     front of the title, it reads as part of the row's identity, which is what it is.
  //   - **The glyph is now a control.** A cell that filters the table cannot sit under a header
  //     the reader can hide: hiding the Category column would have taken the category filter
  //     off the table with it, leaving a control that exists on Tuesdays. Inside the `alwaysOn`
  //     Contract column it is always reachable.
  //
  // What was lost is the ability to scan categories down a column. That reading is served by
  // clicking one glyph — which is now what filtering *is* — and the row order is unchanged, so
  // the eye can still run down the left edge of the titles where the glyphs line up.
  // Coverage was a column here — outlets, and the companies holding them, merged into one
  // cell after Stage 3's width work — and is not one any more, because a contract no longer
  // names an outlet. What replaced it is the column below, and the trade is strictly in the
  // table's favour: `⌂ 3 · 🏢 2` was two derived counts over two indexes, and every state it
  // had to render was a way of saying "not yet".
  {
    // **On by default, and it was not.** Brand was the third registry dimension, two hops off
    // the row, off by default on the argument that the *filter* answered the useful question
    // and the column only answered a rarer one — "which brands is *this* contract for" — at a
    // width the table had fought six stages to reclaim.
    //
    // Both halves of that argument have changed. It is the row's own field, so the cell is a
    // value rather than a derivation; and it is what the table groups by, so a reader who
    // turns grouping off and finds no brand anywhere has lost the dimension the screen is
    // organised around. A column that is hidden by default while the toggle beside it is
    // named after the same word reads as a bug.
    id: "brand",
    header: "Brand",
    headerIcon: TagIcon,
    defaultVisible: true,
    // 18ch — brand names are short ("Harbour Table" is 13) but they are free text, and one
    // long one would otherwise set this column's width on behalf of a single row.
    cellClassName: "max-w-[18ch] text-ink-secondary",
    cell: ({ contract, brandById }) => (
      // The zero case takes the default — an agreement naming no brand is held at group level,
      // which is a decision rather than a gap. The vendors table passes its own node there,
      // because its zero has a second reading.
      <BrandNamesCell brandIds={contract.brand_ids} brandById={brandById} />
    ),
  },
  {
    // A term is two dates and the table has only ever shown one. Off by default: "when does
    // this end" is the question that generates work, and "when did it start" is the one you
    // ask once you are already looking at the row.
    id: "starts",
    header: "Starts",
    defaultVisible: false,
    cellClassName: "text-ink-secondary",
    cell: ({ contract }) => formatDate(contract.start_date),
  },
  {
    id: "ends",
    header: "Ends",
    defaultVisible: true,
    cellClassName: "text-ink-secondary",
    cell: ({ contract }) => formatDate(contract.end_date),
  },
  {
    // The date leads and the number supports — "give notice by 3 Oct" is what gets acted on,
    // where "60-day notice" still needs arithmetic done to it. §3.4 of the plan asks Ops to
    // confirm that against the built column.
    id: "notice",
    header: "Notice by",
    defaultVisible: true,
    // Capped for the gap branch, which is the only cell here that may never be shortened
    // (§1.6) and so takes height instead of width. See `NoticeByCell`.
    cellClassName: "max-w-[18ch] text-ink-secondary",
    cell: ({ contract }) => <NoticeByCell contract={contract} />,
  },
  {
    // Off by default, and not only for width: a money column visible by default on a laptop
    // open in a dining room is a decision nobody made. See `ValueCell` for the three states.
    id: "value",
    header: "Value",
    defaultVisible: false,
    // Right-aligned so the magnitudes line up and the column is sized by its widest figure
    // rather than by proportional digits. `tabular-nums` is already on every `td` from the
    // base layer (globals.css §5.3), so nothing here has to ask for it.
    align: "right",
    cell: ({ contract }) => <ValueCell contract={contract} />,
  },
  {
    id: "renewal",
    header: "Renewal",
    defaultVisible: true,
    cell: ({ contract }) => <RenewalCell contract={contract} />,
  },
  {
    id: "status",
    header: "Status",
    defaultVisible: true,
    cell: ({ contract }) => <StatusCell contract={contract} />,
  },
  {
    // The data-quality column. After a 158-row import, "has anyone actually touched this"
    // is what tells you whether a blank field is a decision or an omission — and that is a
    // different question from any of the dates above it, all of which came from the contract.
    id: "updated",
    header: "Updated",
    defaultVisible: false,
    cellClassName: "text-ink-secondary",
    cell: ({ contract }) => (
      // Relative and short, with the exact instant in the tooltip: "6 Aug 2026, 14:32" is 17
      // characters for a column nobody reads to the minute, and the reader who does care is
      // one hover or one Tab away. `NamesTooltip` rather than a second hover affordance — its
      // dashed underline already means "there is more here" and its trigger is a real button,
      // so keyboard focus opens it.
      <NamesTooltip
        label={formatRelativeShort(contract.updated_at)}
        names={[formatDateTime(contract.updated_at)]}
      />
    ),
  },
];

/**
 * The set the table opens with, and what "Reset" goes back to.
 *
 * A frozen `Set` rather than a list of columns, because that is the shape the picker holds and
 * the shape identity comparison needs: `visible === DEFAULT_COLUMN_IDS` is not the test (a
 * reader can toggle a column off and back on), so `isDefaultColumnSet` compares contents.
 */
const DEFAULT_COLUMN_IDS: ReadonlySet<string> = new Set(
  COLUMNS.filter((column) => column.defaultVisible).map((column) => column.id),
);

/** Whether the reader has changed anything — what the trigger's active state and the panel's
 *  "Reset" both key off. Same size and same members, since a swap is possible in one step. */
function isDefaultColumnSet(visible: ReadonlySet<string>): boolean {
  return (
    visible.size === DEFAULT_COLUMN_IDS.size &&
    [...DEFAULT_COLUMN_IDS].every((id) => visible.has(id))
  );
}

/**
 * The column picker, and the legend Stage 3 owes.
 *
 * **A `Popover`, not a `DropdownMenu`** — the same rule that puts the filter panel in one
 * (`AGENTS.md`): a menu is `role="menu"` and promises `menuitem` children with roving arrow-key
 * focus, which fights the checkboxes inside and announces "menu, 11 items" over what are
 * actually eleven form controls.
 *
 * Two things it does beyond switching columns:
 *
 * - **Every row carries the column's glyph beside its name**, so the panel that already had to
 *   list every column by name *is* the key to the header icons. Stage 3 compressed Category to
 *   twelve glyphs and named a legend as the debt that left; this is where it comes due.
 * - **`alwaysOn` and the last optional column render as disabled, checked boxes** rather than
 *   vanishing from the list. "Why can't I hide this one" is answered by seeing the control and
 *   finding it fixed; a missing row answers nothing.
 */
function ColumnsPopover({
  visible,
  onToggle,
  onReset,
}: {
  visible: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onReset: () => void;
}) {
  const isDefault = isDefaultColumnSet(visible);
  // The last optional column standing. A table of nothing but the title is not a state worth
  // being able to reach, and the honest way to prevent it is a control that refuses rather than
  // a toggle that appears to work and renders an empty row.
  const lastOptional =
    COLUMNS.filter((column) => !column.alwaysOn && visible.has(column.id)).length === 1;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="secondary"
            // The same `--surface-selected` treatment as a set filter, and deliberately **no
            // count**: "Columns ③" would have to mean "three changes from default", which is a
            // different idea from "three filters set" wearing the same badge. One idea, two
            // controls, no miscount — the mistake `FilterPopover`'s comment records.
            data-active={isDefault ? undefined : ""}
            className="data-active:border-border-strong data-active:bg-surface-selected"
          >
            <Columns3Icon data-icon="inline-start" />
            Columns
          </Button>
        }
      />
      <PopoverContent className="flex max-h-[70vh] w-80 flex-col gap-3 overflow-y-auto">
        <div className="flex items-center justify-between gap-3">
          <p className="text-helper font-medium text-ink">Columns</p>
          {isDefault ? null : (
            <Button variant="ghost" size="xs" onClick={onReset}>
              Reset
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {COLUMNS.map((column) => {
            const checked = visible.has(column.id);
            const fixed = column.alwaysOn === true || (checked && lastOptional);
            const Icon = column.headerIcon;

            return (
              <label
                key={column.id}
                className={cn(
                  "flex items-center gap-2 text-helper text-ink-secondary",
                  fixed && "text-ink-tertiary",
                )}
                title={
                  column.alwaysOn
                    ? "Always shown — it is what names the row"
                    : fixed
                      ? "One column beside the title stays on"
                      : undefined
                }
              >
                <Checkbox
                  checked={checked}
                  disabled={fixed}
                  onChange={() => onToggle(column.id)}
                />
                {/* The glyph the header shows, or a spacer holding its place so the names line
                    up. `aria-hidden` on both: the column's word is right beside it, and a second
                    reading of the same fact is what `GlyphCell`'s rules exist to prevent. */}
                {Icon ? (
                  <Icon aria-hidden className="size-4 shrink-0 text-ink-tertiary" />
                ) : (
                  <span aria-hidden className="size-4 shrink-0" />
                )}
                <span className="min-w-0 flex-1">{column.header}</span>
                {/* Why the box is fixed, in the row itself. A disabled control with no stated
                    reason is the "why can't I hide this one" this panel exists to answer, and
                    answering it only in a `title` answers it only for a mouse. */}
                {column.alwaysOn ? (
                  <span className="shrink-0 text-ink-tertiary">Always</span>
                ) : fixed ? (
                  <span className="shrink-0 text-ink-tertiary">Last one</span>
                ) : null}
              </label>
            );
          })}
        </div>

        {/* The legend, and now also the only written notice that the glyphs are clickable.
            Eleven glyphs is a vocabulary, not a hint — Stage 3 shipped it behind `sr-only` text
            and a tooltip apiece, which answers "what is this one" and never "what are the
            eleven". It stays in this panel although Category is no longer a column: this is
            still the panel a reader wondering about the table's presentation opens, and the
            Filters popover is a `w-72` column of controls with no scroll, which eleven rows
            would overflow off the bottom of. Labels wrap rather than truncate: a legend with a
            clipped word in it is not a legend. */}
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
          <p className="text-helper font-medium text-ink">Category icons</p>
          <p className="text-helper text-ink-tertiary">
            In front of each contract&rsquo;s title. Click one to filter the table to that
            category, and click it again to clear.
          </p>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {CONTRACT_CATEGORY_OPTIONS.map((option) => {
              const Icon = CONTRACT_CATEGORY_ICONS[option.value];
              return (
                <li
                  key={option.value}
                  className="flex items-start gap-2 text-helper leading-tight text-ink-secondary"
                >
                  <Icon aria-hidden className="mt-px size-4 shrink-0 text-ink-tertiary" />
                  <span className="min-w-0">{option.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ContractResults({
  filters,
  showAll,
  groupByBrand,
  visibleColumns,
  categoryFilter,
}: {
  filters: Partial<Record<(typeof FILTER_KEYS)[number], string>>;
  showAll: boolean;
  groupByBrand: boolean;
  /** Ids, from the picker in the parent. Order comes from `COLUMNS`, never from the order a
   *  reader ticked them: the table's column order is a property of the table. */
  visibleColumns: ReadonlySet<string>;
  /** Read and written by the category glyph in every Contract cell. Owned by the parent
   *  because it is the URL, and this component is remounted whenever the URL changes. */
  categoryFilter: CategoryFilter;
}) {
  // The band cannot inherit the row height — it is a cell with `p-0` and a button inside — so it
  // asks the ladder for the rung the cells got (`lib/table-density.ts`).
  const { band } = useTableDensityClasses();

  const columns = React.useMemo(
    () => COLUMNS.filter((column) => visibleColumns.has(column.id)),
    [visibleColumns],
  );

  const { byId: vendorById } = useVendorIndex();
  // Deduplicated against the parent's `useBrandIndex` by SWR — same key, one request. Read
  // unconditionally rather than behind `visibleColumns.has("brand")`: a hook cannot be
  // conditional, the catalogue is already being fetched for the filter's options, and the
  // grouping below needs it whatever the column picker says.
  const { byId: brandById } = useBrandIndex();

  // Bundled once rather than threaded as two props: a column declares what it derives, and
  // the row hands it the same maps whichever columns are on screen.
  const lookups: ColumnLookups = React.useMemo(
    () => ({ vendorById, brandById }),
    [vendorById, brandById],
  );

  const { items, error, isLoading, hasMore, isLoadingMore, loadMore } = useContractPages({
    q: filters.q, // already debounced by the parent, which keys this component on it
    category: filters.category as ContractCategory | undefined,
    status: filters.status as ContractStatus | undefined,
    renewal_type: filters.renewal as RenewalType | undefined,
    vendor_id: filters.vendor_id,
    brand_id: filters.brand_id,
    // `true` or nothing — never `false`. See `NOTICE_GAP_ON` and `ContractFilters`.
    notice_gap: filters.notice_gap ? true : undefined,
    view: showAll ? "all" : undefined,
  });

  /**
   * Grouping fans a contract out under *each* brand it is held for — "what do we spend on
   * Kopi & Co" is the question being answered, and a tracking study bought for all four
   * brands is genuinely part of each of their answers. A row therefore appears more than
   * once when it names more than one brand, which is the same fan-out the outlet grouping
   * did and for the same reason: the alternative is a "several brands" bucket that answers
   * nobody's question.
   *
   * **`Group level` is a bucket, not a gap.** Six of the agreements name no brand at all —
   * a seat licence, a press office retainer — and they are not unattributed data waiting to
   * be fixed; they are held for the whole group. The band says so in words and sorts last,
   * because it is an absence of a *category* rather than a category.
   *
   * A brand id the index has not resolved renders `…` and never "Unknown brand". Every
   * `brand_id` here is a real reference, so a name absent from the map is a request in
   * flight — the rule `AGENTS.md` states, and the one this table got wrong once before.
   */
  const groups = React.useMemo(() => {
    if (!groupByBrand) return null;
    const buckets = new Map<string | null, ContractRecord[]>();
    for (const contract of items) {
      const brandIds = contract.brand_ids.length > 0 ? contract.brand_ids : [null];
      for (const brandId of brandIds) {
        const bucket = buckets.get(brandId) ?? [];
        bucket.push(contract);
        buckets.set(brandId, bucket);
      }
    }
    return [...buckets.entries()]
      .map(([brandId, contracts]) => ({
        brandId,
        name: brandId ? (brandById.get(brandId)?.name ?? PENDING) : GROUP_LEVEL,
        contracts,
      }))
      .sort((a, b) => {
        if (a.brandId === null) return 1;
        if (b.brandId === null) return -1;
        return a.name.localeCompare(b.name);
      });
  }, [groupByBrand, items, brandById]);

  // Which groups are folded away. A Set of brand ids rather than a per-group `open` flag
  // so the default is expanded — a table that opens collapsed hides the data it exists to
  // show. Held here rather than in the URL: it is a reading posture, not a view worth
  // sharing, and thirty ids would swamp the link that `useQueryFilters` keeps pasteable.
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const toggleGroup = React.useCallback((id: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const allCollapsed = groups !== null && groups.length > 0 && collapsed.size === groups.length;

  const toggleAll = React.useCallback(() => {
    setCollapsed(
      allCollapsed || groups === null
        ? new Set<string>()
        : new Set(groups.map((group) => groupKey(group.brandId))),
    );
  }, [allCollapsed, groups]);

  if (error) return <QueryError error={error} />;
  if (isLoading) return <LoadingRows rows={5} />;

  if (items.length === 0) {
    const activeKeys = Object.entries(filters)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key);
    const filtered = activeKeys.length > 0;
    // Echo the term only when search is the *sole* active filter — otherwise "match 'lbs'"
    // would lie about the category/status also narrowing the table.
    const onlyQ = Boolean(filters.q) && activeKeys.every((key) => key === "q");
    return (
      <EmptyState
        message={
          onlyQ
            ? `No contracts match “${filters.q}”`
            : filtered
              ? "No contracts match these filters"
              : "No contracts yet"
        }
        hint={
          onlyQ
            ? "Search covers contract title and vendor name."
            : filtered
              ? "Clear a filter to widen the search."
              : "Record the agreements — coverage, renewal terms and schedules all hang off them."
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groups ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <p className="text-helper text-ink-secondary">
            {groups.length} {groups.length === 1 ? "group" : "groups"}
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
      ) : null}

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              {/* First cell `pl-5`, last `pr-5` — by position, not by column id, so hiding
                  either end keeps the edges. 20px either way on the left: ungrouped that is
                  `pl-5`, grouped it is the 4px rail plus the row's `pl-4`. The header has to
                  match the rows under it or the whole first column reads as misaligned. */}
              {columns.map((column, index) => (
                <TableHead
                  key={column.id}
                  className={cn(
                    index === 0 && "pl-5",
                    index === columns.length - 1 && "pr-5",
                    column.align === "right" && "text-right",
                    column.headClassName,
                  )}
                >
                  {column.headerIcon ? (
                    <IconHeader icon={column.headerIcon} label={column.header} />
                  ) : (
                    column.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups
              ? groups.map((group) => {
                  const key = groupKey(group.brandId);
                  const rail = railForGroup(key);
                  const isCollapsed = collapsed.has(key);

                  return (
                    <React.Fragment key={key}>
                      {/* The band. `border-t border-border` is the full-strength divider
                          rather than the hairline rows use — a group boundary has to out-rank
                          a row boundary or the sections read as one continuous table, which
                          is exactly what they did before. */}
                      <TableRow className="border-t border-border bg-surface-sunken hover:bg-surface-sunken">
                        {/* Spans whatever is on screen. Hard-coded at 7 until the column
                            model, which is a band that stops short of the table edge the
                            first time somebody hides a column — visible, and only then. */}
                        <TableCell
                          colSpan={columns.length}
                          className={cn("border-l-4 p-0", band, rail.band)}
                        >
                          <button
                            type="button"
                            onClick={() => toggleGroup(key)}
                            aria-expanded={!isCollapsed}
                            className={cn(
                              "flex w-full items-center gap-2 pr-5 pl-3.5 text-left",
                              band,
                            )}
                          >
                            <ChevronDownIcon
                              aria-hidden
                              className={cn(
                                "size-4 shrink-0 text-ink-tertiary transition-transform duration-[120ms]",
                                isCollapsed && "-rotate-90",
                              )}
                            />
                            <span className="font-medium text-ink">{group.name}</span>
                            <Badge variant="outline" className="bg-surface">
                              {group.contracts.length}
                            </Badge>
                            {/* The chevron carries the state visually; this carries it in
                                words, because a rotation is not a label. */}
                            <span className="sr-only">
                              {isCollapsed ? "Expand group" : "Collapse group"}
                            </span>
                          </button>
                        </TableCell>
                      </TableRow>

                      {isCollapsed
                        ? null
                        : group.contracts.map((contract) => (
                            <ContractRow
                              key={`${key}-${contract.id}`}
                              contract={contract}
                              columns={columns}
                              lookups={lookups}
                              categoryFilter={categoryFilter}
                              q={filters.q}
                              rail={rail.rows}
                            />
                          ))}
                    </React.Fragment>
                  );
                })
              : items.map((contract) => (
                  <ContractRow
                    key={contract.id}
                    contract={contract}
                    columns={columns}
                    lookups={lookups}
                    categoryFilter={categoryFilter}
                    q={filters.q}
                  />
                ))}
          </TableBody>
        </Table>
      </TableCard>

      <LoadMore
        loadedCount={items.length}
        noun="contract"
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
      />
    </div>
  );
}

/**
 * One contract, rendered as whatever columns it is handed.
 *
 * Two things the row owns rather than the columns, because both are facts about *position*
 * and a cell cannot know where it sits:
 *
 * - **The first visible cell carries the rail** — `border-l-4 pl-4` grouped, `pl-5` ungrouped,
 *   20px either way, matching the header. Applied by index and not by column id: the title
 *   column is `alwaysOn` today, but a rail that only lands on `id === "contract"` is a first
 *   column reading as misaligned the day that stops being true.
 * - **The last visible cell keeps `pr-5`.**
 */
function ContractRow({
  contract,
  columns,
  lookups,
  categoryFilter,
  q,
  rail,
}: {
  contract: ContractRecord;
  columns: readonly ContractColumn[];
  lookups: ColumnLookups;
  categoryFilter: CategoryFilter;
  /** Applied search term, forwarded to the cells that mark their match. */
  q?: string;
  /** Border classes continuing the group's rail down the row. Absent when ungrouped. */
  rail?: string;
}) {
  // Rebuilt per row rather than hoisted: it is derived from `columns`, which is the same
  // reference for every row on a render, so the cost is a Set of seven strings and the
  // alternative is a second parameter that can disagree with the list it describes.
  const ctx: ColumnContext = {
    contract,
    ...lookups,
    visible: new Set(columns.map((column) => column.id)),
    category: categoryFilter,
    q,
  };

  return (
    <TableRow>
      {columns.map((column, index) => (
        <TableCell
          key={column.id}
          className={cn(
            index === 0 && (rail ? cn("border-l-4 pl-4", rail) : "pl-5"),
            index === columns.length - 1 && "pr-5",
            column.align === "right" && "text-right",
            column.cellClassName,
          )}
        >
          {column.cell(ctx)}
        </TableCell>
      ))}
    </TableRow>
  );
}

/**
 * Renewal, where the asymmetry is the point — **and where a bare glyph was not enough of it.**
 *
 * Until now `auto` kept a worded ochre badge while `manual` and `none` were muted glyphs and
 * nothing else. The intent was right: two thirds of rows should not carry a pill announcing
 * that nothing is wrong. The execution failed at the thing a table is for. A pen line and a
 * minus circle, both 16px and both in tertiary ink, are the same grey mark at reading distance —
 * so a reader scanning the column could tell which rows were *not* auto-renewing and could not
 * tell, without hovering each one, which of the other two they were. A vocabulary you have to
 * hover to read is not a vocabulary.
 *
 * So the asymmetry moved from **presence** to **treatment**, and every row now carries its word:
 *
 * - `auto` → the ochre pill, glyph and all. Unchanged, and still the only thing here with a
 *   background: it is the value that generates work, and the notice deadline in the column
 *   beside it is the work.
 * - `manual` / `none` → the glyph *plus its label* in tertiary ink, no pill, no border. Present
 *   enough to read in one pass, quiet enough not to compete with the row above it.
 *
 * This costs no width. The column has always been sized by "Auto-renews" at badge padding, and
 * "No renewal" in bare tertiary text is narrower than that. `RENEWAL_TYPE_TONES` still maps
 * `manual` and `none` to `outline`; it is no longer read here, because the quiet branch is not
 * a badge at all — the tones stay for the filter panel and the detail page, which have room.
 */
function RenewalCell({ contract }: { contract: ContractRecord }) {
  const Icon = RENEWAL_TYPE_ICONS[contract.renewal_type];
  const label = RENEWAL_TYPE_LABELS[contract.renewal_type];

  if (contract.renewal_type === "auto") {
    return (
      <Badge variant="warning">
        <Icon data-icon="inline-start" aria-hidden />
        {label}
      </Badge>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-helper text-ink-tertiary">
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {label}
    </span>
  );
}

/**
 * What the contract is worth, and the billing frequency that makes the figure mean something.
 *
 * **Three states, and the middle one is the reason this is not a null test.** `ContractRead` has
 * no `value` key *at all* for a caller who may not see it — not null, absent — so the cell
 * narrows with `hasContractValue()`:
 *
 * - the figure, when the field is there and set;
 * - **"On file"**, when it is absent and `has_value` (which is on both shapes) is true — a figure
 *   exists and this caller may not see it;
 * - the em dash, when no figure is recorded. A reader must be able to tell "nothing was agreed"
 *   from "you are not allowed to know", and `value: null` cannot carry that difference.
 *
 * Under `AUTH_MODE=token` every caller is the alpha admin, so only the first and third states are
 * reachable today. The middle branch is written anyway — it is the one nobody will remember to add
 * once identity exists, which is the same discipline `PasswordValue` follows.
 *
 * Billing frequency is the **second line, not a second column**. It is the unit the number is in;
 * "S$4,800" is a different fact depending on whether it is annual or monthly, and it is meaningless
 * anywhere except beside the figure. Two columns for one fact is exactly the width this stage is
 * trying not to spend — the same call as the Vendor/title trade, in the other direction.
 */
function ValueCell({ contract }: { contract: ContractRecord }) {
  const frequency = contract.billing_frequency ? (
    <span className="mt-0.5 block text-helper text-ink-tertiary">
      {BILLING_FREQUENCY_LABELS[contract.billing_frequency]}
    </span>
  ) : null;

  if (!hasContractValue(contract)) {
    return contract.has_value ? (
      <>
        <span className="text-ink-secondary">On file</span>
        {frequency}
      </>
    ) : (
      <Value>{null}</Value>
    );
  }

  if (contract.value == null) return <Value>{null}</Value>;

  return (
    <>
      {formatMoney(contract.value)}
      {frequency}
    </>
  );
}

/**
 * Status, plus the one state that is not a status: an expiry nobody has answered yet.
 *
 * **That state renders as the two buttons that end it, not as a badge naming it.** It used to
 * be an ochre "Needs decision" pill, and the pill was an accurate label attached to nothing: the
 * actions lived on the detail page, so resolving a row meant opening it, scrolling to the
 * lifecycle card, and coming back to the list to find the next one. On a table whose whole
 * purpose is a worklist, the cell that identifies the work is the right place to do it.
 *
 * The words are not lost, they are demoted to where they belong — the `role=group` label inside
 * `DecisionActions` — because a reader who can see two buttons offering to renew or close off an
 * expired contract does not need a pill telling them a decision is needed. The Ends date is in
 * the column beside it either way.
 *
 * Every other status keeps its badge. This branch is the *only* one with an action attached,
 * which is exactly why it is the only one that trades its label for controls.
 */
function StatusCell({ contract }: { contract: ContractRecord }) {
  if (needsDecision(contract)) {
    return <DecisionActions contract={contract} compact />;
  }

  return (
    <>
      <Badge variant={CONTRACT_STATUS_TONES[contract.status]}>
        {CONTRACT_STATUS_LABELS[contract.status]}
      </Badge>
      {contract.status === "expired" ? (
        // Only reachable under "All contracts" — the current view hides resolved history.
        // Words, so the reader can tell the two resolutions apart.
        <span className="mt-0.5 block text-helper text-ink-tertiary">
          {contract.renewed_by_id ? "Renewed" : "Closed off"}
        </span>
      ) : null}
    </>
  );
}

/**
 * "Give notice by" — the date, the number behind it, and the gap where neither exists.
 *
 * Four states, and the two that look alike are deliberately not the same cell:
 *
 * - **A date**, from `contract.notice_due_date`. Computed on the server, never here —
 *   `lib/format.ts` opens with why a business date must not go through `new Date()`, and a
 *   deadline is the worst place in the product for that off-by-one. The `{n}-day notice`
 *   line beneath it puts the input next to the output, so a wrong-looking date can be
 *   traced without opening the record.
 * - **The gap** — auto-renewing with no notice period. A *warning badge in words*, because
 *   this is the row that generates work: the agreement rolls over unless somebody gives
 *   notice, and with no period recorded the obligation engine generates nothing to warn
 *   them. §1.6 of the plan names this as one of three things that may never be compressed
 *   to a glyph.
 * - **The em dash**, for "does not apply" — anything not auto-renewing. An absence and a
 *   missing input must never render the same, which is the whole reason the branch above
 *   exists.
 * - **The em dash again**, for an auto contract that *has* a notice period but no end date
 *   to count back from. The gap there is the missing end date, which is its own review
 *   item with its own detector; claiming "No notice period" would name the wrong problem.
 *
 * No urgency colouring. The dashboard owns "is this due, is this late" — that is what the
 * obligation engine and `NOTICE_DEADLINE_LEAD_DAYS` are for — and a second urgency system
 * computed against the reader's local clock would eventually disagree with it. A table
 * saying "fine" while the dashboard says "overdue" destroys trust in both.
 *
 * The column's `max-w-[18ch]` is what makes the gap branch wrap rather than run: it may never
 * be shortened (§1.6), so it takes height instead. Uncapped, its helper line was a single
 * 35-character run driving this column to 243px, a sixth of the table, on behalf of the rows
 * that need it least. Height is the axis with room.
 */
function NoticeByCell({ contract }: { contract: ContractRecord }) {
  const isAuto = contract.renewal_type === "auto";

  if (isAuto && contract.notice_period_days == null) {
    return (
      <>
        <Badge variant="warning">No notice period</Badge>
        {/* `whitespace-normal` because `TableCell` sets `whitespace-nowrap` on every cell in
            the product — without it this 35-character line rendered as one unbreakable run
            that **overflowed into the Renewal column**, since a `<td>` does not clip. Every
            other long cell here escapes that with `truncate` (which brings `overflow-hidden`
            with it); this one may not be shortened, so it wraps instead and the row grows.
            Found by looking at the rendered page — nothing else could have seen it. */}
        <span className="mt-0.5 block whitespace-normal text-helper text-ink-tertiary">
          Auto-renews with nothing to warn on
        </span>
      </>
    );
  }

  // Restricted to auto-renewal, as the notice subtext under the Renewal badge always was:
  // the question this column answers is "when must we act to stop this rolling over", and
  // a contract that simply ends does not carry that trap. The *property* is arithmetic and
  // has a value for any contract with both inputs — narrowing it is this column's editorial
  // decision, not the model's.
  if (!isAuto || contract.notice_due_date == null) {
    return <Value>{null}</Value>;
  }

  return (
    <>
      {formatDate(contract.notice_due_date)}
      <span className="mt-0.5 block text-helper text-ink-tertiary">
        {contract.notice_period_days}-day notice
      </span>
    </>
  );
}

/**
 * The rail palette.
 *
 * `--color-chart-*` is the categorical series from styleguide §13 — eight muted, mutually
 * distinguishable hues. Using them here rather than the brand accent is deliberate and not
 * an aesthetic preference: the accent has a fixed per-view budget (the primary button, one
 * accent-filled block, the selected control state), and a green rail repeated down thirty
 * group headers would blow it several times over. The series exists precisely to say "these
 * are different categories of the same kind of thing", which is what a group rail says.
 *
 * The band takes the full colour and the rows a 40% wash of it, so a section reads as one
 * block without the rows competing with their own header. 40% was arrived at on screen: at
 * 25% the ochre and gold rails were invisible against white at normal viewing distance,
 * which is the whole job the rail has. Classes are written out rather
 * than composed, because Tailwind scans for literal strings — `border-l-chart-${n}` yields
 * a rail with no colour at all.
 */
const NO_BRAND_KEY = "__none__";

function groupKey(brandId: string | null): string {
  return brandId ?? NO_BRAND_KEY;
}

/** Neutral for the "Group level" bucket — it is an absence of a brand, not a brand. */
function railForGroup(key: string): GroupRail {
  return key === NO_BRAND_KEY ? NEUTRAL_RAIL : railFor(key);
}

/**
 * The category, in front of the title, as a control.
 *
 * Three things happen in one 16px glyph, and each of them is why it is here rather than in a
 * column of its own:
 *
 * 1. **It says what kind of contract this is** — the job the Category column had.
 * 2. **Clicking it narrows the table to that category, and clicking it again widens it back.**
 *    The toggle is against the *URL*, so the chip above the table and the select in the Filters
 *    panel move with it, and the narrowed view is still a link somebody can paste.
 * 3. **While it is on, every glyph on screen is highlighted** — necessarily, since every
 *    remaining row is that category. That is the honest rendering: `aria-pressed` is true of
 *    each of them, and a single "the one you clicked" highlight would be a lie the moment the
 *    reader arrived on the filtered URL from a link instead of from a click.
 *
 * The accessible name is a **sentence about what the button does**, not the value alone, and it
 * changes with the state: *"Filter by category: Cleaning"* becomes *"Clear category filter:
 * Cleaning"*. A glyph's name has to say which dimension it belongs to; a *control's* owes more
 * than that, because "Cleaning" announced on Tab says nothing about what pressing it will do.
 * Naming the dimension is also what keeps this button's name distinct from the title link's
 * beside it — two adjacent controls sharing one accessible name is the 0.11.0 defect, and a
 * contract *titled* "Pest control" is exactly where it would recur.
 *
 * `aria-pressed` rather than a `data-` attribute alone: this is a two-state control and the
 * state is the whole interaction. The tint is `--surface-selected`, the same "this control is
 * doing something" treatment the Filters trigger and a set `FilterSelect` carry.
 *
 * This absorbs `GlyphCell`, the shared "symbol standing in for a word" that both glyph columns
 * rendered. That component is deleted rather than kept, because both of its callers stopped
 * needing it in the same change — Category became this control, Renewal grew its words back —
 * and a shared component with no callers is a pattern nobody is following. Its rules were never
 * about the component and are all still in force here: `sr-only` text carries the label while
 * the glyph is `aria-hidden` (a tooltip is not an accessible name and does not exist on touch);
 * the tooltip opens on keyboard focus because the trigger is a real button, at the price of a
 * tab stop per row; and twelve symbols is a vocabulary, so it keeps its legend in the Columns
 * popover.
 */
function CategoryGlyph({
  contract,
  filter,
}: {
  contract: ContractRecord;
  filter: CategoryFilter;
}) {
  const Icon = CONTRACT_CATEGORY_ICONS[contract.category];
  const label = CONTRACT_CATEGORY_LABELS[contract.category];
  const on = filter.active === contract.category;
  const name = on
    ? `Clear ${CATEGORY_HEADER.toLowerCase()} filter: ${label}`
    : `Filter by ${CATEGORY_HEADER.toLowerCase()}: ${label}`;

  return (
    <Tooltip>
      {/* A bare `TooltipTrigger`, as `IconHeader` and `NamesTooltip` use — Base UI renders it as
          a real `<button>`, which is what makes the tooltip open on keyboard focus and what
          `aria-pressed` needs to be legal. */}
      <TooltipTrigger
        aria-pressed={on}
        onClick={() => filter.toggle(contract.category)}
        // `mt-1` puts the 16px glyph on the title's baseline row inside an `items-start`
        // flex parent — the title link carries `-my-1 py-1`, so its text sits 4px down.
        className={cn(
          "mt-1 inline-flex shrink-0 items-center rounded-md border border-transparent p-1 transition-colors duration-[120ms]",
          on
            ? "border-border-strong bg-surface-selected text-ink"
            : "text-ink-tertiary hover:bg-surface-hover hover:text-ink-secondary",
        )}
      >
        <Icon aria-hidden className="size-4" />
        <span className="sr-only">{name}</span>
      </TooltipTrigger>
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  );
}

/**
 * An icon header, and the largest free width win on this table.
 *
 * *"Coverage"* is eight characters and its cell is a glyph and a digit — **the header, not the
 * data, was setting that column's minimum width.** The word is not lost: it is `sr-only` for
 * assistive tech and one hover or focus away for everyone else.
 */
function IconHeader({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger className="inline-flex items-center rounded-md p-0.5">
        <Icon aria-hidden className="size-4 text-ink-secondary" />
        <span className="sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
