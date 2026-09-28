import { describe, expect, it } from 'vitest'
import {
  curatedThroughLabel,
  formatKeyDateRange,
  keyDatesByDay,
  keyDatesForSets,
  keyDatesOnDay,
  seasonsInMonth,
  splitByShape,
  staleSets,
  upcomingKeyDates,
  type KeyDate,
  type KeyDateSet,
} from './index'

// Fixtures are built from local `Date` components where a `Date` is needed at
// all, the `calendar.test.ts` convention: nothing here pins `TZ`, and a literal
// UTC instant would make these assertions read differently in Auckland.

const ALL_SETS: readonly KeyDateSet[] = ['global', 'sg-holidays', 'sg-events']

function date(id: string, start: string, end?: string, set: KeyDateSet = 'global'): KeyDate {
  return { id, set, name: id, start, ...(end ? { end } : {}), source: 'test' }
}

describe('keyDatesForSets', () => {
  it('returns nothing when no set is on', () => {
    expect(keyDatesForSets([])).toEqual([])
  })

  it('collapses Christmas Day across the global and holiday sets, keeping global', () => {
    // Both sets carry Christmas by design — each has to stand alone for a brand
    // that enables only one — so with both on it must render once.
    const both = keyDatesForSets(['global', 'sg-holidays'])
    const christmas = both.filter((d) => d.name === 'Christmas Day' && d.start === '2026-12-25')
    expect(christmas).toHaveLength(1)
    // The survivor is the set listed first in `KEY_DATE_SETS`, not the one that
    // happens to sort first by id.
    expect(christmas[0]?.set).toBe('global')
  })

  it('leaves the shared observances intact when only one set is on', () => {
    const holidaysOnly = keyDatesForSets(['sg-holidays'])
    const christmas = holidaysOnly.filter((d) => d.name === 'Christmas Day')
    expect(christmas.map((d) => d.start).sort()).toEqual(['2026-12-25', '2027-12-25'])
    expect(christmas.every((d) => d.set === 'sg-holidays')).toBe(true)
  })

  it('keeps both entries on 9 August 2026 — they are two facts, not one repeated', () => {
    const all = keyDatesForSets(ALL_SETS)
    const ninth = all.filter((d) => d.start === '2026-08-09')
    expect(ninth.map((d) => d.name).sort()).toEqual(['National Day', 'National Day Parade'])
  })

  it('sorts by start, with same-day entries in set order', () => {
    const all = keyDatesForSets(ALL_SETS)
    const starts = all.map((d) => d.start)
    expect(starts).toEqual([...starts].sort())
    // The stable-sort consequence: the holiday reads above the event.
    const ninth = all.filter((d) => d.start === '2026-08-09')
    expect(ninth.map((d) => d.set)).toEqual(['sg-holidays', 'sg-events'])
  })

  it('never returns an entry from a set that is off', () => {
    const global = keyDatesForSets(['global'])
    expect(global.every((d) => d.set === 'global')).toBe(true)
    expect(global.length).toBeGreaterThan(0)
  })
})

describe('splitByShape', () => {
  it('sends a single day to days and an end-bearing entry to seasons', () => {
    const { days, seasons } = splitByShape([
      date('deepavali', '2026-11-08'),
      date('i-light', '2026-06-05', '2026-06-28'),
    ])
    expect(days.map((d) => d.id)).toEqual(['deepavali'])
    expect(seasons.map((d) => d.id)).toEqual(['i-light'])
  })

  it('splits the real dataset without losing or duplicating an entry', () => {
    const all = keyDatesForSets(ALL_SETS)
    const { days, seasons } = splitByShape(all)
    expect(days.length + seasons.length).toBe(all.length)
    expect(days.every((d) => d.end === undefined)).toBe(true)
    expect(seasons.every((d) => d.end !== undefined)).toBe(true)
  })
})

describe('keyDatesByDay', () => {
  it('buckets single days by their key and preserves order within a day', () => {
    const byDay = keyDatesByDay([
      date('national-day', '2026-08-09', undefined, 'sg-holidays'),
      date('ndp', '2026-08-09', undefined, 'sg-events'),
      date('observed', '2026-08-10', undefined, 'sg-holidays'),
    ])
    expect([...byDay.keys()]).toEqual(['2026-08-09', '2026-08-10'])
    expect(byDay.get('2026-08-09')?.map((d) => d.id)).toEqual(['national-day', 'ndp'])
  })

  it('has no key for a day with no key date', () => {
    const byDay = keyDatesByDay([date('deepavali', '2026-11-08')])
    expect(byDay.has('2026-11-07')).toBe(false)
  })
})

describe('seasonsInMonth', () => {
  // `month` is 0-based throughout, matching `Date.prototype.getMonth` and
  // `monthGridDays`. July is 6, August is 7, September is 8.

  it('catches a season that starts before and ends after the whole month', () => {
    // The case that fails if you test only whether `start` falls in the month —
    // and standing in the middle of a season is when you are most likely to be
    // planning inside it. Nothing in the real dataset spans a whole month, so
    // the fixture is constructed.
    const swallowsAugust = date('long-season', '2026-07-20', '2026-09-10')
    expect(seasonsInMonth([swallowsAugust], 2026, 7).map((d) => d.id)).toEqual(['long-season'])
  })

  it('catches a season overlapping either edge of the month', () => {
    const endsInside = date('grillfest', '2026-07-23', '2026-08-16')
    const startsInside = date('night-festival', '2026-08-21', '2026-09-05')
    expect(seasonsInMonth([endsInside, startsInside], 2026, 7).map((d) => d.id)).toEqual([
      'grillfest',
      'night-festival',
    ])
    // and each shows up in its other month too
    expect(seasonsInMonth([endsInside], 2026, 6)).toHaveLength(1)
    expect(seasonsInMonth([startsInside], 2026, 8)).toHaveLength(1)
  })

  it('includes a season touching only the first or last day of the month', () => {
    expect(seasonsInMonth([date('a', '2026-07-01', '2026-08-01')], 2026, 7)).toHaveLength(1)
    expect(seasonsInMonth([date('b', '2026-08-31', '2026-09-30')], 2026, 7)).toHaveLength(1)
  })

  it('excludes a season that misses the month by a day at either end', () => {
    expect(seasonsInMonth([date('a', '2026-06-01', '2026-07-31')], 2026, 7)).toEqual([])
    expect(seasonsInMonth([date('b', '2026-09-01', '2026-09-30')], 2026, 7)).toEqual([])
  })

  it('finds the Hungry Ghost month in both August and September 2026', () => {
    const { seasons } = splitByShape(keyDatesForSets(['sg-holidays']))
    const inAugust = seasonsInMonth(seasons, 2026, 7).map((d) => d.name)
    const inSeptember = seasonsInMonth(seasons, 2026, 8).map((d) => d.name)
    expect(inAugust).toContain('Hungry Ghost Festival')
    expect(inSeptember).toContain('Hungry Ghost Festival')
  })
})

describe('keyDatesOnDay', () => {
  const nationalDay = date('national-day', '2026-08-09')
  const deepavali = date('deepavali', '2026-11-08')
  const hungryGhost = date('hungry-ghost', '2026-08-08', '2026-09-06')

  const dates = [nationalDay, deepavali, hungryGhost]

  it('matches a single day only on its own key', () => {
    expect(keyDatesOnDay(dates, '2026-08-09').days.map((d) => d.id)).toEqual(['national-day'])
    expect(keyDatesOnDay(dates, '2026-08-10').days).toEqual([])
  })

  it('returns a season on its first, a middle and its last day', () => {
    for (const day of ['2026-08-08', '2026-08-20', '2026-09-06']) {
      expect(
        keyDatesOnDay(dates, day).seasons.map((d) => d.id),
        day,
      ).toEqual(['hungry-ghost'])
    }
  })

  it('drops a season the day after it ends, and the day before it starts', () => {
    expect(keyDatesOnDay(dates, '2026-09-07').seasons).toEqual([])
    expect(keyDatesOnDay(dates, '2026-08-07').seasons).toEqual([])
  })

  it('keeps the two claims apart — a day inside a season is both, separately', () => {
    // 9 August 2026 is National Day *and* sits inside the Hungry Ghost month.
    // Two facts, and a caller that renders them alike can still concatenate.
    const onNationalDay = keyDatesOnDay(dates, '2026-08-09')
    expect(onNationalDay.days.map((d) => d.id)).toEqual(['national-day'])
    expect(onNationalDay.seasons.map((d) => d.id)).toEqual(['hungry-ghost'])
  })

  it('matches nothing for an empty day key', () => {
    // What an empty date field in a form must show: no chips, rather than
    // every season in the set.
    expect(keyDatesOnDay(dates, '')).toEqual({ days: [], seasons: [] })
  })
})

describe('upcomingKeyDates', () => {
  const dates = [
    date('yesterday', '2026-08-05'),
    date('today', '2026-08-06'),
    date('tomorrow', '2026-08-07'),
    date('next-week', '2026-08-13'),
    date('next-month', '2026-09-01'),
  ]
  /** Local noon on 6 August 2026 — built from components, not an ISO literal. */
  const now = new Date(2026, 7, 6, 12, 0)

  it('includes today and excludes yesterday', () => {
    expect(upcomingKeyDates(dates, now, 10).map((d) => d.id)).toEqual([
      'today',
      'tomorrow',
      'next-week',
      'next-month',
    ])
  })

  it('honours the limit', () => {
    expect(upcomingKeyDates(dates, now, 2).map((d) => d.id)).toEqual(['today', 'tomorrow'])
    expect(upcomingKeyDates(dates, now, 0)).toEqual([])
  })

  it('keeps a season you are standing in the middle of', () => {
    // The reason the test is `end ?? start`: a four-week ghost month you are
    // three days into is still the most relevant thing on the list.
    const ongoing = date('hungry-ghost', '2026-08-01', '2026-08-28')
    expect(upcomingKeyDates([ongoing], now, 5).map((d) => d.id)).toEqual(['hungry-ghost'])
  })

  it('drops a season that has already finished', () => {
    expect(upcomingKeyDates([date('over', '2026-07-01', '2026-08-05')], now, 5)).toEqual([])
  })

  it('returns them in date order regardless of input order', () => {
    const shuffled = [...dates].reverse()
    expect(upcomingKeyDates(shuffled, now, 10).map((d) => d.id)).toEqual([
      'today',
      'tomorrow',
      'next-week',
      'next-month',
    ])
  })

  it('returns nothing for an unusable now rather than throwing', () => {
    expect(upcomingKeyDates(dates, new Date('nonsense'), 5)).toEqual([])
  })
})

describe('staleSets', () => {
  it('names the events set once the month is past its horizon', () => {
    expect(staleSets(ALL_SETS, 2027, 10)).toEqual(['sg-events'])
  })

  it('says nothing while every enabled set still has data', () => {
    // December 2026: the events set is curated to the 31st, and the comparison
    // is against the month's *first* day, so a half-covered month does not nag.
    expect(staleSets(ALL_SETS, 2026, 11)).toEqual([])
  })

  it('names every set once the month is past all three horizons', () => {
    expect(staleSets(ALL_SETS, 2028, 0)).toEqual(['global', 'sg-holidays', 'sg-events'])
  })

  it('never names a set that is switched off', () => {
    expect(staleSets(['global'], 2027, 10)).toEqual([])
    expect(staleSets([], 2028, 0)).toEqual([])
  })

  it('reports in KEY_DATE_SETS order, not the order the user toggled', () => {
    expect(staleSets(['sg-events', 'global', 'sg-holidays'], 2028, 0)).toEqual([
      'global',
      'sg-holidays',
      'sg-events',
    ])
  })
})

describe('curatedThroughLabel', () => {
  it('names the month each set runs out in', () => {
    expect(curatedThroughLabel('sg-events')).toBe('December 2026')
    expect(curatedThroughLabel('global')).toBe('December 2027')
  })

  it('gives month precision even when the set ends mid-month', () => {
    // `sg-holidays` stops on Christmas Day because that is the last gazetted
    // holiday, not because the 26th is missing. "Curated through 25 December
    // 2027" would invite a question whose honest answer is "there are no more
    // rows".
    expect(curatedThroughLabel('sg-holidays')).toBe('December 2027')
  })
})

describe('formatKeyDateRange', () => {
  it('renders a single day as one date', () => {
    expect(formatKeyDateRange(date('x', '2026-11-08'))).toBe('8 Nov')
  })

  it('renders a range inside one month without repeating the month', () => {
    expect(formatKeyDateRange(date('x', '2026-06-05', '2026-06-28'))).toBe('5–28 Jun')
  })

  it('renders a range across two months with both months', () => {
    expect(formatKeyDateRange(date('x', '2026-07-23', '2026-08-16'))).toBe('23 Jul – 16 Aug')
  })

  it('renders a range across two years with both years', () => {
    // Nothing in the dataset does this today, but a range that silently dropped
    // the year would be a lie the moment one did.
    expect(formatKeyDateRange(date('x', '2026-12-18', '2027-01-03'))).toBe(
      '18 Dec 2026 – 3 Jan 2027',
    )
  })

  it('returns an empty string for an unparseable start', () => {
    expect(formatKeyDateRange(date('x', 'not-a-day'))).toBe('')
  })

  it('falls back to the start alone when the end will not parse', () => {
    expect(formatKeyDateRange(date('x', '2026-06-05', '2026-06-31'))).toBe('5 Jun')
  })
})
