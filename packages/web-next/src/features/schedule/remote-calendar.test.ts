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

const state = (posts: object[], ideas: object[] = []) => ({
  brand: { id: 'casa-vostra' },
  posts,
  ideas,
})

const day = (weeks: ReturnType<typeof calendarOf>['weeks'], n: string) =>
  weeks.flatMap((w) => w.days).find((d) => d.n === n && !d.outside)!

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
    expect(feedsOf(day(weeks, '14'))).toEqual([
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
    expect(day(weeks, '8').story).toEqual({ kind: 'posted', image: '/demo/pasta.jpg', count: 2 })
    expect(day(weeks, '9').story).toEqual({ kind: 'post', postId: 's3' })
    expect(posts.map((p) => p.id)).toEqual(['s3'])
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
})
