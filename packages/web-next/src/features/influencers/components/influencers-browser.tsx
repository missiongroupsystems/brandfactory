"use client";

import type {
  BrandSummary,
  Influencer,
  InfluencerAccount,
  InfluencerPlatform,
} from "@brandfactory/shared";
import {
  blendedEngagement,
  byInfluencerReach,
  platformsOf,
  primaryAccount,
  totalReach,
} from "@brandfactory/shared";
import Link from "next/link";
import { ChevronDownIcon, LayersIcon, PlusIcon, SparklesIcon } from "lucide-react";
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
import { ViewSettingsSection } from "@/components/layout/view-settings";
import { SortableHead } from "@/components/layout/sortable-head";
import { Checkbox } from "@/components/ui/checkbox";
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
  INFLUENCER_PLATFORM_LABELS,
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

import { formatAccountCount, formatEngagement, GENERALIST } from "../format";
import { useInfluencers } from "../hooks";
import { influencerHref } from "../href";
import type { FieldEdit } from "../patch";
import { profileUrlOn } from "../platforms";
import {
  type InfluencerSort,
  nextSort,
  parseSort,
  type SortKey,
  sortInfluencers,
} from "../sort";
import { railForTier, REACH_TIERS, type ReachTier, tierFor } from "../tiers";
import { AccountsPanel } from "./accounts-panel";
import { type QuickAddDraft, toAccountDraft } from "../lookup";
import {
  parseReachSortKey,
  reachColumnsFor,
  reachOn,
  reachSortKey,
  reachTableMinWidth,
} from "../reach-columns";
import { InfluencerForm, type InfluencerFormPrefill } from "./influencer-form";
import { BrandsEditor, StatusEditor, useInlineEdit, VerticalEditor } from "./inline-editors";
import { PlatformBadges } from "./platform-badges";
import { QuickAddSheet } from "./quick-add-sheet";
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
const VIEW_KEYS = ["group", "sort", "dir", "reach"] as const;

/** The one value this screen writes to turn grouping off. Grouping is the default, so the *off*
 *  state is what appears in the URL. */
const GROUP_NONE = "none";

/**
 * The one value this screen writes to turn the reach columns on. Off is the default, so the *on*
 * state is what appears in the URL — the mirror of `GROUP_NONE` above, and for the same reason:
 * the URL should carry what somebody changed, not what they left alone.
 *
 * **In the URL rather than in `stored-preference`, even though it is offered on the View panel.**
 * The panel is a *place*, not a storage decision. Row height sits there because it describes how
 * a reader likes to look at a table; this describes *what columns are on screen* and can carry a
 * sort key that only exists while they are — a pasted link showing the roster ordered by Instagram
 * following has to reproduce both halves or it reproduces neither. `lib/table-density.ts` draws
 * the line and this falls on the other side of it.
 */
const REACH_BY_PLATFORM = "platform";

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

  /**
   * Whether the single Reach column becomes one column per platform, plus a total.
   *
   * Answers "who has the biggest Instagram following on this list", which is a question about the
   * *column* and is the one thing the per-creator accounts panel cannot do.
   *
   * **Off by default, and the default is the one 1.49.1 measured.** That pass got this table to
   * stop overflowing its card — `table-fixed`, a percentage per column, the badge cap cut from
   * three to two — and three more numeric columns is the direct opposite of it. So the default
   * view keeps every one of those decisions untouched and this one buys a horizontal scrollbar,
   * which is the trade the reader is making when they turn it on.
   */
  const reachByPlatform = viewFilters.reach === REACH_BY_PLATFORM;

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

  /**
   * The reach-by-platform toggle, which **clears a per-platform sort on the way out**.
   *
   * The third exclusivity rule on this screen, and the one the plan asked to have re-argued for a
   * column that only sometimes exists. Turning the view off while sorted by `reach:instagram`
   * would leave the table ordered by a column with no heading — no way to see why the rows are in
   * that order and no way to clear it but the URL. Turning it *on* clears nothing: every one of
   * the eight base columns is still there and still sorted by whatever it was.
   *
   * A pasted URL carrying `?sort=reach:instagram` without `?reach=platform` is left alone rather
   * than corrected — see `ReachPlatformSortKey`. The order is honest, the heading is one click
   * away, and silently dropping the sort somebody shared would be worse than showing it.
   */
  const setReachByPlatform = React.useCallback(
    (next: boolean) => {
      if (next) {
        setViewFilters({ reach: REACH_BY_PLATFORM });
        return;
      }
      const sortingByPlatform = parseReachSortKey(viewFilters.sort) !== null;
      setViewFilters(
        sortingByPlatform ? { reach: null, sort: null, dir: null } : { reach: null },
      );
    },
    [setViewFilters, viewFilters.sort],
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

  /**
   * Quick add, and the full form it can hand off to.
   *
   * **Two sheets rather than one with a mode**, on the same argument the detail page's second
   * `InfluencerForm` already makes: they ask different questions, and a component that held both
   * flows would branch on `step` at every field. The handoff is one direction only — quick add
   * opens the form, never the reverse.
   *
   * `createPrefill` is **held apart from `createOpen` and never cleared on close**, the pattern
   * `editing` below uses and for its reason: `InfluencerForm` re-seeds its draft during render
   * when `open` flips true, so clearing the seed on the way out would empty the fields mid-exit
   * animation, in front of the reader.
   */
  const [quickAddOpen, setQuickAddOpen] = React.useState(false);
  const [createPrefill, setCreatePrefill] = React.useState<InfluencerFormPrefill | undefined>(
    undefined,
  );
  const openQuickAdd = React.useCallback(() => {
    // The prefill belongs to the last handoff; a fresh quick add must not inherit it.
    setCreatePrefill(undefined);
    setQuickAddOpen(true);
  }, []);
  const handOffToForm = React.useCallback((draft: QuickAddDraft) => {
    setCreatePrefill({
      name: draft.name,
      accounts: [toAccountDraft(draft)],
      vertical: draft.vertical,
    });
    setQuickAddOpen(false);
    setCreateOpen(true);
  }, []);

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      {/* Toolbar and chips are one block — the chips describe the row above them, so they sit at
          gap-3 from it rather than at the page's gap-4 from everything.

          **The overflow form and not `FilterBar`, measured at 1280.** Search at `sm:w-72` plus
          four selects at `sm:min-w-44` is about 1050px before the gaps, and the view toggle and
          the primary action take another 300 on the right. */}
      <div className="flex flex-col gap-3">
        <FilterToolbar
          settingsModified={reachByPlatform}
          settings={
            /* **The first user of the View panel's `settings` slot**, which has existed since
               1.48.0 with nothing in it. The row height above it is a preference; this is a URL
               state — see `REACH_BY_PLATFORM` for why both belong in one panel anyway. */
            <ViewSettingsSection title="Reach column">
              {/* A real `<label>` wrapping the box, not an `aria-label`: a panel has vertical room,
                  which is the same reason `PanelFilter` gets a visible label where the toolbar row
                  could only afford a hidden one. */}
              <label className="flex cursor-pointer items-start gap-2">
                <Checkbox
                  className="mt-0.5"
                  checked={reachByPlatform}
                  onChange={(event) => setReachByPlatform(event.target.checked)}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-helper text-ink">One column per platform</span>
                  <span className="text-helper text-ink-tertiary">
                    A column for each platform on this list, plus the total. The table scrolls
                    sideways.
                  </span>
                </span>
              </label>
            </ViewSettingsSection>
          }
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
              {/* **`Add creator` demotes and quick add takes the primary slot**, which is this
                  release read as one control — the same move `SyncInfluencersButton` made when the
                  create arrived, for the same reason. The full form is still the way to enter a
                  creator with brands, notes or several accounts, and still the only way to enter
                  an XiaoHongShu one; what it is no longer is the *cheapest* way in, and the
                  primary slot should belong to the cheapest way in.

                  Exactly one primary button per view, per the accent budget in AGENTS.md — which
                  is why this is a demotion rather than a second primary beside it. */}
              <Button variant="secondary" onClick={openCreate}>
                <PlusIcon data-icon="inline-start" />
                Add creator
              </Button>
              <Button onClick={openQuickAdd}>
                <SparklesIcon data-icon="inline-start" />
                Quick add
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
        reachByPlatform={reachByPlatform}
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
      <InfluencerForm open={createOpen} onOpenChange={setCreateOpen} prefill={createPrefill} />

      {/* Quick add reads the roster itself — the same SWR entry the table renders from — so the
          duplicate check costs no request and nothing is threaded down. */}
      <QuickAddSheet
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        onAddManually={handOffToForm}
      />
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
  reachByPlatform,
  sort,
  onSort,
  brands,
  brandsLoading,
  brandById,
}: {
  filters: Partial<Record<(typeof FILTER_KEYS)[number], string>>;
  grouped: boolean;
  /** One numeric column per platform on this list, plus the total. See `reach-columns.ts`. */
  reachByPlatform: boolean;
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

  const { influencers, isLoading, error } = useInfluencers();

  const items = React.useMemo(
    () => influencers.filter((influencer) => matchesFilters(influencer, filters)),
    [influencers, filters],
  );

  const groups = React.useMemo(() => (grouped ? groupByTier(items) : null), [grouped, items]);

  /**
   * The platform columns, **derived from the filtered rows rather than from the enum**, so a
   * roster using three platforms gets three columns and not six of which three are always empty.
   * `items` and not `influencers`: filter to TikTok and the Instagram column goes with it.
   */
  const reachColumns = React.useMemo(
    () => (reachByPlatform ? reachColumnsFor(items) : []),
    [reachByPlatform, items],
  );

  /**
   * A column's share of the fixed-layout budget, **or nothing in the wide view.**
   *
   * The eight percentages sum to 100 and that is the only reason they mean anything. The wide view
   * adds one 9% column per platform on top of them — 145% with all six present — and a browser
   * answers an over-subscribed set of percentage widths by scaling every one of them down, so the
   * headings clip. That view is `table-layout: auto` over a minimum width instead, where a column
   * takes what its content needs and the reader gets the scrollbar they asked for.
   */
  const share = (pct: string) => (reachByPlatform ? undefined : pct);

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
  // row is the redundancy grouping exists to remove. The reach columns add one per platform on top
  // of the total, which is the one this view splits — so the arithmetic is `+ N`, not `+ N + 1`.
  const columnCount = (grouped ? 7 : 8) + reachColumns.length;

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
        {/* **`table-fixed`, with a percentage share per column.** Left to `table-layout: auto`
            every column takes whatever its widest cell needs — which is how this table used to
            end up wider than the card, headers ellipsizing to `T…`/`Engage…` while `Status` fell
            off the right edge with no scrollbar visible to explain why. A percentage share is a
            proportion of the card rather than a pixel count, so it holds across window widths
            without a media query: the whole row scales together instead of one column eating the
            others' space. The eight numbers are chosen off the actual roster (146 real creators,
            widest name/handle/vertical/brand-list included) and sum to 100 across the *ungrouped*
            table; grouped drops `Tier`'s share and the remaining seven stretch to fill it, which
            needs no code of its own — an unset column simply is not there to claim a share.
            See `docs/completions/` for the column-by-column budget this was measured against. */}
        {/* **The wide view drops `table-fixed` and takes a minimum width instead.** The eight
            percentages above are a budget that sums to 100 and cannot absorb three more columns
            without squeezing every one of them below what 1.49.1 measured as its content need —
            which is the bug that pass fixed. So this view stops dividing a fixed pie and starts
            being wider than the card on purpose, which is what the `overflow-x-auto` in
            `components/ui/table.tsx` has always been there to catch. The width is a literal class
            from a map, never interpolated — see `reachTableMinWidth`.

            **And it drops the percentages with it — `share()` below is what makes that true.**
            Leaving them on was the browser pass's one finding: six platform columns at 9% each on
            top of a budget already summing to 100 gives 145%, which a browser normalises by
            squeezing every column proportionally. The result was seven clipped headings, `TikTok`
            reading `Ti…` — the same symptom, on the same table, that 1.49.1 spent a release
            removing. A percentage is only a budget while it sums to one. */}
        <Table
          className={
            reachByPlatform
              ? cn("w-full", reachTableMinWidth(reachColumns.length))
              : "table-fixed"
          }
        >
          <TableHeader>
            {/* Every heading sorts, and a click on any of them turns the bands off — see
                `features/influencers/sort.ts` for why this screen may sort at all when
                AGENTS.md bans it, and why the two set-valued columns order by count. */}
            <TableRow>
              {/* 4px rail + `pl-4` grouped, `pl-5` ungrouped — 20px either way, or the whole first
                  column reads as misaligned against the band above it. */}
              <SortableHead
                label="Creator"
                className={cn(grouped ? "pl-4" : "pl-5", share("w-[14%]"))}
                active={directionOf(sort, "name")}
                onSort={() => onSort("name")}
              />
              {/* **Platforms**, plural, since a creator holds up to ten accounts. The column is a
                  set now rather than a field, and the heading is the first thing that says so —
                  which is also why it sorts by how many rather than by a first name in the set. */}
              <SortableHead
                label="Platforms"
                hint="by how many"
                className={share("w-[18%]")}
                active={directionOf(sort, "platforms")}
                onSort={() => onSort("platforms")}
              />
              {/* **One heading per platform, then the total.** The platform columns come first
                  and the total last, which is the order the figures are read in — the parts, then
                  what they add up to — and the same order the accounts panel puts them in
                  one column over. */}
              {reachColumns.map((platform) => (
                <SortableHead
                  key={platform}
                  label={INFLUENCER_PLATFORM_LABELS[platform]}
                  align="right"
                  hint="not on it last"
                  active={directionOf(sort, reachSortKey(platform))}
                  onSort={() => onSort(reachSortKey(platform))}
                />
              ))}
              <SortableHead
                label={reachByPlatform ? "Total" : "Reach"}
                align="right"
                className={share("w-[10%]")}
                active={directionOf(sort, "reach")}
                onSort={() => onSort("reach")}
              />
              {grouped ? null : (
                <SortableHead
                  label="Tier"
                  className={share("w-[9%]")}
                  active={directionOf(sort, "tier")}
                  onSort={() => onSort("tier")}
                />
              )}
              <SortableHead
                label="Engagement"
                align="right"
                hint="unmeasured last"
                className={share("w-[12%]")}
                active={directionOf(sort, "engagement")}
                onSort={() => onSort("engagement")}
              />
              <SortableHead
                label="Vertical"
                className={share("w-[14%]")}
                active={directionOf(sort, "vertical")}
                onSort={() => onSort("vertical")}
              />
              <SortableHead
                label="Brands"
                hint="by how many"
                className={share("w-[13%]")}
                active={directionOf(sort, "brands")}
                onSort={() => onSort("brands")}
              />
              <SortableHead
                label="Status"
                className={cn("pr-5", share("w-[10%]"))}
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
                              reachColumns={reachColumns}
                              rail={rail.rows}
                              query={filters.q}
                              brands={brands}
                              brandsLoading={brandsLoading}
                              brandById={brandById}
                              commit={commit}
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
                    reachColumns={reachColumns}
                    query={filters.q}
                    brands={brands}
                    brandsLoading={brandsLoading}
                    brandById={brandById}
                    commit={commit}
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

      {/* **The second `InfluencerForm` this screen used to carry is gone.** It existed only for
          the Platforms and Reach pencils, which navigated a reader into a whole-record sheet to
          change one follower count — and submitted a `CreateInfluencerInput` that rewrote the
          brand set on the way past. Those two cells open the accounts panel now, and the one field
          the panel leaves out has a link in its footer to the record's own page, which carries its
          own Edit sheet. The form left on this screen is the toolbar's, and it is create-only. */}
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
 * One creator, and the line that decides what each of its eight cells does when you press it.
 *
 * **Every cell that can be acted on is a control over its whole area.** The pencil that used to
 * sit at each cell's right edge is gone — see `editable-cell.tsx` for what the reader objected to
 * and which of its properties were kept. What replaces it is a hover tint over the cell, and a
 * chevron on the cells that open a list.
 *
 * | Column | Pressing the cell | Why |
 * |---|---|---|
 * | Creator | opens the record | **A link, and nothing else.** The one cell whose whole job is to be one |
 * | Platforms | the accounts panel | A set over the child table. The badges are links in their own right |
 * | Reach | the accounts panel | `totalReach`, derived — so the panel edits the figures it is a sum of |
 * | Tier | **nothing** | Derived from a derived figure. There is nothing behind it to open |
 * | Engagement | **nothing** | `blendedEngagement`, a weighted mean. The parts are in the accounts panel |
 * | Vertical | a menu | A field. `Generalist` is the empty option, as in the form |
 * | Brands | a checkbox popover | A field — a full-replacement set, as the picker already means |
 * | Status | a menu | A field, and the most-edited one on this table |
 *
 * **You still cannot edit a sum by typing over it**, and the two refusals that survive are the two
 * with nothing behind them: a tier is a band over a sum, and a blend is arithmetic over rates. The
 * other two derived columns stopped opening a form and started opening the thing they are derived
 * *from* — one panel, from either cell, because Platforms and Reach are the same child table read
 * from two angles.
 *
 * **The Creator cell is the deliberate exception**, and it is a removal rather than an omission.
 * It used to carry a text editor; the reader asked for the name to stay a link, and 1.49.0's
 * browser pass had already found what the editor cost — a two-line cell whose editor added 10px to
 * the tallest thing in the row and pushed every row below it down. The name is still editable on
 * the record's own form.
 *
 * **No edit from this table can move a row**, and that is a property rather than a coincidence.
 * The bands group by reach and the default order is reach descending — and the accounts panel is
 * the one control that can now change both. It is also the one whose write the reader is looking
 * *at* when it lands, on a panel they pressed `Save` on, which is the case where a row moving is
 * the answer rather than a surprise. Not one of the other three fields is an input to either
 * ordering.
 */
function InfluencerRow({
  influencer,
  grouped,
  reachColumns,
  rail,
  query,
  brands,
  brandsLoading,
  brandById,
  commit,
}: {
  influencer: Influencer;
  grouped: boolean;
  /** The platform columns to render before the total. Empty in the default view. */
  reachColumns: readonly InfluencerPlatform[];
  rail?: string;
  query?: string;
  brands: BrandSummary[];
  brandsLoading: boolean;
  brandById: Map<string, BrandSummary>;
  commit: (influencer: Influencer, edit: FieldEdit) => Promise<boolean>;
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
  const accountsLabel = `Edit the accounts of ${influencer.name}`;

  return (
    // The `group/row` this row used to name is gone with the pencils that read it. Nothing on the
    // row is revealed on hover any more: every trigger is drawn at all times and it is the *tint*
    // that changes, which `TableRow`'s own `hover:` and each trigger's own `hover:` handle between
    // them without a named group.
    <TableRow className={cn(rail && "border-l-4", rail)}>
      <TableCell className={grouped ? "pl-4" : "pl-5"}>
        {/* **The one cell on this table with no editor at all, by request.** *"The Creator cell
            stays a link and always opens the creator's profile."* It is also the cell that cost
            the most to make editable: the name sits over the handle, so the editor took the height
            of a line rather than of the cell, and getting that wrong moved every row below it by
            10px on the default rung. That whole apparatus — `stacked`, and the arithmetic behind
            it — leaves with the editor.

            The row is still not clickable as a whole: a row-level `onClick` makes the text
            unselectable and cannot be opened in a new tab, and the handle underneath carries the
            search highlight, which a nested link would fight. */}
        <Link
          href={influencerHref(influencer)}
          className="-mx-2 -my-1 block min-w-0 truncate rounded-md px-2 py-1 font-medium text-ink hover:text-brand hover:underline"
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

      {/* Up to two platform badges, then a `+N` naming the rest on hover and on focus.
          **Marks and words together, and the marks are monochrome** — see
          `components/platform-icons.tsx` for why they are not the platforms' own colours, which
          is the decision the next person is most likely to reverse by accident. Enum order rather
          than entry order, so reordering a creator's accounts does not reshuffle their row for a
          change that says nothing about where they post. */}
      <TableCell>
        {/* **Two peers in one cell, and that is deliberate.** The badges are links — to somebody
            else's site — and a button wrapping a link is what this feature refuses to write. So
            the panel's trigger is a *sibling* taking whatever the badges leave (`flex-1`), with
            the same tint, and the cell still reads as one control. The floor is what keeps it a
            target at all on a creator whose badges fill the column. */}
        <span className="flex min-w-0 items-center gap-1">
          {/* **Each badge opens that platform's profile in a new tab.** The cell was six words and
              a pencil; the platform a reader is looking at is also the profile they are about to
              go and check, and the route to it used to be row → record → account list → link.
              `profileUrlOn` is what decides — the stored URL first, then the one the handle
              addresses on the five platforms that can be addressed that way. Xiaohongshu is not
              one of them and never derives. */}
          <PlatformBadges
            platforms={platforms}
            hrefFor={(platform) => profileUrlOn(influencer.accounts, platform)}
          />
          <AccountsPanel
            influencer={influencer}
            commit={commit}
            label={accountsLabel}
            triggerClassName="min-w-6 flex-1"
          />
        </span>
      </TableCell>

      {/* **One cell per platform column, before the total.** An em dash where the creator is not
          on that platform, never a `0`: zero followers is a measurement and "not on TikTok" is
          not, and the column is read down its length by somebody deciding where to brief. The
          same distinction `reachOn` encodes by answering `null`, and the same em dash the
          Engagement column already uses for unmeasured. */}
      {reachColumns.map((platform) => {
        const on = reachOn(influencer.accounts, platform);
        return (
          <TableCell
            key={platform}
            className="text-right font-mono text-helper tabular-nums text-ink-secondary"
          >
            {on === null ? <span className="text-ink-tertiary">—</span> : formatCompactNumber(on)}
          </TableCell>
        );
      })}

      {/* Right-aligned and tabular, because this column is compared down its length rather than
          read across the row — `84.2k` under `1.24M` only lines up on the decimal if the digits
          are the same width. */}
      <TableCell className="text-right font-mono text-helper tabular-nums text-ink">
        {/* **The whole cell is the trigger here**, unlike Platforms: once the account count stops
            being its own popover trigger there is nothing else interactive in it, so one button
            over both lines is one control rather than two peers to the same panel.

            It also retires the reason the pencil sat *before* the figure. A revealed pencil still
            occupied its width, so on the right it would have pushed the digits off the column's
            edge on hover — the one column on this table that is read down its length. Nothing is
            revealed now, so nothing is reserved, so the figure keeps the right edge to itself. */}
        <AccountsPanel
          influencer={influencer}
          commit={commit}
          label={accountsLabel}
          // The trigger sits in a right-aligned column near the card's edge, so the panel cannot
          // grow rightwards — `ReachBreakdown`'s rule, kept.
          align="end"
          triggerClassName="h-auto w-full flex-col items-end gap-0"
        >
          <span className="block">{formatCompactNumber(reach)}</span>
          {/* **The one line on this screen that says the figure is a sum.** Without it a creator on
              140k reads as one account of 140k, which is the misreading the child table exists to
              remove. Still hidden below two accounts, which is the rule it has always had: there
              is nothing to split, and `1 account` under eighty-odd rows is noise. What changed is
              that its absence no longer means the cell is inert — the trigger is the cell, so a
              one-account creator can correct their follower count from here too. */}
          {influencer.accounts.length > 1 ? (
            // **`text-helper` is stated rather than inherited**, which is not a style choice: the
            // cell's own `text-helper` is dropped by `twMerge` where it meets `text-ink` in the
            // same `text-*` group, so this column actually renders at 14px. The sub-line the
            // read-only breakdown drew said `text-helper` for that reason, and leaving it off
            // here made this cell 2.16px taller than the Creator cell beside it — enough to give
            // the table two row heights depending on whether a creator has one account or two.
            // Found in this release's browser pass, which is the same 2.16px-shaped hole 1.49.0's
            // pass found at 10px.
            <span className="mt-0.5 block font-sans text-helper font-normal text-ink-tertiary">
              {formatAccountCount(influencer.accounts.length)}
            </span>
          ) : null}
        </AccountsPanel>
      </TableCell>

      {grouped ? null : (
        <TableCell className="text-ink-secondary">{tierFor(reach).label}</TableCell>
      )}

      <TableCell className="text-right font-mono text-helper tabular-nums text-ink-secondary">
        {/* The follower-weighted blend across the measured accounts. `Value` renders the em dash
            when **none** of them is measured. Not a zero: 0% engagement is a measurement, and a
            prospect who has never run a campaign has not been measured at all. The per-account
            rates are in the accounts panel, where the blend is shown beside the figures it came
            from. */}
        <Value>{formatEngagement(blendedEngagement(influencer.accounts))}</Value>
      </TableCell>

      <TableCell className="text-ink-secondary">
        <VerticalEditor
          influencer={influencer}
          commit={commit}
          display={
            influencer.vertical && VerticalIcon ? (
              // The glyph is never alone — a vocabulary of ten symbols is not readable at 16px on
              // its own, and WCAG 1.4.1 does not allow the icon to be the only carrier.
              //
              // `min-w-0` plus `truncate` on the label rather than on this span: the fixed-width
              // column (see `table-fixed` above) means the ten-vertical vocabulary's longest
              // entries — "Family & lifestyle", "Beauty & skincare" — can now exceed the column,
              // and a flex child does not shrink below its content's width without `min-w-0`. The
              // icon stays `shrink-0` so it is the label that gives, never the glyph.
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <VerticalIcon aria-hidden className="size-4 shrink-0 text-ink-tertiary" />
                <span className="truncate">{INFLUENCER_VERTICAL_LABELS[influencer.vertical]}</span>
              </span>
            ) : (
              // **The word, not the em dash**, and this is a correction rather than a preference —
              // see `GENERALIST`. `InfluencerSchema` says `null` here is a genuine generalist and
              // not an unclassified row, which is why the union has no `other` member; the em dash
              // is this table's word for "not recorded", so it stated the one thing the schema went
              // out of its way not to mean. The menu's empty option carries the same word, so the
              // display and the editor agree about what `null` means.
              <span className="text-ink-tertiary">{GENERALIST}</span>
            )
          }
        />
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
        {/* The one editor that is a checkbox popover rather than a menu: the set needs an explicit
            `Save`, because the write is a full replacement. Its trigger is a sibling for the
            Platforms cell's reason — `BrandNamesCell` renders a tooltip on a real button whenever
            a creator holds more than one brand. See `BrandsEditor`. */}
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
            on submit. It is one `PATCH` of one key now, from a menu over the cell. */}
        <StatusEditor
          influencer={influencer}
          commit={commit}
          display={
            <Badge variant={INFLUENCER_STATUS_TONES[influencer.status]}>
              {INFLUENCER_STATUS_LABELS[influencer.status]}
            </Badge>
          }
        />
      </TableCell>
    </TableRow>
  );
}
