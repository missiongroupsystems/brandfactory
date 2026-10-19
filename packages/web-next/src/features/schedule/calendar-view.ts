'use client'

import * as React from 'react'

import { onToday } from '@/lib/dates'

import { ALL_STAGES, type StageFilter } from './calendar-items'
import { todayPlace } from './month'

/**
 * Where the calendar is: its view, the month (0 is the month of this week's Monday), the week
 * inside that month and the day inside that week, and the stage filter. Outside React, so opening
 * a post on its own page and coming back lands on the same view. A reload starts on this week.
 */
export type CalendarMode = 'month' | 'week' | 'day'

export interface CalendarPlace {
  view: CalendarMode
  offset: number
  week: number
  day: number
  stages: StageFilter
}

let place: CalendarPlace = { view: 'week', ...todayPlace(), stages: ALL_STAGES }
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

// The server's today replaces the demo's: the calendar opens on its week.
onToday(() => setCalendarPlace(todayPlace(place.view)))
