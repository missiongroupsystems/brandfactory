import { describe, expect, it } from 'vitest'

import { contentFor } from '@/data/brands'

import { ALL_STAGES, countsOf, failedOf, itemsOf } from './calendar-items'

const casa = contentFor('casa-vostra')
const byId = (id: string) => casa.posts.find((p) => p.id === id)
const dayN = (n: string) => casa.weeks.flatMap((w) => w.days).find((d) => d.n === n)!
const onlyFailed = { ...ALL_STAGES, idea: false, awaiting: false, scheduled: false, posted: false }

describe('the month chips', () => {
  it('count a failed post once, on the account it failed on, and not again per platform', () => {
    // 5 Oct holds one post: the wine night carousel, for Instagram and Facebook, failed on Facebook.
    for (const stages of [ALL_STAGES, onlyFailed]) {
      const items = itemsOf(dayN('5'), byId, stages)
      expect(failedOf(items)).toEqual([{ channel: 'fb', n: 1 }])
      expect(countsOf(items)).toEqual([])
    }
  })

  it('count every account of a post that did not fail', () => {
    // 8 Oct: a carousel for Instagram and Facebook, and a reel for Instagram, TikTok and YouTube.
    const items = itemsOf(dayN('8'), byId, ALL_STAGES)
    expect(failedOf(items)).toEqual([])
    expect(countsOf(items)).toEqual([
      { channel: 'ig', n: 2 },
      { channel: 'tt', n: 1 },
      { channel: 'yt', n: 1 },
      { channel: 'fb', n: 1 },
    ])
  })
})
