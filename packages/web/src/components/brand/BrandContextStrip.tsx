import { Link } from '@tanstack/react-router'
import { brandContextState, type BrandWithSections } from '@brandfactory/shared'
import { BrandMark } from '@/components/brand/BrandMark'
import {
  formatKeyDateRange,
  KEY_DATE_APPEARANCE,
  KEY_DATE_SET_LABELS,
  type KeyDate,
} from '@/lib/key-dates'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// BrandContextStrip — what a modal has to say once it covers the rail
// ---------------------------------------------------------------------------
//
// A dialog that fills the screen takes away the brand rail's answer to *which
// brand is this?* and puts nothing in its place. This strip is that answer, and
// one more the running app can give exactly and gives nowhere today: *how much
// of this brand is actually written down*.
//
// Two rows, because they are two different kinds of fact:
//
//   1. The brand, and the state of its context. True for the whole dialog.
//   2. The key dates on the day in the form. True for one field's value, and
//      it changes when that field does.
//
// **Pure, and it holds no query.** Both facts are already loaded by the page
// that opens the dialog — `useBrand` returns the sections, and `keyDatesForSets`
// runs once per render beside the grid — so this component takes them as props
// and can be rendered in a test without a QueryClient. That is the seam
// `AssetLibraryView` established and `SocialCalendarView` follows.
//
// **Colour is never the only signal.** The chips carry their set name in the
// accessible name, `KeyDateStrip`'s rule verbatim: under simulated protanopia
// the rose and teal inks sit at ΔE 8.4, so the hue is the fast path and never
// the only path.

/** The `Brand context` mini-app, named once. It is the link's destination. */
const CONTEXT_LINK_LABEL = 'Add brand context'

export interface BrandContextStripProps {
  brand: BrandWithSections
  /**
   * The key dates this surface is about, **already selected** by the caller —
   * the dialog narrows to the day in its date field with `keyDatesOnDay`, the
   * planner to its window with `keyDatesInWindow`.
   *
   * The dialog's rule is worth restating because it is the trap: the selection
   * comes from the *field*, never from the seed. That is the difference between
   * a fact and a stale label — change the date and these must follow.
   *
   * Days first, then the seasons running through them, which is the order
   * `keyDatesOnDay` returns them in.
   */
  keyDates?: KeyDate[]
}

export function BrandContextStrip({ brand, keyDates = [] }: BrandContextStripProps) {
  const { written, total } = brandContextState(brand.sections)

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-surface-sunken px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <BrandMark name={brand.name} seed={brand.id} size="sm" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{brand.name}</span>
          <span className="text-xs text-muted-foreground">{contextLine(written, total)}</span>
        </div>
        {/* The way to fix it, offered only when there is something to fix. A
            link out of a dialog does cost whatever is half-typed in the form
            behind it — accepted, because the state that shows this link is the
            state a user reads *before* they start typing, and the alternative
            is naming a problem with no way to act on it. */}
        {written < total || total === 0 ? (
          <Link
            to="/brands/$brandId/context"
            params={{ brandId: brand.id }}
            className="ml-auto shrink-0 text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
          >
            {CONTEXT_LINK_LABEL}
          </Link>
        ) : null}
      </div>

      {/* No empty container on a quiet day: a date with nothing on it renders
          row 1 alone, exactly as the dialog reads without this strip at all. */}
      {keyDates.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {keyDates.map((keyDate) => (
            <li
              key={keyDate.id}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs',
                KEY_DATE_APPEARANCE[keyDate.set].label,
              )}
            >
              <span className="sr-only">{KEY_DATE_SET_LABELS[keyDate.set]}: </span>
              <span className="font-medium">{keyDate.name}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{formatKeyDateRange(keyDate)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The one sentence about how much of the brand is written.
 *
 * Three states, and the third is the trap: a brand with **no sections at all**
 * is `0 of 0`, which as a fraction invites the reader to go looking for rows
 * that do not exist. It reads as *no brand context yet* instead.
 */
function contextLine(written: number, total: number): string {
  if (total === 0 || written === 0) return 'No brand context yet'
  if (written === total) {
    return `Brand context loaded — ${total} ${total === 1 ? 'section' : 'sections'}`
  }
  return `Brand context is thin — ${written} of ${total} sections written`
}
