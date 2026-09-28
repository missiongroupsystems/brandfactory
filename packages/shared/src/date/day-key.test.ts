import { describe, expect, it } from 'vitest'
import { dayKeyToDate, localDayKey, monthLabel } from './day-key'

describe('localDayKey', () => {
  it('reads the local calendar day, not the UTC one', () => {
    // 23:30 local on 3 August is 4 August in UTC east of Greenwich and 3 August
    // west of it. The key follows the reader either way, which is the whole
    // point — `toISOString().slice(0, 10)` would not.
    const late = new Date(2026, 7, 3, 23, 30)
    expect(localDayKey(late)).toBe('2026-08-03')
    expect(localDayKey(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01')
    expect(localDayKey(new Date(2026, 11, 31, 12, 0))).toBe('2026-12-31')
  })

  it('returns an empty key for an invalid date rather than "NaN-aN-aN"', () => {
    expect(localDayKey(new Date('nonsense'))).toBe('')
  })
})

describe('dayKeyToDate', () => {
  it('round-trips a key through local midnight', () => {
    const date = dayKeyToDate('2026-08-03')
    expect(date && localDayKey(date)).toBe('2026-08-03')
    expect(date?.getHours()).toBe(0)
  })

  it.each(['', '2026-8-3', '03/08/2026', 'today', '2026-13-01', '2026-02-30'])(
    'refuses %s',
    (input) => {
      // The last two matter most: the `Date` constructor would silently
      // normalise them into January and March respectively, and a calendar
      // that answers a nonsense day with a real one is worse than one that
      // answers nothing.
      expect(dayKeyToDate(input)).toBeNull()
    },
  )
})

describe('monthLabel', () => {
  it('names the month and the year', () => {
    expect(monthLabel(2026, 7)).toBe('August 2026')
    expect(monthLabel(2026, 0)).toBe('January 2026')
  })
})
