import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Styleguide §12.2. `default` is the accent-filled primary and there is one per view (§4),
 * which is why every other variant is neutral.
 *
 * Sizes track density (§6.2): `default` is the 40px comfortable control, `sm` the 32px
 * compact one. Nothing interactive lands below the 36px pointer target except `xs`, which
 * exists for inline chips rather than for real actions.
 *
 * Focus comes from the global `:focus-visible` rule in globals.css (§10.2) rather than a
 * per-variant ring, so no variant can quietly lose it. Disabled changes fill *and* text
 * colour — opacity alone is not a state (§10.1).
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-colors duration-[120ms] select-none disabled:cursor-not-allowed disabled:border-transparent disabled:bg-muted disabled:text-ink-disabled aria-invalid:border-error [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-[color-mix(in_oklab,var(--primary),white_12%)] active:bg-[color-mix(in_oklab,var(--primary),white_20%)]",
        outline:
          "border-border bg-surface text-ink hover:bg-surface-hover aria-expanded:bg-surface-hover",
        secondary:
          "border-border bg-surface text-ink hover:bg-surface-hover aria-expanded:bg-surface-hover",
        ghost:
          "text-ink-secondary hover:bg-surface-hover hover:text-ink aria-expanded:bg-surface-hover",
        destructive:
          "bg-error text-ink-inverse hover:bg-[color-mix(in_oklab,var(--color-feedback-error),white_12%)] active:bg-[color-mix(in_oklab,var(--color-feedback-error),white_20%)]",
        link: "text-ink underline decoration-[0.5px] underline-offset-4 hover:text-brand",
      },
      size: {
        default:
          "h-10 gap-2 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-4",
        icon: "size-10",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
