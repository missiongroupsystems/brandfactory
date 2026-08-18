import { CompassIcon, MessageSquareTextIcon } from "lucide-react";

import { type BrandPillar, brandPillars } from "../pillars";
import { splitPillars } from "../profile";
import type { ProfileSection } from "../types";
import { EditButton } from "./edit-button";
import { SectionHeading } from "./section-heading";

/**
 * Brand pillars — **a hardcoded design, and it reads no section.**
 *
 * `docs/plans/brand-profiles.md` §2 equated pillars with the brand's values, so this band used to
 * render `Values & positioning` under a second name, subtitled *from Values & positioning*. On
 * real data the equation broke: that section answers two questions — what the brand stands for,
 * *and how it differs from the alternatives* — and the second half is a competitive-set argument
 * that is not a pillar under any reading. `Values & positioning` went back to being an ordinary
 * section in the grid under its own label, and this band became a stated-empty box.
 *
 * It now draws the shape instead. **The words come from `pillars.ts` and are the same for every
 * brand** — nothing is stored, nothing is per-brand, and no route is involved. The design being
 * settled first is the point: the product wants to see what a pillar carries and how five of them
 * read before it decides which table holds one.
 *
 * **Two honesty markers, and both are load-bearing.** The heading says `Sample`, and a line under
 * the grid says every brand shows these five and points at the section that does hold this
 * brand's own words. Invented values rendered silently under a real brand's name is exactly the
 * failure 1.35.1 corrected, and this band is where it would recur.
 *
 * **Still no edit action, on purpose.** A button here would have to write something, and there is
 * nowhere to write it. An edit that discards itself on reload is worse than no edit: the reader
 * believes the brand now holds five pillars. The control arrives with the column.
 *
 * The grid is three-up at `lg` and two-up at `sm`, so the five land as 3 + 2 rather than as one
 * cramped row of five — a pillar is a title *and* two sentences, and at a fifth of the measure
 * the sentences stop being readable. **No ordinals**: pillars are a set, not a ranking, and a
 * numbered list is a claim about priority that nothing in the record supports.
 */
export function PillarsBand({ anchor }: { anchor: string }) {
  const pillars = brandPillars();

  return (
    <section aria-labelledby={anchor} className="flex flex-col gap-3">
      <SectionHeading
        id={anchor}
        icon={CompassIcon}
        title="Brand pillars"
        note="Sample — not stored yet"
      />

      {/* A list, because it is one: five sibling items with no order between them. The role is
          what a screen-reader user hears as "5 items", which is the fact the cap is about. */}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pillars.map((pillar) => (
          <li key={pillar.title} className="flex">
            <PillarCard pillar={pillar} />
          </li>
        ))}
      </ul>

      <p className="max-w-[72ch] text-helper text-ink-tertiary">
        A design placeholder. Pillars are not modelled yet, so these five are hardcoded and every
        brand shows the same ones. What this brand stands for today reads under{" "}
        <span className="text-ink">Values &amp; positioning</span> below.
      </p>
    </section>
  );
}

/**
 * One pillar — glyph, title, and the commitment underneath.
 *
 * `h-full` and the parent's `flex` so the cards in a row share a height: the descriptions run to
 * different lengths, and five cards with five different bottom edges read as five different kinds
 * of thing.
 *
 * The glyph sits in a sunken tile rather than on the accent. Five filled accent surfaces in one
 * band would spend the CI's whole accent budget on decoration, and the green means "the thing to
 * press" everywhere else in this app.
 */
function PillarCard({ pillar }: { pillar: BrandPillar }) {
  const { icon: Icon } = pillar;

  return (
    <article className="flex h-full flex-col gap-2.5 rounded-xl border border-border bg-card p-4 shadow-e1">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-ink-secondary"
        >
          <Icon className="size-4" />
        </span>
        <h3 className="text-h3 text-ink">{pillar.title}</h3>
      </div>
      <p className="text-sm text-ink-secondary">{pillar.description}</p>
    </article>
  );
}

/**
 * Content pillars — the band next door, deliberately quieter, and about a different question.
 *
 * **Chips, where the band above draws cards**, and the difference in weight is the argument.
 * Values are strategy and stable for years; content pillars are editorial and revisited each
 * quarter. The product's planner reads this section and refuses to invent themes the brand has
 * not declared, so the two must not be conflated — and the clearest possible explanation of the
 * difference is having both on screen under names that say which is which (plan §2.2).
 *
 * Renders nothing at all when the section is absent or empty. A brand with no content pillars is
 * not missing anything on *this* page; the planner is where that gap costs something, and the
 * planner is where it should be reported.
 */
export function ContentPillarsBand({
  section,
  anchor,
  onEdit,
}: {
  section: ProfileSection | undefined;
  anchor: string;
  onEdit: () => void;
}) {
  const { pillars } = splitPillars(section);
  if (pillars.length === 0) return null;

  return (
    <section aria-labelledby={anchor} className="flex flex-col gap-3">
      <SectionHeading
        id={anchor}
        icon={MessageSquareTextIcon}
        title="What we post about"
        note="Content pillars — the recurring subjects, not one campaign"
        action={<EditButton onClick={onEdit} what="Content pillars" />}
      />
      <ul className="flex flex-wrap gap-2">
        {pillars.map((pillar) => (
          <li
            key={pillar}
            className="rounded-lg border border-border-subtle bg-surface-sunken px-3 py-1.5 text-helper text-ink-secondary"
          >
            {pillar}
          </li>
        ))}
      </ul>
    </section>
  );
}
