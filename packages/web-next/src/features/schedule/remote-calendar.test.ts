import { describe, expect, it } from 'vitest'

import { feedsOf } from '@/data/demo'

import { calendarOf, postingTimes } from './remote-calendar'

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

  it("gives casa-vostra on the core none of the demo brand's own events", () => {
    // Production's casa-vostra shares the demo brand's id: its "Our events" are invented.
    const { weeks } = calendarOf('casa-vostra', state([], [], '2026-10-22'))
    const texts = weeks.flatMap((w) => w.events.map((e) => e.text))
    expect(texts).not.toContain('Wine pairing night')
    expect(texts).not.toContain('Private dinner · 40')
    expect(texts).toContain('F1 Singapore Grand Prix')
    const layers = new Set(weeks.flatMap((w) => w.events.map((e) => e.layer)))
    expect([...layers].every((l) => l === 'city' || l === 'holiday')).toBe(true)
  })
})

describe('the best time to post, from the brand posts that went out', () => {
  // 5 Oct 2026 is a Monday, 8 Oct a Thursday.
  const out = (n: number, day: string, time: string, likes: number, views = 0) =>
    Array.from({ length: n }, (_, i) =>
      post({ id: `${day}-${time}-${i}`, stage: 'posted', day, time, metrics: { likes, views } }),
    )

  it('says nothing under twenty posts with numbers: a guess is worse than no mark', () => {
    const few = [...out(10, '2026-10-08', '18:00', 90), ...out(9, '2026-10-05', '09:00', 10)]
    expect(postingTimes(few)).toBeUndefined()
    // Posts without numbers, or not posted, do not make up the count.
    const padded = [
      ...few,
      post({ id: 'bare', stage: 'posted', day: '2026-10-05', time: '09:00' }),
      post({
        id: 'plan',
        stage: 'planned',
        day: '2026-10-05',
        time: '09:00',
        metrics: { likes: 5 },
      }),
    ]
    expect(postingTimes(padded)).toBeUndefined()
    expect(postingTimes([...few, ...out(1, '2026-10-05', '09:00', 10)])).toBeDefined()
  })

  it('finds the hour and the weekday that did best', () => {
    const times = postingTimes([
      ...out(12, '2026-10-08', '18:00', 90),
      ...out(8, '2026-10-05', '09:00', 10),
    ])!
    expect(times.best).toBe('18:00')
    expect(times.hours[3]).toBe(1)
    expect(times.hours[0]).toBeLessThan(0.5)
    expect(times.days[3]).toBe(1)
    expect(times.days[0]).toBeLessThan(0.5)
    expect(times.days).toHaveLength(7)
  })

  it('counts likes, comments, shares and saves; an hour between dayparts goes to the nearest', () => {
    const mixed = (n: number, time: string, metrics: object) =>
      Array.from({ length: n }, (_, i) =>
        post({ id: `${time}-${i}`, stage: 'posted', day: '2026-10-06', time, metrics }),
      )
    const times = postingTimes([
      ...mixed(10, '12:40', { likes: 5, comments: 10, shares: 10, saves: 10, views: 1 }),
      ...mixed(10, '19:10', { likes: 20, views: 9000 }),
    ])!
    expect(times.best).toBe('12:00')
  })

  it('never names an hour with fewer than three posts, however well they did', () => {
    const times = postingTimes([
      ...out(18, '2026-10-06', '12:00', 10),
      ...out(2, '2026-10-06', '21:00', 5000),
    ])!
    expect(times.best).toBe('12:00')
    // The thin hour keeps the average: no taller than the best.
    expect(times.hours[4]).toBeLessThanOrEqual(times.hours[1]!)
  })

  it('breaks a tie on engagement with views', () => {
    const times = postingTimes([
      ...out(10, '2026-10-06', '09:00', 40, 100),
      ...out(10, '2026-10-06', '15:00', 40, 900),
    ])!
    expect(times.best).toBe('15:00')
  })
})
