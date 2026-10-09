import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { IDEAS_BY_BRAND } from '@/data/ideas'
import { BrandProvider } from '@/features/schedule/posts-store'

import { IdeatePage } from './ideate-page'
import { resetIdeas, useIdeas } from './ideas-store'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => '/ideate',
  useRouter: () => ({ push, replace: vi.fn() }),
}))

// jsdom has no ResizeObserver; the board keeps its default column count without one.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
)

beforeEach(() => {
  resetIdeas()
  push.mockClear()
  vi.useFakeTimers()
})

afterEach(() => vi.useRealTimers())

const openMoodboard = () =>
  render(
    <BrandProvider>
      <IdeatePage />
    </BrandProvider>,
  )

describe('the moodboard', () => {
  it('connects every account tapped while the first is still connecting', () => {
    // One pending slot once ignored the second and third taps.
    openMoodboard()
    fireEvent.click(screen.getByRole('button', { name: 'Pinterest' }))
    fireEvent.click(screen.getByRole('button', { name: 'Instagram' }))
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    const { result } = renderHook(() => useIdeas('casa-vostra'))
    expect(result.current.sources).toMatchObject({ pinterest: true, ig: true, tt: false })
  })

  it('makes the idea from the picked posts and opens its page, with no step between', () => {
    openMoodboard()
    fireEvent.click(screen.getByRole('button', { name: 'Pinterest' }))
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    const [first, second] = screen.getAllByRole('checkbox')
    // The first post picked lends the idea its words and format.
    const pins = IDEAS_BY_BRAND['casa-vostra'].boards.flatMap((b) => b.pins)
    const lead = pins.find(
      (p) => first!.getAttribute('aria-label') === `${p.account}: ${p.borrow}`,
    )!
    fireEvent.click(first!)
    fireEvent.click(second!)
    fireEvent.click(screen.getByRole('button', { name: 'Plan idea from this' }))
    const { result } = renderHook(() => useIdeas('casa-vostra'))
    const made = result.current.ideas.at(-1)!
    expect(made.inspiration).toHaveLength(2)
    expect(made.inspiration[0]).toBe(lead.id)
    expect(made).toMatchObject({ hook: lead.seed.hook, format: lead.seed.format })
    expect(push).toHaveBeenCalledWith(`/ideate/${made.id}`)
  })
})
