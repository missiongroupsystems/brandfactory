"use client";

import { Loader2Icon, PencilIcon } from "lucide-react";
import * as React from "react";

import { useTableDensityClasses } from "@/lib/table-density";
import { cn } from "@/lib/utils";

/**
 * The affordance and the swap — the two halves of editing a cell you are already looking at.
 *
 * ── The affordance is on hover **and** on focus ───────────────────────────
 *
 * A control that exists only under a pointer is a control a keyboard cannot reach. So the pencil
 * is a **real button in the tab order** at all times; what hover changes is only whether it is
 * visible. `opacity-0` and not `hidden` for exactly that reason — a hidden button is not
 * focusable, and this app's base layer has one `:focus-visible` rule that everything relies on.
 *
 * Both triggers are needed and neither is enough: `group-hover/row` covers the pointer,
 * `focus-visible:opacity-100` covers the keyboard, and a screen reader gets the button's label
 * whatever the opacity says.
 *
 * ── The editor has to fit the rung ────────────────────────────────────────
 *
 * `Input` and `Select` are a fixed `h-10`. A default-height editor opening inside a `compact` row
 * — 32px, of which 24px is content box — grows that row and shifts every row below it, with the
 * reader's pointer still on the one they clicked. So the editor is sized from
 * `useTableDensityClasses().editor`, which `lib/table-density.ts` defines as the content box
 * exactly and `table-density.test.ts` asserts.
 *
 * It is also **borderless with its padding pulled back**, so the value does not jump sideways as
 * the editor opens over it: a bordered control would inset the text by its own padding and the
 * column would visibly shuffle on every click.
 *
 * ── The rung is a ceiling, and a stacked cell needs {@link stacked} ────────
 *
 * **`editor` is the tallest thing a cell can hold, not the height every editor should be**, and
 * the difference only shows up in a cell holding more than one line. A one-line cell — Vertical,
 * Status, Brands — has its whole content box free, so an editor filling it moves nothing.
 *
 * The Creator cell is a **two-line stack**: a 21px name over an 18.84px handle, 39.84px together,
 * which already exceeds the content box of every rung. Swapping the 21px line for a rung-height
 * editor there adds the difference straight onto the tallest cell in the row — **+10px at
 * `comfortable`, which is the default** — and every row below it moves down under the reader's
 * pointer. That is the exact failure the rung was invented to prevent, arriving through the one
 * cell whose arithmetic it does not describe. Found in 1.49.0's browser pass; the headless render
 * that signed Phase C off measured the three one-line editors.
 *
 * So a stacked cell sizes its editor from **the line it replaces** rather than from the box:
 * `h-auto` with no vertical padding and no border, which leaves the control exactly one line box
 * tall. It needs no number — the line tracks the type scale, so this cannot drift the way an
 * `h-[21px]` would. The rung still bounds it, and by a wide margin: one line is shorter than the
 * content box at every rung, so `Input`'s own `h-10` is still the thing being overridden.
 *
 * ── What this component does not decide ───────────────────────────────────
 *
 * When an edit *commits* — the four editors disagree about that, and rightly. A text box commits
 * on `Enter` and on blur; a select commits the moment the platform says the reader chose
 * something; a multi-select commits on an explicit `Save`, because a picker that wrote on every
 * tick would fire a full-replacement write per checkbox. So the editor is a render prop and it
 * calls `close` itself.
 *
 * What this component does decide is **`Escape` cancels**, uniformly, and that focus returns to
 * the pencil afterwards — a keyboard user who cancels an edit must not be dropped on `document.body`
 * in the middle of a 146-row table.
 */

/**
 * The pencil, on its own, for the cells whose editor is not an inline swap.
 *
 * Two callers: {@link EditableCell} below, and the cells whose "editor" is somewhere else — the
 * brand picker's popover, and the derived columns whose pencil opens the record's own form.
 * Exported rather than duplicated so the reveal rule has one definition; a second copy is how one
 * of five pencils ends up invisible to a keyboard.
 */
export function EditPencil({
  label,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  /** What is being edited, lower case — the button reads `Edit status`. */
  label: string;
}) {
  return (
    <button
      type="button"
      // Not `aria-label` alone: the visible glyph carries no text, so the name is the only thing
      // a screen reader gets, and `Edit` on its own down eight columns names nothing.
      aria-label={`Edit ${label}`}
      className={cn(
        "shrink-0 rounded-md p-0.5 text-ink-tertiary opacity-0 transition-opacity duration-[120ms] group-hover/row:opacity-100 hover:text-ink focus-visible:opacity-100",
        className,
      )}
      {...props}
    >
      <PencilIcon aria-hidden className="size-3.5" />
    </button>
  );
}

/** What the render prop is handed. The cell owns the pending state; the editor only reports it. */
export type EditorSlot = {
  /** Return to the display state and refocus the pencil. */
  close: () => void;
  /** The rung-sized, borderless classes the editor must wear. */
  className: string;
  /** True while a write is in flight — every editor has to honour it. See below. */
  disabled: boolean;
  setPending: (pending: boolean) => void;
};

/**
 * A cell whose editor is an **inline swap** — the value, and a box in its place.
 *
 * Three of the four editable columns use it. The fourth, Brands, is a popover instead: a column of
 * checkboxes does not fit a 24px cell, and its write needs an explicit `Save`. It reaches for
 * {@link EditPencil} on its own rather than bending this component into two shapes.
 *
 * The two right-aligned numeric columns are not editable and do not use this either; they carry a
 * bare {@link EditPencil} that opens the record's form, positioned *before* the figure so the
 * column stays flush right.
 */
export function EditableCell({
  label,
  display,
  children,
  className,
  stacked = false,
}: {
  label: string;
  /** What the cell shows when it is not being edited. */
  display: React.ReactNode;
  children: (slot: EditorSlot) => React.ReactNode;
  className?: string;
  /**
   * True when this cell holds another line **below** the one being edited — the Creator cell's
   * handle. The editor then takes the height of the line it replaces instead of the cell's content
   * box, because in a stack those are not the same number and the rung is the larger one. See the
   * component docstring; getting this wrong moves every row below on the default rung.
   */
  stacked?: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  // Owned here rather than by the row: it is per *cell*, it lives exactly as long as the editor,
  // and a row holding one flag per editable column would need four.
  const [isPending, setIsPending] = React.useState(false);
  const { editor } = useTableDensityClasses();
  const pencilRef = React.useRef<HTMLButtonElement>(null);
  const wasEditing = React.useRef(false);

  // Focus back to the pencil when the editor closes, so `Escape` does not strand a keyboard user
  // on `document.body`. An effect, but not the banned one: it sets no state, it moves focus —
  // which is a DOM side effect and has nowhere else to live.
  React.useEffect(() => {
    if (wasEditing.current && !editing) pencilRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const close = React.useCallback(() => setEditing(false), []);

  if (editing) {
    return (
      <span
        className={cn("flex items-center gap-1", className)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          // **Never mid-write.** Escaping out of a request already in flight would close the cell
          // over a write that still lands, so the display would show the old value until the
          // refetch replaced it — a table that appears to have ignored an edit it actually made.
          if (isPending) return;
          // Stopped, or the same press also dismisses whatever popup the editor opened — and on a
          // grouped table it would reach the band's own handlers on the way up.
          event.stopPropagation();
          close();
        }}
      >
        {children({
          close,
          // Borderless and pulled back by its own padding, so the value does not shift sideways
          // as the editor opens over it. The height is the rung's — except in a stack, where it
          // is the line's; see the docstring.
          className: cn(
            stacked ? "h-auto border-0 py-0" : editor,
            "-mx-1 min-w-0 rounded-md border-transparent bg-surface-sunken px-1 text-sm text-ink",
          ),
          disabled: isPending,
          setPending: setIsPending,
        })}
        {/* **Nothing is optimistic**, so the cell cannot show the new value as a fact while the
            write is in flight. What it shows instead is the editor, disabled, holding what the
            reader chose, with a spinner beside it — "this is being saved", never "this is
            saved". The server's answer is what finally re-renders the display. */}
        {isPending ? (
          <Loader2Icon aria-hidden className="size-3 shrink-0 animate-spin text-ink-tertiary" />
        ) : null}
      </span>
    );
  }

  return (
    <span className={cn("flex items-center gap-1", className)}>
      {display}
      {/* `ml-auto` rather than a gap: the pencil belongs at the cell's right edge whatever the
          value's width, so the column of pencils lines up instead of tracking the text. */}
      <EditPencil
        ref={pencilRef}
        label={label}
        onClick={() => setEditing(true)}
        className="ml-auto"
      />
    </span>
  );
}
