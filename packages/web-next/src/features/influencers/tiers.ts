import { GROUP_RAILS, type GroupRail } from "@/components/layout/group-rail";

/**
 * The reach ladder the Influencers table groups by.
 *
 * **Derived, never stored**, and that is what makes this file worth having on its own. The old
 * screen grouped by `contact.vendor_id` — a foreign key into a table it had to resolve through
 * `useVendorIndex`, which produced the three states that dominated that component: a named
 * group, a real null bucket, and *a group whose name has not arrived yet*, which had to be
 * kept apart from the null one so a slow request never read as "this creator has no agency".
 *
 * A tier is computed from a number the row already carries, so **none of that exists here.**
 * There is no index to resolve, no request to be in flight, and no null bucket — `followers`
 * is not nullable (see {@link import("@/lib/api/types").Influencer}), so the grouping is
 * *total*: every loaded row lands in exactly one tier and the bands always sum to the rows.
 * That is the property that lets the group headers carry counts honestly.
 *
 * **The boundaries are conventional, not invented.** Nano / micro / mid / macro / mega at
 * 10k / 100k / 500k / 1M are the ranges the influencer-marketing trade uses, which matters
 * because the reader has met them before and because a rate card is quoted against them. They
 * are still arbitrary in the sense that every threshold is: a creator on 99,800 followers is
 * not meaningfully different from one on 100,200, and the table says so by showing the real
 * figure in the column beside the band.
 *
 * Ordered **largest first**. Reach descending is the order a budget conversation happens in —
 * the few expensive names at the top, the long tail below — and it is the opposite of the
 * alphabetical order every other grouped table in this app uses, which is why it is stated
 * here rather than left to the caller.
 */
export type ReachTier = {
  id: "mega" | "macro" | "mid" | "micro" | "nano";
  label: string;
  /** Inclusive. The tier holds every count from here up to the next tier's `min`. */
  min: number;
  /** The range in words, for the band beside the label. */
  range: string;
};

export const REACH_TIERS: readonly ReachTier[] = [
  { id: "mega", label: "Mega", min: 1_000_000, range: "1M+" },
  { id: "macro", label: "Macro", min: 500_000, range: "500k – 1M" },
  { id: "mid", label: "Mid-tier", min: 100_000, range: "100k – 500k" },
  { id: "micro", label: "Micro", min: 10_000, range: "10k – 100k" },
  // `min: 0` and not `min: 1_000`. The trade calls 1k–10k "nano" and says nothing about
  // below 1k, but a creator with 400 followers is a row this table has to be able to hold —
  // and a tier list with a gap at the bottom would drop them out of the grouping entirely,
  // which is the one thing a total grouping may not do.
  { id: "nano", label: "Nano", min: 0, range: "Under 10k" },
];

/**
 * Which tier a follower count falls in.
 *
 * A linear scan down five entries, ordered descending, so the first `min` the count clears
 * wins. The final entry's `min` is 0, so this **always** returns a tier for any non-negative
 * count — the non-null return type is a promise the list above keeps, not an assumption.
 *
 * A negative count is not reachable from the fixture and would be a data fault rather than a
 * real reading, so it falls to `nano` rather than being given a bucket of its own.
 */
export function tierFor(followers: number): ReachTier {
  return REACH_TIERS.find((tier) => followers >= tier.min) ?? REACH_TIERS[REACH_TIERS.length - 1];
}

/**
 * The rail colour for a tier — **by position, not hashed.**
 *
 * `railFor()` in `group-rail.ts` hashes its key, which is right for an *open* set of groups:
 * brands and vendors arrive and leave, and hashing keeps a colour attached to a thing as the
 * list around it changes. The tiers are the opposite — a closed, ordered set of five, fixed at
 * compile time — so position gives every band the same colour on every screen and every
 * reload, and the ramp reads in the ladder's own order instead of in an arbitrary one.
 *
 * `GROUP_RAILS` holds eight entries and this uses the first five, so no tier shares a rail.
 */
export function railForTier(tier: ReachTier): GroupRail {
  return GROUP_RAILS[REACH_TIERS.findIndex((candidate) => candidate.id === tier.id)];
}
