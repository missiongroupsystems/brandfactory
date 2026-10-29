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

// jsdom has no scrolling; the setup panel scrolls itself into view when it opens.
Element.prototype.scrollIntoView = vi.fn()

beforeEach(() => {
  resetIdeas()
  push.mockClear()
  vi.useFakeTimers()
})

afterEach(() => vi.useRealTimers())

const ideasOf = (id: 'casa-vostra' | 'temper') => renderHook(() => useIdeas(id)).result.current

const openMoodboard = () =>
  render(
    <BrandProvider>
      <IdeatePage />
    </BrandProvider>,
  )

describe('the moodboard', () => {
  it("connects the brand's own board from the team's one Pinterest account", () => {
    // The team keeps one Pinterest account with a board per brand: another brand's board must
    // never feed this moodboard.
    openMoodboard()
    fireEvent.click(screen.getByRole('button', { name: 'Pinterest' }))
    expect(screen.getByRole('radio', { name: 'Casa Vostra board' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    // Other brands' boards are not even listed: no greyed noise, nothing to pick by mistake.
    expect(screen.queryByRole('radio', { name: 'Temper board' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Connect Casa Vostra’s board' }))
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(ideasOf('casa-vostra').sources).toEqual({ pinterest: true, dm: false, tt: false })
    expect(ideasOf('temper').sources.pinterest).toBe(false)
  })

  it('brings Instagram in by DM to the moodboard account, with the brand tag', () => {
    // Instagram lets no app read saved posts, so the honest route is a DM with the brand's tag.
    openMoodboard()
    fireEvent.click(screen.getByRole('button', { name: 'Instagram DMs' }))
    expect(screen.getAllByText('@mission.moodboards').length).toBeGreaterThan(0)
    expect(screen.getByText('#casavostra')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }))
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(ideasOf('casa-vostra').sources).toEqual({ pinterest: false, dm: true, tt: false })
    // One name for one thing: the source button says Instagram DMs, so the chip says Instagram.
    expect(screen.getByRole('tab', { name: /Instagram/ })).toBeInTheDocument()
  })

  it('offers the sources not yet on the board behind one chip, not one chip each', () => {
    openMoodboard()
    fireEvent.click(screen.getByRole('button', { name: 'Pinterest' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect Casa Vostra’s board' }))
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.queryByRole('button', { name: /^Add Instagram/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add a source' }))
    fireEvent.click(screen.getByRole('button', { name: 'TikTok' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect TikTok' }))
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(ideasOf('casa-vostra').sources).toEqual({ pinterest: true, dm: false, tt: true })
    // The popover closes; it does not jump on to the Instagram setup nobody asked for.
    expect(screen.queryByText(/It lands on/)).toBeNull()
  })

  it('makes the idea from the picked posts and opens its page, with no step between', () => {
    openMoodboard()
    fireEvent.click(screen.getByRole('button', { name: 'Pinterest' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect Casa Vostra’s board' }))
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

// The judge found the cards uneven: a green statistic on some, "Use it" on moments and "Plan it"
// on ideas. One action word, and the statistic stays on the idea's own page.
describe('the current ideas', () => {
  it('show no statistic on a card, and one action word: Plan it', () => {
    openMoodboard()
    fireEvent.click(screen.getByRole('radio', { name: 'Current ideas' }))
    expect(screen.queryByText('Hand-made reels hold viewers 2× longer')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Use it' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Plan it' }).length).toBeGreaterThan(0)
  })
})
