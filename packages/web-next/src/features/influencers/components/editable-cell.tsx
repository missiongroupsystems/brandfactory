"use client";

import { ChevronDownIcon, Loader2Icon } from "lucide-react";
import * as React from "react";

import { useTableDensityClasses } from "@/lib/table-density";
import { cn } from "@/lib/utils";

/**
 * The affordance for a cell you can act on — **the cell itself**.
 *
 * ── What this replaces, and what the reader actually objected to ──────────
 *
 * Every editable column used to carry a 14px pencil at its right edge, revealed on row hover. The
 * reader's words: *"Instead of a pencil icon next to each cell, let me click the cell and edit it
 * there. The pen feels dated."* Two separate costs sat behind that sentence and only one of them
 * is about fashion.
 *
 * The pencil was a **target inside a target**. A reader pointing at the Status cell had to find a
 * glyph at the far end of it, in a column whose contents are a pill at the near end. The tint
 * covers the whole cell, so the thing you point at and the thing you press are the same thing.
 *
 * The pencil was also **the same mark for four different outcomes** — a text box, a native select,
 * a checkbox popover and a navigation to a form. It said *something happens here* and nothing
 * more. A chevron on the two cells that open a list says which of them.
 *
 * ── The three properties that are kept, because they were expensive ───────
 *
 * None of them is what the reader objected to, and all three are easy to lose in a restyle.
 *
 * - **A real `<button>` in the tab order at all times.** The pencil was `opacity-0` rather than
 *   `hidden` for exactly this reason — a hidden button is not focusable, and this app's base layer
 *   has one `:focus-visible` rule that everything relies on. A cell-wide button keeps the property
 *   and improves on it: nothing is revealed, so nothing is reserved, so **nothing shifts on
 *   hover**. That is what retires the hack in the Reach cell, where the pencil sat *before* the
 *   figure so its reserved width could not push the numbers off the column's right edge.
 * - **The trigger is sized from the density rung**, so a cell's resting state and whatever opens
 *   over it are the same height and the row cannot grow under the pointer that clicked it. The
 *   rung's `editor` measurement is the cell's content box exactly — see `lib/table-density.ts`.
 * - **Nothing is optimistic.** {@link CellTrigger} takes a `pending` flag and shows a spinner
 *   beside the value it still holds, so a cell says "this is being saved" and never "this is
 *   saved". The server's answer is what re-renders it.
 *
 * ── The tint is one step deeper than the row's own ────────────────────────
 *
 * `TableRow` already paints `bg-surface-hover` (beige-100) across the whole row on hover, so a
 * cell tint at that token would be **invisible exactly when it is needed**. The cell goes to
 * `bg-surface-selected` (beige-200), which reads as one step further in on a row that is already
 * lit. Focus and the open state get the same token, so a keyboard user sees what a pointer does
 * and an open menu keeps its cell marked while the reader is looking at the list.
 *
 * ── What used to be here ──────────────────────────────────────────────────
 *
 * `EditPencil`, and `EditableCell` — a display-to-editor **swap** with a render prop, an `Escape`
 * handler and a `stacked` flag for the Creator cell's two-line stack. Both are gone, and the swap
 * has no callers left rather than no uses today: the two enum columns became menus, Brands was
 * always a popover, Platforms and Reach open the accounts panel, and the Creator cell stopped
 * being editable at all. A cell on this table now opens *something anchored to it*, and this file
 * is the one control they share.
 */

/**
 * The button a cell is.
 *
 * Composition is Base UI's `render` prop, so this is what `DropdownMenuTrigger` and
 * `PopoverTrigger` render as: `render={<CellTrigger label="Edit status" chevron />}`. It is a
 * plain `<button>` otherwise, and it forwards everything — the `aria-expanded` those primitives
 * set is what the open-state tint reads.
 */
export function CellTrigger({
  label,
  chevron = false,
  pending = false,
  className,
  children,
  disabled,
  ...props
}: React.ComponentProps<"button"> & {
  /**
   * The whole phrase, `sr-only`, appended **after** the cell's own content — `Edit status`,
   * `Edit the accounts of Priya Raman`.
   *
   * Not `aria-label`, which would replace the accessible name rather than extend it: the value in
   * the cell is the thing a screen-reader user is moving through the column to hear, and a button
   * named only "Edit status" over 146 rows says nothing about any of them. The name reads
   * *"Prospect, Edit status"*. Where the trigger has no visible content of its own — the sibling
   * in the Platforms cell — this phrase is the whole name, which is why it has to be a phrase.
   */
  label: string;
  /**
   * True on a cell that opens a **list of choices**, which is the one thing the pencil never
   * managed to say. Always drawn, never revealed on hover: a mark that appears under the pointer
   * has to reserve its width anyway, and reserving it without drawing it buys nothing but a
   * flicker.
   */
  chevron?: boolean;
  /** True while this cell's write is in flight. Shows the spinner and refuses a second press. */
  pending?: boolean;
}) {
  const { editor } = useTableDensityClasses();

  return (
    <button
      type="button"
      disabled={disabled || pending}
      className={cn(
        // `-mx-1 px-1` so the tint is a little wider than the value it sits behind, matching the
        // inset the inline editors used to open at — the block you see on hover is the footprint
        // of the thing that opens.
        "-mx-1 flex min-w-0 items-center gap-1 rounded-md px-1 text-left transition-colors duration-[120ms]",
        // One step deeper than `TableRow`'s own `hover:bg-surface-hover`, which the cell is
        // already sitting on by the time a pointer reaches it. See the file docstring.
        "hover:bg-surface-selected focus-visible:bg-surface-selected aria-expanded:bg-surface-selected",
        "disabled:cursor-default disabled:hover:bg-transparent",
        editor,
        className,
      )}
      {...props}
    >
      {children}
      <span className="sr-only">{label}</span>
      {pending ? (
        <Loader2Icon aria-hidden className="ml-auto size-3 shrink-0 animate-spin text-ink-tertiary" />
      ) : chevron ? (
        // `ml-auto` rather than a gap, so the chevrons line up down the column whatever each
        // value's width — the one thing the pencil's position got right.
        <ChevronDownIcon aria-hidden className="ml-auto size-3.5 shrink-0 text-ink-tertiary" />
      ) : null}
    </button>
  );
}
