import { CalendarHeart } from 'lucide-react'
import {
  KEY_DATE_APPEARANCE,
  KEY_DATE_SETS,
  KEY_DATE_SET_DESCRIPTIONS,
  KEY_DATE_SET_LABELS,
  type KeyDateSet,
} from '@/lib/key-dates'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// KeyDatesMenu — which borrowed dates the calendar shows
// ---------------------------------------------------------------------------
//
// Pure: it renders `enabled` and calls `onChange`. `SocialCalendarPage` owns
// the state and the `localStorage` write, the same seam every other control on
// this surface uses.
//
// Three checkbox items rather than a segmented control or three separate
// toggles: the sets are independent, any combination is valid, and a menu keeps
// four affordances out of a header that already carries a view toggle and a
// primary button. `DropdownMenuCheckboxItem` is already built and exported, so
// this needs no new primitive and no new dependency.

export interface KeyDatesMenuProps {
  enabled: KeyDateSet[]
  onChange: (sets: KeyDateSet[]) => void
}

export function KeyDatesMenu({ enabled, onChange }: KeyDatesMenuProps) {
  /**
   * Toggling one set leaves the other two exactly as they were.
   *
   * Rebuilt by filtering `KEY_DATE_SETS` rather than by pushing onto or
   * splicing `enabled`, so the result is always in canonical order and always a
   * new array — the same ordering `getEnabledSets` returns, so a toggle and a
   * reload cannot disagree about what "on" looks like.
   */
  const toggle = (set: KeyDateSet, checked: boolean) => {
    const next = new Set(enabled)
    if (checked) next.add(set)
    else next.delete(set)
    onChange(KEY_DATE_SETS.filter((s) => next.has(s)))
  }

  const count = enabled.length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          // The bare numeral reads as "Key dates 1" to a screen reader, which
          // is a count of nothing in particular. Spelling it out keeps the
          // visible label inside the accessible name (WCAG 2.5.3) while saying
          // what the number counts.
          aria-label={count > 0 ? `Key dates, ${count} of ${KEY_DATE_SETS.length} on` : undefined}
        >
          <CalendarHeart className="size-4" aria-hidden="true" />
          Key dates
          {/* The count is the only thing that says a set is on without opening
              the menu, so it is a numeral rather than a dot. */}
          {count > 0 ? <span className="text-tertiary tabular-nums">{count}</span> : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Key dates</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {KEY_DATE_SETS.map((set) => (
          <DropdownMenuCheckboxItem
            key={set}
            checked={enabled.includes(set)}
            onCheckedChange={(checked) => toggle(set, checked === true)}
            // The menu stays open: switching two sets on is one gesture, and a
            // menu that closed on each pick would make it three.
            onSelect={(event) => event.preventDefault()}
          >
            <span className="flex items-start gap-2">
              <span
                className={cn('mt-1 size-2.5 shrink-0 rounded-full', KEY_DATE_APPEARANCE[set].dot)}
                aria-hidden="true"
              />
              <span className="flex flex-col">
                <span>{KEY_DATE_SET_LABELS[set]}</span>
                {/* The label carries the set; this line carries what is
                    actually in it. "Singapore holidays" does not tell you
                    Thaipusam and the Hungry Ghost month are inside, and a
                    longer label would not either. */}
                <span className="text-tertiary text-xs">{KEY_DATE_SET_DESCRIPTIONS[set]}</span>
              </span>
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
