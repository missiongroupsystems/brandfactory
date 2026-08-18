import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";

/**
 * A page that is deliberately empty, and says so.
 *
 * **Distinct from `NotBuiltYet`, which is a different promise.** That component describes an area
 * that is *modelled* — it lists what exists in the schema, what is missing, and where the decision
 * is written down, and it carries a phase number. This one describes an area where nothing has
 * been decided yet: the door is in the nav so the shape of the product is visible, and what goes
 * behind it is still an open question. Listing "already in place: nothing" would be filler
 * dressed as detail.
 *
 * **No stat cards, no sample rows, no spinner.** A spinner suggests something is loading and fake
 * rows are worse still — the two ways an empty screen ends up as a bug report against a feature
 * that was never started. What it does have is a plain statement and the reason it is here.
 *
 * The `Placeholder` marker is `variant="outline"`, not the neutral beige pill: that pill *is*
 * `--surface-sunken`, which is also the page canvas, so on this background it would be invisible.
 * Beige pills belong on white — in cards and table cells.
 */
export function PlaceholderPage({
  title,
  description,
  note,
}: {
  title: string;
  description: string;
  /** One sentence on what this page is expected to become. Optional; omit rather than pad. */
  note?: string;
}) {
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={<Badge variant="outline">Placeholder</Badge>}
      />

      <div className="px-6 pb-8 md:px-8">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <p className="text-sm font-medium text-ink">Nothing here yet</p>
          {note ? <p className="max-w-[56ch] text-helper text-ink-secondary">{note}</p> : null}
        </div>
      </div>
    </>
  );
}
