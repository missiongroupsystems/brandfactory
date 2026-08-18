"use client";

import type { BrandSummary, Influencer, InfluencerAccount } from "@brandfactory/shared";
import {
  blendedEngagement,
  byInfluencerReach,
  platformsOf,
  primaryAccount,
  totalReach,
} from "@brandfactory/shared";
import Link from "next/link";
import { ChevronDownIcon, LayersIcon, PlusIcon } from "lucide-react";
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
import { BrandNamesCell } from "@/features/registry-brands/components/brand-names-cell";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useQueryFilters } from "@/hooks/use-query-filters";
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

import { formatAccountCount, formatEngagement, GENERALIST } from "../format";
import { useInfluencers } from "../hooks";
import { influencerHref } from "../href";
import { railForTier, REACH_TIERS, type ReachTier, tierFor } from "../tiers";
import { InfluencerForm } from "./influencer-form";
import { SyncInfluencersButton } from "./sync-influencers-button";

const FILTER_KEYS = ["q", "platform", "vertical", "status", "brandId"] as const;

/**
 * The four in the Filters panel — `q` stays on the row, because search is what people reach for
 * first and a search box behind a click is a search box nobody uses. Also the set the trigger
 * counts and the chips describe, which is why `activeCount` from `useQueryFilters` is the wrong
 * number: it includes `q`, and a "Filters ①" badge for a term already visible in the search box
 * is a miscount.
 */
const PANEL_KEYS = ["platform", "vertical", "status", "brandId"] as const;

// `group` re-arranges rows already on screen, so it lives on its own `useQueryFilters` instance
// and "Clear filters" leaves it alone. The same split `/contracts` makes; the difference here is
// which way round the default sits.
const VIEW_KEYS = ["group"] as const;

/** The one value this screen writes to turn grouping off. Grouping is the default, so the *off*
 *  state is what appears in the URL. */
const GROUP_NONE = "none";

/**
 * The creators the brands engage — one searchable roster, filed by how far each one reaches.
 *
 * **Reading the Hono server as of this release.** It rendered `fixtures/influencers.ts` through
 * `lib/api/mock.ts` before, which is why three things this file used to need are gone:
 * `useInfluencerPages`, the `LoadMore` footer, and the note above the table admitting the bands
 * might be incomplete. `GET /workspaces/:id/influencers` returns the whole roster in reach order,
 * so **the counts on the bands are totals** and the filters below narrow an array the client holds
 * completely. That is the property the honesty note existed to compensate for, and deleting it is
 * the point of the release rather than a tidy-up.
 *
 * **Grouped by reach tier, and that is the default.** The screen this replaced grouped by
 * *vendor*: it filed each creator under the talent agency holding their contract and offered a
 * filter over the Operations Hub's thirteen building trades. Both were the borrowed address book
 * showing through. An influencer is engaged **for a brand**, and the manager you book through is
 * not the axis you file them under.
 *
 * Reach is the axis because it is the one every other question hangs off: it sets the rate, it
 * decides whether a name is affordable before anything else about them matters, and it sorts a
 * roster into the shape a budget conversation already has. `?group=none` restores the flat table
 * and adds the tier back as a column.
 *
 * Three things the vendor version needed and this does not, all because the tier is **derived**
 * from a number the row already carries (`features/influencers/tiers.ts`): there is no index to
 * resolve, so no band can be pending; `followers` is not nullable, so there is no unknown bucket;
 * and the grouping is total, so the band counts always sum to the rows.
 */
export function InfluencersBrowser() {
  const { filters, setFilter, setFilters, clearAll } = useQueryFilters(FILTER_KEYS);
  const { filters: viewFilters, setFilter: setViewFilter } = useQueryFilters(VIEW_KEYS);

  /**
   * **The workspace's real brands, not `useBrandIndex`.**
   *
   * `useBrandIndex` reads `fixtures/brands.ts` — the Operations Hub's invented F&B group — and
   * AGENTS.md bans pointing a table at `useWorkspaceBrands` to escape it. That ban is about
   * `/contracts`, whose `brand_ids` *are* fixture ids: re-pointing the index there would make
   * every row read `Group level` in a workspace that had not happened to name a brand
   * `Harbour Table`. Here the **data itself moved** — a creator's `brandIds` are foreign keys into
   * the workspace's `brands` table — so the index has to move with it. Contracts and vendors keep
   * the Ops brands, which is why `BrandNamesCell` was *widened* to serve both rather than
   * re-pointed.
   *
   * `useActiveBrand()` for the list, as `outlets-browser.tsx` does: it is `useWorkspaceBrands`
   * under one SWR key, shared with the sidebar's toggle, so this screen adds no second request.
   * The *selected* brand is deliberately not read — see the filter panel below.
   */
  const { brands } = useActiveBrand();

  const brandById = React.useMemo(() => {
    const map = new Map<string, BrandSummary>();
    for (const brand of brands) map.set(brand.id, brand);
    return map;
  }, [brands]);

  // Grouped unless explicitly turned off. Written as "is it the string `none`" rather than as a
  // truthiness test, so an unrecognised value falls back to the default rather than to flat.
  const grouped = viewFilters.group !== GROUP_NONE;

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

  // A chip per set panel filter, naming the dimension and the chosen option. The option lists are
  // the same ones the panel renders, so a chip can never disagree with the control behind it —
  // and a brand id whose record has not loaded yet reads as the raw value rather than vanishing.
  const chips: FilterChip[] = React.useMemo(() => {
    const dimensions: {
      key: (typeof PANEL_KEYS)[number];
      label: string;
      options: readonly { value: string; label: string }[];
    }[] = [
      { key: "platform", label: "Platform", options: INFLUENCER_PLATFORM_OPTIONS },
      { key: "vertical", label: "Vertical", options: INFLUENCER_VERTICAL_OPTIONS },
      { key: "status", label: "Status", options: INFLUENCER_STATUS_OPTIONS },
      { key: "brandId", label: "Brand", options: brandOptions },
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

  /**
   * Still debounced, and there is no longer a remount boundary under it.
   *
   * `filterIdentity` and the `key=` on the results component are gone with the pagination: they
   * existed to reset an accumulated page count when a filter changed, and there are no pages to
   * accumulate. What is left is the reason to debounce a text input at all — a `useMemo` over
   * nineteen rows on every keystroke is cheap, but the highlight recomputation down a growing
   * roster is not, and 250ms is the figure every search box in this app uses.
   */
  const debouncedQ = useDebouncedValue(filters.q, 250);

  /**
   * Create only. **Editing lives on the record page**, and that split is deliberate rather than
   * unfinished: this table has no actions column, and giving it one to reach a form that the
   * creator's own page already holds would put the same sheet behind two entry points and a
   * per-row menu on a table whose rows are already a link. The table lists and adds; the record
   * page corrects and removes. `/outlets` opens its form from a row because it grew one before it
   * had a detail page.
   */
  const [createOpen, setCreateOpen] = React.useState(false);
  const openCreate = React.useCallback(() => setCreateOpen(true), []);

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      {/* Toolbar and chips are one block — the chips describe the row above them, so they sit at
          gap-3 from it rather than at the page's gap-4 from everything.

          **The overflow form and not `FilterBar`, measured at 1280.** Search at `sm:w-72` plus
          four selects at `sm:min-w-44` is about 1050px before the gaps, and the view toggle and
          the primary action take another 300 on the right. */}
      <div className="flex flex-col gap-3">
        <FilterToolbar
          actions={
            <>
              {/* A view control, not a filter — `ToggleButton`, as AGENTS.md requires, so it does
                  not read as a fifth select. Pressed means grouped, which is the default, so the
                  *off* state is what writes to the URL. */}
              <ToggleButton
                pressed={grouped}
                onPressedChange={(next) => setViewFilter("group", next ? undefined : GROUP_NONE)}
              >
                <LayersIcon data-icon="inline-start" />
                Group by reach
              </ToggleButton>
              {/* **The import demoted and the create took the primary slot**, which is the whole
                  release read as one control. `SyncInfluencersButton` was the primary because it
                  was the only action there was, and its argument — a follower count is pulled from
                  a platform, not typed — is still on the button and still true. What changed is
                  that the table can now hold a row somebody put there, so an import that does not
                  exist yet is no longer the only way in. Secondary beside a working create is
                  honest; primary in place of one was not.

                  Exactly one primary button per view, per the accent budget in AGENTS.md. */}
              <SyncInfluencersButton />
              <Button onClick={openCreate}>
                <PlusIcon data-icon="inline-start" />
                Add creator
              </Button>
            </>
          }
        >
          {/* Name **or any handle**, and both are the row's own fields — so unlike every other
              search box in this app the predicate joins to nothing. The label names both, because
              a placeholder promising more than the predicate delivers is the bug this rule closed
              on the screen this one replaced.

              **"Any handle" is the widening `influencer_accounts` bought**, and it is stated
              rather than left implicit: a creator with three accounts is found by any of the three,
              and the Creator cell shows whichever one matched so the row never matches invisibly. */}
          <SearchField
            label="Search creators by name or any handle"
            placeholder="Name or handle"
            value={filters.q}
            onChange={(value) => setFilter("q", value)}
          />
          <FilterPopover activeCount={chips.length} onClear={clearPanel}>
            {/* Brand leads the panel, because it is the dimension a creator is engaged *against* —
                the question the vendor filter used to sit in the place of.

                **The nav's active brand does not narrow this table**, as on `/contracts` and
                `/vendors`: the filter is explicit, and a roster silently scoped to one brand would
                hide every prospect, who by definition has none. */}
            <PanelFilter
              label="Brand"
              allLabel="All brands"
              value={filters.brandId}
              options={brandOptions}
              onChange={(value) => setFilter("brandId", value)}
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
        filters={{ ...filters, q: debouncedQ }}
        grouped={grouped}
        brandById={brandById}
      />

      {/* Create mode only, so it carries **no `influencer` and no `key`**. The obvious
          `key={editing?.id ?? "new"}` is the wedge AGENTS.md records twice — a key that changes
          mid-dismissal leaves Base UI's overlay mounted and eating clicks — and there is nothing
          here for it to key on anyway. `InfluencerForm` resets its draft during render. */}
      <InfluencerForm open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

type TierGroup = {
  tier: ReachTier;
  influencers: Influencer[];
};

/**
 * Narrow the roster to what the four filters and the search box asked for.
 *
 * **Client-side, over a list the client holds completely.** The route takes no filter parameters —
 * see `listInfluencersByWorkspace` in `@brandfactory/db` for why, and for the tripwire: past
 * roughly 150 rows the keyset cursor and the SQL filters land *together*, because a paginated list
 * with client-side filters is the "Zephyr alone on page one" failure AGENTS.md bans.
 *
 * **Two predicates became `.some` when a creator gained accounts, and both changed meaning.**
 * Platform is now *has an account on* rather than *is on*, so a creator with an Instagram grid and
 * a TikTok appears under both — which is the whole point of the child table. Search matches the
 * name or **any** of the handles, so looking somebody up by the handle they are not primarily
 * known by finds them.
 *
 * Brand is unchanged and was already a `contains` over the row's set, because a creator can be
 * engaged for two.
 */
function matchesFilters(
  influencer: Influencer,
  filters: Partial<Record<(typeof FILTER_KEYS)[number], string>>,
): boolean {
  if (
    filters.platform &&
    !influencer.accounts.some((account) => account.platform === filters.platform)
  ) {
    return false;
  }
  if (filters.status && influencer.status !== filters.status) return false;
  if (filters.vertical && influencer.vertical !== filters.vertical) return false;
  // `.some` and not `.includes`: `brandIds` is `BrandId[]`, the branded type, and `includes`
  // demands its own element type where `===` accepts the plain string a URL param is.
  if (filters.brandId && !influencer.brandIds.some((id) => id === filters.brandId)) return false;

  const q = filters.q?.trim().toLowerCase();
  if (!q) return true;
  return (
    influencer.name.toLowerCase().includes(q) || matchingAccount(influencer, q) !== undefined
  );
}

/**
 * The first account whose handle contains the search term, or `undefined`.
 *
 * It is both halves of one rule: the predicate above uses it to decide whether a row matches, and
 * the Creator cell uses it to decide **which handle to show**. A row that matched on an account
 * the cell was not rendering would highlight nothing and read as a false positive — the failure
 * AGENTS.md names for a search that spans more than the title.
 */
function matchingAccount(influencer: Influencer, query: string): InfluencerAccount | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return influencer.accounts.find((account) => account.handle.toLowerCase().includes(q));
}

/**
 * Bucket the creators by reach tier.
 *
 * Built by walking {@link REACH_TIERS} and filtering, rather than by bucketing the rows into a
 * `Map` and sorting the buckets afterwards. The tier list is closed and already in the order the
 * screen wants, so the walk *is* the sort — and an empty tier drops out instead of needing to be
 * suppressed. The vendor grouping this replaced could not do that: its buckets came from the data,
 * so their order, their names and whether they existed at all were three separate questions.
 *
 * Inside a tier: **by total reach, descending, then by name** — which is the order the server
 * already sent, restated here because a `filter` preserves order and a reader should not have to
 * know that to trust the column. It restates it by calling `byInfluencerReach`, the comparator the
 * server sorts with, rather than by writing the rule a second time.
 *
 * The tier is read off the **sum** now. A creator with three accounts sits where their combined
 * reach puts them, which is the correction `influencer_accounts` was built for.
 */
function groupByTier(influencers: Influencer[]): TierGroup[] {
  return REACH_TIERS.map((tier) => ({
    tier,
    influencers: influencers
      .filter((influencer) => tierFor(totalReach(influencer.accounts)).id === tier.id)
      .sort(byInfluencerReach),
  })).filter((group) => group.influencers.length > 0);
}

function InfluencerResults({
  filters,
  grouped,
  brandById,
}: {
  filters: Partial<Record<(typeof FILTER_KEYS)[number], string>>;
  grouped: boolean;
  brandById: Map<string, BrandSummary>;
}) {
  // Which bands are folded away. A Set rather than a per-group `open` flag so the default is
  // expanded — a table that opens collapsed hides the data it exists to show. `useState` and not
  // the URL: a reading posture, not a view worth sharing.
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(() => new Set());

  const { influencers, isLoading, error } = useInfluencers();

  const items = React.useMemo(
    () => influencers.filter((influencer) => matchesFilters(influencer, filters)),
    [influencers, filters],
  );

  const groups = React.useMemo(() => (grouped ? groupByTier(items) : null), [grouped, items]);

  // Only bands with something to hide get a toggle — a chevron that folds away a single row is a
  // control with no purpose. Collapse-all follows: it appears only when at least one band is
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
            : // Both doors, in the order they actually work. The import is still the one that
              // scales and is still not connected, so promising it alone — as this hint did while
              // there was no create — left a reader with nothing to do on an empty table.
              "Add the creators each brand works with, and the reach that decides what they cost. Importing them from a platform is the next piece of work."
        }
      />
    );
  }

  // Ungrouped adds the tier back as a column: grouped, it is the band, and repeating it down every
  // row is the redundancy grouping exists to remove.
  const columnCount = grouped ? 7 : 8;

  return (
    <div className="flex flex-col gap-3">
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
              {/* 4px rail + `pl-4` grouped, `pl-5` ungrouped — 20px either way, or the whole first
                  column reads as misaligned against the band above it. */}
              <TableHead className={grouped ? "pl-4" : "pl-5"}>Creator</TableHead>
              {/* **Platforms**, plural, since a creator holds up to ten accounts. The column is a
                  set now rather than a field, and the heading is the first thing that says so. */}
              <TableHead>Platforms</TableHead>
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

      {/* **A total, and it is allowed to be one.** AGENTS.md forbids a footer claiming a total on
          every Ops list, because that API answers `next_cursor` and no count. This route returns
          the whole roster, so `19 creators` is a fact rather than "nineteen so far" — the second
          screen here to earn that, after `/outlets`. The word is the count of what is *on screen*,
          filters and all, which is why it is `items` rather than the unfiltered list. */}
      <p className="px-1 text-helper text-ink-tertiary">
        {items.length} {items.length === 1 ? "creator" : "creators"}
      </p>
    </div>
  );
}

/**
 * The band above each tier: rail, the tier's name, its range, a count, a collapse toggle.
 *
 * **The range is always shown, and the count only above two rows or more.** They answer different
 * questions and only one of them is noise when it is trivial: "Micro" means nothing without
 * "10k – 100k" beside it, whereas a column of `1`s down five bands is noise in the one position
 * where a number has to mean something.
 *
 * **The count is now a total.** It was the count of the rows that happened to be loaded, which is
 * what the deleted note above the table admitted; the route is exhaustive, so a band that says
 * `9` holds nine.
 *
 * Unlike the vendor bands this replaced there is **no unlabelled state**. A tier is computed from
 * the row, so there is no index in flight and no `…` to render.
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
    // `border-t border-border` is the full-strength divider rather than the hairline the rows use
    // — a band boundary has to out-rank a row boundary or the sections read as one continuous
    // table.
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
          // **`pl-4`, so 4px rail + 16px = 20px, the same 20px the rows use.** With a chevron the
          // band's *name* is indented past it and the chevron lines up with the column instead;
          // without one there is nothing to hang the name off, so the name itself has to align
          // with the names below it.
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
  brandById: Map<string, BrandSummary>;
}) {
  const VerticalIcon = influencer.vertical ? INFLUENCER_VERTICAL_ICONS[influencer.vertical] : null;

  /**
   * The handle this row shows: the one the search matched, or the primary.
   *
   * A row that matched on a hidden account's handle and then rendered the primary would highlight
   * nothing — it would look like a false positive to the one reader who can tell. Position 0 is
   * the account the creator is known by, so it is what shows whenever the search is not the reason
   * this row is here.
   */
  const shown = (query ? matchingAccount(influencer, query) : undefined) ?? primaryAccount(influencer.accounts);
  const platforms = platformsOf(influencer.accounts);
  const reach = totalReach(influencer.accounts);

  return (
    <TableRow className={rail ? cn("border-l-4", rail) : undefined}>
      <TableCell className={grouped ? "pl-4" : "pl-5"}>
        {/* The link fills the cell so the whole name is a target. The row is not clickable as a
            whole: a row-level `onClick` makes the text unselectable and cannot be opened in a new
            tab — and the handle underneath carries the search highlight, which a nested link would
            fight. The slug comes off the row, so nothing is looked up to build this. */}
        <Link
          href={influencerHref(influencer)}
          className="-mx-2 -my-1 block truncate rounded-md px-2 py-1 font-medium text-ink hover:text-brand hover:underline"
        >
          <HighlightMatch text={influencer.name} query={query} />
        </Link>
        {/* The handle is the creator's identifier and the second thing the search box matches, so
            it is marked in place — `HighlightMatch`, not relevance ordering, per the rule AGENTS.md
            sets for a search that spans more than the title. The `@` is added here because the
            column never carries one: `InfluencerHandleSchema` rejects a leading `@` rather than
            stripping it, so no account can arrive with its own.

            **One handle, not all of them.** A creator with three accounts is three handles, and a
            stacked list of them under every name would make the column the tallest thing on the
            screen for a fact the Platforms cell already carries. The count lives under Reach, where
            it explains the figure it belongs to. */}
        <span className="mt-0.5 block font-mono text-helper text-ink-tertiary">
          @<HighlightMatch text={shown.handle} query={query} />
        </span>
      </TableCell>

      {/* Up to three platform names, then `+N`. **Words, not glyphs** — Lucide holds no brand
          marks, and drawing six of them for this column is not this release's work. Enum order
          rather than entry order, so reordering a creator's accounts does not reshuffle their row
          for a change that says nothing about where they post. */}
      <TableCell className="text-ink-secondary">
        {platforms
          .slice(0, 3)
          .map((platform) => INFLUENCER_PLATFORM_LABELS[platform])
          .join(", ")}
        {platforms.length > 3 ? (
          <span className="text-ink-tertiary"> +{platforms.length - 3}</span>
        ) : null}
      </TableCell>

      {/* Right-aligned and tabular, because this column is compared down its length rather than
          read across the row — `84.2k` under `1.24M` only lines up on the decimal if the digits
          are the same width. */}
      <TableCell className="text-right font-mono text-helper tabular-nums text-ink">
        {formatCompactNumber(reach)}
        {/* **The one line on this screen that says the figure is a sum.** Without it a creator on
            140k reads as one account of 140k, which is the misreading the child table exists to
            remove. Only when there is more than one: `1 account` under every single-account row
            would be noise on most of the table. */}
        {influencer.accounts.length > 1 ? (
          <span className="mt-0.5 block font-sans text-helper text-ink-tertiary">
            {formatAccountCount(influencer.accounts.length)}
          </span>
        ) : null}
      </TableCell>

      {grouped ? null : (
        <TableCell className="text-ink-secondary">{tierFor(reach).label}</TableCell>
      )}

      <TableCell className="text-right font-mono text-helper tabular-nums text-ink-secondary">
        {/* The follower-weighted blend across the measured accounts. `Value` renders the em dash
            when **none** of them is measured. Not a zero: 0% engagement is a measurement, and a
            prospect who has never run a campaign has not been measured at all. The per-account
            rates are on the detail page, where the blend is shown beside the figures it came
            from. */}
        <Value>{formatEngagement(blendedEngagement(influencer.accounts))}</Value>
      </TableCell>

      <TableCell className="text-ink-secondary">
        {influencer.vertical && VerticalIcon ? (
          // The glyph is never alone — a vocabulary of ten symbols is not readable at 16px on its
          // own, and WCAG 1.4.1 does not allow the icon to be the only carrier.
          <span className="inline-flex items-center gap-1.5">
            <VerticalIcon aria-hidden className="size-4 shrink-0 text-ink-tertiary" />
            {INFLUENCER_VERTICAL_LABELS[influencer.vertical]}
          </span>
        ) : (
          // **The word, not the em dash**, and this is a correction rather than a preference —
          // see `GENERALIST`. `InfluencerSchema` says `null` here is a genuine generalist and not
          // an unclassified row, which is why the union has no `other` member; the em dash is this
          // table's word for "not recorded", so it stated the one thing the schema went out of its
          // way not to mean. Tertiary ink, the same register as `Not engaged yet` two cells over.
          <span className="text-ink-tertiary">{GENERALIST}</span>
        )}
      </TableCell>

      <TableCell className="max-w-[24ch] text-ink-secondary">
        {/* **Not `Group level`, and not the em dash.** `BrandNamesCell`'s default names a contract
            held for the whole group on purpose; a creator with no brand is a *prospect* — somebody
            on the shortlist nobody has booked — which is a stated fact and not a missing one. The
            em dash would read as "not recorded", which is what `Value` has taught these tables it
            means.

            The index behind it is the workspace's own brands now, so an unresolvable id here is a
            request in flight and nothing else: the ids are foreign keys with `ON DELETE CASCADE`
            on both sides, so a deleted brand takes the link with it rather than leaving a dangling
            reference. That is the whole reason the relation is a join table. */}
        <BrandNamesCell
          brandIds={influencer.brandIds}
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
