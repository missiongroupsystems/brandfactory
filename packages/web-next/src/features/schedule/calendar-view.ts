'use client'

import * as React from 'react'

import { ALL_STAGES, type StageFilter } from './calendar-items'

/**
 * Where the calendar is: its view, the month (0 is the demo's October), the week inside that month
 * and the day inside that week, and the stage filter. Outside React, so opening a post on its own
 * page and coming back lands on the same view. A reload starts on this week, as the demo does.
 */
export type CalendarMode = 'month' | 'week' | 'day'

export interface CalendarPlace {
  view: CalendarMode
  offset: number
  week: number
  day: number
  stages: StageFilter
}

/** Today is Tuesday 6 October: the first week of the demo's month, its second day. */
export const TODAY_PLACE = { offset: 0, week: 0, day: 1 }

let place: CalendarPlace = { view: 'week', ...TODAY_PLACE, stages: ALL_STAGES }
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useCalendarPlace(): CalendarPlace {
  return React.useSyncExternalStore(
    subscribe,
    () => place,
    () => place,
  )
}

export function setCalendarPlace(next: Partial<CalendarPlace>) {
  place = { ...place, ...next }
  listeners.forEach((l) => l())
}
