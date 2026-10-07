import { describe, expect, it } from 'vitest'

import { feedsOf } from '@/data/demo'

import { archiveFor, monthView } from './month'

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
