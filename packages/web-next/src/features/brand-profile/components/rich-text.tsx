import { cn } from "@/lib/utils";

import type { ProfileBlock } from "../types";

/**
 * A section's body.
 *
 * The read-only half of what `packages/web` renders through a non-editable TipTap instance. This
 * package has no TipTap and does not need one to *read*: a profile shows a document, it does not
 * edit it, and a renderer is smaller than an editor by an order of magnitude (plan §6). The
 * editor comes across with `EditGuidelinesDialog`, when editing stops leaving the shell.
 *
 * `max-w-[68ch]` rather than the container's width: prose set to a full-width card is the thing
 * that makes a brand book unreadable, and the styleguide caps prose at ~720px for the same
 * reason (§7.1).
 */
export function RichText({ blocks, className }: { blocks: ProfileBlock[]; className?: string }) {
  return (
    <div className={cn("flex max-w-[68ch] flex-col gap-3 text-sm text-ink", className)}>
      {blocks.map((block, index) =>
        block.kind === "paragraph" ? (
          <p key={index} className="leading-relaxed">
            {block.text}
          </p>
        ) : (
          <ul key={index} className="flex flex-col gap-1.5">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="flex gap-2.5 leading-relaxed">
                {/* A drawn marker rather than `list-disc`, so the bullet takes the tertiary ink
                    and the text stays on one indent whatever its length. */}
                <span aria-hidden className="mt-[0.6em] size-1 shrink-0 rounded-full bg-ink-tertiary" />
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
