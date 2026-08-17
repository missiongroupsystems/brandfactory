import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Multi-line text on the same border, radius and type as `Input` (§11).
 *
 * `field-sizing-content` grows the box with what is typed, up to `max-h`, so a two-line note
 * does not sit in a five-line well and a long one does not need scrolling to read back.
 * `min-h-20` rather than `rows`, because rows and a CSS height fight each other.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-sizing-content max-h-64 min-h-20 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-ink transition-colors duration-[120ms] placeholder:text-ink-tertiary hover:border-border-strong disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-ink-disabled aria-invalid:border-error",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
