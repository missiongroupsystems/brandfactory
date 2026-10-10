import { describe, expect, it } from 'vitest'

import type { BrandId } from '@/data/brands'
import { INSIGHTS_BY_BRAND, type PostStat } from '@/data/insights'
import { DAYS, HUB_BY_BRAND, dayOf, type BrandHub } from '@/data/insights-hub'

import { addSplits, bestOffSocial, bookingsByFormat, liftAfter, percents, sum } from './hub-model'

const brands = Object.keys(HUB_BY_BRAND) as BrandId[]

/** Thirty days from a Monday: Fridays busy, the rest quiet, as a restaurant's week runs. */
const week = (fri = 20, rest = 10) =>
  Array.from({ length: DAYS }, (_, d) => (d % 7 === 4 ? fri : rest))

const post = (date: string, format: PostStat['format'] = 'reel'): PostStat => ({
  image: '',
  hook: date,
  format,
  pillar: 'Craft',
  date,
  reach: 5000,
  saves: 100,
  engagement: 5,
})

const hub = (bookings: number[]): BrandHub => ({
  daily: {
    ig: [],
    tt: [],
    web: [],
    maps: bookings,
    searches: [],
    calls: [],
    directions: [],
    bookings,
  },
  sentiment: HUB_BY_BRAND['casa-vostra'].sentiment,
})

describe('what a post did off social', () => {
  it('does not credit a Thursday post with the usual Friday crowd', () => {
    // 10 Sep is a Thursday: the next day is a Friday, busy whatever was posted.
    expect(liftAfter(week(), dayOf('10 SEP'), [dayOf('10 SEP')])).toBeCloseTo(1)
  })

  it('measures a real rise against the same weekdays on quiet days', () => {
    const bookings = week()
    const day = dayOf('15 SEP') // a Tuesday; Wednesday and Thursday double
    bookings[day + 1] = 20
    bookings[day + 2] = 20
    expect(liftAfter(bookings, day, [day])).toBeCloseTo(2)
  })

  it('leads with the post the rise followed, not the one after it', () => {
    const bookings = week()
    bookings[dayOf('16 SEP')] = 30
    bookings[dayOf('17 SEP')] = 30
    const posts = [post('15 SEP'), post('18 SEP')]
    expect(bestOffSocial(posts, hub(bookings)).post.hook).toBe('15 SEP')
  })

  it('answers "after which post type?" with the format bookings rose after, and never a negative', () => {
    const bookings = week()
    bookings[dayOf('16 SEP')] = 25
    bookings[dayOf('17 SEP')] = 25
    bookings[dayOf('23 SEP')] = 5 // a quiet day after a photo: the week, not the photo
    const rows = bookingsByFormat([post('15 SEP', 'carousel'), post('22 SEP', 'photo')], bookings)
    expect(rows[0]!.format).toBe('carousel')
    expect(rows[0]!.percent).toBeGreaterThan(0)
    expect(rows.find((r) => r.format === 'photo')!.percent).toBe(0)
  })
})

describe('sentiment shares', () => {
  it('always add up to 100, so a full bar never reads 101%', () => {
    for (const s of [
      { pos: 1, neu: 1, neg: 1 },
      { pos: 221, neu: 57, neg: 26 },
      { pos: 2, neu: 3, neg: 7 },
    ]) {
      const p = percents(s)
      expect(p.pos + p.neu + p.neg).toBe(100)
    }
  })
})

describe('the hub data', () => {
  it('adds Instagram and TikTok up to the reach on the Overview', () => {
    for (const id of brands) {
      const { daily } = HUB_BY_BRAND[id]
      const reach = INSIGHTS_BY_BRAND[id].kpis.find((q) => q.label === 'Reach')!
      const social = [...daily.ig, ...daily.tt].reduce((n, v) => n + v, 0)
      expect(`${(social / 1000).toFixed(1)}k`, id).toBe(reach.value)
    }
  })

  it('gives every post on the Posts view its own comment split', () => {
    for (const id of brands) {
      const split = HUB_BY_BRAND[id].sentiment.posts
      for (const p of INSIGHTS_BY_BRAND[id].posts)
        expect(sum(split[p.hook]!), p.hook).toBeGreaterThan(0)
    }
  })

  it('puts every source on all 30 days', () => {
    for (const id of brands) {
      for (const values of Object.values(HUB_BY_BRAND[id].daily)) expect(values).toHaveLength(DAYS)
    }
  })

  it('keeps each brand mostly positive, with complaints to work on', () => {
    for (const id of brands) {
      const s = HUB_BY_BRAND[id].sentiment
      const all = addSplits([...Object.values(s.posts), s.mentions])
      expect(percents(all).pos, id).toBeGreaterThan(60)
      expect(s.complaints.length, id).toBeGreaterThan(0)
    }
  })
})
