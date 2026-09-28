import type { SocialPostStatus } from "@brandfactory/shared";

/**
 * The pipeline's five stages, as a badge class and a word.
 *
 * **Not the accent, and that is the rule rather than a preference.** `globals.css` gives the
 * accent a fixed per-view budget — the primary button, one stat card, the selected control state,
 * small brand chrome — and a status pill repeats on every entry in a month. Green down thirty
 * cells blows that budget many times over, which is the same argument `group-rail.ts` makes for
 * using the chart series on band rails and `platform-icons.tsx` makes for drawing six brand marks
 * in one colour.
 *
 * **Not the feedback tints either.** Those mean error, warning, success and information, and
 * `Filming` is not a warning — the key-date sets refused them for the same reason.
 *
 * So: neutral at `Idea`, an outline once somebody cleared it, two chart hues for the stages where
 * work is happening, and a settled fill at `Posted`. The steps differ in lightness as well as hue,
 * so the ramp survives deuteranopia, and colour is the fast path rather than the only one — every
 * surface that uses this renders {@link STATUS_LABELS} beside it.
 *
 * ⚠️ Full class strings, never composed. Tailwind scans source text, so `bg-chart-${n}/10`
 * compiles to no colour at all.
 */
export const STATUS_PILL: Record<SocialPostStatus, string> = {
  idea: "bg-muted text-muted-foreground",
  approved: "border border-[var(--border-strong)] text-foreground",
  filming: "bg-chart-2/10 text-chart-2",
  editing: "bg-chart-5/10 text-chart-5",
  posted: "bg-chart-1/10 text-chart-1",
};

/** The same five, as words. A pill always renders one — see above. */
export const STATUS_LABELS: Record<SocialPostStatus, string> = {
  idea: "Idea",
  approved: "Approved",
  filming: "Filming",
  editing: "Editing",
  posted: "Posted",
};
