import { SUGGESTED_SECTIONS } from '@brandfactory/shared'
import { cn } from '@/lib/utils'

export const GUIDELINE_METER_TOTAL = SUGGESTED_SECTIONS.length

/**
 * Soft completeness indicator (D2). Muted dots only — no red/green, no %, no
 * "incomplete" copy. Zero sections is a legitimate brand state.
 *
 * `sectionCount` is row count (not filled-body count). Dots clamp to the
 * suggested total when a brand has more sections than suggestions.
 */
export function GuidelineMeter({ sectionCount }: { sectionCount: number }) {
  const total = GUIDELINE_METER_TOTAL
  const filled = Math.min(Math.max(0, sectionCount), total)
  const label = `${sectionCount} of ${total} guideline sections`

  return (
    <div role="img" aria-label={label} title={label} className="flex items-center gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            'size-1.5 rounded-full',
            i < filled
              ? 'bg-muted-foreground/70'
              : 'border border-muted-foreground/35 bg-transparent',
          )}
        />
      ))}
    </div>
  )
}
