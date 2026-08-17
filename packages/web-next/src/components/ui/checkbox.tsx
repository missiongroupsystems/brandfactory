"use client"

import { CheckIcon } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A native checkbox with the platform box swapped for a token-styled one — 16px, 4px radius
 * (`--radius-sm` exists for exactly this, see globals.css §9).
 *
 * Native for the same reason as `Select`: the outlet attribute editor is twenty checkboxes in
 * a fieldset, and the platform control brings label association, indeterminate support, form
 * participation and the base-layer focus ring for free.
 *
 * The box is drawn on the `<input>` itself via `appearance-none` and the tick is a sibling
 * revealed by `peer-checked:` — an icon inside the input is not possible, and an icon that
 * tracks `checked` in React state is a second source of truth for something the DOM already
 * knows.
 */
function Checkbox({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
      <input
        type="checkbox"
        data-slot="checkbox"
        className={cn(
          "peer size-4 appearance-none rounded-sm border border-input bg-surface transition-colors duration-[120ms] checked:border-brand checked:bg-brand hover:border-border-strong disabled:cursor-not-allowed disabled:border-border disabled:bg-muted checked:disabled:bg-ink-disabled",
          className
        )}
        {...props}
      />
      <CheckIcon
        aria-hidden
        strokeWidth={3}
        className="pointer-events-none absolute size-3 text-ink-inverse opacity-0 peer-checked:opacity-100"
      />
    </span>
  )
}

export { Checkbox }
