import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Status pill / badge — styleguide §12.4. 999px, sentence case, 12px/500, tint background
 * with matching text; never a saturated fill inline in a table.
 *
 * `default` is the neutral beige pill, because that is what most badges are: counts, phase
 * markers, plain states. The feedback variants are the fixed mapping — positive/additive to
 * `success`, destructive to `error`, neutral-but-notable to `warning`, informational to
 * `info`. There is deliberately no accent variant: the accent budget (§4) does not include
 * badges.
 *
 * A badge is never the only carrier of a state (WCAG 1.4.1) — pair it with text or an icon.
 */
const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors duration-[120ms] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-muted text-ink-secondary",
        secondary: "bg-muted text-ink-secondary",
        success: "bg-success-tint text-success",
        warning: "bg-warning-tint text-warning",
        error: "bg-error-tint text-error",
        destructive: "bg-error-tint text-error",
        info: "bg-info-tint text-info",
        outline: "border-border text-ink-secondary",
        ghost: "text-ink-secondary hover:bg-surface-hover hover:text-ink",
        link: "text-ink underline decoration-[0.5px] underline-offset-4 hover:text-brand",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
