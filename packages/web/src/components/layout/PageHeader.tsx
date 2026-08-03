import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The top of a content area: what this page is, and the one thing you most
 * likely came to do.
 *
 * **It exists because the shell stopped having a header.** Styleguide §7.1 puts
 * the title and the primary action at the top of the content rather than in a
 * strip, and four routes were each spelling that out — three of them with the
 * same `mb-6 flex items-start justify-between gap-4` and a fourth without, which
 * is how the settings page ended up with a heading a different distance from its
 * first field than every other page in the app.
 *
 * `action` is deliberately a slot rather than a `label` + `onClick` pair: two of
 * the four call sites pass a dialog trigger, not a button, and a component that
 * insisted on the pair would have them render one anyway and wire it themselves.
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  /** A category's glyph, from the mini-app registry. */
  icon?: LucideIcon
  action?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('mb-6 flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
          <span className="min-w-0 truncate">{title}</span>
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-pretty text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}
