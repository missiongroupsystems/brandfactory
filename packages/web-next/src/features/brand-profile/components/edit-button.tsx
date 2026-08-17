"use client";

import { PencilIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The quiet edit affordance a band or a card carries.
 *
 * **Same weight as `CopyButton` on purpose.** These two sit side by side in every band heading,
 * and giving edit a filled button would make a reading surface look like a form. The page is a
 * brand book that happens to be editable, not an editor that happens to render.
 *
 * The label names the section rather than saying "Edit" alone, because a page holding eight of
 * these presents a screen-reader user with eight identical controls otherwise. It is visually
 * hidden past the glyph, so the row stays one control tall.
 */
export function EditButton({
  onClick,
  what,
  className,
}: {
  onClick: () => void;
  /** What is being edited — "TL;DR", "Voice & tone", "the brand". */
  what: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-helper text-ink-tertiary transition-colors duration-[120ms] hover:bg-surface-hover hover:text-ink-secondary",
        className,
      )}
    >
      <PencilIcon aria-hidden className="size-3.5" />
      Edit
      <span className="sr-only"> {what}</span>
    </button>
  );
}
