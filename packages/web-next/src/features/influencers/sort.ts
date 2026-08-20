import type { Influencer, InfluencerPlatform } from "@brandfactory/shared";
import { InfluencerPlatformSchema } from "@brandfactory/shared";
import {
  blendedEngagement,
  byInfluencerReach,
  platformsOf,
  totalReach,
} from "@brandfactory/shared";

import { INFLUENCER_STATUS_LABELS, INFLUENCER_VERTICAL_LABELS } from "@/lib/labels";

import { GENERALIST } from "./format";
import { parseReachSortKey, reachOn, reachSortKey } from "./reach-columns";
import { tierFor } from "./tiers";

/**
 * What a click on a column heading does to the roster.
 *
 * ── Why this screen may sort at all ───────────────────────────────────────
 *
 * `AGENTS.md` bans column sorting, and the ban is right for every other list in this package:
 * they are cursor-paginated, so a client-side sort reorders *the rows that happen to be loaded*
 * and puts Zephyr at the top of page one while Alma sits unfetched on page three. That is a
 * table that lies about what it is showing.
 *
 * `/influencers` is the one list with no page two. `GET /workspaces/:id/influencers` answers the
 * whole roster — the same property that lets the tier bands carry true counts and the footer say
 * `146 creators` rather than "146 loaded" — so an order computed here is the order over
 * everything there is. The rule is amended rather than deleted, and it names the property rather
 * than this screen: the day `listInfluencersByWorkspace` takes the keyset cursor its docstring
 * plans for (~150 rows, and the roster is at 146), this file moves into SQL with it.
 *
 * ── Every column sorts by what it shows ───────────────────────────────────
 *
 * The reader is looking at the cell, not at the record behind it, so the sort key is the thing
 * rendered in the column:
 *
 * - **Text** columns compare with `localeCompare`, which is A→Z including the accented names
 *   this roster is full of — `Á` files with `A` rather than after `Z`, where a code-point
 *   comparison would put it.
 * - **Number** columns compare numerically. Reach is the sum across a creator's accounts, which
 *   is the figure the Reach cell prints.
 * - **Set-valued** columns — Platforms and Brands — compare by **how many**. A cell reading
 *   `Instagram, TikTok` has no alphabet of its own, and the count is the only order over it a
 *   reader can predict. It is stated on the control's tooltip rather than left to be discovered.
 *
 * `vertical` sorts by the label the cell prints, so a generalist files under `Generalist` where
 * the record holds `null` — the word the column shows, not the absence behind it. `status` sorts
 * the same way and therefore alphabetically: `Active`, `Past`, `Prospect`. That is deliberately
 * not the enum's own order (active, prospect, past), because a reader clicking a heading marked
 * A→Z has been promised A→Z, and a hidden workflow order would put `Past` where they expect it
 * and `Prospect` where they do not.
 *
 * ── Two rules that keep the order total ───────────────────────────────────
 *
 * **Unmeasured engagement is always last**, in both directions. `blendedEngagement` answers
 * `null` for a creator no account of whom has ever been measured, and the whole roster is
 * currently in that state — the Curly's media list measures nobody. `null` is not a small
 * number: sorting it to the top of an ascending list would say those creators have the *worst*
 * engagement, which is a claim nobody has made.
 *
 * **Ties fall back to `byInfluencerReach`** — reach descending, then name, then id. It is the
 * order the server sends and the order the screen opens in, so a column with few distinct values
 * (Status has three) still produces a stable table rather than whatever order the sort happened
 * to leave equal rows in. It is total, so the result never depends on `Array.sort` stability.
 */

/** The eight columns the table always has. */
export type BaseSortKey =
  | "name"
  | "platforms"
  | "reach"
  | "tier"
  | "engagement"
  | "vertical"
  | "brands"
  | "status";

/**
 * One platform's reach column — `reach:instagram`.
 *
 * **These keys are only meaningful while the columns exist**, which is what makes
 * them different from the eight above: the reach-by-platform view is off by
 * default, so a key naming a column nobody can see has to be handled rather than
 * assumed away. `influencers-browser.tsx` clears the sort when the view is turned
 * off, and `parseSort` still accepts one from a pasted URL — the sort is applied
 * and the reader simply cannot see the heading it belongs to until they turn the
 * view on. Refusing it instead would make a shared link silently drop the order
 * it was shared to show.
 */
export type ReachPlatformSortKey = `reach:${InfluencerPlatform}`;

export type SortKey = BaseSortKey | ReachPlatformSortKey;

export type SortDirection = "asc" | "desc";

export type InfluencerSort = { key: SortKey; direction: SortDirection };

/** The eight always-present columns, in the order the table renders them. Exported for the test,
 *  which walks the list rather than naming eight keys a ninth column could be added beside.
 *  The per-platform reach keys are **not** here — they exist only in the wide view, and a test
 *  walking this list should be walking the columns every reader has. */
export const SORT_KEYS = [
  "name",
  "platforms",
  "reach",
  "tier",
  "engagement",
  "vertical",
  "brands",
  "status",
] as const satisfies readonly BaseSortKey[];

/**
 * What each column compares by, and how.
 *
 * `text` and `number` are the two comparisons, not the two data types — `platforms` holds a set
 * and sorts as the number of them, `tier` holds a band and sorts as its floor. Keeping the kind
 * beside the extractor is what lets one comparator serve all eight.
 */
type SortRule = {
  kind: "text" | "number";
  /** `null` means "not recorded", and sorts last whichever way the column is pointing. */
  value: (influencer: Influencer) => string | number | null;
};

const BASE_RULES: Record<BaseSortKey, SortRule> = {
  name: { kind: "text", value: (i) => i.name },
  platforms: { kind: "number", value: (i) => platformsOf(i.accounts).length },
  reach: { kind: "number", value: (i) => totalReach(i.accounts) },
  // The tier's floor rather than its label: `Mega` before `Micro` alphabetically is the one
  // ordering of these five words that means nothing. The floor is the ladder's own order, so
  // ascending runs Nano → Mega, and rows inside a band fall to the reach tiebreak below.
  tier: { kind: "number", value: (i) => tierFor(totalReach(i.accounts)).min },
  engagement: { kind: "number", value: (i) => blendedEngagement(i.accounts) },
  vertical: {
    kind: "text",
    value: (i) => (i.vertical ? INFLUENCER_VERTICAL_LABELS[i.vertical] : GENERALIST),
  },
  brands: { kind: "number", value: (i) => i.brandIds.length },
  status: { kind: "text", value: (i) => INFLUENCER_STATUS_LABELS[i.status] },
};

/**
 * One rule per platform, built from the enum rather than written out.
 *
 * `reachOn` answers `null` for a creator who is not on the platform, and the
 * comparator below already sorts `null` last in **both** directions — so the 75
 * Instagram-only creators on this roster fall to the bottom of the TikTok column
 * rather than into the middle of it on a zero nobody measured. That behaviour is
 * inherited rather than special-cased, which is the whole reason `reachOn` returns
 * `null` instead of `0`.
 */
const REACH_RULES = Object.fromEntries(
  InfluencerPlatformSchema.options.map((platform) => [
    reachSortKey(platform),
    { kind: "number", value: (i: Influencer) => reachOn(i.accounts, platform) } satisfies SortRule,
  ]),
) as Record<ReachPlatformSortKey, SortRule>;

const RULES: Record<SortKey, SortRule> = { ...BASE_RULES, ...REACH_RULES };

/** Both halves of the URL, validated together: a `sort` this release does not know and a `dir`
 *  that is neither word both fall to "no sort", which is the order the screen opens in. */
export function parseSort(
  key: string | undefined,
  direction: string | undefined,
): InfluencerSort | null {
  if (!key) return null;
  // A per-platform reach key is as valid as one of the eight — see `ReachPlatformSortKey` for
  // why a key whose column is currently hidden is still honoured rather than dropped.
  const known =
    (SORT_KEYS as readonly string[]).includes(key) || parseReachSortKey(key) !== null;
  if (!known) return null;
  // A known column with a missing or unrecognised direction is ascending — the state the first
  // click produces — rather than nothing, so a hand-edited `?sort=name` still sorts.
  return { key: key as SortKey, direction: direction === "desc" ? "desc" : "asc" };
}

/**
 * The next state of the control: ascending, then descending, then off.
 *
 * **Three states and not two**, because "off" is a real answer here: it is the server's reach
 * order, which is what the screen opens in and what the tier bands are built on. A two-state
 * toggle would leave no way back to it except editing the URL.
 *
 * A click on a *different* column always starts ascending, whatever the previous column was
 * pointing at — carrying a direction across columns makes the first click on a new heading
 * unpredictable.
 */
export function nextSort(current: InfluencerSort | null, key: SortKey): InfluencerSort | null {
  if (current?.key !== key) return { key, direction: "asc" };
  return current.direction === "asc" ? { key, direction: "desc" } : null;
}

/**
 * The roster in the reader's order.
 *
 * Copies before sorting: the array comes from a `useMemo` over SWR's cached data, and sorting it
 * in place would reorder the cache every other consumer reads.
 */
export function sortInfluencers(
  influencers: readonly Influencer[],
  sort: InfluencerSort | null,
): Influencer[] {
  if (!sort) return [...influencers];

  const rule = RULES[sort.key];
  const flip = sort.direction === "desc" ? -1 : 1;

  return [...influencers].sort((a, b) => {
    const left = rule.value(a);
    const right = rule.value(b);

    // Unmeasured sorts last in both directions, so the `flip` is deliberately not applied.
    if (left === null || right === null) {
      if (left === right) return byInfluencerReach(a, b);
      return left === null ? 1 : -1;
    }

    const compared =
      rule.kind === "text"
        ? String(left).localeCompare(String(right))
        : Number(left) - Number(right);

    return compared !== 0 ? compared * flip : byInfluencerReach(a, b);
  });
}
