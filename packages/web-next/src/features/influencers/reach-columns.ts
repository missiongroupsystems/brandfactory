import type { Influencer, InfluencerAccount, InfluencerPlatform } from "@brandfactory/shared";
import { InfluencerPlatformSchema } from "@brandfactory/shared";

// ---------------------------------------------------------------------------
// Reach by platform — the optional wide view of the Reach column
// ---------------------------------------------------------------------------
//
// The Reach column answers *what is this creator worth in total*. It cannot answer
// *who has the biggest Instagram following on this list*, because that is a
// question about the column rather than about a row, and the accounts panel's
// popover — which explains one creator's sum — is the wrong shape for it.
//
// This module is the other shape: one numeric column per platform, plus the
// total, each sortable. Everything here is a function over data; the rendering
// decisions are in `influencers-browser.tsx` and the sort keys are in `sort.ts`.
//
// **It is opt-in and off by default, and that is not timidity.** 1.49.1 spent a
// whole pass getting this table to stop overflowing its own card — `table-fixed`,
// a measured percentage per column, and the platform badge cap cut from three to
// two to buy the width. Adding three or more numeric columns is the direct
// opposite of that work. The resolution is that the default view keeps every one
// of those decisions untouched, and the wide view is a thing a reader asks for
// and is given a scrollbar for. See `REACH_TABLE_MIN_WIDTH`.

/**
 * This creator's followers on one platform, or `null` when they are not on it.
 *
 * **`null` and never `0`, and this is the decision the whole feature turns on.**
 * A creator with no TikTok has no TikTok reach; a creator with a TikTok account
 * showing zero followers has a reading of zero. Collapsing the two would sort a
 * roster's 75 Instagram-only creators into the middle of the TikTok column as
 * though they had all been measured and found empty, and `sortInfluencers`
 * already has the right behaviour for `null` — it sorts last in **both**
 * directions, which is exactly what "not on this platform" deserves.
 *
 * **Summed rather than taken from the first match**, because three Instagram
 * accounts is a real creator and `totalReach` sums them for the same reason.
 */
export function reachOn(
  accounts: readonly InfluencerAccount[],
  platform: InfluencerPlatform,
): number | null {
  let total: number | null = null;
  for (const account of accounts) {
    if (account.platform !== platform) continue;
    total = (total ?? 0) + account.followers;
  }
  return total;
}

/**
 * Which platform columns to render, **in enum order**, for the rows on screen.
 *
 * Derived from the *filtered* set rather than from the enum, so a roster that
 * uses three platforms gets three columns and not six of which three are empty.
 * That is what makes this affordable at all: the plan budgeted for "up to seven
 * numeric columns", and the real Curly's roster uses **three** — 139 Instagram
 * accounts, 71 TikTok, 6 XiaoHongShu, and none at all on YouTube, Facebook or
 * LinkedIn.
 *
 * **Enum order, never frequency order.** Ordering by how many creators use each
 * platform would re-arrange the *columns* every time a filter changed, which is a
 * table whose shape moves under the reader. `platformsOf` makes the same call for
 * the badges one column over.
 */
export function reachColumnsFor(
  influencers: readonly Influencer[],
): InfluencerPlatform[] {
  const present = new Set<InfluencerPlatform>();
  for (const influencer of influencers) {
    for (const account of influencer.accounts) present.add(account.platform);
  }
  return InfluencerPlatformSchema.options.filter((platform) => present.has(platform));
}

/** The sort key for one platform's column. `reach:instagram`. */
export function reachSortKey(platform: InfluencerPlatform): `reach:${InfluencerPlatform}` {
  return `reach:${platform}`;
}

/**
 * The platform a `reach:<platform>` key names, or `null` for anything else.
 *
 * Validated against the enum rather than by splitting on the colon, so a
 * hand-edited `?sort=reach:myspace` falls to no sort instead of to a column that
 * does not exist.
 */
export function parseReachSortKey(key: string | undefined): InfluencerPlatform | null {
  if (!key?.startsWith("reach:")) return null;
  const candidate = key.slice("reach:".length);
  const parsed = InfluencerPlatformSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * How wide the table has to be before the platform columns are readable, keyed by
 * **how many numeric columns there are** — the platforms present, plus the total.
 *
 * **Literal classes in a map, never `min-w-[${n}rem]`.** Tailwind scans source for
 * complete class strings and an interpolated one emits no CSS at all — the class
 * lands in the DOM and does nothing, which is the failure `lib/table-density.ts`
 * records for the row-height ladder and `group-rail.ts` for the band colours.
 * Three files, one trap.
 *
 * The width buys the reader a horizontal scrollbar rather than a squeezed table,
 * which is the trade this view exists on: `components/ui/table.tsx` already wraps
 * every table in an `overflow-x-auto`, and 1.49.1's finding was that the *default*
 * view reaching that scrollbar was a bug because nobody had asked for it. Here
 * somebody has.
 */
const MIN_WIDTHS: Record<number, string> = {
  2: "min-w-[60rem]",
  3: "min-w-[68rem]",
  4: "min-w-[76rem]",
  5: "min-w-[84rem]",
  6: "min-w-[92rem]",
  7: "min-w-[100rem]",
};

/** The widest case, for a count outside the map. Six platforms plus a total is the enum's own cap. */
const WIDEST = "min-w-[100rem]";

export function reachTableMinWidth(platformCount: number): string {
  return MIN_WIDTHS[platformCount + 1] ?? WIDEST;
}
