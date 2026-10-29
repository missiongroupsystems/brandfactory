import { describe, expect, it } from 'vitest'

import type { Post } from '@/data/demo'
import type { ServerPost } from '@/features/schedule/remote-calendar'

import {
  canRank,
  countsOn,
  figuresOf,
  fromServer,
  gridOf,
  headlineKeyOf,
  headlineOf,
  hoursLeft,
  kindOf,
  ledgerOf,
  openOn,
  readingOn,
  bodyOf,
  nowIn,
  PLATFORMS,
  platformOf,
  profileName,
  railOf,
  rankedOf,
  ringsOf,
  shortDay,
  tileCountsOf,
  tileLabel,
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
  it('shows what the sync read back: the address, the counts as of their reading, the story’s end and the stored cover', () => {
    const cover = 'https://core.test/files/sig/brandbase/c.jpg#photo'
    const [post, story] = fromServer([
      server('casa-ig-1', {
        media: [{ src: cover, kind: 'photo' }],
        permalink: 'https://www.instagram.com/p/D1/',
        metrics: { reach: 900, likes: 40 },
        measuredAt: '2026-10-29T05:00:00.000Z',
        expiresAt: null,
      }),
      server('casa-ig-2', {
        format: 'story',
        day: '2026-10-29',
        expiresAt: '2026-10-30T01:00:00.000Z',
      }),
    ])
    expect(post!.post).toMatchObject({
      images: [cover],
      permalink: 'https://www.instagram.com/p/D1/',
      metrics: { reach: 900, likes: 40 },
      measuredAt: '2026-10-29T05:00:00.000Z',
    })
    expect(post!.post.expiresAt).toBeUndefined()
    expect(story!.post.expiresAt).toBe('2026-10-30T01:00:00.000Z')
  })

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

describe('the profile name', () => {
  const brand = { name: 'Casa Vostra', handle: '@casavostrasg' }
  const linked = { ig: 'testbrandbase', fb: 'CV', tt: 'Casa Vostra SG' }

  it('is the linked Instagram account, as a handle, never the brand’s own', () => {
    expect(profileName('ig', linked, brand)).toBe('@testbrandbase')
    expect(profileName('ig', { ig: '@testbrandbase' }, brand)).toBe('@testbrandbase')
  })

  it('is the Facebook Page’s name as typed: a Page has no handle', () => {
    expect(profileName('fb', linked, brand)).toBe('CV')
  })

  it('is the TikTok account’s name, else the brand’s handle', () => {
    expect(profileName('tt', linked, brand)).toBe('Casa Vostra SG')
    expect(profileName('tt', {}, brand)).toBe('@casavostrasg')
  })

  it('is the brand’s name on Instagram or Facebook with nothing linked', () => {
    expect(profileName('ig', {}, brand)).toBe('Casa Vostra')
    expect(profileName('fb', { ig: 'testbrandbase' }, brand)).toBe('Casa Vostra')
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
    const sum = { posts: 2, stories: 1, totals: [], counted: 0, of: 3 }
    expect(figuresOf(sum, 'ig')).toEqual([
      { label: 'posts', value: 2 },
      { label: 'story', value: 1 },
    ])
    expect(figuresOf(sum, 'fb').map((f) => f.label)).toEqual(['posts'])
  })

  it('leave out a figure that is 0: no "0 stories", no "0 posts"', () => {
    const sum = summaryOf(
      ledgerOf([item('a', '2026-10-20', { metrics: { likes: 0, reach: 40 } })], 'ig'),
      'ig',
      TODAY,
    )
    expect(figuresOf(sum, 'ig')).toEqual([
      { label: 'post', value: 1 },
      { label: 'reach', value: 40 },
    ])
    const stories = summaryOf(
      ledgerOf([item('s', '2026-10-28', { format: 'story' })], 'ig'),
      'ig',
      TODAY,
    )
    expect(figuresOf(stories, 'ig')).toEqual([{ label: 'story', value: 1 }])
    expect(figuresOf(summaryOf([], 'ig', TODAY), 'ig')).toEqual([])
  })
})

describe('a tile', () => {
  it('shows the one count most of the grid has; between equals reach, then views, then likes', () => {
    const reel = item('r', TODAY, { format: 'reel', metrics: { views: 900, likes: 40 } })
    const photo = item('p', TODAY, { metrics: { reach: 900, likes: 40 } })
    // Both have likes: that leaves no cover bare. Only one has reach or views.
    expect(headlineKeyOf([reel, photo], 'ig')).toBe('likes')
    expect(headlineKeyOf([photo, item('q', TODAY, { metrics: { reach: 5 } })], 'ig')).toBe('reach')
    expect(headlineKeyOf([reel], 'ig')).toBe('views')
    expect(headlineKeyOf([item('l', TODAY, { metrics: { likes: 3, saves: 9 } })], 'ig')).toBe(
      'likes',
    )
    expect(headlineKeyOf([item('s', TODAY, { metrics: { saves: 9 } })], 'ig')).toBe('saves')
    expect(headlineKeyOf([item('b', TODAY)], 'ig')).toBeUndefined()
    // The same count on every tile, never a different one where it is missing.
    expect(headlineOf(photo, 'ig', 'reach')).toMatchObject({ key: 'reach', value: 900 })
    expect(headlineOf(reel, 'ig', 'reach')).toBeUndefined()
  })

  it('shows none without counts or off its first account', () => {
    expect(headlineOf(item('b', TODAY), 'ig', 'reach')).toBeUndefined()
    // Instagram's counts never show on Facebook.
    const both = item('c', TODAY, { metrics: { likes: 5 } }, { went: ['ig', 'fb'] })
    expect(headlineKeyOf([both], 'fb')).toBeUndefined()
    expect(headlineOf(both, 'fb', 'likes')).toBeUndefined()
  })

  it('never shows a 0: the grid picks a count someone has, and the hover leaves 0s out', () => {
    const reel = item('r', TODAY, { format: 'reel', metrics: { views: 0, likes: 12, saves: 0 } })
    expect(headlineKeyOf([reel], 'ig')).toBe('likes')
    expect(headlineOf(reel, 'ig', 'likes')).toMatchObject({ key: 'likes', value: 12 })
    expect(tileCountsOf(reel, 'ig').map((c) => c.key)).toEqual(['likes'])
    expect(headlineOf(item('z', TODAY, { metrics: { likes: 0 } }), 'ig', 'likes')).toBeUndefined()
  })

  it('says itself in words: kind, when, collab, hook and its one count', () => {
    const reel = item('Sunday roast is back', '2026-10-25', {
      format: 'reel',
      metrics: { views: 12400, likes: 318 },
    })
    expect(tileLabel(reel, 'ig', TODAY, 'views')).toBe(
      'Reel · Sun 25 Oct, 12:00: Sunday roast is back · 12.4k views',
    )
    const collab = item('Wine night', TODAY, {}, { collabs: ['@dan'] })
    expect(tileLabel(collab, 'ig', TODAY, 'views')).toBe(
      'Post · Today, 12:00 · with @dan: Wine night',
    )
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

  it('orders the grid ranked only when asked and ranking says something, stories never in it', () => {
    const withStory = [
      ...ledger,
      item('story', '2026-10-28', { format: 'story', metrics: { likes: 99 } }),
    ]
    expect(gridOf(withStory, 'ig', 'newest').map((i) => i.post.id)).toEqual([
      'none',
      'quiet',
      'loud',
      'tie',
    ])
    expect(gridOf(withStory, 'ig', 'top').map((i) => i.post.id)).toEqual([
      'loud',
      'tie',
      'quiet',
      'none',
    ])
    // One post with counts ranks nothing: Top stays newest first.
    const one = ledgerOf(
      [item('a', '2026-10-20', { metrics: { likes: 1 } }), item('b', '2026-10-21')],
      'ig',
    )
    expect(gridOf(one, 'ig', 'top').map((i) => i.post.id)).toEqual(['b', 'a'])
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

  it('end when the core says, for a story it read back', () => {
    const read = item('r', '2026-10-28', { format: 'story', expiresAt: '2026-10-29T02:00:00Z' })
    // 18:00 UTC: eight hours to go by the core's end, whatever the day and time say.
    const at = new Date('2026-10-28T18:00:00Z')
    expect(hoursLeft(read, { day: '2026-10-28', time: '12:00', at })).toBe(8)
    expect(
      hoursLeft(read, { day: '2026-10-29', time: '10:00', at: new Date('2026-10-29T02:00:00Z') }),
    ).toBeNull()
    // Without the instant (or the end), 24 hours from the time it went out.
    expect(hoursLeft(read, { day: '2026-10-28', time: '12:00' })).toBe(24)
  })

  it("read now in the brand's own zone, day and time from one instant", () => {
    // 23:30 in Singapore on the 28th is 16:30 in Rome: still the 28th there.
    const at = new Date('2026-10-28T15:30:00Z')
    expect(nowIn(at, 'Europe/Rome')).toEqual({ day: '2026-10-28', time: '16:30', at })
    // Past midnight in Singapore, the 29th; Rome is still on the 28th.
    const late = new Date('2026-10-28T16:30:00Z')
    expect(nowIn(late, 'Asia/Singapore')).toEqual({ day: '2026-10-29', time: '00:30', at: late })
    expect(nowIn(late, 'Europe/Rome')).toEqual({ day: '2026-10-28', time: '17:30', at: late })
    // A story at 11:40 Rome time is still up at 00:30 Singapore, which is 17:30 in Rome.
    expect(hoursLeft(story, nowIn(late, 'Europe/Rome'))).toBe(19)
  })

  it('keep the demo on its fixed today, with the clock’s time', () => {
    const at = new Date('2026-10-28T04:00:00Z')
    expect(nowIn(at, 'Asia/Singapore', '2026-10-06')).toEqual({
      day: '2026-10-06',
      time: '12:00',
      at,
    })
  })

  it('ring every story still up and those gone in the last week, newest first', () => {
    const now = { day: '2026-10-29', time: '10:00' }
    const rings = ringsOf(
      ledgerOf(
        [
          item('up', '2026-10-29', { format: 'story' }, { time: '08:00' }),
          item('gone', '2026-10-23', { format: 'story' }),
          item('old', '2026-10-22', { format: 'story' }),
          item('post', '2026-10-28'),
        ],
        'ig',
      ),
      now,
    )
    expect(rings.map((r) => [r.item.post.id, r.left])).toEqual([
      ['up', 22],
      ['gone', null],
    ])
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

  it('give a ring its day in short', () => {
    expect(shortDay(item('a', TODAY), TODAY)).toBe('Today')
    expect(shortDay(item('a', '2026-10-27'), TODAY)).toBe('Tue 27')
  })
})

describe('each account’s own reading', () => {
  const both = item('both', TODAY, {
    channels: ['ig', 'fb'],
    metrics: { reach: 800, likes: 64 },
    measuredAt: '2026-10-29T05:00:00Z',
    permalink: 'https://www.instagram.com/p/A/',
    readings: {
      ig: {
        metrics: { reach: 800, likes: 64 },
        readAt: '2026-10-29T05:00:00Z',
        permalink: 'https://www.instagram.com/p/A/',
      },
      fb: {
        metrics: { likes: 12 },
        readAt: '2026-10-28T05:00:00Z',
        permalink: 'https://www.facebook.com/x/posts/1',
      },
    },
  }).post

  it('gives each account its own counts, their time and its link', () => {
    expect(readingOn(both, 'fb', ['ig', 'fb'])).toEqual({
      counts: [{ key: 'likes', label: 'Likes', value: 12 }],
      measuredAt: '2026-10-28T05:00:00Z',
      permalink: 'https://www.facebook.com/x/posts/1',
    })
    expect(readingOn(both, 'ig', ['ig', 'fb']).permalink).toBe('https://www.instagram.com/p/A/')
  })

  it("never labels Facebook's link as Instagram's on a post from before each account kept its own", () => {
    // Before 1.13.1 the post kept whichever account's link came first: here Facebook's.
    const old = { ...both, readings: undefined, permalink: 'https://www.facebook.com/x/posts/1' }
    expect(readingOn(old, 'ig', ['ig', 'fb']).permalink).toBeUndefined()
    expect(readingOn(old, 'ig', ['ig', 'fb']).counts.length).toBeGreaterThan(0)
  })

  it('fills nothing in for an account with no reading: no counts, no link', () => {
    const igOnly = { ...both, readings: { ig: both.readings!.ig! } }
    expect(readingOn(igOnly, 'fb', ['ig', 'fb'])).toEqual({ counts: [] })
  })

  it('lets a post read before each account kept its own stand for its first account alone', () => {
    const old = { ...both, readings: undefined }
    expect(readingOn(old, 'ig', ['ig', 'fb']).counts.map((c) => c.value)).toEqual([800, 64])
    expect(readingOn(old, 'ig', ['ig', 'fb']).permalink).toBe('https://www.instagram.com/p/A/')
    expect(readingOn(old, 'fb', ['ig', 'fb'])).toEqual({ counts: [] })
  })

  it('keeps a link that came with no counts, and a later reading without one does not lose it', () => {
    const linkOnly = {
      ...both,
      readings: { fb: { permalink: 'https://www.facebook.com/x/posts/1' } },
    }
    expect(readingOn(linkOnly, 'fb', ['ig', 'fb'])).toEqual({
      counts: [],
      permalink: 'https://www.facebook.com/x/posts/1',
    })
  })

  it('reads a post on one account from that account', () => {
    const one = item('one', TODAY, {
      metrics: { likes: 5 },
      permalink: 'https://www.instagram.com/p/B/',
    }).post
    expect(readingOn(one, 'ig', ['ig'])).toMatchObject({
      permalink: 'https://www.instagram.com/p/B/',
    })
    expect(readingOn(one, 'ig', ['ig']).counts).toHaveLength(1)
  })

  it('puts Facebook’s own counts on the Posted page’s Facebook tab', () => {
    const it2 = item('both', TODAY, both, { went: ['ig', 'fb'] })
    expect(countsOn(it2, 'fb').map((c) => c.value)).toEqual([12])
  })

  it('opens on the account asked for, else the first with counts, else the first', () => {
    expect(openOn(both, ['ig', 'fb'], 'fb')).toBe('fb')
    expect(openOn(both, ['ig', 'fb'], 'tt')).toBe('ig')
    const fbOnly = { ...both, metrics: undefined, readings: { fb: both.readings!.fb! } }
    expect(openOn(fbOnly, ['ig', 'fb'])).toBe('fb')
    expect(openOn({ ...both, metrics: undefined, readings: undefined }, ['ig', 'fb'])).toBe('ig')
    expect(openOn(both, [])).toBeUndefined()
  })
})

describe('the caption under the title', () => {
  it('drops a first line that only says the title again', () => {
    expect(bodyOf('\nPasta night\nBook a table.', 'Pasta night')).toBe('Book a table.')
    expect(bodyOf('Book a table.', 'Pasta night')).toBe('Book a table.')
    expect(bodyOf('', 'Pasta night')).toBe('')
  })
})

describe('an account’s link from the core', () => {
  it('is what Make answered when it posted, until the read-back gives its own', () => {
    const sent = server('sent', {
      channels: ['ig', 'fb'],
      stage: 'scheduled',
      jobs: [
        { channel: 'ig', status: 'live', error: null },
        {
          channel: 'fb',
          status: 'live',
          error: null,
          permalink: 'https://www.facebook.com/x/posts/1',
        },
      ],
      readings: { ig: { metrics: { likes: 3 }, readAt: '2026-10-29T05:00:00Z' } },
    })
    const [it2] = fromServer([sent])
    expect(readingOn(it2!.post, 'fb', it2!.went).permalink).toBe(
      'https://www.facebook.com/x/posts/1',
    )
    // Instagram has counts but no link anywhere: none is borrowed from Facebook.
    expect(readingOn(it2!.post, 'ig', it2!.went)).toEqual({
      counts: [{ key: 'likes', label: 'Likes', value: 3 }],
      measuredAt: '2026-10-29T05:00:00Z',
    })
  })
})
