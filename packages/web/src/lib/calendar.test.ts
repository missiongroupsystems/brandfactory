import { describe, expect, it } from 'vitest'
import type { SocialPost } from '@brandfactory/shared'
import {
  DEFAULT_POST_TIME,
  dayKeyToDate,
  formatDayHeading,
  formatTimeOfDay,
  groupByDay,
  isoToLocalParts,
  localDayKey,
  localPartsToIso,
  monthGridDays,
  monthLabel,
  shiftMonth,
} from './calendar'

// ---------------------------------------------------------------------------
// Every assertion here is timezone-agnostic, on purpose
// ---------------------------------------------------------------------------
//
// The suite runs under whatever `TZ` the machine has — nothing pins it, and
// pinning it would hide the exact class of bug this module exists to avoid.
// So no test writes a literal UTC instant and expects a particular local day.
// Instead fixtures are built from **local** components (`new Date(2026, 7, 3,
// 9, 0)`) and converted to ISO for the wire, which is the same round trip the
// app performs, and reads the same in Auckland as in Los Angeles.

const STAMPS = {
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} as const

/** A post scheduled at a **local** wall-clock time, stated as the wire would. */
function postAt(id: string, local: Date | null): SocialPost {
  return {
    id: id as SocialPost['id'],
    brandId: 'b-1' as SocialPost['brandId'],
    platform: 'instagram',
    scheduledAt: local === null ? null : local.toISOString(),
    body: '',
    status: 'draft',
    assetIds: [],
    deletedAt: null,
    ...STAMPS,
  }
}

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

describe('monthGridDays', () => {
  it('starts on the Monday on or before the 1st and fills whole weeks', () => {
    const days = monthGridDays(2026, 7) // August 2026 — the 1st is a Saturday
    expect(days.length % 7).toBe(0)
    expect(days[0]?.getDay()).toBe(1)
    expect(days[days.length - 1]?.getDay()).toBe(0)
    expect(localDayKey(days[0]!)).toBe('2026-07-27')
  })

  it('contains every day of the month exactly once', () => {
    const days = monthGridDays(2026, 7)
    const own = days.filter((d) => d.getMonth() === 7).map(localDayKey)
    expect(own).toHaveLength(31)
    expect(new Set(own).size).toBe(31)
    expect(own[0]).toBe('2026-08-01')
    expect(own[30]).toBe('2026-08-31')
  })

  it('needs no leading pad when the 1st is itself a Monday', () => {
    const days = monthGridDays(2026, 5) // June 2026 starts on a Monday
    expect(localDayKey(days[0]!)).toBe('2026-06-01')
  })

  it('knows February in a leap year and in an ordinary one', () => {
    const leap = monthGridDays(2028, 1).filter((d) => d.getMonth() === 1)
    const plain = monthGridDays(2026, 1).filter((d) => d.getMonth() === 1)
    expect(leap).toHaveLength(29)
    expect(plain).toHaveLength(28)
  })

  it('wraps the year at both ends', () => {
    // What `shiftMonth` hands back after ‹ from January and › from December.
    const dec = monthGridDays(2026, -1).filter((d) => d.getMonth() === 11)
    const jan = monthGridDays(2026, 12).filter((d) => d.getMonth() === 0)
    expect(localDayKey(dec[0]!)).toBe('2025-12-01')
    expect(localDayKey(jan[0]!)).toBe('2027-01-01')
  })

  // The DST test that works in every zone: whatever the local rules, the cells
  // must be consecutive *calendar* days. Millisecond arithmetic across a
  // spring-forward boundary repeats or skips one, and this catches it without
  // the suite having to know which March Sunday any given zone moves on.
  it.each([2, 9])('advances one calendar day per cell across month %i', (month) => {
    const days = monthGridDays(2026, month)
    for (let i = 1; i < days.length; i++) {
      const previous = days[i - 1]!
      const expected = new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() + 1)
      expect(localDayKey(days[i]!)).toBe(localDayKey(expected))
    }
  })
})

describe('shiftMonth', () => {
  it.each([
    [{ year: 2026, month: 0 }, -1, { year: 2025, month: 11 }],
    [{ year: 2026, month: 11 }, 1, { year: 2027, month: 0 }],
    [{ year: 2026, month: 7 }, 0, { year: 2026, month: 7 }],
    [{ year: 2026, month: 1 }, 12, { year: 2027, month: 1 }],
  ])('%o shifted by %i', (cursor, delta, expected) => {
    expect(shiftMonth(cursor, delta)).toEqual(expected)
  })
})

describe('groupByDay', () => {
  it('buckets UTC timestamps by the reader’s local day', () => {
    const morning = postAt('p-1', new Date(2026, 7, 3, 9, 0))
    const evening = postAt('p-2', new Date(2026, 7, 3, 23, 30))
    const next = postAt('p-3', new Date(2026, 7, 4, 8, 0))
    const grouped = groupByDay([morning, evening, next])
    expect([...grouped.keys()]).toEqual(['2026-08-03', '2026-08-04'])
    expect(grouped.get('2026-08-03')?.map((p) => p.id)).toEqual(['p-1', 'p-2'])
  })

  it('leaves unscheduled posts out entirely — they are the tray, not a day', () => {
    const grouped = groupByDay([postAt('p-1', null), postAt('p-2', new Date(2026, 7, 3, 9, 0))])
    expect([...grouped.keys()]).toEqual(['2026-08-03'])
    expect([...grouped.values()].flat()).toHaveLength(1)
  })

  it('drops a post whose timestamp will not parse rather than inventing a cell', () => {
    const broken = { ...postAt('p-1', null), scheduledAt: 'not a timestamp' }
    expect(groupByDay([broken]).size).toBe(0)
  })

  it('preserves input order, so a bySchedule list comes back chronological', () => {
    const ordered = [
      postAt('p-1', new Date(2026, 7, 3, 9, 0)),
      postAt('p-2', new Date(2026, 7, 3, 14, 0)),
      postAt('p-3', new Date(2026, 7, 10, 9, 0)),
    ]
    const grouped = groupByDay(ordered)
    expect([...grouped.keys()]).toEqual(['2026-08-03', '2026-08-10'])
    expect(grouped.get('2026-08-03')?.map((p) => p.id)).toEqual(['p-1', 'p-2'])
  })
})

describe('the dialog’s converters', () => {
  it('round-trips a local slot through the wire and back', () => {
    const iso = localPartsToIso('2026-08-03', '14:45')
    expect(iso).not.toBeNull()
    expect(isoToLocalParts(iso!)).toEqual({ date: '2026-08-03', time: '14:45' })
  })

  it('treats a cleared date as unscheduled, not as an error', () => {
    // The unschedule gesture *is* clearing the field, so `null` has to be a
    // return value rather than a refusal.
    expect(localPartsToIso('', '09:00')).toBeNull()
    expect(localPartsToIso('   ', '')).toBeNull()
  })

  it('fills a blank time with the default slot rather than midnight', () => {
    expect(isoToLocalParts(localPartsToIso('2026-08-03', '')!).time).toBe(DEFAULT_POST_TIME)
  })

  it('zeroes seconds — nobody schedules a post at 09:00:37', () => {
    expect(localPartsToIso('2026-08-03', '09:00')).toMatch(/:00\.000Z$/)
  })

  it.each(['2026-08-03T09:00', '2026-13-01', 'tomorrow'])('refuses the date %s', (date) => {
    expect(localPartsToIso(date, '09:00')).toBeNull()
  })

  it.each(['25:00', '09:71', 'noon'])('refuses the time %s', (time) => {
    expect(localPartsToIso('2026-08-03', time)).toBeNull()
  })

  it('reads an unparseable timestamp as unscheduled rather than as a bad slot', () => {
    expect(isoToLocalParts('nonsense')).toEqual({ date: '', time: '' })
  })
})

describe('display helpers', () => {
  it('labels a month with its year', () => {
    expect(monthLabel(2026, 7)).toBe('August 2026')
    expect(monthLabel(2026, 0)).toBe('January 2026')
  })

  it('renders a post’s local time in 24h, matching the dialog’s field', () => {
    const iso = new Date(2026, 7, 3, 23, 30).toISOString()
    expect(formatTimeOfDay(iso)).toBe('23:30')
    expect(formatTimeOfDay(iso)).toBe(isoToLocalParts(iso).date && isoToLocalParts(iso).time)
  })

  describe('formatDayHeading', () => {
    const now = new Date(2026, 7, 3, 12, 0)

    it.each([
      ['2026-08-03', 'Today'],
      ['2026-08-04', 'Tomorrow'],
      ['2026-08-02', 'Yesterday'],
    ])('names %s as %s', (key, expected) => {
      expect(formatDayHeading(key, now)).toBe(expected)
    })

    it('dates anything further out, without the year inside the current one', () => {
      expect(formatDayHeading('2026-08-10', now)).toBe('Mon 10 Aug')
    })

    it('states the year once it differs — its absence would read as this year', () => {
      expect(formatDayHeading('2027-01-04', now)).toBe('Mon 4 Jan 2027')
    })

    it('crosses a month boundary without claiming tomorrow', () => {
      const eve = new Date(2026, 7, 31, 12, 0)
      expect(formatDayHeading('2026-09-01', eve)).toBe('Tomorrow')
    })

    it('returns nothing for a key it cannot read', () => {
      expect(formatDayHeading('later', now)).toBe('')
    })
  })
})
