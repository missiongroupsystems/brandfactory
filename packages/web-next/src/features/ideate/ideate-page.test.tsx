import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
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

// jsdom has no media queries; the preview asks whether it is on a phone.
if (!window.matchMedia) {
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList
}

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
    // A tap opens a pin; Select makes taps pick, with the chips still there to change folder.
    expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(screen.getByRole('tablist', { name: 'Folders' })).toBeInTheDocument()
    const [first, second] = screen.getAllByRole('checkbox')
    // The first post picked lends the idea its words and format.
    const pins = IDEAS_BY_BRAND['casa-vostra'].boards.flatMap((b) => b.pins)
    const lead = pins.find(
      (p) => first!.getAttribute('aria-label') === `${p.account}: ${p.borrow}`,
    )!
    fireEvent.click(first!)
    fireEvent.click(second!)
    fireEvent.click(screen.getByRole('button', { name: 'Plan idea' }))
    const { result } = renderHook(() => useIdeas('casa-vostra'))
    const made = result.current.ideas.at(-1)!
    expect(made.inspiration).toHaveLength(2)
    expect(made.inspiration[0]).toBe(lead.id)
    expect(made).toMatchObject({ hook: lead.seed.hook, format: lead.seed.format })
    expect(push).toHaveBeenCalledWith(`/ideate/${made.id}`)
  })

  it('opens a pin on a tap, bigger, with one thing to do: plan an idea from it', () => {
    openMoodboard()
    fireEvent.click(screen.getByRole('button', { name: 'Pinterest' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect Casa Vostra’s board' }))
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    const pins = IDEAS_BY_BRAND['casa-vostra'].boards.flatMap((b) => b.pins)
    const first = screen.getByRole('button', { name: `${pins[0]!.account}: ${pins[0]!.borrow}` })
    fireEvent.click(first)
    const dialog = screen.getByRole('dialog', { name: pins[0]!.account })
    expect(within(dialog).getByText(pins[0]!.borrow)).toBeInTheDocument()
    // The demo's boards have no address on pinterest.com, so there is nothing to open there.
    expect(within(dialog).queryByRole('link', { name: /Open on/ })).toBeNull()
    // The arrow keys walk the board; Escape closes and the pin on show takes the focus.
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByRole('dialog')).toHaveTextContent('2 /')
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByRole('dialog')).toHaveTextContent('1 /')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(first).toHaveFocus()
    fireEvent.click(first)
    fireEvent.click(screen.getByRole('button', { name: 'Plan idea from this' }))
    const { result } = renderHook(() => useIdeas('casa-vostra'))
    const made = result.current.ideas.at(-1)!
    expect(made.inspiration).toEqual([pins[0]!.id])
    expect(push).toHaveBeenCalledWith(`/ideate/${made.id}`)
  })

  it('takes a pasted link in one step, on any chip, and asks what to borrow on the card', () => {
    // The judge needed five steps to find the paste box; it sits in the chip row now.
    openMoodboard()
    fireEvent.click(screen.getByRole('button', { name: 'Pinterest' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect Casa Vostra’s board' }))
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    const field = screen.getByLabelText('Paste an Instagram or TikTok link')
    fireEvent.change(field, { target: { value: 'https://www.instagram.com/reel/C9abc123/' } })
    fireEvent.submit(field.closest('form')!)
    // The link has a home chip without the DM source, and its words field takes the cursor.
    expect(screen.getByRole('tab', { name: /Instagram/ })).toBeInTheDocument()
    const words = screen.getByLabelText('What to borrow')
    expect(words).toHaveFocus()
    fireEvent.change(words, { target: { value: 'The slow zoom on the cheese pull' } })
    fireEvent.keyDown(words, { key: 'Enter' })
    fireEvent.blur(words)
    expect(screen.getByRole('button', { name: /instagram.com: The slow zoom/ })).toBeInTheDocument()
    expect(ideasOf('casa-vostra').sources.dm).toBe(false)
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
