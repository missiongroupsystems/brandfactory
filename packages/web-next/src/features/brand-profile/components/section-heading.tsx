import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A band's heading — glyph, title, an optional note beside it, an optional action on the right.
 *
 * **A real `<h2>` with a real `id`**, and both halves matter. The `id` is the anchor the contents
 * rail scrolls to and the thing that makes "here is our voice section" a link somebody pastes
 * into Slack (plan §3); the heading level is what lets a screen-reader user walk the page by its
 * structure instead of by its scrollbar. `CardTitle` in this kit renders a `div`, which is why
 * the bands do not use it.
 *
 * `scroll-mt-6` so an anchored heading does not land flush against the top of the viewport with
 * its first line clipped.
 */
export function SectionHeading({
  id,
  icon: Icon,
  title,
  note,
  action,
  className,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  /** A quiet qualifier — where the words come from, what the band is for. */
  note?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
      <h2 id={id} className="flex scroll-mt-6 items-center gap-2 text-h3 text-ink">
        <Icon aria-hidden className="size-4 shrink-0 text-ink-tertiary" />
        {title}
      </h2>
      {note ? <span className="text-helper text-ink-tertiary">{note}</span> : null}
      {action ? <div className="ml-auto">{action}</div> : null}
    </div>
  );
}
