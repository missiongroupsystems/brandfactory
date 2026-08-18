"use client"

import * as React from "react"

import {
  DEFAULT_TABLE_DENSITY,
  TABLE_DENSITY_CLASSES,
  useTableDensity,
  type TableDensity,
  type TableDensityClasses,
} from "@/lib/table-density"
import { cn } from "@/lib/utils"

/**
 * Styleguide §12.3. Headers are 12px/500 **sentence case** in secondary ink — weight does
 * the work ALL-CAPS would do elsewhere. Row lines are the `--border-subtle` hairline, rows
 * are 48px comfortable, cells 16px padding-x.
 *
 * Numeric columns are right-aligned and tabular: `th`/`td` get `tabular-nums` from the base
 * layer, so a quantity column cannot jitter as it updates. Product codes and other IDs go in
 * `font-mono` (§5.4) at the call site.
 *
 * ── Row height is a reader preference, and it arrives here ────────────────
 *
 * "48px comfortable" above is now the **top** of a three-rung ladder rather than the only
 * value — see `lib/table-density.ts`. Every table in this package is built out of these six
 * components, which is what makes one edit here the answer for all twenty-two of them instead
 * of twenty-two edits that would each need remembering.
 *
 * "cells 16px padding-x" is on that ladder too, and for the same reason: it is a measurement
 * that changes how much fits without changing what any cell says. 16px is what `comfortable`
 * still gives; the tighter rungs give 12px and 10px. Neither number is written here any more —
 * a constant in this file is a constant no reader can turn down.
 *
 * `Table` subscribes **once** and hands the answer down by context. `TableCell` reading the
 * store itself would be one `useSyncExternalStore` per cell — over a thousand subscriptions on
 * the 146-row influencers table, to answer a question that cannot differ between two cells of
 * the same table.
 */
const TableDensityContext = React.createContext<TableDensity>(DEFAULT_TABLE_DENSITY)

/**
 * The measurements, for the primitives below only.
 *
 * A call site outside this file wants `useTableDensityClasses` from `lib/table-density.ts`,
 * which reads the store directly — the context is provided by `Table`, so a component that
 * *renders* a `<Table>` sits above its own provider and would read the default here.
 */
function useCellDensity(): TableDensityClasses {
  return TABLE_DENSITY_CLASSES[React.useContext(TableDensityContext)]
}

function Table({ className, ...props }: React.ComponentProps<"table">) {
  const density = useTableDensity()

  return (
    <TableDensityContext.Provider value={density}>
      <div
        data-slot="table-container"
        className="relative w-full overflow-x-auto"
      >
        <table
          data-slot="table"
          // Mirrored onto the element so the rung a table is actually rendering at is legible
          // in the inspector and addressable from a test, rather than being a value that exists
          // only inside React.
          data-density={density}
          className={cn("w-full caption-bottom text-sm", className)}
          {...props}
        />
      </div>
    </TableDensityContext.Provider>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b [&_tr]:border-border-subtle", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-border-subtle bg-surface-sunken font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border-subtle transition-colors duration-[120ms] hover:bg-surface-hover has-aria-expanded:bg-surface-hover data-[state=selected]:bg-surface-selected",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  const density = useCellDensity()

  return (
    <th
      data-slot="table-head"
      // The height AND the horizontal padding come from the rung rather than from the base
      // string, so there is no `h-10`/`px-4` sitting underneath waiting for `tailwind-merge` to
      // resolve it away. `className` stays last: a call site that sets its own end gutter
      // (`pl-5`/`pr-5`) still wins, which every grouped table depends on.
      className={cn(
        "text-left align-middle text-xs font-medium whitespace-nowrap text-ink-secondary [&:has([role=checkbox])]:pr-0",
        density.head,
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  const density = useCellDensity()

  return (
    <td
      data-slot="table-cell"
      className={cn(
        "align-middle text-ink whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        density.cell,
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-helper text-ink-secondary", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
