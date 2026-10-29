import { describe, expect, it } from 'vitest'

import type { Post } from '@/data/demo'
import type { ServerPost } from '@/features/schedule/remote-calendar'

import {
  canRank,
  countsOn,
  figuresOf,
  firstLine,
  fromServer,
  hoursLeft,
  kindOf,
  ledgerOf,
  monthsOf,
  nowIn,
  PLATFORMS,
  platformOf,
  railOf,
  rankedOf,
  storyKind,
  summaryOf,
  whenOf,
  windowLine,
  type PostedItem,
} from './model'

const TODAY = '2026-10-29'

function item(id: string, day: string, over: Partial<Post> = {}, more: Partial<PostedItem> = {}) {
  const post: Post = {
    id,
    format: 'carousel',
    hook: id,
    images: ['/a.jpg'],
    stage: 'posted',
    slot: '',
    slotShort: '',
    ...over,
  }
  return { post, went: ['ig'], day, time: '12:00', caption: '', collabs: [], ...more } as PostedItem
}

function server(id: string, over: Partial<ServerPost> = {}): ServerPost {
  return {
    id,
    format: 'carousel',
    hook: id,
    day: '2026-10-20',
    time: '18:00',
    channels: ['ig'],
    media: [],
    fromIdea: null,
    stage: 'posted',
    jobs: [],
    caption: '',
    draft: {},
    ...over,
  }
}

describe('what went out, from the core', () => {
  it('takes posted posts and the accounts a post is live on, and nothing that never went out', () => {
    const items = fromServer([
      server('out'),
      // Instagram went live, Facebook failed: it still went out on Instagram.
      server('half', {
        stage: 'failed',
        channels: ['ig', 'fb'],
        jobs: [
          { channel: 'ig', status: 'live', error: null },
          { channel: 'fb', status: 'failed', error: 'no' },
        ],
      }),
      server('planned', {
        stage: 'scheduled',
        jobs: [{ channel: 'ig', status: 'scheduled', error: null }],
      }),
      server('draft', { stage: 'draft' }),
    ])
    expect(items.map((i) => [i.post.id, i.went])).toEqual([
      ['out', ['ig']],
      ['half', ['ig']],
    ])
  })

  it('lists a post only on the accounts whose job went live, never a planned-only one', () => {
    // All its jobs live, so it reads posted; TikTok was planned beside Instagram, never sent.
    const items = fromServer([
      server('sent', {
        channels: ['ig', 'tt'],
        jobs: [{ channel: 'ig', status: 'live', error: null }],
        metrics: { likes: 40 },
      }),
    ])
    expect(items[0]!.went).toEqual(['ig'])
    expect(ledgerOf(items, 'tt')).toEqual([])
    expect(railOf(items, () => false)).toEqual(['ig'])
    expect(summaryOf(ledgerOf(items, 'tt'), 'tt', TODAY).posts).toBe(0)
  })

  it('lists a post marked posted by hand, with no job, on all its accounts', () => {
    expect(fromServer([server('marked', { channels: ['ig', 'tt'] })])[0]!.went).toEqual([
      'ig',
      'tt',
    ])
  })

  it('keeps a story that went out, which the calendar keeps only as a count', () => {
    const items = fromServer([server('s', { format: 'story' })])
    expect(ledgerOf(items, 'ig').map((i) => i.post.id)).toEqual(['s'])
  })
})

describe('the ledger', () => {
  it('is one platform, posts and stories together, newest first', () => {
    const items = [
      item('old', '2026-10-01'),
      item('story', '2026-10-28', { format: 'story' }),
      item('new', '2026-10-28', {}, { time: '18:00' }),
      item('tiktok', '2026-10-27', { format: 'reel' }, { went: ['tt'] }),
    ]
    expect(ledgerOf(items, 'ig').map((i) => i.post.id)).toEqual(['new', 'story', 'old'])
  })

  it('leaves out Facebook stories: nothing reads them yet', () => {
    const items = [item('story', '2026-10-28', { format: 'story' }, { went: ['ig', 'fb'] })]
    expect(ledgerOf(items, 'fb')).toEqual([])
    expect(ledgerOf(items, 'ig')).toHaveLength(1)
  })

  it('groups by month, with the year only when it is not this one', () => {
    const months = monthsOf(
      ledgerOf([item('a', '2026-10-02'), item('b', '2026-09-30'), item('c', '2025-12-01')], 'ig'),
      TODAY,
    )
    expect(months.map((m) => [m.title, m.items.length])).toEqual([
      ['October', 1],
      ['September', 1],
      ['December 2025', 1],
    ])
  })
})

describe('the rail', () => {
  it('lists a platform with posts or a linked account, in the rail order', () => {
    const items = [item('a', '2026-10-02', {}, { went: ['tt'] })]
    expect(railOf(items, (p) => p === 'fb')).toEqual(['fb', 'tt'])
  })

  it('shows every platform when nothing is linked or posted, so each can be connected', () => {
    expect(railOf([], () => false)).toEqual(PLATFORMS)
  })

  it('opens on the platform picked while it is in the rail, else the first with posts', () => {
    const items = [item('a', '2026-10-02', {}, { went: ['tt'] })]
    const rail = railOf(items, (p) => p === 'fb')
    expect(platformOf(rail, items, 'fb')).toBe('fb')
    // An address naming Instagram, which is not in this rail, opens on TikTok, the one with posts.
    expect(platformOf(rail, items, 'ig')).toBe('tt')
    expect(platformOf(['fb', 'ig'], [], 'tt')).toBe('fb')
  })
})

describe('counts', () => {
  const both = item('a', '2026-10-20', { metrics: { likes: 10 } }, { went: ['ig', 'fb'] })

  it("are the first account's: Facebook never repeats Instagram's numbers", () => {
    expect(countsOn(both, 'ig').map((c) => c.value)).toEqual([10])
    expect(countsOn(both, 'fb')).toEqual([])
  })

  it('summarise the last 30 days, with no total a post in it does not have', () => {
    const ledger = ledgerOf(
      [
        item('a', '2026-10-20', {
          metrics: { likes: 10, reach: 100 },
          measuredAt: '2026-10-28T01:00:00Z',
        }),
        item('b', '2026-10-21', { metrics: { likes: 5 }, measuredAt: '2026-10-29T01:00:00Z' }),
        item('s', '2026-10-28', { format: 'story' }),
        // 30 days back from the 29th is the 30th of September: this one is out of the window.
        item('old', '2026-09-29', { metrics: { likes: 1000 } }),
      ],
      'ig',
    )
    expect(summaryOf(ledger, 'ig', TODAY)).toEqual({
      posts: 2,
      stories: 1,
      totals: [
        { label: 'reach', value: 100 },
        { label: 'likes', value: 15 },
      ],
      counted: 2,
      of: 3,
      measuredAt: '2026-10-29T01:00:00Z',
    })
  })

  it('say how many the totals cover when only some have numbers', () => {
    const sum = summaryOf(
      ledgerOf(
        [
          item('a', '2026-10-20', { metrics: { likes: 10 }, measuredAt: '2026-10-28T01:00:00Z' }),
          item('b', '2026-10-21'),
          item('c', '2026-10-22'),
        ],
        'ig',
      ),
      'ig',
      TODAY,
    )
    expect(windowLine(sum)).toBe('Last 30 days · 1 of 3 with numbers · as of 28 Oct')
  })

  it('invent nothing: posts with no counts give no totals and no reading', () => {
    const sum = summaryOf([item('a', '2026-10-20')], 'ig', TODAY)
    expect(sum).toEqual({ posts: 1, stories: 0, totals: [], counted: 0, of: 1 })
    expect(windowLine(sum)).toBe('Last 30 days')
  })

  it('total views where no post has reach: an import reads none', () => {
    const ledger = ledgerOf(
      [
        item('a', '2026-10-20', { format: 'reel', metrics: { views: 900, likes: 10 } }),
        item('b', '2026-10-21', { metrics: { likes: 5 } }),
      ],
      'ig',
    )
    expect(summaryOf(ledger, 'ig', TODAY).totals).toEqual([
      { label: 'views', value: 900 },
      { label: 'likes', value: 15 },
    ])
  })

  it('count stories on Instagram only: no other platform lists them', () => {
    const sum = summaryOf([], 'ig', TODAY)
    expect(figuresOf(sum, 'ig').map((f) => f.label)).toEqual(['posts', 'stories'])
    expect(figuresOf(sum, 'fb').map((f) => f.label)).toEqual(['posts'])
  })
})

describe('ranking', () => {
  const ledger = ledgerOf(
    [
      item('quiet', '2026-10-25', { metrics: { likes: 5, reach: 900 } }),
      item('loud', '2026-10-20', { metrics: { likes: 50, saves: 10 } }),
      item('none', '2026-10-28'),
      item('tie', '2026-10-10', { metrics: { likes: 5, reach: 1200 } }),
    ],
    'ig',
  )

  it('puts the most engaging first, a tie to the bigger reach, and the uncounted apart', () => {
    const { ranked, unread } = rankedOf(ledger, 'ig')
    expect(ranked.map((i) => i.post.id)).toEqual(['loud', 'tie', 'quiet'])
    expect(unread.map((i) => i.post.id)).toEqual(['none'])
  })

  it('needs two posts with counts to say anything', () => {
    expect(canRank(ledger, 'ig')).toBe(true)
    expect(
      canRank(ledgerOf([item('a', '2026-10-20', { metrics: { likes: 1 } })], 'ig'), 'ig'),
    ).toBe(false)
  })
})

describe('stories', () => {
  const story = item('s', '2026-10-28', { format: 'story' }, { time: '11:40' })

  it('are live for 24 hours, with the hours left rounded up', () => {
    expect(hoursLeft(story, { day: '2026-10-28', time: '12:00' })).toBe(24)
    expect(hoursLeft(story, { day: '2026-10-29', time: '02:40' })).toBe(9)
    expect(hoursLeft(story, { day: '2026-10-29', time: '11:40' })).toBeNull()
  })

  it("read now in the brand's own zone, day and time from one instant", () => {
    // 23:30 in Singapore on the 28th is 16:30 in Rome: still the 28th there.
    const at = new Date('2026-10-28T15:30:00Z')
    expect(nowIn(at, 'Europe/Rome')).toEqual({ day: '2026-10-28', time: '16:30' })
    // Past midnight in Singapore, the 29th; Rome is still on the 28th.
    const late = new Date('2026-10-28T16:30:00Z')
    expect(nowIn(late, 'Asia/Singapore')).toEqual({ day: '2026-10-29', time: '00:30' })
    expect(nowIn(late, 'Europe/Rome')).toEqual({ day: '2026-10-28', time: '17:30' })
    // A story at 11:40 Rome time is still up at 00:30 Singapore, which is 17:30 in Rome.
    expect(hoursLeft(story, nowIn(late, 'Europe/Rome'))).toBe(19)
  })

  it('keep the demo on its fixed today, with the clock’s time', () => {
    const at = new Date('2026-10-28T04:00:00Z')
    expect(nowIn(at, 'Asia/Singapore', '2026-10-06')).toEqual({ day: '2026-10-06', time: '12:00' })
  })

  it('name their frames', () => {
    expect(storyKind(story.post)).toBe('Story')
    expect(storyKind({ ...story.post, images: ['/a', '/b', '/c'] })).toBe('Story · 3 frames')
  })
})

describe('words', () => {
  it('say what each platform calls the post', () => {
    expect(kindOf(item('a', TODAY).post, 'ig')).toBe('Post')
    expect(kindOf(item('a', TODAY).post, 'fb')).toBe('Photo')
    expect(kindOf(item('a', TODAY, { images: ['/a', '/b'] }).post, 'ig')).toBe('Carousel')
    expect(kindOf(item('a', TODAY, { format: 'reel' }).post, 'tt')).toBe('Video')
  })

  it('say today as Today, and a past year in full', () => {
    expect(whenOf(item('a', TODAY), TODAY)).toBe('Today, 12:00')
    expect(whenOf(item('a', '2026-10-25'), TODAY)).toBe('Sun 25 Oct, 12:00')
    expect(whenOf(item('a', '2025-10-26'), TODAY)).toBe('Sun 26 Oct 2025, 12:00')
  })

  it('take the caption’s first line, never the hook again', () => {
    const a = item('Hook', TODAY, {}, { caption: '\nBeef and gravy.\nMore' })
    expect(firstLine(a)).toBe('Beef and gravy.')
    expect(firstLine(item('Hook', TODAY, {}, { caption: 'Hook\nrest' }))).toBe('')
  })
})
