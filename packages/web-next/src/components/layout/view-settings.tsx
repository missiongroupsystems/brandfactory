"use client";

import { Settings2Icon } from "lucide-react";
import * as React from "react";

import { TableDensityControl } from "@/components/layout/table-density";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * How the table below is *presented*, as one panel.
 *
 * ── Why a panel rather than three buttons in the row ──────────────────────
 *
 * A setting you change while looking at the thing it changes wants to cost one click, in place,
 * with the answer visible behind it — which argues for the bare control on the toolbar. The
 * arithmetic on this app's toolbars argues the other way. `/influencers` already carries a
 * search field, **Filters**, a `Group by reach` toggle, **Sync** and **Add creator**; a
 * three-button glyph cluster is the sixth control and the row wraps, stranding it on a line of
 * its own. A control pushed onto its own line has already lost the adjacency the one-click
 * argument was buying.
 *
 * So presentation folds into one trigger. It is the shape `FilterPopover` already established
 * for the filters, for the same reason: collapsing controls is acceptable when what is *set*
 * stays legible outside — and the row height is legible in the rows themselves.
 *
 * ── One trigger, rendered centrally ───────────────────────────────────────
 *
 * `FilterBar` and `FilterToolbar` render this themselves, which is what put the control on every
 * list screen in one edit rather than in twenty edits that would each need remembering. Screens
 * with more to say pass it as `children`; screens with nothing extra get a panel holding row
 * height alone.
 *
 * ── What the trigger's active state may and may not mean ──────────────────
 *
 * `modified` is the **caller's** business — a grouping the reader turned off, a sort they chose.
 * Density is deliberately excluded from it: it is a remembered reader preference, so folding it
 * in would light this trigger up permanently for everybody who once chose 32px rows, and a
 * signal that is always on is not a signal. It is the same distinction `FilterPopover` draws
 * when its count excludes `q`.
 */
export function ViewSettings({
  children,
  modified = false,
  /**
   * Whether to offer the row-height control. On by default, because every screen that renders a
   * `FilterBar` today renders a table under it; the flag is here so the day one of them filters
   * something that is not a table, the answer is a prop rather than a control that adjusts
   * nothing.
   */
  density = true,
}: {
  children?: React.ReactNode;
  modified?: boolean;
  density?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="secondary"
            // The `--surface-selected` treatment every "this control is doing something" trigger
            // in this toolbar wears — a set `FilterSelect`, a counted `FilterPopover`, a pressed
            // `ToggleButton`. Three shapes, one visual idea.
            data-active={modified ? "" : undefined}
            className="data-active:border-border-strong data-active:bg-surface-selected"
          >
            <Settings2Icon data-icon="inline-start" />
            View
          </Button>
        }
      />
      {/* `align="start"`, the popover default and `FilterPopover`'s: this trigger sits in the
          left cluster on every screen that renders one, so the panel opens rightwards into the
          width of the page rather than back over the search field. */}
      <PopoverContent className="flex max-h-[70vh] w-72 flex-col gap-4 overflow-y-auto">
        {density ? (
          <ViewSettingsSection title="Row height">
            {/* Full width, unlike a toolbar row where it would be sized to fit beside five other
                controls. There is room in a panel, and a wider target is a better one. */}
            <TableDensityControl className="w-full" grow />
          </ViewSettingsSection>
        ) : null}
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * One labelled block inside the panel.
 *
 * A heading per block rather than separators alone: the panel holds unrelated questions and the
 * reader arrives looking for one of them. `PanelFilter` makes the same call for the filters — a
 * panel has vertical room, so the dimension gets a real visible label where the toolbar row
 * could only afford an `aria-label`.
 */
export function ViewSettingsSection({
  title,
  action,
  children,
  className,
}: {
  title: string;
  /** A **Reset** or similar, on the heading's right — `FilterPopover` puts "Clear all" there. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-helper font-medium text-ink">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ─── The slot ────────────────────────────────────────────────────────────── */

/**
 * Whether a `ViewSettings` has already been rendered by an enclosing toolbar.
 *
 * **Three screens nest the two containers.** `/outlets`, `/vendors` and `/contracts` put a
 * `FilterBar` inside a `FilterToolbar`'s children, because the toolbar owns the row and the bar
 * owns the growing cluster of filters inside it. Both components render this panel, so without a
 * claim those screens would ship two **View** buttons side by side.
 *
 * A context rather than a `density={false}` prop at the three call sites: that would be a rule
 * enforced by whoever remembers it, and the fourth screen to nest them would ship the bug. The
 * outer container claims the slot for its whole subtree; anything inside sees it taken and
 * renders nothing.
 */
const ViewSettingsSlotContext = React.createContext(false);

/** Read by `FilterBar` and `FilterToolbar` before they render the trigger. */
export function useViewSettingsSlotTaken(): boolean {
  return React.useContext(ViewSettingsSlotContext);
}

export function ViewSettingsSlotClaimed({ children }: { children: React.ReactNode }) {
  return (
    <ViewSettingsSlotContext.Provider value={true}>{children}</ViewSettingsSlotContext.Provider>
  );
}
