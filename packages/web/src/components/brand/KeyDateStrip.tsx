import {
  formatKeyDateRange,
  KEY_DATE_APPEARANCE,
  KEY_DATE_SET_LABELS,
  type KeyDate,
} from '@/lib/key-dates'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// KeyDateStrip — the seasons, above the grid rather than inside it
// ---------------------------------------------------------------------------
//
// **A season is a property of the month, so that is where it goes.** The
// alternative — painting a marker into every cell a season covers — would put a
// pill on 29 of August's 31 days, because the Hungry Ghost month and the
// Singapore Night Festival overlap there, and bury the posts the grid exists to
// show.
//
// The other alternative, rendering a season on its first day only, was rejected
// for the opposite reason: the event vanishes the moment you land mid-season,
// and mid-season is when you are most likely to be planning inside it.
//
// Pure, and renders `null` for an empty list rather than an empty container —
// a month with no seasons is unchanged, which is what lets Phase D's diff be
// read as "what changed" rather than "what was rethreaded".

export function KeyDateStrip({ seasons }: { seasons: KeyDate[] }) {
  if (seasons.length === 0) return null

  return (
    <ul className="mt-3 flex flex-wrap gap-1.5">
      {seasons.map((season) => (
        <li
          key={season.id}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs',
            KEY_DATE_APPEARANCE[season.set].label,
          )}
        >
          {/* The set is named for a screen reader and for anyone who cannot
              separate the three hues — Phase B measured rose and teal at ΔE 8.4
              under protanopia, so the colour is the fast path, never the only
              one. Visually hidden rather than rendered: the band already says
              which set it is in colour, and three extra words per band would
              crowd a strip that can carry four of them. */}
          <span className="sr-only">{KEY_DATE_SET_LABELS[season.set]}: </span>
          <span className="font-medium">{season.name}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{formatKeyDateRange(season)}</span>
        </li>
      ))}
    </ul>
  )
}
