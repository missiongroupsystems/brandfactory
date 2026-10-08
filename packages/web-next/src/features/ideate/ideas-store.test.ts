import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { coverOf, IDEAS_BY_BRAND } from '@/data/ideas'

import {
  addIdeaFromPosts,
  keepSuggestion,
  resetIdeas,
  setDay,
  setHook,
  skipSuggestion,
  suggest,
  useIdeas,
} from './ideas-store'

beforeEach(() => resetIdeas())

// The month's eight are feed posts: stories ride alongside and do not fill a slot.
const own = (ideas: { status: string; format: string }[]) =>
  ideas.filter((i) => i.status !== 'suggested' && i.format !== 'story')
const stories = (ideas: { format: string }[]) => ideas.filter((i) => i.format === 'story')

describe('the ideas store', () => {
  it('starts each brand at five of eight, with three suggestions hidden', () => {
    const { result } = renderHook(() => useIdeas('casa-vostra'))
    expect(own(result.current.ideas)).toHaveLength(5)
    expect(result.current.ideas.length - stories(result.current.ideas).length).toBe(8)
    expect(stories(result.current.ideas)).toHaveLength(2)
    expect(result.current.target).toBe(8)
    expect(result.current.suggesting).toBe(false)
  })

  it('shows the suggestions in place without opening one', () => {
    const { result } = renderHook(() => useIdeas('casa-vostra'))
    act(() => suggest('casa-vostra'))
    expect(result.current.suggesting).toBe(true)
  })

  it('keeps a suggestion as an idea that still says what it was built on', () => {
    const { result } = renderHook(() => useIdeas('temper'))
    act(() => {
      suggest('temper')
      keepSuggestion('temper', 'tp-s-ask-floor')
    })
    const kept = result.current.ideas.find((i) => i.id === 'tp-s-ask-floor')!
    expect(kept.status).toBe('idea')
    expect(kept.builtOn?.idea.hook).toBe('What the sommelier drinks on a Monday.')
    expect(own(result.current.ideas)).toHaveLength(6)
  })

  it('drops a skipped suggestion', () => {
    const { result } = renderHook(() => useIdeas('carlitos'))
    act(() => {
      suggest('carlitos')
      skipSuggestion('carlitos', 'ca-s-sherry')
    })
    expect(result.current.ideas.map((i) => i.id)).not.toContain('ca-s-sherry')
  })

  it('plans an idea from the posts picked, keeps every post, and keeps the brands apart', () => {
    const temper = renderHook(() => useIdeas('temper'))
    const casa = renderHook(() => useIdeas('casa-vostra'))
    const { boards, references } = IDEAS_BY_BRAND.temper
    // A pin first, then a saved Instagram post and a TikTok one: all three platforms in one idea.
    const posts = [boards[0]!.pins[0]!, references[0]!, boards[1]!.pins[2]!]
    let id = ''
    act(() => {
      id = addIdeaFromPosts('temper', posts)
    })
    const idea = temper.result.current.ideas.at(-1)!
    expect(idea.id).toBe(id)
    // The first post lends its words and its shots; the idea remembers all three, in order.
    expect(idea).toMatchObject({
      hook: posts[0]!.seed.hook,
      format: posts[0]!.seed.format,
      shots: posts[0]!.seed.shots,
      inspiration: posts.map((p) => p.id),
      status: 'idea',
      source: { kind: 'reference', account: 'Bar moods' },
    })
    expect(coverOf('temper', idea)).toBe(posts[0]!.image)
    expect(casa.result.current.ideas).toHaveLength(IDEAS_BY_BRAND['casa-vostra'].ideas.length)
  })

  it('takes the hook and the format written in the plan step over the first post’s', () => {
    const { result } = renderHook(() => useIdeas('carlitos'))
    const posts = IDEAS_BY_BRAND.carlitos.boards[0]!.pins.slice(0, 2)
    act(() => {
      addIdeaFromPosts('carlitos', posts, { hook: 'Sunday, from the pan.', format: 'story' })
    })
    const idea = result.current.ideas.at(-1)!
    expect(idea).toMatchObject({ hook: 'Sunday, from the pan.', format: 'story', sharper: [] })
    expect(idea.inspiration).toEqual(posts.map((p) => p.id))
  })

  it('swaps a hook for a sharper one, and records the day it was sent to', () => {
    const { result } = renderHook(() => useIdeas('casa-vostra'))
    const card = result.current.ideas[0]!
    act(() => {
      setHook('casa-vostra', card.id, card.sharper[0]!.text)
      setDay('casa-vostra', card.id, '14')
    })
    expect(result.current.ideas[0]).toMatchObject({ hook: card.sharper[0]!.text, dayN: '14' })
  })
})
