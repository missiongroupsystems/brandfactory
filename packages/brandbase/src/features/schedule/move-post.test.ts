import { describe, expect, it } from 'vitest'

import { POSTS, WEEKS, feedsOf } from '@/data/demo'

import { dayOf, movePost, moveRefusal, slotFor } from './move-post'

const crust = POSTS.find((p) => p.id === 'crust')!

describe('moving a post to another day', () => {
  it('takes the post off its day and puts it on the new one', () => {
    expect(dayOf(WEEKS, 'crust')).toBe('8')
    const weeks = movePost(WEEKS, POSTS, 'crust', '7')
    expect(dayOf(weeks, 'crust')).toBe('7')
    // Thursday kept the other post it held.
    const thu = weeks.flatMap((w) => w.days).find((d) => d.n === '8')!
    expect(feedsOf(thu)).toEqual([{ kind: 'post', postId: 'ravioli' }])
  })

  // The drawer reads the slot, so a tile moved from Thursday to Wednesday must open on Wednesday.
  it('moves the slot with the tile and keeps the time', () => {
    expect(slotFor(WEEKS, '7', crust.slot)).toEqual({
      slot: 'Wed 7 Oct, 18:00',
      slotShort: 'Wed, 18:00',
    })
    expect(slotFor(WEEKS, '1', crust.slot).slot).toBe('Sun 1 Nov, 18:00')
  })

  it('refuses a past day, the same day and a post that is already live', () => {
    expect(moveRefusal(WEEKS, crust, '5')).toBe('past')
    expect(moveRefusal(WEEKS, crust, '8')).toBe('same-day')
    expect(moveRefusal(WEEKS, { ...crust, stage: 'posted' }, '9')).toBe('posted')
    expect(moveRefusal(WEEKS, crust, '9')).toBeNull()
  })

  it('orders a shared day by time', () => {
    const weeks = movePost(WEEKS, POSTS, 'pasta', '8')
    const thu = weeks.flatMap((w) => w.days).find((d) => d.n === '8')!
    // ravioli 12:00, pasta 12:00, crust 18:00: the moved post joins in time order.
    expect(feedsOf(thu).map((m) => (m.kind === 'post' ? m.postId : m.kind))).toEqual([
      'ravioli',
      'pasta',
      'crust',
    ])
  })
})
