import { describe, expect, it } from 'vitest'

import { contentFor } from '@/data/brands'
import { WEEKS } from '@/data/demo'

import { dayIndex, dayLabel, dayOfHook, landingDay, slotOfHook } from './calendar-slot'

describe('dayLabel', () => {
  it('names the day, and knows the month turns after 31', () => {
    expect(dayLabel(WEEKS, '20')).toBe('Tue 20 Oct')
    expect(dayLabel(WEEKS, '1')).toBe('Sun 1 Nov')
    expect(dayLabel(WEEKS, '99')).toBeNull()
    expect(dayIndex(WEEKS, '12')).toBe(7)
  })
})

describe('dayOfHook', () => {
  it('finds an idea tile by its hook, and a post by its hook', () => {
    const { posts } = contentFor('casa-vostra')
    const hookOf = (id: string) => posts.find((p) => p.id === id)?.hook
    expect(dayOfHook(WEEKS, 'Blindfold pizza: the rematch.', hookOf)).toBe('23')
    expect(slotOfHook(WEEKS, 'Five pastas, one dough.', hookOf)).toBe('Fri 30 Oct')
    expect(slotOfHook(WEEKS, 'Not on the calendar', hookOf)).toBeNull()
  })
})

describe('landingDay', () => {
  it('takes the day asked for when it is ahead and holds no post', () => {
    expect(landingDay(WEEKS, '10')).toBe('10')
    // A post sits on 13; the idea lands on the first empty day after this week instead.
    expect(landingDay(WEEKS, '13')).toBe('12')
    // Today and the past are never asked for.
    expect(landingDay(WEEKS, '6')).toBe('12')
  })

  it('leaves this week alone, since a shoot needs lead time', () => {
    expect(landingDay(WEEKS)).toBe('12')
  })
})
