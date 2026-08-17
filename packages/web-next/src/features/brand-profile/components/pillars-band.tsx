import { CompassIcon, MessageSquareTextIcon } from "lucide-react";

import { splitPillars } from "../profile";
import type { ProfileSection } from "../types";
import { EditButton } from "./edit-button";
import { SectionHeading } from "./section-heading";

/**
 * Brand pillars — **a placeholder, and it reads no section.**
 *
 * `docs/plans/brand-profiles.md` §2 equated pillars with the brand's values, so this band used to
 * render `Values & positioning` under a second name, subtitled *from Values & positioning*. On
 * real data the equation broke: that section answers two questions — what the brand stands for,
 * *and how it differs from the alternatives* — and the second half is a competitive-set argument
 * that is not a pillar under any reading. The page was putting a paragraph about hotel dining
 * rooms and seafood joints under a heading that promised the brand's foundations.
 *
 * `Values & positioning` therefore went back to being an ordinary section, rendered as one card in
 * the grid under its own label. This band keeps its place in the page and its anchor in the
 * contents rail, and says plainly that pillars are not defined yet.
 *
 * **No edit action, on purpose.** A button here would have to write a section, and the only label
 * it could write is one no taxonomy knows and no other surface reads — a row a research run will
 * never fill and the rail will never suggest. The band goes live when the product decides what a
 * pillar is and where it is stored; until then, an honest empty box is the smaller lie. The strip
 * this file used to draw is in the history of this file, and `splitPillars` — which fed it — is
 * still here, serving `ContentPillarsBand`.
 */
export function PillarsBand({ anchor }: { anchor: string }) {
  return (
    <section aria-labelledby={anchor} className="flex flex-col gap-3">
      <SectionHeading id={anchor} icon={CompassIcon} title="Brand pillars" note="Not defined yet" />
      <div className="rounded-xl border border-dashed border-border-input px-5 py-4">
        <p className="max-w-[62ch] text-sm text-ink-secondary">
          The three to five things this brand stands on — the sentences every other section ends up
          agreeing with. They are not modelled yet, so nothing is written here. What the brand
          stands for today reads under{" "}
          <span className="text-ink">Values &amp; positioning</span> below.
        </p>
      </div>
    </section>
  );
}

/**
 * Content pillars — the same shape, quieter, and about a different question.
 *
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
