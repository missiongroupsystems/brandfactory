import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { feedsOf } from '@/data/demo'
import { channelsOf } from '@/features/schedule/calendar-items'
import { storyTaken } from '@/features/schedule/move-post'
import { BrandProvider, useBrand } from '@/features/schedule/posts-store'

const wrapper = ({ children }: { children: ReactNode }) => <BrandProvider>{children}</BrandProvider>

describe('addIdeaToCalendar', () => {
  it('puts the idea on the calendar of the current brand only, and says which day', () => {
    const { result } = renderHook(() => useBrand(), { wrapper })
    act(() => result.current.setBrandId('temper'))
    let label: string | null = null
    act(() => {
      label = result.current.addIdeaToCalendar({
        format: 'reel',
        hook: 'Last seating. Lights down.',
        why: 'Room-at-night reels reach 2.6× daytime photos',
      })
    })
    expect(label).toBe('Mon 12 Oct')
    const day = result.current.weeks.flatMap((w) => w.days).find((d) => d.n === '12')!
    expect(feedsOf(day)).toEqual([
      {
        kind: 'idea',
        format: 'reel',
        hook: 'Last seating. Lights down.',
        why: 'Room-at-night reels reach 2.6× daytime photos',
      },
    ])
    act(() => result.current.setBrandId('casa-vostra'))
    const casa = result.current.weeks.flatMap((w) => w.days).find((d) => d.n === '12')!
    expect(feedsOf(casa)).toEqual([])
  })

  it('refuses a day that holds a post, and replaces an idea on the day it takes', () => {
    const { result } = renderHook(() => useBrand(), { wrapper })
    // Casa Vostra, 8 Oct holds two posts: the idea goes to the first free day after this week.
    let label: string | null = null
    act(() => {
      label = result.current.addIdeaToCalendar({ format: 'reel', hook: 'Moves', why: 'Test' }, '8')
    })
    expect(label).toBe('Mon 12 Oct')
    const busy = result.current.weeks.flatMap((w) => w.days).find((d) => d.n === '8')!
    expect(feedsOf(busy).map((m) => m.kind)).toEqual(['post', 'post'])
    // 23 Oct holds an idea; the new one takes its place.
    act(() => {
      result.current.addIdeaToCalendar({ format: 'reel', hook: 'Replaces', why: 'Test' }, '23')
    })
    const day = result.current.weeks.flatMap((w) => w.days).find((d) => d.n === '23')!
    expect(feedsOf(day)).toHaveLength(1)
    expect(feedsOf(day)[0]).toMatchObject({ kind: 'idea', hook: 'Replaces' })
  })
})

describe('planning from the shoot brief', () => {
  const day = (weeks: { days: { n: string }[] }[], n: string) =>
    weeks.flatMap((w) => w.days).find((d) => d.n === n)! as Parameters<typeof feedsOf>[0]

  it('turns an idea into a post at its stage, so the calendar shows what the brief decided', () => {
    const { result } = renderHook(() => useBrand(), { wrapper })
    let id = ''
    // "Blindfold pizza" sits on 23 as an idea tile; the brief plans it for 22 as a draft.
    act(() => {
      id = result.current.planPost(
        { format: 'reel', hook: 'Blindfold pizza: the rematch.' },
        '22',
        '12:00',
        'draft',
      )
    })
    expect(feedsOf(day(result.current.weeks, '22'))).toEqual([{ kind: 'post', postId: id }])
    expect(feedsOf(day(result.current.weeks, '23'))).toEqual([])
    expect(result.current.byId(id)).toMatchObject({ stage: 'draft', slot: 'Thu 22 Oct, 12:00' })

    act(() => result.current.setStage(id, 'scheduled'))
    act(() => {
      result.current.reschedule(id, '27', '19:30')
    })
    expect(feedsOf(day(result.current.weeks, '22'))).toEqual([])
    expect(feedsOf(day(result.current.weeks, '27'))).toEqual([{ kind: 'post', postId: id }])
    expect(result.current.byId(id)).toMatchObject({ stage: 'scheduled', slot: 'Tue 27 Oct, 19:30' })
  })

  it('keeps an idea on its day when the brief renames it, so planning it leaves no stray tile', () => {
    const { result } = renderHook(() => useBrand(), { wrapper })
    // "Blindfold pizza" is an idea tile on 23, found by its hook.
    act(() =>
      result.current.renameIdea('Blindfold pizza: the rematch.', 'Blindfold pizza, round two.'),
    )
    expect(feedsOf(day(result.current.weeks, '23'))).toMatchObject([
      { kind: 'idea', hook: 'Blindfold pizza, round two.' },
    ])
    let id = ''
    act(() => {
      id = result.current.planPost(
        { format: 'reel', hook: 'Blindfold pizza, round two.' },
        '23',
        '18:00',
        'scheduled',
      )
    })
    expect(feedsOf(day(result.current.weeks, '23'))).toEqual([{ kind: 'post', postId: id }])
  })

  it('keeps the accounts picked in the composer, so the month counts each one', () => {
    const { result } = renderHook(() => useBrand(), { wrapper })
    let id = ''
    act(() => {
      id = result.current.planPost(
        { format: 'reel', hook: 'One post, four accounts.', channels: ['ig', 'tt', 'yt', 'li'] },
        '14',
        '18:00',
        'scheduled',
      )
    })
    // A reel defaults to Instagram, TikTok and YouTube; the pick adds LinkedIn.
    expect(channelsOf(result.current.byId(id)!)).toEqual(['ig', 'tt', 'yt', 'li'])
  })

  it('changes nothing when a post is rescheduled to the day and time it has', () => {
    // Publish reports the time from an effect: a new posts array each time would loop.
    const { result } = renderHook(() => useBrand(), { wrapper })
    const before = result.current.posts
    let ok = false
    act(() => {
      ok = result.current.reschedule('pasta', '13', '12:00')
    })
    expect(ok).toBe(true)
    expect(result.current.posts).toBe(before)
    act(() => {
      result.current.reschedule('pasta', '13', '19:30')
    })
    expect(result.current.byId('pasta')).toMatchObject({ slot: 'Tue 13 Oct, 19:30' })
  })

  it('puts a story in the story row, one planned story a day, and moves it', () => {
    const { result } = renderHook(() => useBrand(), { wrapper })
    let a = ''
    let b = ''
    act(() => {
      a = result.current.planPost({ format: 'story', hook: 'Vote.' }, '12', '18:00', 'draft')
    })
    expect(day(result.current.weeks, '12').story).toEqual({ kind: 'post', postId: a })
    expect(feedsOf(day(result.current.weeks, '12'))).toEqual([])
    act(() => {
      b = result.current.planPost({ format: 'story', hook: 'Prep.' }, '14', '18:00', 'draft')
    })
    let moved = true
    act(() => {
      moved = result.current.reschedule(b, '12', '18:00')
    })
    expect(moved).toBe(false)
    act(() => {
      result.current.reschedule(a, '15', '08:00')
    })
    expect(day(result.current.weeks, '15').story).toEqual({ kind: 'post', postId: a })
    expect(day(result.current.weeks, '12').story).toEqual({ kind: 'open', draftsReady: false }) // A day whose stories are already out holds no new one either.
    expect(storyTaken(result.current.weeks, '5')).toBe(true)
    expect(storyTaken(result.current.weeks, '20')).toBe(false)
  })
})
