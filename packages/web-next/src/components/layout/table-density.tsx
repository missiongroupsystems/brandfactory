"use client";

import { Rows2Icon, Rows3Icon, Rows4Icon, type LucideIcon } from "lucide-react";
import type * as React from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  setTableDensity,
  TABLE_DENSITIES,
  TABLE_DENSITY_LABELS,
  useTableDensity,
  type TableDensity,
} from "@/lib/table-density";
import { cn } from "@/lib/utils";

/**
 * Row height, as a control.
 *
 * ── The glyphs are the measurement ────────────────────────────────────────
 *
 * `Rows2` · `Rows3` · `Rows4` draw two, three and four bars in the same box: the icon shows how
 * many rows fit, which is the actual question. The word is not lost — every button carries a
 * tooltip and an `sr-only` label, so the control is readable from the keyboard and from a screen
 * reader, which is the trade AGENTS.md requires wherever a glyph is the visible carrier.
 *
 * ── Why the buttons are `aria-pressed` and not radios ─────────────────────
 *
 * They act immediately and there is nothing to submit. Radio semantics would promise arrow-key
 * selection this does not implement — the same reasoning `SegmentedControl` in `filter-bar.tsx`
 * records for the same shape, and this deliberately wears that component's shell (height,
 * border, surface, 2px inset) so a panel carrying both does not read as two kinds of control.
 *
 * The preference is **global and remembered** — see `lib/table-density.ts` for why it is a
 * reader preference rather than a URL parameter. That is stated in the group's accessible name
 * rather than in visible copy: a sentence of explanation on twenty toolbars would be twenty
 * copies of something one use teaches, and the group has to be named for assistive tech anyway.
 */

const DENSITY_ICONS: Record<TableDensity, LucideIcon> = {
  comfortable: Rows2Icon,
  cosy: Rows3Icon,
  compact: Rows4Icon,
};

export function TableDensityControl({
  className,
  /**
   * Share the available width between the three buttons instead of sizing each to its glyph.
   *
   * For the `ViewSettings` panel, which is 288px wide and has room a toolbar row would not:
   * three 32px targets floated at the left of a panel look like an unfinished row, and a wider
   * target is a better one.
   */
  grow = false,
}: {
  className?: string;
  grow?: boolean;
}) {
  const density = useTableDensity();

  return (
    <div
      role="group"
      aria-label="Row height — applies to every table and is remembered"
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5",
        className,
      )}
    >
      {TABLE_DENSITIES.map((option) => {
        const Icon = DENSITY_ICONS[option];
        const selected = option === density;

        return (
          <Tooltip key={option}>
            <TooltipTrigger
              // Base UI's trigger renders a real `<button>`, so this is focusable and pressable
              // without a `render` prop — and the tooltip opens on focus, which is what makes an
              // icon-only control usable from the keyboard.
              type="button"
              aria-pressed={selected}
              onClick={() => setTableDensity(option)}
              className={cn(
                "inline-flex h-full items-center justify-center rounded-md px-2 transition-colors duration-[120ms]",
                grow && "flex-1",
                selected
                  ? "bg-surface-selected text-ink"
                  : "text-ink-secondary hover:bg-surface-hover hover:text-ink",
              )}
            >
              <Icon aria-hidden className="size-4" />
              <span className="sr-only">{TABLE_DENSITY_LABELS[option]} rows</span>
            </TooltipTrigger>
            <TooltipContent>{TABLE_DENSITY_LABELS[option]} rows</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
