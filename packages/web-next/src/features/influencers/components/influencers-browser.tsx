"use client";

import { ChevronDownIcon, LayersIcon } from "lucide-react";
import * as React from "react";

import {
  ActiveFilterChips,
  type FilterChip,
  FilterPopover,
  FilterToolbar,
  PanelFilter,
  SearchField,
  ToggleButton,
} from "@/components/layout/filter-bar";
import { type GroupRail } from "@/components/layout/group-rail";
import { HighlightMatch } from "@/components/layout/highlight-match";
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
import { BrandNamesCell } from "@/features/registry-brands/components/brand-names-cell";
import { useBrandIndex } from "@/features/registry-brands/hooks";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { filterIdentity, useQueryFilters } from "@/hooks/use-query-filters";
import type {
  Brand,
  Influencer,
  InfluencerPlatform,
  InfluencerStatus,
  InfluencerVertical,
} from "@/lib/api/types";
import { formatCompactNumber } from "@/lib/format";
import {
  INFLUENCER_PLATFORM_LABELS,
  INFLUENCER_PLATFORM_OPTIONS,
  INFLUENCER_STATUS_LABELS,
  INFLUENCER_STATUS_OPTIONS,
  INFLUENCER_STATUS_TONES,
  INFLUENCER_VERTICAL_ICONS,
  INFLUENCER_VERTICAL_LABELS,
  INFLUENCER_VERTICAL_OPTIONS,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

import { useInfluencerPages } from "../hooks";
import { railForTier, REACH_TIERS, type ReachTier, tierFor } from "../tiers";
import { SyncInfluencersButton } from "./sync-influencers-button";

const FILTER_KEYS = ["q", "platform", "vertical", "status", "brand_id"] as const;

/**
 * The four in the Filters panel — `q` stays on the row, because search is what people reach for
 * first and a search box behind a click is a search box nobody uses. Also the set the trigger
 * counts and the chips describe, which is why `activeCount` from `useQueryFilters` is the wrong
 * number: it includes `q`, and a "Filters ①" badge for a term already visible in the search box
 * is a miscount.
 */
const PANEL_KEYS = ["platform", "vertical", "status", "brand_id"] as const;

// `group` re-arranges rows already loaded, so it must **not** refetch — it lives on its own
// `useQueryFilters` instance, outside `resultsKey`, and "Clear filters" leaves it alone. The
// same split `/contracts` makes; the difference here is which way round the default sits.
const VIEW_KEYS = ["group"] as const;

/** The one value this screen writes to turn grouping off. Grouping is the default, so the *off*
 *  state is what appears in the URL. */
const GROUP_NONE = "none";

/**
 * How many creators one request fetches.
 *
 * `MAX_LIMIT`, deliberately, because **grouping the loaded window is honest and grouping a
 * partial one while showing counts is not** — a band counting rows that were never fetched is
 * the `2 of 1` bug the review queue shipped once. At 200 a brand's whole roster fits in a single
 * request with room to spare; the fixture holds nineteen.
 *
 * The tripwire is the same one `/contacts` carried and it moves with the screen: past roughly
 * **150** rows, client-side grouping stops being defensible and the answer is backend ordering —
 * a composite keyset cursor on `(followers desc, name, id)`. Until then the honesty note above
 * the table carries the gap.
 */
const PAGE_LIMIT = 200;

/**
 * The creators the brands partner with — one searchable roster, filed by how far each one
 * reaches.
 *
 * **Grouped by reach tier, and that is the default.** The screen this replaced grouped by
 * *vendor*: it filed each creator under the talent agency holding their contract, resolved the
 * agency name through `useVendorIndex`, and offered a filter over the Operations Hub's thirteen
 * building trades. All three were the borrowed address book showing through. An influencer is
 * engaged **for a brand**, the manager you book through is not the axis you file them under, and
 * a talent agency has no trade in a vocabulary whose members are aircon and grease traps.
 *
 * Reach is the axis because it is the one every other question hangs off: it sets the rate, it
 * decides whether a name is affordable before anything else about them matters, and it sorts a
 * roster into the shape a budget conversation already has. `?group=none` restores the flat table
 * for anyone who wants to scan every creator at once, and adds the tier back as a column.
 *
 * Three things the old component needed and this one does not, all for the same reason — the
 * tier is **derived** from a number the row already carries (`features/influencers/tiers.ts`):
 * there is no index to resolve, so no band can be pending; `followers` is not nullable, so there
 * is no unknown bucket; and the grouping is total, so the counts on the bands always sum to the
 * rows in the table.
 */
export function InfluencersBrowser() {
  const { filters, setFilter, setFilters, clearAll } = useQueryFilters(FILTER_KEYS);
  const { filters: viewFilters, setFilter: setViewFilter } = useQueryFilters(VIEW_KEYS);
  const { brands, byId: brandById } = useBrandIndex();

  // Grouped unless explicitly turned off. Written as "is it the string `none`" rather than as a
  // truthiness test, so an unrecognised value falls back to the default rather than to flat.
  const grouped = viewFilters.group !== GROUP_NONE;

  // Every brand, retired ones included. Retiring a brand does not un-run the campaigns made for
  // it — Eastside Kitchens is retired and has three creators against it — so a filter that hid
  // them would answer "no creators" about a brand with creators.
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
  // it — and a brand id whose record has not loaded yet reads as the raw value rather than
  // vanishing.
  const chips: FilterChip[] = React.useMemo(() => {
    const dimensions: {
      key: (typeof PANEL_KEYS)[number];
      label: string;
      options: readonly { value: string; label: string }[];
    }[] = [
      { key: "platform", label: "Platform", options: INFLUENCER_PLATFORM_OPTIONS },
      { key: "vertical", label: "Vertical", options: INFLUENCER_VERTICAL_OPTIONS },
      { key: "status", label: "Status", options: INFLUENCER_STATUS_OPTIONS },
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
  }, [filters, brandOptions, setFilter]);

  // Debounced *here*, above the remount boundary — see `filterIdentity`'s docstring.
  const debouncedQ = useDebouncedValue(filters.q, 250);
  const resultsFilters = React.useMemo(
    () => ({ ...filters, q: debouncedQ }),
    [filters, debouncedQ],
  );
  const resultsKey = filterIdentity(FILTER_KEYS, resultsFilters);

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      {/* Toolbar and chips are one block — the chips describe the row above them, so they sit at
          gap-3 from it rather than at the page's gap-4 from everything.

          **The overflow form and not `FilterBar`, measured at 1280.** Search at `sm:w-72` plus
          four selects at `sm:min-w-44` is about 1050px before the gaps, and the view toggle and
          the primary action take another 300 on the right — so a single wrapping row puts the
          filters on two ragged lines with the action group pinned away from them, which is the
          layout `/contracts` moved off. Four panel filters is one below that screen's five and
          still over the threshold, because the action group here is a wide button. */}
      <div className="flex flex-col gap-3">
        <FilterToolbar
          actions={
            <>
              {/* A view control, not a filter — `ToggleButton`, as AGENTS.md requires, so it
                  does not read as a fifth select. Pressed means grouped, which is the default,
                  so the *off* state is what writes to the URL. */}
              <ToggleButton
                pressed={grouped}
                onPressedChange={(next) =>
                  setViewFilter("group", next ? undefined : GROUP_NONE)
                }
              >
                <LayersIcon data-icon="inline-start" />
                Group by reach
              </ToggleButton>
              <SyncInfluencersButton />
            </>
          }
        >
          {/* Name **or handle**, and both are the row's own fields — so unlike every other
              search box in this app the predicate joins to nothing. That is why the label names
              both: a placeholder promising more than the predicate delivers is the bug this rule
              closed on the screen this one replaced, which advertised "vendor" for releases
              before the backend matched it. */}
          <SearchField
            label="Search creators by name or handle"
            placeholder="Name or handle"
            value={filters.q}
            onChange={(value) => setFilter("q", value)}
          />
          <FilterPopover activeCount={chips.length} onClear={clearPanel}>
            {/* Brand leads the panel, because it is the dimension a creator is engaged
                *against* — the question the vendor filter used to sit in the place of. */}
            <PanelFilter
              label="Brand"
              allLabel="All brands"
              value={filters.brand_id}
              options={brandOptions}
              onChange={(value) => setFilter("brand_id", value)}
            />
            <PanelFilter
              label="Vertical"
              allLabel="All verticals"
              value={filters.vertical}
              options={INFLUENCER_VERTICAL_OPTIONS}
              onChange={(value) => setFilter("vertical", value)}
            />
            <PanelFilter
              label="Platform"
              allLabel="All platforms"
              value={filters.platform}
              options={INFLUENCER_PLATFORM_OPTIONS}
              onChange={(value) => setFilter("platform", value)}
            />
            <PanelFilter
              label="Status"
              allLabel="All statuses"
              value={filters.status}
              options={INFLUENCER_STATUS_OPTIONS}
              onChange={(value) => setFilter("status", value)}
            />
          </FilterPopover>
        </FilterToolbar>

        <ActiveFilterChips chips={chips} onClear={clearAll} />
      </div>

      <InfluencerResults
        key={resultsKey}
        filters={resultsFilters}
        grouped={grouped}
        brandById={brandById}
      />
    </div>
  );
}

type TierGroup = {
  tier: ReachTier;
  influencers: Influencer[];
};

/**
 * Bucket the loaded creators by reach tier.
 *
 * Built by walking {@link REACH_TIERS} and filtering, rather than by bucketing the rows into a
 * `Map` and sorting the buckets afterwards. The tier list is closed and already in the order the
 * screen wants, so the walk *is* the sort — and an empty tier drops out instead of needing to be
 * suppressed. The vendor grouping this replaced could not do that: its buckets came from the
 * data, so their order, their names and whether they existed at all were three separate
 * questions.
 *
 * Inside a tier: **by reach, descending, then by name.** The band is a range and the column
 * inside it is the figure, so ordering by anything else would put the numbers out of order
 * underneath a heading that is about them. Name breaks a tie, which two invented follower counts
 * will not produce and a real import will.
 */
function groupByTier(influencers: Influencer[]): TierGroup[] {
  return REACH_TIERS.map((tier) => ({
    tier,
    influencers: influencers
      .filter((influencer) => tierFor(influencer.followers).id === tier.id)
      .sort((a, b) => b.followers - a.followers || a.name.localeCompare(b.name)),
  })).filter((group) => group.influencers.length > 0);
}

function InfluencerResults({
  filters,
  grouped,
  brandById,
}: {
  filters: Partial<Record<(typeof FILTER_KEYS)[number], string>>;
  grouped: boolean;
  brandById: Map<string, Brand>;
}) {
  // Which bands are folded away. A Set rather than a per-group `open` flag so the default is
  // expanded — a table that opens collapsed hides the data it exists to show. `useState` and not
  // the URL: a reading posture, not a view worth sharing.
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(() => new Set());

  const { items, error, isLoading, hasMore, isLoadingMore, loadMore } = useInfluencerPages({
    platform: filters.platform as InfluencerPlatform | undefined,
    vertical: filters.vertical as InfluencerVertical | undefined,
    status: filters.status as InfluencerStatus | undefined,
    brand_id: filters.brand_id,
    q: filters.q, // already debounced by the parent, which keys this component on it
    limit: PAGE_LIMIT,
  });

  const groups = React.useMemo(
    () => (grouped ? groupByTier(items) : null),
    [grouped, items],
  );

  // Only bands with something to hide get a toggle — a chevron that folds away a single row is
  // a control with no purpose. Collapse-all follows: it appears only when at least one band is
  // collapsible.
  const collapsible = React.useMemo(
    () => (groups ?? []).filter((group) => group.influencers.length > 1),
    [groups],
  );
  const allCollapsed =
    collapsible.length > 0 && collapsible.every((group) => collapsed.has(group.tier.id));

  const toggleGroup = (id: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  if (error) return <QueryError error={error} />;
  if (isLoading) return <LoadingRows rows={4} />;

  if (items.length === 0) {
    const filtered = Object.values(filters).some(Boolean);
    return (
      <EmptyState
        message={filtered ? "No creators match these filters" : "No creators yet"}
        hint={
          filtered
            ? "Clear a filter to widen the search."
            : "Import the creators each brand works with, and the reach that decides what they cost."
        }
      />
    );
  }

  // Ungrouped adds the tier back as a column: grouped, it is the band, and repeating it down
  // every row is the redundancy grouping exists to remove.
  const columnCount = grouped ? 7 : 8;

  return (
    <div className="flex flex-col gap-3">
      {/* **The honesty note, built rather than written down.** While there is another page to
          fetch, every band below may be missing rows that were never loaded — and a count beside
          a tier name looks like a claim about that tier whether or not one was intended. This is
          what stops it being one. Deliberately not an `EmptyState`-style panel: it has to sit
          above the table without displacing it. */}
      {hasMore ? (
        <p className="px-1 text-helper text-ink-tertiary">
          {/* `items.length`, not `PAGE_LIMIT`: pressing Load more fetches a second page and
              leaves `hasMore` true, so a hardcoded 200 would go on claiming "the first 200" over
              400 loaded rows. */}
          Showing the first {items.length} creators — bands below may be incomplete.
        </p>
      ) : null}

      {collapsible.length > 0 ? (
        <div className="flex justify-end px-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setCollapsed(
                allCollapsed ? new Set() : new Set(collapsible.map((group) => group.tier.id)),
              )
            }
          >
            {allCollapsed ? "Expand all" : "Collapse all"}
          </Button>
        </div>
      ) : null}

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              {/* 4px rail + `pl-4` grouped, `pl-5` ungrouped — 20px either way, or the whole
                  first column reads as misaligned against the band above it. */}
              <TableHead className={grouped ? "pl-4" : "pl-5"}>Creator</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead className="text-right">Reach</TableHead>
              {grouped ? null : <TableHead>Tier</TableHead>}
              <TableHead className="text-right">Engagement</TableHead>
              <TableHead>Vertical</TableHead>
              <TableHead>Brands</TableHead>
              <TableHead className="pr-5">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups
              ? groups.map((group) => {
                  const rail = railForTier(group.tier);
                  const isCollapsed = collapsed.has(group.tier.id);
                  const canCollapse = group.influencers.length > 1;

                  return (
                    <React.Fragment key={group.tier.id}>
                      <TierHeader
                        group={group}
                        rail={rail}
                        columnCount={columnCount}
                        canCollapse={canCollapse}
                        isCollapsed={isCollapsed}
                        onToggle={() => toggleGroup(group.tier.id)}
                      />
                      {canCollapse && isCollapsed
                        ? null
                        : group.influencers.map((influencer) => (
                            <InfluencerRow
                              key={influencer.id}
                              influencer={influencer}
                              grouped
                              rail={rail.rows}
                              query={filters.q}
                              brandById={brandById}
                            />
                          ))}
                    </React.Fragment>
                  );
                })
              : items.map((influencer) => (
                  <InfluencerRow
                    key={influencer.id}
                    influencer={influencer}
                    grouped={false}
                    query={filters.q}
                    brandById={brandById}
                  />
                ))}
          </TableBody>
        </Table>
      </TableCard>

      <LoadMore
        loadedCount={items.length}
        noun="creator"
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
      />
    </div>
  );
}

/**
 * The band above each tier: rail, the tier's name, its range, a count, a collapse toggle.
 *
 * **The range is always shown, and the count only above two rows or more.** They answer
 * different questions and only one of them is noise when it is trivial: "Micro" means nothing
 * without "10k – 100k" beside it, whereas a column of `1`s down five bands is noise in the one
 * position where a number has to mean something. That is the condition `/contacts` measured and
 * it carries over unchanged.
 *
 * Unlike the vendor bands this replaced there is **no unlabelled state**. A tier is computed
 * from the row, so there is no index in flight and no `…` to render — which is why this
 * component has three conditions where its predecessor had five.
 */
function TierHeader({
  group,
  rail,
  columnCount,
  canCollapse,
  isCollapsed,
  onToggle,
}: {
  group: TierGroup;
  rail: GroupRail;
  columnCount: number;
  canCollapse: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  const body = (
    <span className="flex items-center gap-2">
      {canCollapse ? (
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-ink-tertiary transition-transform duration-[120ms]",
            isCollapsed && "-rotate-90",
          )}
        />
      ) : null}
      <span className="font-medium text-ink">{group.tier.label}</span>
      <span className="text-helper text-ink-tertiary">{group.tier.range}</span>
      {group.influencers.length > 1 ? (
        <Badge variant="outline" className="bg-surface">
          {group.influencers.length}
        </Badge>
      ) : null}
    </span>
  );

  return (
    // `border-t border-border` is the full-strength divider rather than the hairline the rows
    // use — a band boundary has to out-rank a row boundary or the sections read as one
    // continuous table.
    <TableRow className="border-t border-border bg-surface-sunken hover:bg-surface-sunken">
      <TableCell colSpan={columnCount} className={cn("h-11 border-l-4 p-0", rail.band)}>
        {canCollapse ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!isCollapsed}
            className="flex h-11 w-full items-center pr-5 pl-3.5 text-left"
          >
            {body}
            {/* The chevron carries the state visually; this carries it in words, because a
                rotation is not a label. */}
            <span className="sr-only">{isCollapsed ? "Expand band" : "Collapse band"}</span>
          </button>
        ) : (
          // No toggle, so no button — a `<button>` that does nothing is a tab stop that costs a
          // keyboard user a press and tells them nothing.
          //
          // **`pl-4`, so 4px rail + 16px = 20px, the same 20px the rows use.** With a chevron
          // the band's *name* is indented past it and the chevron lines up with the column
          // instead; without one there is nothing to hang the name off, so the name itself has
          // to align with the names below it.
          <div className="flex h-11 w-full items-center pr-5 pl-4">{body}</div>
        )}
      </TableCell>
    </TableRow>
  );
}

function InfluencerRow({
  influencer,
  grouped,
  rail,
  query,
  brandById,
}: {
  influencer: Influencer;
  grouped: boolean;
  rail?: string;
  query?: string;
  brandById: Map<string, Brand>;
}) {
  const VerticalIcon = influencer.vertical
    ? INFLUENCER_VERTICAL_ICONS[influencer.vertical]
    : null;

  return (
    <TableRow className={rail ? cn("border-l-4", rail) : undefined}>
      <TableCell className={grouped ? "pl-4" : "pl-5"}>
        <span className="block font-medium text-ink">
          <HighlightMatch text={influencer.name} query={query} />
        </span>
        {/* The handle is the creator's identifier and the second thing the search box matches,
            so it is marked in place — `HighlightMatch`, not relevance ordering, per the rule
            AGENTS.md sets for a search that spans more than the title. The `@` is added here so
            the fixture cannot carry it on some rows and not others. */}
        <span className="mt-0.5 block font-mono text-helper text-ink-tertiary">
          @<HighlightMatch text={influencer.handle} query={query} />
        </span>
      </TableCell>

      <TableCell className="text-ink-secondary">
        {INFLUENCER_PLATFORM_LABELS[influencer.platform]}
      </TableCell>

      {/* Right-aligned and tabular, because this column is compared down its length rather than
          read across the row — `84.2k` under `1.24M` only lines up on the decimal if the digits
          are the same width. */}
      <TableCell className="text-right font-mono text-helper tabular-nums text-ink">
        {formatCompactNumber(influencer.followers)}
      </TableCell>

      {grouped ? null : (
        <TableCell className="text-ink-secondary">
          {tierFor(influencer.followers).label}
        </TableCell>
      )}

      <TableCell className="text-right font-mono text-helper tabular-nums text-ink-secondary">
        {/* `Value` renders the em dash for a rate nobody has measured. Not a zero: 0% engagement
            is a measurement, and a prospect who has never run a campaign has not been measured
            at all. */}
        <Value>
          {influencer.engagement_rate === null ? null : `${influencer.engagement_rate}%`}
        </Value>
      </TableCell>

      <TableCell className="text-ink-secondary">
        {influencer.vertical && VerticalIcon ? (
          // The glyph is never alone — a vocabulary of ten symbols is not readable at 16px on
          // its own, and WCAG 1.4.1 does not allow the icon to be the only carrier.
          <span className="inline-flex items-center gap-1.5">
            <VerticalIcon aria-hidden className="size-4 shrink-0 text-ink-tertiary" />
            {INFLUENCER_VERTICAL_LABELS[influencer.vertical]}
          </span>
        ) : (
          <Value>{null}</Value>
        )}
      </TableCell>

      <TableCell className="max-w-[24ch] text-ink-secondary">
        {/* **Not `Group level`, and not the em dash.** `BrandNamesCell`'s default names a
            contract held for the whole group on purpose; a creator with no brand is a *prospect*
            — somebody on the shortlist nobody has booked — which is a stated fact and not a
            missing one. The em dash would read as "not recorded", which is what `Value` has
            taught these tables it means. */}
        <BrandNamesCell
          brandIds={influencer.brand_ids}
          brandById={brandById}
          empty={<span className="text-ink-tertiary">Not engaged yet</span>}
        />
      </TableCell>

      <TableCell className="pr-5">
        <Badge variant={INFLUENCER_STATUS_TONES[influencer.status]}>
          {INFLUENCER_STATUS_LABELS[influencer.status]}
        </Badge>
      </TableCell>
    </TableRow>
  );
}
