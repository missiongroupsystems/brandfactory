import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      // §11: 40px tall (comfortable density), 8px radius, a 1px --border-input
      // boundary that clears 3:1 (§3.4 — the hairline is for dividers, not for
      // interactive control edges), placeholder in tertiary text.
      className={cn(
        'file:text-foreground placeholder:text-tertiary selection:bg-primary selection:text-primary-foreground border-input bg-surface-base flex h-10 w-full min-w-0 rounded-lg border px-3 py-1 text-sm transition-colors duration-150 outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-[var(--color-text-disabled)]',
        'hover:border-[var(--border-strong)]',
        'focus-visible:border-[var(--border-focus)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]',
        'aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
