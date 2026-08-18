"use client";

import { SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import type * as React from "react";

import {
  ViewSettings,
  ViewSettingsSlotClaimed,
  useViewSettingsSlotTaken,
} from "@/components/layout/view-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * The filter row above a table.
 *
 * Filters are not wrapped in a card: they act on the card below and reading as a separate panel
 * would suggest otherwise. They sit directly on the sunken canvas, which is also why every
 * control inside is white (`--surface-base`) — the styleguide's rule that a field stays white
 * even when the page behind it is beige.
 */
export function FilterBar({
  children,
  activeCount,
  onClear,
  density = true,
  settings,
  settingsModified,
}: {
  children: React.ReactNode;
  activeCount: number;
  onClear: () => void;
  /**
   * Whether to offer the row-height control — see {@link ViewSettings}. On by default, because
   * every screen rendering a `FilterBar` today renders a table under it.
   */
  density?: boolean;
  /** Extra presentation controls for the **View** panel — see {@link ViewSettings}. */
  settings?: React.ReactNode;
  /** Whether those controls are away from their defaults, which lights the trigger. */
  settingsModified?: boolean;
}) {
  // Nested inside a `FilterToolbar` on `/outlets`, `/vendors` and `/contracts`, which has already
  // rendered the panel for the whole row. Two **View** buttons side by side is what this reads.
  const taken = useViewSettingsSlotTaken();

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      {children}

      {/* After the filters and BEFORE "Clear", which is the only position that does not move.
          Put last it would slide sideways every time a filter is set or cleared — a control that
          changes place while you are using it. It is not a filter and is not counted by
          `activeCount`: it narrows nothing, and "Clear 3 filters" must never mean "and put the
          rows back to 48px". */}
      {!taken && (density || settings) ? (
        <ViewSettings density={density} modified={settingsModified}>
          {settings}
        </ViewSettings>
      ) : null}

      {/* Only rendered when something is filtered. A permanently-visible "Clear" on an unfiltered
          table is a button that does nothing, and one that grows the row by 40px for the whole
          time it does nothing. */}
      {activeCount > 0 ? (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <XIcon data-icon="inline-start" />
          Clear {activeCount === 1 ? "filter" : `${activeCount} filters`}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * A select whose empty option names the dimension — "All statuses", not a separate label.
 *
 * The visible label is the placeholder option, so the control needs no `<label>` above it and the
 * row stays one control tall. `aria-label` carries the same information for anyone who cannot see
 * that the current selection *is* the label.
 */
export function FilterSelect<T extends string>({
  label,
  allLabel,
  value,
  options,
  onChange,
  className,
}: {
  /** Used for `aria-label`, e.g. "Filter by status". */
  label: string;
  /** The empty-value option, e.g. "All statuses". */
  allLabel: string;
  value: string | undefined;
  options: readonly { value: T; label: string }[];
  onChange: (value: string | undefined) => void;
  className?: string;
}) {
  return (
    <Select
      aria-label={label}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || undefined)}
      // A filter that is set looks set before you read it. `--surface-selected` is the same
      // beige-green as a selected nav item and a selected table row, so "this control is doing
      // something" is one visual idea across the product rather than three. The styling lives
      // here rather than in `Select`, which stays a plain field.
      data-active={value ? "" : undefined}
      className="data-active:border-border-strong data-active:bg-surface-selected"
      containerClassName={cn("sm:w-auto sm:min-w-44", className)}
    >
      <option value="">{allLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

/**
 * Free-text search.
 *
 * Controlled by the URL rather than by local state, so the field, the fetch and a pasted link
 * can never disagree. The debounce that keeps this from firing a request per keystroke is applied
 * to the *fetch key* by the caller (`useDebouncedValue`), not to the value shown here — a search
 * box that lags behind typing feels broken.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  label = "Search",
  className,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder: string;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative sm:w-72", className)}>
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-tertiary"
      />
      <Input
        type="search"
        aria-label={label}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value || undefined)}
        // pr-9 leaves room for the clear button; the native search cancel widget is suppressed in
        // globals-free fashion here by simply not relying on it — it is inconsistent across
        // browsers and unstyleable in most.
        className="pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onChange(undefined)}
          className="absolute top-1/2 right-1.5 -translate-y-1/2"
        >
          <XIcon />
          <span className="sr-only">Clear search</span>
        </Button>
      ) : null}
    </div>
  );
}

/* ===========================================================================
   The overflow toolbar — for a screen with more filters than fit on one line.

   `FilterBar` above wraps every control into the row and is right for the screens with
   three or four of them. Contracts has nine (six filters, two view controls and the
   primary action) and wraps into three ragged rows with a hole in the middle, because the
   filter group grows while the action group stays pinned right.

   These pieces answer that differently: the row holds a fixed number of controls
   regardless of how many filters exist, and the filters themselves live in a panel behind
   a counted trigger. What is *set* stays visible as chips under the row, so nothing is
   hidden — only the empty controls are.
   =========================================================================== */

/**
 * The row itself: a growing left cluster and a right cluster that stays put.
 *
 * `justify-between` on a single wrapping flex row is what produced the gap in the old
 * layout — the left group wrapped to three lines while the right group floated beside
 * line two. Two nested clusters wrap independently and each stays internally tidy.
 */
export function FilterToolbar({
  children,
  actions,
  density = true,
  settings,
  settingsModified,
}: {
  children: React.ReactNode;
  /** View controls and the primary action — the right cluster. */
  actions?: React.ReactNode;
  /** See `FilterBar` — same default, same reason. */
  density?: boolean;
  /** Extra presentation controls for the **View** panel — see {@link ViewSettings}. */
  settings?: React.ReactNode;
  /** Whether those controls are away from their defaults, which lights the trigger. */
  settingsModified?: boolean;
}) {
  return (
    // The claim covers the whole row, so a `FilterBar` passed as `children` — which is what
    // `/outlets`, `/vendors` and `/contracts` do — renders no second trigger.
    <ViewSettingsSlotClaimed>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {children}
          {/* Last in the LEFT cluster, beside Filters rather than beside the primary action. Both
              are questions about the table below — one narrows what is in it, the other decides
              how it is drawn — and the right cluster is where the thing that *writes a row*
              lives. Putting a reading preference there would sit it next to "Add creator". */}
          {density || settings ? (
            <ViewSettings density={density} modified={settingsModified}>
              {settings}
            </ViewSettings>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </ViewSettingsSlotClaimed>
  );
}

/**
 * The counted "Filters" trigger and the panel behind it.
 *
 * The count is the whole point of the pattern: a collapsed filter panel that does not say
 * how many filters are set is how a user ends up staring at an unexplained three-row
 * table. It repeats on the chips below, deliberately — the trigger says *how many*, the
 * chips say *which*, and the trigger is still readable once the chips scroll off.
 */
export function FilterPopover({
  activeCount,
  onClear,
  title = "Filters",
  children,
}: {
  activeCount: number;
  onClear: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="secondary"
            // Same `--surface-selected` treatment as a set `FilterSelect` and a selected
            // nav item: "this control is doing something" is one visual idea product-wide.
            data-active={activeCount > 0 ? "" : undefined}
            className="data-active:border-border-strong data-active:bg-surface-selected"
          >
            <SlidersHorizontalIcon data-icon="inline-start" />
            {title}
            {/* A white pill on the selected beige-green, not an accent-filled one: the
                accent budget (§4) does not extend to badges, and `Badge`'s own default
                beige would disappear into the active trigger behind it. */}
            {activeCount > 0 ? (
              <Badge
                variant="outline"
                className="ml-0.5 h-5 min-w-5 bg-surface px-1.5 text-ink"
              >
                {activeCount}
              </Badge>
            ) : null}
          </Button>
        }
      />
      <PopoverContent className="flex w-72 flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-helper font-medium text-ink">{title}</p>
          {activeCount > 0 ? (
            <Button variant="ghost" size="xs" onClick={onClear}>
              Clear all
            </Button>
          ) : null}
        </div>
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * One filter inside the panel.
 *
 * Unlike `FilterSelect` — which hides its label in `aria-label` to keep the row one
 * control tall — the panel has vertical room, so the dimension gets a real visible
 * `<label>`. The "All …" option stays as the empty value: it reads as a sentence with the
 * label above it ("Category / All categories") and it is the same wording the chips drop
 * back to when a filter is removed.
 */
export function PanelFilter<T extends string>({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string | undefined;
  options: readonly { value: T; label: string }[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-helper font-medium text-ink-secondary">{label}</span>
      <Select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
        data-active={value ? "" : undefined}
        className="data-active:border-border-strong data-active:bg-surface-selected"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

/** One set filter, named and removable. */
export type FilterChip = {
  /** The filter's URL key — stable, so React does not re-key on a value change. */
  key: string;
  /** The dimension, e.g. "Category". */
  label: string;
  /** The chosen option's label, e.g. "Cleaning". */
  value: string;
  onRemove: () => void;
};

/**
 * What is currently filtered, under the toolbar row.
 *
 * This is the half of the pattern that keeps the panel honest. Collapsing filters behind a
 * trigger is only acceptable if the *set* ones stay on screen — otherwise a shared link
 * opens on a filtered table with no visible reason for the rows that are missing, which is
 * exactly the "it got lost" failure this product exists to fix.
 *
 * Renders nothing when nothing is set, rather than an empty 28px strip that shifts the
 * table down for no information.
 */
export function ActiveFilterChips({
  chips,
  onClear,
}: {
  chips: readonly FilterChip[];
  onClear: () => void;
}) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex h-7 items-center gap-1 rounded-4xl border border-border bg-surface-selected py-0.5 pr-1 pl-2.5 text-xs text-ink"
        >
          <span className="text-ink-secondary">{chip.label}:</span>
          <span className="font-medium">{chip.value}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={chip.onRemove}
            className="size-5 rounded-4xl"
          >
            <XIcon />
            <span className="sr-only">Remove {chip.label} filter</span>
          </Button>
        </span>
      ))}

      <Button variant="ghost" size="xs" onClick={onClear}>
        Clear all
      </Button>
    </div>
  );
}

/**
 * A two-or-three-way view switch — "Current contracts / All contracts".
 *
 * A `Select` would work and is what this replaced, but a select is the wrong shape for a
 * two-option scope: it hides half the answer behind a click, and it sits in the row
 * looking exactly like the filters it is not. A segment shows both states at once and is
 * visibly a different kind of control.
 *
 * `aria-pressed` rather than `role="radiogroup"`: these are buttons that act immediately,
 * not a form field that is submitted, and radio semantics would promise arrow-key
 * selection that does not commit.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  /** Names the group for assistive tech, e.g. "Which contracts to show". */
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex h-10 shrink-0 items-center gap-0.5 rounded-lg border border-input bg-surface p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-full rounded-md px-3 text-sm font-medium transition-colors duration-[120ms]",
              selected
                ? "bg-surface-selected text-ink"
                : "text-ink-secondary hover:bg-surface-hover hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * An on/off view control, e.g. grouping.
 *
 * A `Select` holding a single option ("No grouping" / "Group by outlet") is a menu for a
 * boolean — two clicks and a hidden state for something with one bit of information. This
 * is that bit, shown.
 */
export function ToggleButton({
  pressed,
  onPressedChange,
  children,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="secondary"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      data-active={pressed ? "" : undefined}
      className="data-active:border-border-strong data-active:bg-surface-selected"
    >
      {children}
    </Button>
  );
}
