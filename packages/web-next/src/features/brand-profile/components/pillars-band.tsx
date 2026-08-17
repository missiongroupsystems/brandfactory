import { CompassIcon, MessageSquareTextIcon } from "lucide-react";

import { splitPillars } from "../profile";
import type { ProfileSection } from "../types";
import { EditButton } from "./edit-button";
import { RichText } from "./rich-text";
import { SectionHeading } from "./section-heading";

/**
 * Brand pillars — the cards, and the positioning prose under them.
 *
 * **Pillars are the brand's values.** Settled in `docs/plans/brand-profiles.md` §2, and the whole
 * reason this band reads `Values & positioning` instead of a ninth section holding the same idea
 * under a second name.
 *
 * `splitPillars` is why the prose is separate: the section deliberately holds a list *and* a
 * paragraph, and a band that turned both into cards would promote "how we differ from the
 * alternatives" into a fourth pillar. Cards for the list, prose beneath for the rest.
 *
 * A brand that wrote its values as one paragraph gets no cards and its prose — correct, and the
 * nudge to press Return three times.
 */
export function PillarsBand({
  section,
  anchor,
  onEdit,
}: {
  section: ProfileSection | undefined;
  anchor: string;
  onEdit: () => void;
}) {
  const { pillars, prose } = splitPillars(section);
  if (pillars.length === 0 && prose.length === 0)
    return <EmptyPillars anchor={anchor} onEdit={onEdit} />;

  return (
    <section aria-labelledby={anchor} className="flex flex-col gap-4">
      <SectionHeading
        id={anchor}
        icon={CompassIcon}
        title="Brand pillars"
        // Says where the words live, because the editor still calls the row by its stored label.
        // Plan §2.3 option (a): the page can read as the product speaks without orphaning every
        // brand that already wrote a section under the old name.
        note="from Values & positioning"
        action={<EditButton onClick={onEdit} what="Values & positioning" />}
      />

      {pillars.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map((pillar) => {
            // The first clause is the pillar; whatever the brand wrote after the dash or the
            // em dash is its supporting line. Split on the separator rather than on the first
            // sentence: a value written as one plain phrase must stay one phrase.
            const [name, ...rest] = pillar.split(/\s+[—–-]\s+/);
            const support = rest.join(" — ");
            return (
              <li
                key={pillar}
                className="flex flex-col gap-1.5 rounded-xl border border-border bg-card px-4 py-3.5 shadow-e1"
              >
                <span className="text-sm font-medium text-ink">{name}</span>
                {support ? (
                  <span className="text-helper leading-relaxed text-ink-secondary">{support}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {prose.length > 0 ? <RichText blocks={prose} /> : null}
    </section>
  );
}

function EmptyPillars({ anchor, onEdit }: { anchor: string; onEdit: () => void }) {
  return (
    <section aria-labelledby={anchor} className="flex flex-col gap-3">
      <SectionHeading id={anchor} icon={CompassIcon} title="Brand pillars" />
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border-input px-5 py-4">
        <p className="max-w-[62ch] text-sm text-ink-secondary">
          Name what this brand stands on — three to five, one per line. They are the sentences
          every other section ends up agreeing with.
        </p>
        {/* "One per line" is not decoration in that sentence: `splitPillars` turns list items
            into cards and leaves paragraphs as prose, so how they are typed decides how they
            render. The editor's bullet list is what produces the strip. */}
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg border border-border-input px-2.5 py-1 text-helper text-ink-secondary hover:border-border-strong hover:text-ink"
        >
          Name the pillars
        </button>
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
