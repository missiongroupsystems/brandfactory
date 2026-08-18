import {
  EyeIcon,
  HammerIcon,
  type LucideIcon,
  SunIcon,
  TypeIcon,
  UsersIcon,
} from "lucide-react";

/**
 * Brand pillars — **hardcoded sample content, and the band that renders it says so.**
 *
 * The band above the grid held a stated-empty box for two releases. The argument for it was that
 * pillars were not modelled and an honest empty box beats an invented one, and that argument has
 * not changed: **nothing here is stored, nothing here is per-brand, and no route reads it.** What
 * changed is the question being asked. The product now wants the shape settled — what a pillar
 * carries, how many there are, how a row reads on the page — before it decides which table holds
 * one. This file is that shape, filled with words so the design can be looked at.
 *
 * The honesty this owes is the same one `/contracts` and the requests inbox pay: the heading
 * carries a `Sample` note and a line under the grid states that every brand shows these five.
 * A page that renders invented values under a real brand's name, silently, is the one failure
 * this feature has already corrected once — see the `Values & positioning` history in
 * `profile.ts`.
 *
 * ---------------------------------------------------------------------------
 * What a pillar is, as this design defines it
 * ---------------------------------------------------------------------------
 *
 * A pillar is **one thing the brand stands on**: a short title somebody can repeat from memory,
 * and two sentences saying what it commits the brand to. It is strategy, and it is stable for
 * years.
 *
 * It is **not** a content pillar, which is editorial and revisited each quarter, and the two must
 * not merge — the planner reads content pillars and refuses to invent themes the brand has not
 * declared. `ContentPillarsBand` renders those, further down the page, under *What we post
 * about*. Having both on screen under names that say which is which is the clearest available
 * explanation of the difference.
 *
 * It is also **not** `Values & positioning`. That section answers two questions — what the brand
 * stands for, *and how it differs from the alternatives* — and the second half is a
 * competitive-set argument that is not a pillar under any reading. That is why the band stopped
 * borrowing the section in 1.35.1 and why this file invents its own rows rather than reading one.
 *
 * ---------------------------------------------------------------------------
 * The icon is part of the record, not decoration chosen by the component
 * ---------------------------------------------------------------------------
 *
 * A pillar without a glyph is a paragraph with a bold first line, and five of them are a wall.
 * The glyph is what makes the grid scannable, so it belongs beside the words it labels rather
 * than being assigned by position — a component that picked the icon from the index would give a
 * pillar a new one the moment somebody reordered the list.
 *
 * When these become rows, a stored pillar carries an icon *name* out of a fixed set and the
 * component resolves it. A `LucideIcon` value is what a hardcoded list can hold and a database
 * column cannot.
 */
export interface BrandPillar {
  /** Short enough to repeat from memory. Three or four words is the target. */
  title: string;
  /** What the title commits the brand to. One or two sentences. */
  description: string;
  /** The glyph that labels it in the grid. Stored as a name once these are rows — see above. */
  icon: LucideIcon;
}

/**
 * How many pillars a brand may declare.
 *
 * **Five is a product decision, not a layout constraint**, and it is the interesting half of this
 * design. A brand that stands on nine things stands on nothing: the list stops being a set of
 * commitments and becomes a description, and no one on the team can recite it. Three to five is
 * the range the band has claimed since it was a placeholder.
 *
 * The cap is enforced in {@link brandPillars} rather than by the grid, so the rule is one
 * assertion in `pillars.test.ts` and not a count of children in a screen test. This is a **bound
 * on the data**, unlike `MAX_PILLAR_CARDS` in `profile.ts`, which is a display cap on a content
 * pillar strip a brand may legitimately have written twelve of.
 */
export const MAX_BRAND_PILLARS = 5;

/**
 * The sample — five pillars, the same five for every brand.
 *
 * Deliberately **written about no industry**. The band renders these under whichever brand is
 * open, so a set of bakery pillars would read as a bug on the next brand along. These say
 * something concrete about how a company behaves without naming what it sells, which is the only
 * way one hardcoded list can sit under every name in the switcher without lying about any of
 * them in particular.
 */
const SAMPLE: readonly BrandPillar[] = [
  {
    title: "Craft over volume",
    description:
      "One thing done properly beats five that are nearly right. Nothing ships until somebody on the team would put their own name on it.",
    icon: HammerIcon,
  },
  {
    title: "Say it plainly",
    description:
      "No jargon, no superlatives, no borrowed voice. A sentence that needs a second reading goes back for a rewrite.",
    icon: TypeIcon,
  },
  {
    title: "The customer knows the job",
    description:
      "We build from what people tell us they already do, not from what we imagine they want. The research is the brief.",
    icon: UsersIcon,
  },
  {
    title: "Warm, never loud",
    description:
      "Confident without shouting. People stay because we are good company, not because we were the loudest thing in the room.",
    icon: SunIcon,
  },
  {
    title: "Show the work",
    description:
      "Prices, process, and the parts that went wrong. Trust compounds out of small disclosures, and it does not survive one big omission.",
    icon: EyeIcon,
  },
];

/**
 * The pillars the page renders, capped at {@link MAX_BRAND_PILLARS}.
 *
 * A function rather than the array, because this is the seam the stored version replaces: the
 * band already calls something that answers a list, so wiring it to a brand is a change to this
 * file and a parameter, not to the component. The cap applies here so it holds for whatever
 * feeds it next.
 */
export function brandPillars(): BrandPillar[] {
  return SAMPLE.slice(0, MAX_BRAND_PILLARS);
}
