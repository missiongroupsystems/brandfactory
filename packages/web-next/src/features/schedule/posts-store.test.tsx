import { act, renderHook } from '@testing-library/react'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { BRAND_CONTENT } from '@/data/brands'
import { feedsOf } from '@/data/demo'

import { BrandProvider, useBrand, usePosts } from './posts-store'

const wrapper = ({ children }: { children: ReactNode }) => <BrandProvider>{children}</BrandProvider>

describe('the posts store', () => {
  it('moves a post to a new stage, so the calendar tile follows the composer', () => {
    const { result } = renderHook(() => usePosts(), { wrapper })
    act(() => result.current.setStage('crust', 'scheduled'))
    expect(result.current.byId('crust')?.stage).toBe('scheduled')
  })

  it('changes nothing, not even identities, when the stage is already set', () => {
    // The composer calls this from an effect. A new array per call, or a new
    // setStage per render, re-ran that effect forever ("Maximum update depth exceeded").
    const { result } = renderHook(() => usePosts(), { wrapper })
    act(() => result.current.setStage('crust', 'scheduled'))
    const before = result.current
    act(() => result.current.setStage('crust', 'scheduled'))
    expect(result.current.posts).toBe(before.posts)
    expect(result.current.setStage).toBe(before.setStage)
  })
})

describe('taking a post back to an idea', () => {
  it('lifts the post off its day and puts the idea tile back there', () => {
    const { result } = renderHook(() => useBrand(), { wrapper })
    let id = ''
    act(() => {
      id = result.current.planPost(
        { format: 'reel', hook: 'Back to a plan.' },
        '27',
        '18:00',
        'draft',
      )
    })
    act(() =>
      result.current.unplanPost(id, { format: 'reel', hook: 'Back to a plan.', why: 'Team idea' }),
    )
    expect(result.current.byId(id)).toBeUndefined()
    const day = result.current.weeks.flatMap((w) => w.days).find((d) => d.n === '27')!
    expect(feedsOf(day)).toContainEqual({
      kind: 'idea',
      format: 'reel',
      hook: 'Back to a plan.',
      why: 'Team idea',
    })
  })

  it('gives the tile back its own words, and a suggestion stays a suggestion', () => {
    // Casa Vostra's Fri 9 Oct tile says why it is there: "F1 weekend". Planned and taken back,
    // it says the same, not the moment's title.
    const { result } = renderHook(() => useBrand(), { wrapper })
    const hook = 'Pizza before the lights go out.'
    let id = ''
    act(() => {
      id = result.current.planPost({ format: 'reel', hook }, '9', '18:00', 'draft')
    })
    act(() =>
      result.current.unplanPost(id, { format: 'reel', hook, why: 'F1 Singapore Grand Prix' }),
    )
    const day = result.current.weeks.flatMap((w) => w.days).find((d) => d.n === '9')!
    expect(feedsOf(day)).toContainEqual({ kind: 'idea', format: 'reel', hook, why: 'F1 weekend' })
    const tagliatelle = 'Watch the dough become tagliatelle.'
    act(() => {
      id = result.current.planPost({ format: 'reel', hook: tagliatelle }, '20', '18:00', 'draft')
    })
    act(() => result.current.unplanPost(id, { format: 'reel', hook: tagliatelle, why: 'x' }))
    const tue = result.current.weeks.flatMap((w) => w.days).find((d) => d.n === '20')!
    expect(feedsOf(tue).find((m) => m.kind === 'idea' && m.hook === tagliatelle)).toMatchObject({
      suggested: true,
    })
  })

  it("keeps a day's other ideas when a post lands there, or another idea is planned there", () => {
    const { result } = renderHook(() => useBrand(), { wrapper })
    const ideasOn = (n: string) =>
      feedsOf(result.current.weeks.flatMap((w) => w.days).find((d) => d.n === n)!)
        .filter((m) => m.kind === 'idea')
        .map((m) => (m.kind === 'idea' ? m.hook : ''))
    // Fri 9 Oct holds the F1 idea. A second idea planned there, then a post, leave it in place.
    act(() => {
      result.current.addIdeaToCalendar(
        { format: 'reel', hook: 'A second idea.', why: 'Team idea' },
        '9',
      )
    })
    act(() => {
      result.current.planPost({ format: 'reel', hook: 'A new post.' }, '9', '12:00', 'draft')
    })

    expect(ideasOn('9')).toEqual(['Pizza before the lights go out.', 'A second idea.'])
    // A post moved onto a day with an idea leaves the idea there too.
    act(() => {
      result.current.movePost('pasta', '9')
    })
    expect(ideasOn('9')).toEqual(['Pizza before the lights go out.', 'A second idea.'])
  })

  it('keeps a suggestion a suggestion when its day changes, and an idea on one day only', () => {
    const { result } = renderHook(() => useBrand(), { wrapper })
    const all = () => result.current.weeks.flatMap((w) => w.days.flatMap(feedsOf))
    const hook = 'Watch the dough become tagliatelle.'
    act(() =>
      result.current.placeIdea({ format: 'reel', hook, why: 'Insight', suggested: true }, '27'),
    )
    const moved = all().filter((m) => m.kind === 'idea' && m.hook === hook)
    expect(moved).toHaveLength(1)
    expect(moved[0]).toMatchObject({ suggested: true })
    // Planned again by Plan it, the idea leaves its old day rather than showing on two.
    act(() => {
      result.current.addIdeaToCalendar({ format: 'reel', hook, why: 'Insight' }, '29')
    })
    expect(all().filter((m) => m.kind === 'idea' && m.hook === hook)).toHaveLength(1)
  })

  it("opens a story's slot in the story row again", () => {
    const { result } = renderHook(() => useBrand(), { wrapper })
    let id = ''
    act(() => {
      id = result.current.planPost({ format: 'story', hook: 'A story.' }, '27', '18:00', 'draft')
    })
    act(() =>
      result.current.unplanPost(id, { format: 'story', hook: 'A story.', why: 'Team idea' }),
    )
    const day = result.current.weeks.flatMap((w) => w.days).find((d) => d.n === '27')!
    expect(day.story).toEqual({ kind: 'open', draftsReady: false })
    expect(feedsOf(day).some((m) => m.kind === 'idea' && m.hook === 'A story.')).toBe(false)
  })

  it('never takes back a post that went out', () => {
    const { result } = renderHook(() => useBrand(), { wrapper })
    act(() =>
      result.current.unplanPost('margherita', { format: 'reel', hook: 'x', why: 'Team idea' }),
    )
    expect(result.current.byId('margherita')?.stage).toBe('posted')
  })
})

describe('the brand switcher', () => {
  it('opens on Casa Vostra, so the demo starts where the deck does', () => {
    const { result } = renderHook(() => useBrand(), { wrapper })
    expect(result.current.brand.name).toBe('Casa Vostra')
    expect(result.current.posts.map((p) => p.id)).toEqual([
      'crust',
      'ravioli',
      'pasta',
      'wine-night',
      'margherita',
      'five-pastas',
    ])
  })

  it('swaps every brand-dependent list when the brand changes', () => {
    const { result } = renderHook(() => useBrand(), { wrapper })
    act(() => result.current.setBrandId('carlitos'))
    expect(result.current.brand.name).toBe('Carlitos')
    const ids = result.current.posts.map((p) => p.id)
    expect(ids.every((id) => id.startsWith('carlitos-'))).toBe(true)
    // The calendar, the composer and the publish caption all read the same brand.
    const feedIds = result.current.weeks
      .flatMap((w) => w.days)
      .flatMap((d) => feedsOf(d).flatMap((f) => (f.kind === 'post' ? [f.postId] : [])))
    expect(feedIds.sort()).toEqual([...ids].sort())
    expect(Object.keys(result.current.captions).sort()).toEqual([...ids].sort())
    expect(result.current.library.every((src) => src.startsWith('/demo/carlitos/'))).toBe(true)
  })

  it('keeps a changed stage when the user switches away and back', () => {
    const { result } = renderHook(() => useBrand(), { wrapper })
    act(() => result.current.setBrandId('temper'))
    act(() => result.current.setStage('temper-pour', 'draft'))
    act(() => result.current.setBrandId('carlitos'))
    expect(result.current.byId('carlitos-croquetas')?.stage).toBe('scheduled')
    act(() => result.current.setBrandId('temper'))
    expect(result.current.byId('temper-pour')?.stage).toBe('draft')
    // A stage set on one brand never leaks into another's posts.
    act(() => result.current.setBrandId('casa-vostra'))
    expect(result.current.posts.map((p) => p.stage)).toEqual([
      'scheduled',
      'scheduled',
      'draft',
      'posted',
      'posted',
      'draft',
    ])
  })

  it('never shares a post id between brands, since the store looks posts up by id alone', () => {
    const ids = BRAND_CONTENT.flatMap((c) => c.posts.map((p) => p.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('points every photo at a file that ships in public/, so no tile renders empty', () => {
    const srcs = BRAND_CONTENT.flatMap((c) => [
      c.brand.logo,
      ...c.library,
      ...c.posts.flatMap((p) => p.images),
      ...c.weeks.flatMap((w) =>
        w.days.flatMap((d) => (d.story.kind === 'posted' ? [d.story.image] : [])),
      ),
    ])
    const missing = srcs.filter((src) => !existsSync(join(__dirname, '../../../public', src)))
    expect(missing).toEqual([])
  })

  it('links each idea that has a post to a post of the same brand', () => {
    for (const c of BRAND_CONTENT) {
      const ids = new Set(c.posts.map((p) => p.id))
      for (const idea of c.ideas) if (idea.postId) expect(ids.has(idea.postId)).toBe(true)
    }
  })

  it('lists Casa Vostra, Temper and Carlitos, in that order', () => {
    expect(BRAND_CONTENT.map((c) => c.brand.name)).toEqual(['Casa Vostra', 'Temper', 'Carlitos'])
  })

  it('gives every switchable brand a post each week with its own cover, so the calendar visibly changes', () => {
    const covers = new Set<string>()
    for (const c of BRAND_CONTENT.filter((b) => b.brand.id !== 'casa-vostra')) {
      for (const w of c.weeks) {
        const ids = w.days.flatMap((d) =>
          feedsOf(d).flatMap((f) => (f.kind === 'post' ? [f.postId] : [])),
        )
        expect(ids.length, `${c.brand.name} ${w.label}`).toBeGreaterThan(0)
        for (const id of ids) {
          const cover = c.posts.find((p) => p.id === id)!.images[0]!
          expect(covers.has(cover), cover).toBe(false)
          covers.add(cover)
        }
      }
    }
  })
})
