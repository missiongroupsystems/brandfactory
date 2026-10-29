'use client'

import * as React from 'react'

import { dayLabel } from '@/lib/dates'
import { report } from '@/lib/remote'

import { dayOf, tooSoon } from './move-post'
import { useBrand } from './posts-store'

/**
 * A drag that moves a post says where it went, with Undo, as the post page's Reschedule does.
 * Undo carries the post back to the day it left; the time of day never changed. A move to today
 * at a time already gone is refused: the post would go out at once.
 */
export function useMoveWithUndo(): (id: string, toDate: string) => boolean {
  const { brand, weeks, byId, movePost } = useBrand()
  // Undo runs later, against the calendar as it is then, not as it was at the drop.
  const latest = React.useRef({ movePost, byId })
  React.useEffect(() => {
    latest.current = { movePost, byId }
  }, [movePost, byId])
  return React.useCallback(
    (id: string, toDate: string) => {
      const passed = (date: string, find: typeof byId) => {
        const time = find(id)?.slot.split(', ')[1]
        return time !== undefined && tooSoon(brand.id, date, time)
      }
      if (passed(toDate, byId)) {
        report('That time today has passed: pick another day')
        return false
      }
      const from = dayOf(weeks, id)
      if (!movePost(id, toDate)) return false
      const undo = (back: string) => () => {
        const now = latest.current
        if (passed(back, now.byId) || !now.movePost(id, back)) report('Could not move it back')
      }
      report(`Moved to ${dayLabel(toDate)}`, from ? { label: 'Undo', run: undo(from) } : undefined)
      return true
    },
    [brand.id, weeks, byId, movePost],
  )
}
