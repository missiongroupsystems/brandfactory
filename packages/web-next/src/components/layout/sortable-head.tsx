"use client";

import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import type * as React from "react";

import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * A column heading that sorts.
 *
 * ── Read the ban before you reach for this ────────────────────────────────
 *
 * `AGENTS.md` forbids column sorting on this app's lists, and the reason is pagination: a
 * client-side sort over a cursor-paginated list reorders only the rows that happen to be loaded,
 * so "sort by name" puts Zephyr at the top of page one while Alma sits unfetched on page three.
 * This component does not overturn that. It is for the **exhaustive** endpoints — currently
 * `/influencers` alone — where the client holds the whole list and an order computed over it is
 * an order over everything there is.
 *
 * ── The markup ────────────────────────────────────────────────────────────
 *
 * `aria-sort` on the `<th>` and a real `<button>` inside it. The two carry different halves:
 * `aria-sort` tells a screen reader which column the table is ordered by and which way, and the
 * button is what makes the heading operable from the keyboard at all. A `<th onClick>` would be
 * neither — no tab stop, no `Enter`, and nothing announced.
 *
 * ── The glyph is always there, and that is the point ──────────────────────
 *
 * An inactive heading carries `ChevronsUpDown` at tertiary ink; the active one carries a single
 * arrow. A control that appears only on hover is a control a reader has to already know about,
 * and this one is new to the app. The inactive glyph is what says "these headings do something".
 *
 * The arrow points the way the *values* run — up for A→Z and 1→n, down for the reverse — rather
 * than the way the triangle in a spreadsheet's filter menu points. It is the reading every table
 * this group uses shares.
 */
export function SortableHead({
  label,
  active,
  onSort,
  align = "left",
  className,
  /** Appended to the button's accessible name — for a column whose sort is not the obvious
   *  reading of its heading, such as a set-valued column that orders by count. */
  hint,
}: {
  label: React.ReactNode;
  /** This column's current direction, or `null` when the table is ordered by something else. */
  active: "asc" | "desc" | null;
  onSort: () => void;
  align?: "left" | "right";
  className?: string;
  hint?: string;
}) {
  const Icon = active === "asc" ? ArrowUpIcon : active === "desc" ? ArrowDownIcon : ChevronsUpDownIcon;

  return (
    <TableHead
      aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}
      className={cn(align === "right" && "text-right", className)}
    >
      <button
        type="button"
        onClick={onSort}
        // Negative margins so the button's own padding does not indent the label past the cells
        // below it — the heading has to stay on the column's own left edge, and on a right-aligned
        // numeric column on its right one.
        //
        // **The cap has to be `100% + 0.75rem`, not `100%`, and the missing 0.75rem is a bug you
        // can only see under `table-layout: auto`.** `-mx-1.5` is what lets this button be 12px
        // wider than the cell's content box while still lining up with it, so the column's
        // min-content width is the *margin* box — label, icon and gap, with the padding cancelled
        // out. `max-w-full` then clamps the *border* box to that same number, which is 12px short
        // of what the button needs, and `truncate` below eats the difference. Every heading in an
        // auto-layout table therefore lost its last character or two: `TikTok` read `Ti…`,
        // `Engagement` read `Engage…`. Under `table-fixed` the column is wider than min-content so
        // nothing showed, which is why this survived until `/influencers` grew a view that is not
        // fixed. Keep this in step with `-mx-1.5` if either changes.
        className={cn(
          "-mx-1.5 -my-1 inline-flex max-w-[calc(100%+0.75rem)] items-center gap-1 rounded-md px-1.5 py-1 font-medium text-ink-secondary transition-colors duration-[120ms] hover:bg-surface-hover hover:text-ink",
          align === "right" && "flex-row-reverse",
        )}
      >
        <span className="truncate">{label}</span>
        <Icon
          aria-hidden
          className={cn("size-3.5 shrink-0", active ? "text-ink" : "text-ink-tertiary")}
        />
        {/* The heading's word is the label; this is what the button *does*, which a glyph cannot
            say. `aria-sort` above reports the state, so this stays a plain instruction rather
            than repeating it. */}
        <span className="sr-only">
          {`Sort by ${typeof label === "string" ? label : "this column"}`}
          {hint ? `, ${hint}` : ""}
        </span>
      </button>
    </TableHead>
  );
}
