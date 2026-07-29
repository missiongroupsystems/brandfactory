import { type BrandAsset, byPosition, colorValue } from '@/demo/assetTypes'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// ColorSwatches — a brand's palette, proposals included
// ---------------------------------------------------------------------------
//
// Rendered in three places by the front-end mockup, which is the point: the
// same row appears in the rail (structure A), under the mark (structure B) and
// on the asset library page (structure C), so the three arrangements differ in
// *placement* and nothing else. Whichever survives review keeps this component.
//
// **`proposed` and `active` must be tellable apart without colour**, because
// colour is the content here — tinting a swatch to say "unsettled" would be
// unreadable on a swatch whose whole job is to show its own value. So the
// distinction is geometry: an active colour fills its box; a proposed one is a
// smaller chip inside a dashed outline of the same footprint.
//
// It is not a warning state. `docs/vision.md:28` says a brand that arrives as a
// rough idea is a legitimate brand, and the `palette-proposed` fixture — two
// colours, both proposed, nothing else — is the exact case that has to read as
// *in progress* rather than as broken. Same rule the rail's unwritten rows
// follow: quiet and dashed, never red.

export interface ColorSwatchesProps {
  colors: readonly BrandAsset[]
  /** `sm` = 20px chips for the identity band; `md` = 28px for the rail. */
  size?: 'sm' | 'md'
  className?: string
}

const BOX = {
  sm: 'size-5 rounded-md',
  md: 'size-7 rounded-lg',
} as const

const CHIP = {
  sm: 'size-2.5 rounded-[3px]',
  md: 'size-3.5 rounded-[4px]',
} as const

export function ColorSwatches({ colors, size = 'md', className }: ColorSwatchesProps) {
  const swatches = [...colors].filter((c) => colorValue(c) !== null).sort(byPosition)
  if (swatches.length === 0) return null

  return (
    <ul className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {swatches.map((c) => {
        const value = colorValue(c) as string
        const proposed = c.status === 'proposed'
        const description = `${c.label} — ${value}${proposed ? ', proposed' : ''}`
        return (
          <li key={c.id} title={description}>
            {proposed ? (
              <span
                className={cn(
                  'flex items-center justify-center border border-dashed border-[var(--border-strong)]',
                  BOX[size],
                )}
              >
                <span className={CHIP[size]} style={{ backgroundColor: value }} />
              </span>
            ) : (
              <span className={cn('block border', BOX[size])} style={{ backgroundColor: value }} />
            )}
            <span className="sr-only">{description}</span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * "4 colours · 2 proposed", or "4 colours". Written out rather than left to the
 * swatches alone: the dashed outline is legible at a glance but not countable,
 * and the count is what tells you whether a palette is settled.
 */
export function paletteSummary(colors: readonly BrandAsset[]): string {
  const swatches = colors.filter((c) => colorValue(c) !== null)
  const proposed = swatches.filter((c) => c.status === 'proposed').length
  const noun = swatches.length === 1 ? 'colour' : 'colours'
  return proposed > 0
    ? `${swatches.length} ${noun} · ${proposed} proposed`
    : `${swatches.length} ${noun}`
}
