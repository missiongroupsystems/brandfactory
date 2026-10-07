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
  it('moves a post to a new stage, so the calendar tile follows the drawer', () => {
    const { result } = renderHook(() => usePosts(), { wrapper })
    act(() => result.current.setStage('crust', 'scheduled'))
    expect(result.current.byId('crust')?.stage).toBe('scheduled')
  })

  it('changes nothing, not even identities, when the stage is already set', () => {
    // The publish drawer calls this from an effect. A new array per call, or a new
    // setStage per render, re-ran that effect forever ("Maximum update depth exceeded").
    const { result } = renderHook(() => usePosts(), { wrapper })
    act(() => result.current.setStage('crust', 'scheduled'))
    const before = result.current
    act(() => result.current.setStage('crust', 'scheduled'))
    expect(result.current.posts).toBe(before.posts)
    expect(result.current.setStage).toBe(before.setStage)
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
      'five-pastas',
    ])
  })

  it('swaps every brand-dependent list when the brand changes', () => {
    const { result } = renderHook(() => useBrand(), { wrapper })
    act(() => result.current.setBrandId('carlitos'))
    expect(result.current.brand.name).toBe('Carlitos')
    const ids = result.current.posts.map((p) => p.id)
    expect(ids.every((id) => id.startsWith('carlitos-'))).toBe(true)
    // The calendar, the drawer and the publish caption all read the same brand.
    const feedIds = result.current.weeks
      .flatMap((w) => w.days)
      .flatMap((d) => feedsOf(d).flatMap((f) => (f.kind === 'post' ? [f.postId] : [])))
    expect(feedIds.sort()).toEqual([...ids].sort())
    expect(Object.keys(result.current.captions).sort()).toEqual([...ids].sort())
    expect(result.current.library.every((src) => src.startsWith('/demo/carlitos/'))).toBe(true)
  })

  it('keeps a scheduled stage when the user switches away and back', () => {
    const { result } = renderHook(() => useBrand(), { wrapper })
    act(() => result.current.setBrandId('temper'))
    act(() => result.current.setStage('temper-pour', 'scheduled'))
    act(() => result.current.setBrandId('carlitos'))
    expect(result.current.byId('carlitos-croquetas')?.stage).toBe('approved')
    act(() => result.current.setBrandId('temper'))
    expect(result.current.byId('temper-pour')?.stage).toBe('scheduled')
    // A stage set on one brand never leaks into another's posts.
    act(() => result.current.setBrandId('casa-vostra'))
    expect(result.current.posts.map((p) => p.stage)).toEqual([
      'approved',
      'scheduled',
      'editing',
      'draft',
    ])
  })

  it('never shares a post id between brands, since the store looks posts up by id alone', () => {
    const ids = BRAND_CONTENT.flatMap((c) => c.posts.map((p) => p.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('points every photo at a file that ships in public/, so no tile renders empty', () => {
    const srcs = BRAND_CONTENT.flatMap((c) => [
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
