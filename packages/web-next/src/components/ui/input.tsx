import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/**
 * Styleguide §11 / §3.4. The resting border is a **1px `--border-input` (#807d76, 4.1:1)**,
 * not the card hairline: a control boundary has to clear 3:1 (WCAG 1.4.11), and
 * `rgba(23,23,23,.16)` measures about 1.4:1. This is the one place the calm hairline loses.
 *
 * 40px tall, 8px radius, 14px/400 ink on `--surface-base` — the field is white even when the
 * page behind it is sunken beige.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-input bg-surface px-3 py-1 text-sm text-ink transition-colors duration-[120ms] file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink placeholder:text-ink-tertiary hover:border-border-strong disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-ink-disabled aria-invalid:border-error aria-invalid:hover:border-error",
        className
      )}
      {...props}
    />
  )
}

export { Input }
