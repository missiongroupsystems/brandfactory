/**
 * The colour rail down the left of a grouped table.
 *
 * Lifted out of `contracts-view.tsx` when the review queue became the second grouped
 * table — the promotion rule in AGENTS.md, and there is nothing feature-specific left in
 * it once the key is a string.
 *
 * **The categorical series, not the accent.** The accent has a fixed per-view budget
 * (styleguide §4: the primary button, one accent-filled block, the selected control
 * state) and a green rail repeated down thirty group headers spends it many times over.
 * `--color-chart-*` exists to say "different categories of the same kind of thing", which
 * is what a group rail says.
 *
 * ⚠️ **Tailwind scans for literal strings.** `border-l-chart-${n}` compiles to a rail with
 * no colour at all, which is why every class below is written out.
 *
 * The 40% wash on the rows is not a free parameter: 25% was invisible for the ochre and
 * gold entries against white, at which point the rail does nothing. Found by rendering it.
 */

export const GROUP_RAILS = [
  { band: "border-l-chart-1", rows: "border-l-chart-1/40" },
  { band: "border-l-chart-2", rows: "border-l-chart-2/40" },
  { band: "border-l-chart-3", rows: "border-l-chart-3/40" },
  { band: "border-l-chart-4", rows: "border-l-chart-4/40" },
  { band: "border-l-chart-5", rows: "border-l-chart-5/40" },
  { band: "border-l-chart-6", rows: "border-l-chart-6/40" },
  { band: "border-l-chart-7", rows: "border-l-chart-7/40" },
  { band: "border-l-chart-8", rows: "border-l-chart-8/40" },
] as const;

export type GroupRail = (typeof GROUP_RAILS)[number] | typeof NEUTRAL_RAIL;

/** For a bucket that is an *absence* rather than a category — "no outlet coverage". */
export const NEUTRAL_RAIL = {
  band: "border-l-border-strong",
  rows: "border-l-border-subtle",
} as const;

/**
 * A stable colour per key.
 *
 * Hashed from the key rather than taken from the group's position, so a colour belongs to
 * a thing for as long as you are looking at the screen: filtering the list down to four
 * groups must not repaint the three that survived. Collisions between distant groups are
 * fine — the rail separates neighbours, it does not identify anything.
 */
export function railFor(key: string): GroupRail {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return GROUP_RAILS[hash % GROUP_RAILS.length];
}
