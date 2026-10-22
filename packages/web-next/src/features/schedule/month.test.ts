import { describe, expect, it } from 'vitest'

import { contentFor } from '@/data/brands'
import { feedsOf } from '@/data/demo'

import { DEMO_TODAY, setToday } from '@/lib/dates'

import {
  archiveFor,
  monthAt,
  monthRows,
  monthTitle,
  monthView,
  todayPlace,
  withYear,
} from './month'

const day = (weeks: ReturnType<typeof monthView>['weeks'], date: string) =>
  weeks.flatMap((w) => w.days).find((d) => d.date === date)!

describe('months beyond the demo', () => {
  it('shows the weeks whose Monday is in the month, so months meet without overlap', () => {
    // October's own data runs 5 Oct – 1 Nov; September must end the day before.
    const sep = monthView('casa-vostra', 2026, 8)
    expect(sep.range).toBe('7 SEP – 4 OCT · WK 37–40')
    expect(sep.weeks).toHaveLength(4)
    const nov = monthView('casa-vostra', 2026, 10)
    expect(nov.range).toBe('2 NOV – 6 DEC · WK 45–49')
  })

  it('draws what the brand posted on the day it went out, and marks the past', () => {
    const sep = monthView('casa-vostra', 2026, 8)
    const ravioli = archiveFor('casa-vostra').find((p) => p.hook === 'Ravioli, filled by hand.')!
    expect(feedsOf(day(sep.weeks, '2026-09-16'))).toEqual([{ kind: 'post', postId: ravioli.id }])
    expect(ravioli).toMatchObject({ stage: 'posted', slot: 'Wed 16 Sep, 18:00' })
    expect(day(sep.weeks, '2026-09-16').past).toBe(true)
  })

  it('marks the holidays a restaurant plans around, on their day', () => {
    const nov = monthView('temper', 2026, 10)
    const first = nov.weeks[0]!
    expect(first.events).toContainEqual({ layer: 'holiday', text: 'Deepavali', col: 7, span: 1 })
    expect(day(nov.weeks, '2026-11-08').past).toBeFalsy()
  })
})

describe('the month grid', () => {
  const nums = (days: Array<{ date: string; outside?: boolean }>) =>
    days
      .map((d) => (d.outside ? `(${Number(d.date.slice(8))})` : Number(d.date.slice(8))))
      .join(' ')

  it('starts on the 1st: the week before lends its row, its days outside the month dimmed', () => {
    // September's own weeks start on Monday 7 Sep; "September" must still show 1–6 Sep.
    const aug = monthView('casa-vostra', 2026, 7)
    const sep = monthView('casa-vostra', 2026, 8)
    const rows = monthRows(-1, sep.weeks, aug.weeks)
    expect(nums(rows.lead!.days)).toBe('(31) 1 2 3 4 5 6')
    expect(nums(rows.weeks.at(-1)!.days)).toBe('28 29 30 (1) (2) (3) (4)')
    // The lent row keeps what was posted on those days.
    expect(rows.lead!.days[1]).toMatchObject({ date: '2026-09-01', past: true })
  })

  it("lends November the demo's own last October week, with only 1 Nov inside the month", () => {
    const oct = contentFor('casa-vostra').weeks
    const nov = monthView('casa-vostra', 2026, 10)
    const rows = monthRows(1, nov.weeks, oct)
    expect(nums(rows.lead!.days)).toBe('(26) (27) (28) (29) (30) (31) 1')
    // The October days keep their posts in the data; the grid only dims them.
    expect(rows.lead!.days[6]).toEqual({ ...oct.at(-1)!.days[6] })
  })

  it('keeps only the part of an event inside the month', () => {
    const nov = monthView('casa-vostra', 2026, 10)
    const before = [
      {
        label: 'WK 44',
        days: contentFor('casa-vostra').weeks.at(-1)!.days,
        events: [
          { layer: 'holiday' as const, text: 'Halloween', col: 6, span: 1 },
          { layer: 'city' as const, text: 'Festival', col: 5, span: 3 },
        ],
      },
    ]
    const rows = monthRows(1, nov.weeks, before)
    expect(rows.lead!.events).toEqual([{ layer: 'city', text: 'Festival', col: 7, span: 1 }])
  })

  it('lends no row when the 1st is a Monday', () => {
    // June 2026 starts on a Monday.
    const may = monthView('casa-vostra', 2026, 4)
    const jun = monthView('casa-vostra', 2026, 5)
    const rows = monthRows(-4, jun.weeks, may.weeks)
    expect(rows.lead).toBeUndefined()
    expect(rows.weeks[0]!.days[0]).toMatchObject({ date: '2026-06-01' })
  })
})

describe('today', () => {
  it("counts the months from this week's Monday, so a reload opens on today's week", () => {
    expect(monthAt(0)).toEqual({ year: 2026, month: 9 })
    expect(todayPlace()).toEqual({ offset: 0, week: 0, day: 1 })
    try {
      // Tuesday 3 November: its own month, the first week, the second day.
      setToday('2026-11-03')
      expect(monthAt(0)).toEqual({ year: 2026, month: 10 })
      expect(todayPlace()).toEqual({ offset: 0, week: 0, day: 1 })
      // Sunday 1 November sits in the week of Monday 26 October, so October is still home.
      setToday('2026-11-01')
      expect(monthAt(0)).toEqual({ year: 2026, month: 9 })
      expect(todayPlace()).toEqual({ offset: 0, week: 3, day: 6 })
    } finally {
      setToday(DEMO_TODAY)
    }
  })

  it("shows today's own month in the month view, before the month's first Monday too", () => {
    try {
      // Thu 1 Oct 2026 sits in the week of Mon 28 Sep: September's week, October's day.
      setToday('2026-10-01')
      expect(todayPlace()).toEqual({ offset: 0, week: 3, day: 3 })
      expect(todayPlace('month')).toMatchObject({ offset: 1 })
      expect(monthAt(todayPlace('month').offset)).toEqual({ year: 2026, month: 9 })
      // An ordinary day: the same month either way, and the week it is in.
      setToday('2026-10-14')
      expect(todayPlace('month')).toEqual({ offset: 0, week: 1, day: 2 })
    } finally {
      setToday(DEMO_TODAY)
    }
  })

  it('marks a holiday that moves each year only in the year its date is known for', () => {
    const has = (year: number) =>
      monthView('casa-vostra', year, 10)
        .weeks.flatMap((w) => w.events)
        .some((e) => e.text === 'Deepavali')
    expect(has(2026)).toBe(true)
    expect(has(2027)).toBe(false)
  })

  it('titles a month across a year end with its ISO weeks', () => {
    expect(monthTitle(2026, 11)).toEqual({ title: 'December', range: '7 DEC – 3 JAN · WK 50–53' })
    expect(monthTitle(2027, 0).range).toBe('4 JAN – 31 JAN · WK 1–4')
  })
})

describe('the calendar title', () => {
  // Imported posts reach back years: a bare "October" or "27 Apr – 3 May" could be any year.
  it('names the year only when the period is not in this year', () => {
    expect(withYear('October', '2026-10-05', '2026-10-22')).toBe('October')
    expect(withYear('27 Apr – 3 May', '2026-05-03', '2026-10-22')).toBe('27 Apr – 3 May')
    expect(withYear('27 Apr – 3 May', '2025-05-03', '2026-10-22')).toBe('27 Apr – 3 May 2025')
    expect(withYear('28 Dec – 3 Jan', '2027-01-03', '2026-10-22')).toBe('28 Dec – 3 Jan 2027')
  })
})
