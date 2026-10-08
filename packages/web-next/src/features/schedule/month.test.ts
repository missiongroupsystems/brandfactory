import { describe, expect, it } from 'vitest'

import { contentFor } from '@/data/brands'
import { feedsOf } from '@/data/demo'

import { archiveFor, monthRows, monthView } from './month'

const day = (weeks: ReturnType<typeof monthView>['weeks'], n: string) =>
  weeks.flatMap((w) => w.days).find((d) => d.n === n)!

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
    expect(feedsOf(day(sep.weeks, '16'))).toEqual([{ kind: 'post', postId: ravioli.id }])
    expect(ravioli).toMatchObject({ stage: 'posted', slot: 'Wed 16 Sep, 18:00' })
    expect(day(sep.weeks, '16').past).toBe(true)
  })

  it('marks the holidays a restaurant plans around, on their day', () => {
    const nov = monthView('temper', 2026, 10)
    const first = nov.weeks[0]!
    expect(first.events).toContainEqual({ layer: 'holiday', text: 'Deepavali', col: 7, span: 1 })
    expect(day(nov.weeks, '8').past).toBe(false)
  })
})

describe('the month grid', () => {
  const nums = (days: Array<{ n: string; outside?: boolean }>) =>
    days.map((d) => (d.outside ? `(${d.n})` : d.n)).join(' ')

  it('starts on the 1st: the week before lends its row, its days outside the month dimmed', () => {
    // September's own weeks start on Monday 7 Sep; "September" must still show 1–6 Sep.
    const aug = monthView('casa-vostra', 2026, 7)
    const sep = monthView('casa-vostra', 2026, 8)
    const rows = monthRows(-1, sep.weeks, aug.weeks)
    expect(nums(rows.lead!.days)).toBe('(31) 1 2 3 4 5 6')
    expect(nums(rows.weeks.at(-1)!.days)).toBe('28 29 30 (1) (2) (3) (4)')
    // The lent row keeps what was posted on those days.
    expect(rows.lead!.days[1]).toMatchObject({ n: '1', past: true })
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
        days: nov.weeks[0]!.days,
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
    expect(rows.weeks[0]!.days[0]).toMatchObject({ n: '1' })
  })
})
