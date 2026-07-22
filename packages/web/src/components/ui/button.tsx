import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// Styleguide §12.2 / §9 / §10.2: 8px radius on every variant, no elevation on a
// button (§8 — buttons carry borders, not shadows), and a `:focus-visible`
// outline rather than shadcn's default ring.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-[var(--color-text-disabled)] [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)] aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80',
        // `text-destructive-foreground`, not `text-white`: in dark mode the
        // destructive surface is a light salmon (`--color-feedback-error`),
        // where white text falls below AA. The token resolves to white in
        // light mode and near-black in dark.
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80',
        outline: 'border border-border bg-secondary text-secondary-foreground hover:bg-accent',
        secondary: 'border border-border bg-secondary text-secondary-foreground hover:bg-accent',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-[var(--color-text-link)] underline-offset-4 hover:underline',
      },
      // Control heights track the §6.2 density modes: 40px comfortable (default),
      // 32px compact (sm). Never below the 36px pointer-target floor for `lg`.
      size: {
        default: 'h-10 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-11 px-6 has-[>svg]:px-4',
        icon: 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
