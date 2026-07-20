import { cn } from '@/lib/utils'

export type ShortlistMode = 'all' | 'shortlist'

export function ShortlistToggle({
  mode,
  onChange,
  shortlistCount,
}: {
  mode: ShortlistMode
  onChange: (next: ShortlistMode) => void
  shortlistCount: number
}) {
  return (
    <div
      role="tablist"
      aria-label="Canvas filter"
      className="inline-flex rounded-lg border bg-surface-sunken p-0.5 text-xs"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'all'}
        onClick={() => onChange('all')}
        className={cn(
          'rounded-lg px-3 py-1 transition-colors duration-150',
          mode === 'all'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        All blocks
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'shortlist'}
        onClick={() => onChange('shortlist')}
        className={cn(
          'rounded-lg px-3 py-1 transition-colors duration-150',
          mode === 'shortlist'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Shortlist ({shortlistCount})
      </button>
    </div>
  )
}
