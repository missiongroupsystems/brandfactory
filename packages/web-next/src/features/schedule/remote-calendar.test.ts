import { describe, expect, it } from 'vitest'

import { feedsOf } from '@/data/demo'

import { calendarOf } from './remote-calendar'

const post = (over: object) => ({
  format: 'reel',
  hook: 'x',
  day: null,
  time: '18:00',
  channels: ['ig'],
  media: [{ src: '/demo/pasta.jpg', kind: 'photo' }],
  fromIdea: null,
  stage: 'draft',
  jobs: [],
  caption: '',
  draft: {},
  ...over,
})

const state = (posts: object[], ideas: object[] = [], today?: string) => ({
  brand: { id: 'casa-vostra' },
  posts,
  ideas,
  ...(today && { today }),
})

const day = (weeks: ReturnType<typeof calendarOf>['weeks'], n: string) =>
  weeks.flatMap((w) => w.days).find((d) => d.date === n && !d.outside)!

describe('the calendar from the server', () => {
  it('puts posts on their day in time order, and an idea tile after them', () => {
    const { weeks } = calendarOf(
      'casa-vostra',
      state(
        [
          post({ id: 'late', day: '2026-10-14', time: '19:00' }),
          post({ id: 'early', day: '2026-10-14', time: '09:00' }),
        ],
        [
          {
            id: 'i1',
            format: 'carousel',
            hook: 'Tile',
            day: '2026-10-14',
            why: 'Diwali',
            status: 'suggested',
            postId: null,
          },
        ],
      ),
    )
    expect(feedsOf(day(weeks, '2026-10-14'))).toEqual([
      { kind: 'post', postId: 'early' },
      { kind: 'post', postId: 'late' },
      { kind: 'idea', format: 'carousel', hook: 'Tile', why: 'Diwali', suggested: true },
    ])
  })

  it('counts stories already out in the story row, and keeps them out of the posts', () => {
    const { posts, weeks } = calendarOf(
      'casa-vostra',
      state([
        post({ id: 's1', format: 'story', day: '2026-10-08', stage: 'posted' }),
        post({ id: 's2', format: 'story', day: '2026-10-08', stage: 'posted' }),
        post({ id: 's3', format: 'story', day: '2026-10-09', stage: 'draft' }),
      ]),
    )
    expect(day(weeks, '2026-10-08').story).toEqual({
      kind: 'posted',
      image: '/demo/pasta.jpg',
      count: 2,
    })
    expect(day(weeks, '2026-10-09').story).toEqual({ kind: 'post', postId: 's3' })
    expect(posts.map((p) => p.id)).toEqual(['s3'])
  })

  it('keeps the counts of a post brought in from its account, and gives a made post none', () => {
    const { posts } = calendarOf(
      'casa-vostra',
      state([
        post({ id: 'in', day: '2026-10-10', stage: 'posted', metrics: { likes: 37, comments: 1 } }),
        post({ id: 'made', day: '2026-10-11', metrics: null }),
      ]),
    )
    expect(posts.find((p) => p.id === 'in')?.metrics).toEqual({ likes: 37, comments: 1 })
    expect(posts.find((p) => p.id === 'made')).not.toHaveProperty('metrics')
  })

  it('names the account a failed post failed on, with the reason', () => {
    const { posts } = calendarOf(
      'casa-vostra',
      state([
        post({
          id: 'p',
          day: '2026-10-14',
          stage: 'failed',
          jobs: [{ channel: 'tt', status: 'failed', error: 'TikTok refused the video.' }],
        }),
      ]),
    )
    expect(posts[0]).toMatchObject({ failedOn: 'tt', error: 'TikTok refused the video.' })
  })

  it('draws a post after the demo month on its own day, and today from the server', () => {
    const { weeks } = calendarOf(
      'casa-vostra',
      state(
        [
          post({ id: 'nov', day: '2026-11-20', time: '18:00' }),
          post({ id: 'feb', day: '2027-02-03', time: '18:00' }),
        ],
        [],
        '2026-11-03',
      ),
    )
    expect(feedsOf(day(weeks, '2026-11-20'))).toEqual([{ kind: 'post', postId: 'nov' }])
    expect(feedsOf(day(weeks, '2027-02-03'))).toEqual([{ kind: 'post', postId: 'feb' }])
    expect(day(weeks, '2026-11-03')).toMatchObject({ today: true })
    expect(day(weeks, '2026-11-02')).toMatchObject({ past: true })
    expect(day(weeks, '2026-11-04').past).toBeFalsy()
  })

  it('runs from two months before today to six after, and reaches any dated post beyond', () => {
    const { weeks } = calendarOf(
      'casa-vostra',
      state([post({ id: 'old', day: '2026-01-14' })], [], '2026-11-03'),
    )
    const mondays = weeks.map((w) => w.days[0]!.date)
    // Weeks in a row, Monday to Sunday, none missing.
    mondays.forEach((m, i) => {
      if (i > 0) expect(Date.parse(m) - Date.parse(mondays[i - 1]!)).toBe(7 * 86400000)
    })
    expect(mondays[0]).toBe('2026-01-12')
    // May 2027's last Monday: six months after November.
    expect(mondays.at(-1)).toBe('2027-05-31')
    expect(feedsOf(day(weeks, '2026-01-14'))).toEqual([{ kind: 'post', postId: 'old' }])
  })

  it("keeps the demo's city events on the demo's weeks, and gives other weeks the holidays", () => {
    const { weeks } = calendarOf('casa-vostra', state([], [], '2026-11-03'))
    const wk41 = weeks.find((w) => w.days[0]!.date === '2026-10-05')!
    expect(wk41.events).toContainEqual(expect.objectContaining({ text: 'F1 Singapore Grand Prix' }))
    const deepavali = weeks.find((w) => w.days[0]!.date === '2026-11-02')!
    expect(deepavali.label).toBe('WK 45')
    expect(deepavali.events).toContainEqual({
      layer: 'holiday',
      text: 'Deepavali',
      col: 7,
      span: 1,
    })
  })

  it("gives a brand made on the core the city's events and holidays, never a demo brand's own", () => {
    const { weeks } = calendarOf('lucali' as 'casa-vostra', state([], [], '2026-10-22'))
    const wk41 = weeks.find((w) => w.days[0]!.date === '2026-10-05')!
    expect(wk41.events).toContainEqual(expect.objectContaining({ text: 'F1 Singapore Grand Prix' }))
    const layers = new Set(weeks.flatMap((w) => w.events.map((e) => e.layer)))
    expect([...layers].every((l) => l === 'city' || l === 'holiday')).toBe(true)
  })
})
