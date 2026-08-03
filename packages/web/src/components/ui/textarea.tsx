import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * `Input`'s multi-line sibling, and deliberately nothing more — same border,
 * radius, placeholder ink, hover, focus outline and invalid treatment, so a
 * form mixing the two reads as one control set.
 *
 * The three differences are all consequences of holding a paragraph rather
 * than a line: a min-height instead of the fixed 40px (§11's comfortable
 * density applies to a control you click, not to one you write in),
 * `py-2` instead of `py-1` to keep the first line off the top border, and
 * `resize-y` — horizontal resize would break out of a dialog's column, while
 * vertical is exactly what someone drafting long copy reaches for.
 */
function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'placeholder:text-tertiary selection:bg-primary selection:text-primary-foreground border-input bg-surface-base flex field-sizing-content min-h-24 w-full min-w-0 resize-y rounded-lg border px-3 py-2 text-sm transition-colors duration-150 outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-[var(--color-text-disabled)]',
        'hover:border-[var(--border-strong)]',
        'focus-visible:border-[var(--border-focus)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]',
        'aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
