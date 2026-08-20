import type { InfluencerPlatform } from "@brandfactory/shared";

/**
 * How many platform badges a table cell shows before it collapses the rest into `+N`.
 *
 * ── Why the cell needs a rule at all ──────────────────────────────────────
 *
 * A creator holds up to ten accounts (`MAX_INFLUENCER_ACCOUNTS`) across six platforms, so the
 * Platforms cell is a set of between one and six things. Six badges is wider than the column and
 * wider than the two cells either side of it, and a cell that changes the table's column widths
 * depending on which row happens to be the busiest is a table that re-flows as the filters move.
 *
 * **Two, not the three the comma-joined string used to show.** Three real badges (the widest
 * pairing is `Instagram` + `Xiaohongshu`, at up to ~300px including the pencil) forced the column
 * wider than every other column on the table bar none, which is what pushed the whole row past the
 * card and into a horizontal scrollbar — see `docs/completions/`'s column-width pass. The `+N`
 * badge already carries the rest by name in its tooltip, so dropping the cap by one loses nothing a
 * reader cannot still get to; it only moves the third platform one click away.
 *
 * ── Why it is a function and not a `.slice(0, 2)` in the cell ─────────────
 *
 * It is the only part of the platform column a test can see. Everything else about the column —
 * the six marks, the monochrome decision, the badge — is a rendering that has to be looked at.
 * The boundary is arithmetic, and arithmetic that lives inline in a JSX attribute is arithmetic
 * nobody ever asserts.
 */

/** The cap the roster table uses. A caller with more room passes its own. */
export const MAX_PLATFORM_BADGES = 2;

export type VisiblePlatforms = {
  /** The platforms that get a badge of their own, in the order they arrived. */
  shown: InfluencerPlatform[];
  /**
   * The rest, **named rather than counted**. The `+N` badge carries a tooltip listing them, so
   * the cell hides no platform from a reader who asks — returning a number would force the caller
   * to slice the array a second time to build that list.
   */
  overflow: InfluencerPlatform[];
};

/**
 * Split a creator's platforms into the ones the cell draws and the ones the `+N` badge names.
 *
 * **The input order is preserved and is not re-sorted here.** Every caller gets its list from
 * `platformsOf` in `@brandfactory/shared`, which filters `InfluencerPlatformSchema.options` and so
 * answers in **enum order** — deliberately, so that reordering a creator's accounts does not
 * reshuffle their row for a change that says nothing about where they post. Sorting again in this
 * file would be a second opinion about that order, and the two could disagree.
 *
 * **No cleverness at the boundary.** Three platforms render as two badges and a `+1`, even though
 * a `+1` badge is about as wide as the badge it replaced. A rule that sometimes shows the third
 * would make the cell's width depend on which platform the third one is, and "Xiaohongshu" is
 * twice the width of "TikTok".
 *
 * A `max` of zero or below sends everything to the overflow rather than making `slice` count from
 * the end — `slice(0, -1)` drops the *last* platform, which is the one failure this guard exists
 * for.
 */
export function visiblePlatforms(
  platforms: readonly InfluencerPlatform[],
  max: number = MAX_PLATFORM_BADGES,
): VisiblePlatforms {
  const limit = Math.max(0, max);
  return { shown: platforms.slice(0, limit), overflow: platforms.slice(limit) };
}
