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
import { SortableHead } from "@/components/layout/sortable-head";
import { TableCard, Value } from "@/components/layout/table-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActiveBrand } from "@/features/brands/active-brand";
import { BrandNamesCell } from "@/features/registry-brands/components/brand-names-cell";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useQueryFilters } from "@/hooks/use-query-filters";
import { formatCompactNumber } from "@/lib/format";
import {
  INFLUENCER_PLATFORM_OPTIONS,
  INFLUENCER_STATUS_LABELS,
  INFLUENCER_STATUS_OPTIONS,
  INFLUENCER_STATUS_TONES,
  INFLUENCER_VERTICAL_ICONS,
  INFLUENCER_VERTICAL_LABELS,
  INFLUENCER_VERTICAL_OPTIONS,
} from "@/lib/labels";
import { useTableDensityClasses } from "@/lib/table-density";
import { cn } from "@/lib/utils";

import { formatEngagement, GENERALIST } from "../format";
import { useInfluencers } from "../hooks";
import { influencerHref } from "../href";
import type { FieldEdit } from "../patch";
import {
  type InfluencerSort,
  nextSort,
  parseSort,
  type SortKey,
  sortInfluencers,
} from "../sort";
import { railForTier, REACH_TIERS, type ReachTier, tierFor } from "../tiers";
import { EditableCell, EditPencil } from "./editable-cell";
import { InfluencerForm } from "./influencer-form";
import {
  BrandsEditor,
  NameEditor,
  StatusEditor,
  useInlineEdit,
  VerticalEditor,
} from "./inline-editors";
import { PlatformBadges } from "./platform-badges";
import { ReachBreakdown } from "./reach-breakdown";
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

// `group` and the sort both re-arrange rows already on screen, so they live on their own
// `useQueryFilters` instance and "Clear filters" leaves them alone. The same split `/contracts`
// makes; the difference here is which way round the default sits.
//
// **They are in the URL and the row height is not**, which is the line this screen now draws
// twice. A sort describes what is on screen and a pasted link has to reproduce it; a row height
// describes how the reader likes to look at it, and a link that carried one would impose one
// person's eyesight on somebody else's. See `lib/table-density.ts`.
const VIEW_KEYS = ["group", "sort", "dir"] as const;

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
  const { filters: viewFilters, setFilters: setViewFilters } = useQueryFilters(VIEW_KEYS);

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
  const { brands, isLoading: brandsLoading } = useActiveBrand();

  const brandById = React.useMemo(() => {
    const map = new Map<string, BrandSummary>();
    for (const brand of brands) map.set(brand.id, brand);
    return map;
  }, [brands]);

  /**
   * The order the rows are in, or `null` for the server's own — reach descending, which is what
   * the tier bands are built on and what the screen opens in.
   */
  const sort = parseSort(viewFilters.sort, viewFilters.dir);

  // Grouped unless explicitly turned off. Written as "is it the string `none`" rather than as a
  // truthiness test, so an unrecognised value falls back to the default rather than to flat.
  //
  // **A sort turns the bands off**, and the two controls are exclusive rather than composed. A
  // sort inside the bands would give the table two orders at once — bands by reach, rows by name
  // — and the reader would have to hold both to predict where a row is. Worse, it makes the
  // screen's one strong claim ambiguous: the bands exist to say *this is what reach buys*, which
  // is a statement about ordering, and a band whose rows are alphabetical stops making it.
  //
  // Belt and braces: the handlers below write `group=none` with every sort, so this second guard
  // only matters for a hand-edited URL carrying both.
  const grouped = !sort && viewFilters.group !== GROUP_NONE;

  const brandOptions = React.useMemo(
    () => brands.map((brand) => ({ value: brand.id, label: brand.name })),
    [brands],
  );

  /**
   * A click on a heading: ascending, then descending, then back to the server's order.
   *
   * One `setFilters` and not three `setFilter` calls — they each build from the same rendered
   * params, so the last would win and drop the other two (see `setFilters`' docstring). The
   * grouping goes off in the same write, because a URL is a state and a state that says both is
   * a state somebody has to resolve at read time.
   *
   * **Clearing the sort does not bring the bands back.** The reader turned them off by sorting,
   * and re-grouping under them as the order returns to default would be a second change they did
   * not ask for. `Group by reach` is one click away and says what it does.
   */
  const applySort = React.useCallback(
    (key: SortKey) => {
      const next = nextSort(sort, key);
      setViewFilters({
        sort: next?.key ?? null,
        dir: next?.direction ?? null,
        group: GROUP_NONE,
      });
    },
    [sort, setViewFilters],
  );

  /**
   * The grouping toggle, which **clears the sort when it turns the bands on**.
   *
   * The other half of the exclusivity above. Without it, pressing `Group by reach` while sorted
   * by name would either be a button that does nothing visible or a table that quietly ignores
   * the sort still named in its own URL.
   */
  const setGrouped = React.useCallback(
    (next: boolean) => {
      setViewFilters(
        next ? { group: null, sort: null, dir: null } : { group: GROUP_NONE },
      );
    },
    [setViewFilters],
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
   * The sheet, and it is **create only** here.
   *
   * ── The argument that survived, and the one that did not ─────────────────
   *
   * This docstring used to say editing lived on the record page and that the table had no business
   * offering any. Half of that was an argument about a **per-row actions menu** — that giving this
   * table one, to reach a form the creator's own page already holds, would put the same sheet
   * behind two entry points and a menu on a table whose rows are already a link. That half is
   * still right, and there is still no actions column.
   *
   * The other half did not survive contact with the most common edit this table takes. Moving one
   * creator from `prospect` to `active` cost a navigation, a sheet, a select, a save and a
   * navigation back — and the sheet it opened **replaces the entire account list and brand set on
   * submit**, because both are full-replacement keys. So the cheapest correction in the product
   * was also its heaviest write.
   *
   * **Editing the cell you are looking at is not an actions menu.** Four columns hold a field and
   * they edit in place, one key per `PATCH`; the four that hold a sum do not, because you cannot
   * edit a sum by typing over it. See `InfluencerRow` for the column-by-column line and
   * `features/influencers/patch.ts` for the write.
   *
   * The record page keeps what only it can do: the whole record at once, the accounts, the notes,
   * and the delete.
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
              <ToggleButton pressed={grouped} onPressedChange={setGrouped}>
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
        sort={sort}
        onSort={applySort}
        brands={brands}
        brandsLoading={brandsLoading}
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

/**
 * Which way this column is pointing, or `null` when the table is ordered by another one.
 *
 * A one-line adapter between the URL's single sort and eight headings that each have to know
 * whether they are the active one. Written here rather than in `sort.ts` because it is about the
 * control's state and not about the order.
 */
function directionOf(sort: InfluencerSort | null, key: SortKey): "asc" | "desc" | null {
  return sort?.key === key ? sort.direction : null;
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
  sort,
  onSort,
  brands,
  brandsLoading,
  brandById,
}: {
  filters: Partial<Record<(typeof FILTER_KEYS)[number], string>>;
  grouped: boolean;
  /** `null` is the server's own order — reach descending — which is what the bands are built on. */
  sort: InfluencerSort | null;
  onSort: (key: SortKey) => void;
  brands: BrandSummary[];
  brandsLoading: boolean;
  brandById: Map<string, BrandSummary>;
}) {
  // Which bands are folded away. A Set rather than a per-group `open` flag so the default is
  // expanded — a table that opens collapsed hides the data it exists to show. `useState` and not
  // the URL: a reading posture, not a view worth sharing.
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(() => new Set());

  /**
   * The inline write, **once for the table** rather than once per row.
   *
   * `useInfluencerMutations` reaches `useActiveWorkspace`, which is an SWR subscription plus a
   * `useSyncExternalStore` one; 146 of each to serve a single `PATCH` at a time is a cost with
   * nothing on the other side of it. `commit` takes the creator as an argument, and each cell owns
   * its own pending state in a plain `useState`.
   */
  const { commit } = useInlineEdit();

  /**
   * The creator whose whole record is open in the sheet, for the two columns that cannot edit in
   * place. `null` is closed.
   *
   * **Held apart from `open`** and never cleared on close: `InfluencerForm` re-seeds its draft
   * during render when `open` flips true, so the prop has to still be there at that moment.
   * Clearing it on close is also the second half of the wedge AGENTS.md records — a value that
   * changes mid-dismissal, whether through a `key` or through a prop the content reads, is how
   * Base UI's overlay ends up mounted and eating clicks.
   */
  const [editing, setEditing] = React.useState<Influencer | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const openRecord = React.useCallback((influencer: Influencer) => {
    setEditing(influencer);
    setEditOpen(true);
  }, []);

  const { influencers, isLoading, error } = useInfluencers();

  const items = React.useMemo(
    () => influencers.filter((influencer) => matchesFilters(influencer, filters)),
    [influencers, filters],
  );

  const groups = React.useMemo(() => (grouped ? groupByTier(items) : null), [grouped, items]);

  /**
   * The flat table's rows, in the reader's order.
   *
   * Only computed for the flat table: a sort turns the bands off, so `groups` and this are never
   * both in play. `sortInfluencers` copies before sorting — `items` is a `useMemo` over SWR's
   * cached array, and sorting it in place would reorder the cache every other consumer reads.
   */
  const rows = React.useMemo(() => sortInfluencers(items, sort), [items, sort]);

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
            {/* Every heading sorts, and a click on any of them turns the bands off — see
                `features/influencers/sort.ts` for why this screen may sort at all when
                AGENTS.md bans it, and why the two set-valued columns order by count. */}
            <TableRow>
              {/* 4px rail + `pl-4` grouped, `pl-5` ungrouped — 20px either way, or the whole first
                  column reads as misaligned against the band above it. */}
              <SortableHead
                label="Creator"
                className={grouped ? "pl-4" : "pl-5"}
                active={directionOf(sort, "name")}
                onSort={() => onSort("name")}
              />
              {/* **Platforms**, plural, since a creator holds up to ten accounts. The column is a
                  set now rather than a field, and the heading is the first thing that says so —
                  which is also why it sorts by how many rather than by a first name in the set. */}
              <SortableHead
                label="Platforms"
                hint="by how many"
                active={directionOf(sort, "platforms")}
                onSort={() => onSort("platforms")}
              />
              <SortableHead
                label="Reach"
                align="right"
                active={directionOf(sort, "reach")}
                onSort={() => onSort("reach")}
              />
              {grouped ? null : (
                <SortableHead
                  label="Tier"
                  active={directionOf(sort, "tier")}
                  onSort={() => onSort("tier")}
                />
              )}
              <SortableHead
                label="Engagement"
                align="right"
                hint="unmeasured last"
                active={directionOf(sort, "engagement")}
                onSort={() => onSort("engagement")}
              />
              <SortableHead
                label="Vertical"
                active={directionOf(sort, "vertical")}
                onSort={() => onSort("vertical")}
              />
              <SortableHead
                label="Brands"
                hint="by how many"
                active={directionOf(sort, "brands")}
                onSort={() => onSort("brands")}
              />
              <SortableHead
                label="Status"
                className="pr-5"
                active={directionOf(sort, "status")}
                onSort={() => onSort("status")}
              />
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
                              brands={brands}
                              brandsLoading={brandsLoading}
                              brandById={brandById}
                              commit={commit}
                              onOpenRecord={openRecord}
                            />
                          ))}
                    </React.Fragment>
                  );
                })
              : rows.map((influencer) => (
                  <InfluencerRow
                    key={influencer.id}
                    influencer={influencer}
                    grouped={false}
                    query={filters.q}
                    brands={brands}
                    brandsLoading={brandsLoading}
                    brandById={brandById}
                    commit={commit}
                    onOpenRecord={openRecord}
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

      {/* **The sheet the derived columns open**, and the second `InfluencerForm` on this screen —
          the browser's is create-only. Two instances rather than one shared between the toolbar
          and the rows, because a single form would need its mode to change under a `key` or under
          a prop that flips as it closes, and both are the wedge AGENTS.md records. Each is a
          plain, single-purpose sheet with its own `open`. */}
      <InfluencerForm
        influencer={editing ?? undefined}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
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
  // The band cannot inherit the row height — it is a cell with `p-0` and a button inside — so it
  // asks the ladder for the rung the cells got (`lib/table-density.ts`).
  const { band } = useTableDensityClasses();

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
      <TableCell colSpan={columnCount} className={cn("border-l-4 p-0", band, rail.band)}>
        {canCollapse ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!isCollapsed}
            className={cn("flex w-full items-center pr-5 pl-3.5 text-left", band)}
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
          <div className={cn("flex w-full items-center pr-5 pl-4", band)}>{body}</div>
        )}
      </TableCell>
    </TableRow>
  );
}

/**
 * One creator, and the line that decides which of its eight cells can be typed into.
 *
 * **A cell is editable when it holds a field; a derived cell opens its source.**
 *
 * | Column | Inline | Why |
 * |---|---|---|
 * | Creator | **yes**, text | A field on the row. The slug does not follow — frozen at create |
 * | Platforms | no → the record's form | A set over the child table, not a field |
 * | Reach | no → the record's form | `totalReach`, derived and never stored |
 * | Tier | **never** | Derived from a derived figure. There is nothing behind it to open |
 * | Engagement | **never** | `blendedEngagement`, a weighted mean. The parts are in the popover |
 * | Vertical | **yes**, select | A field. `Generalist` is the empty option, as in the form |
 * | Brands | **yes**, multi-select | A field — a full-replacement set, as the picker already means |
 * | Status | **yes**, select | A field, and the most-edited one on this table |
 *
 * The four refusals are one refusal repeated: **you cannot edit a sum by typing over it.** Reach
 * and Platforms get a pencil all the same, because their source *is* editable — it is the account
 * list — so the pencil opens the record's own form rather than pretending the cell is inert. Tier
 * and Engagement get none, because nothing behind them is a thing to open: a tier is a band over a
 * sum, and a blend is arithmetic over rates the reach popover already shows one click away.
 *
 * **No inline edit can move a row**, and that is a property rather than a coincidence. The bands
 * group by reach and the default order is reach descending; not one of the four editable fields is
 * an input to either. So a status change under a grouped table does not make the row jump out from
 * under the pointer that changed it. The exception is a sort *by* one of those columns, where the
 * row moves because the reader asked the table to order by the thing they just changed — the one
 * case where movement is the answer rather than a surprise.
 */
function InfluencerRow({
  influencer,
  grouped,
  rail,
  query,
  brands,
  brandsLoading,
  brandById,
  commit,
  onOpenRecord,
}: {
  influencer: Influencer;
  grouped: boolean;
  rail?: string;
  query?: string;
  brands: BrandSummary[];
  brandsLoading: boolean;
  brandById: Map<string, BrandSummary>;
  commit: (influencer: Influencer, edit: FieldEdit) => Promise<boolean>;
  onOpenRecord: (influencer: Influencer) => void;
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
    // `group/row` is what the pencils' `group-hover/row:opacity-100` reads. **Named**, not a bare
    // `group`: the Reach cell holds a popover and the Brands cell another, and an unnamed group
    // would be claimed by whichever ancestor is nearest.
    <TableRow className={cn("group/row", rail && "border-l-4", rail)}>
      <TableCell className={grouped ? "pl-4" : "pl-5"}>
        {/* **The link stays the cell's primary target and the pencil is a separate control beside
            it** — never a nested interactive, which is what putting a button inside the link would
            be. Opening the record is the more common intent, so it keeps the whole name; the
            pencil sits at the cell's right.

            The row is not clickable as a whole: a row-level `onClick` makes the text unselectable
            and cannot be opened in a new tab — and the handle underneath carries the search
            highlight, which a nested link would fight. */}
        <EditableCell
          label="name"
          // The handle sits under this line, so the editor takes the line's height rather than the
          // rung's — otherwise opening it adds the difference to the row's tallest cell and pushes
          // every row below down. See `editable-cell.tsx`.
          stacked
          display={
            <Link
              href={influencerHref(influencer)}
              className="-mx-2 -my-1 block min-w-0 truncate rounded-md px-2 py-1 font-medium text-ink hover:text-brand hover:underline"
            >
              <HighlightMatch text={influencer.name} query={query} />
            </Link>
          }
        >
          {(slot) => <NameEditor {...slot} influencer={influencer} commit={commit} />}
        </EditableCell>
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

      {/* Up to three platform badges, then a `+N` naming the rest on hover and on focus.
          **Marks and words together, and the marks are monochrome** — see
          `components/platform-icons.tsx` for why they are not the platforms' own colours, which
          is the decision the next person is most likely to reverse by accident. Enum order rather
          than entry order, so reordering a creator's accounts does not reshuffle their row for a
          change that says nothing about where they post. */}
      <TableCell>
        {/* **The pencil opens the record's form, and it says what it is for.** A creator's
            platforms are the child table's, so there is nothing here to type over — but the thing
            behind the cell is editable, and a column that offered no affordance at all would read
            as frozen. `Edit platforms and handles` is the honest name for a control that lands in
            the account editor. */}
        <span className="flex items-center gap-1">
          <PlatformBadges platforms={platforms} />
          <EditPencil
            label="platforms and handles"
            className="ml-auto"
            onClick={() => onOpenRecord(influencer)}
          />
        </span>
      </TableCell>

      {/* Right-aligned and tabular, because this column is compared down its length rather than
          read across the row — `84.2k` under `1.24M` only lines up on the decimal if the digits
          are the same width. */}
      <TableCell className="text-right font-mono text-helper tabular-nums text-ink">
        {/* The pencil goes **before** the figure, not after it. `opacity-0` still occupies its
            width, so a pencil on the right would push the numbers off the column's right edge on
            hover — or, reserved, would unalign the one column on this table that is read down its
            length. Same destination as the Platforms pencil, named for what the reader came to
            change. */}
        <span className="flex items-center justify-end gap-1">
          <EditPencil label="follower counts" onClick={() => onOpenRecord(influencer)} />
          {formatCompactNumber(reach)}
        </span>
        {/* **The one line on this screen that says the figure is a sum**, and now the control that
            shows what the sum is made of. Without it a creator on 140k reads as one account of
            140k, which is the misreading the child table exists to remove. `ReachBreakdown`
            renders nothing at all for a single-account creator: there is nothing to split, and
            `1 account` under every such row would be noise on most of the table. */}
        <ReachBreakdown influencer={influencer} />
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
        <EditableCell
          label="vertical"
          display={
            influencer.vertical && VerticalIcon ? (
              // The glyph is never alone — a vocabulary of ten symbols is not readable at 16px on
              // its own, and WCAG 1.4.1 does not allow the icon to be the only carrier.
              <span className="inline-flex items-center gap-1.5">
                <VerticalIcon aria-hidden className="size-4 shrink-0 text-ink-tertiary" />
                {INFLUENCER_VERTICAL_LABELS[influencer.vertical]}
              </span>
            ) : (
              // **The word, not the em dash**, and this is a correction rather than a preference —
              // see `GENERALIST`. `InfluencerSchema` says `null` here is a genuine generalist and
              // not an unclassified row, which is why the union has no `other` member; the em dash
              // is this table's word for "not recorded", so it stated the one thing the schema went
              // out of its way not to mean. The select's empty option carries the same word, so the
              // display and the editor agree about what `null` means.
              <span className="text-ink-tertiary">{GENERALIST}</span>
            )
          }
        >
          {(slot) => <VerticalEditor {...slot} influencer={influencer} commit={commit} />}
        </EditableCell>
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
        {/* The one editor that is a popover rather than an inline swap: a column of checkboxes
            does not fit a 24px cell, and the set needs an explicit `Save` because the write is a
            full replacement. See `BrandsEditor`. */}
        <BrandsEditor
          influencer={influencer}
          commit={commit}
          brands={brands}
          brandsLoading={brandsLoading}
          display={
            <BrandNamesCell
              brandIds={influencer.brandIds}
              brandById={brandById}
              empty={<span className="text-ink-tertiary">Not engaged yet</span>}
            />
          }
        />
      </TableCell>

      <TableCell className="pr-5">
        {/* **The most-edited cell on this table**, and the reason inline editing is here at all:
            moving one creator from `prospect` to `active` used to cost a navigation, a sheet, a
            select, a save and a navigation back — and that sheet replaced the whole account list
            on submit. It is one `PATCH` of one key now. */}
        <EditableCell
          label="status"
          display={
            <Badge variant={INFLUENCER_STATUS_TONES[influencer.status]}>
              {INFLUENCER_STATUS_LABELS[influencer.status]}
            </Badge>
          }
        >
          {(slot) => <StatusEditor {...slot} influencer={influencer} commit={commit} />}
        </EditableCell>
      </TableCell>
    </TableRow>
  );
}
