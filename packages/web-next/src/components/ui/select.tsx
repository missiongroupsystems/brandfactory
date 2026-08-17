import { ChevronDownIcon } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A **native** `<select>`, styled to match `Input` — styleguide §11.
 *
 * Deliberately not Base UI's `Select` popup. Every select in this product picks one value
 * from a short, closed enum (five outlet statuses, four outlet types, four device types) and
 * the platform control already does that correctly: typeahead, keyboard, mobile wheel pickers
 * and the focus ring from the base layer, none of which has to be reimplemented or tested.
 * A popup select earns its complexity when options need icons, descriptions or search — bring
 * one in then, for those cases, rather than for these.
 *
 * `appearance-none` removes the platform arrow so the chevron matches the rest of the product;
 * the wrapper is `relative` and the chevron is `pointer-events-none` so clicks still land on
 * the control.
 */
function Select({
  className,
  containerClassName,
  children,
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & {
  /**
   * Sizing goes here, not in `className`.
   *
   * The chevron is positioned against this wrapper while the control fills it, so a width put
   * on the `<select>` shrinks the control and leaves the chevron stranded at the wrapper's right
   * edge — and in a `flex-wrap` filter row a wrapper that stays `w-full` forces every control
   * onto its own line. Splitting the two props makes that impossible to get wrong by accident.
   */
  containerClassName?: string
}) {
  return (
    <div className={cn("relative w-full", containerClassName)}>
      <select
        data-slot="select"
        className={cn(
          // pr-9 leaves room for the chevron. Height, radius and border track Input exactly:
          // a select next to a text field at a different height reads as a mistake.
          "h-10 w-full appearance-none rounded-lg border border-input bg-surface py-1 pr-9 pl-3 text-sm text-ink transition-colors duration-[120ms] hover:border-border-strong disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-ink-disabled aria-invalid:border-error",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-tertiary"
      />
    </div>
  )
}

export { Select }
