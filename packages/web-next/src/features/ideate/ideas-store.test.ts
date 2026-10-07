import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { IDEAS_BY_BRAND } from '@/data/ideas'

import {
  addIdea,
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

  it('adds an idea from a pin, and keeps the brands apart', () => {
    const temper = renderHook(() => useIdeas('temper'))
    const casa = renderHook(() => useIdeas('casa-vostra'))
    const pin = IDEAS_BY_BRAND.temper.boards[0]!.pins[0]!
    let id = ''
    act(() => {
      id = addIdea('temper', pin.seed, { kind: 'reference', account: pin.account })
    })
    expect(temper.result.current.ideas.at(-1)!.id).toBe(id)
    expect(temper.result.current.ideas.at(-1)).toMatchObject({
      hook: pin.seed.hook,
      status: 'idea',
      source: { kind: 'reference', account: 'Bar moods' },
    })
    expect(casa.result.current.ideas).toHaveLength(IDEAS_BY_BRAND['casa-vostra'].ideas.length)
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
