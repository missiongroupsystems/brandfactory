import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { POSTS } from '@/data/demo'
import type * as Remote from '@/lib/remote'

import { setCalendarPlace } from './calendar-view'
import { dayOf } from './move-post'
import { BrandProvider, useBrand } from './posts-store'
import { SchedulePage } from './schedule-page'
import { useMoveWithUndo } from './use-move-post'
import { PostTile } from './week-grid'

// What the calendar tells and offers: a drag says where the post went, an empty hour can be found,
// a tile says what it is, and a phone's plus starts a post at once.
const told = vi.hoisted(() => ({ report: vi.fn(), push: vi.fn() }))
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  report: told.report,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: told.push, replace: vi.fn() }),
}))
vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
}))
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.scrollTo = vi.fn()
})
beforeEach(() => {
  told.report.mockClear()
  told.push.mockClear()
})

describe('a post moved on the calendar', () => {
  it('says where it went, and Undo carries it back to the day it left', () => {
    const { result } = renderHook(() => ({ brand: useBrand(), move: useMoveWithUndo() }), {
      wrapper: BrandProvider,
    })
    const from = dayOf(result.current.brand.weeks, 'five-pastas')!
    act(() => {
      result.current.move('five-pastas', '2026-10-28')
    })
    expect(dayOf(result.current.brand.weeks, 'five-pastas')).toBe('2026-10-28')
    const [words, action] = told.report.mock.calls.at(-1)!
    expect(words).toBe('Moved to Wed 28 Oct')
    expect(action.label).toBe('Undo')
    act(() => {
      action.run()
    })
    expect(dayOf(result.current.brand.weeks, 'five-pastas')).toBe(from)
  })
})

describe('a tile on the calendar', () => {
  it('names a single photo a photo, never a carousel', () => {
    const one = { ...POSTS.find((p) => p.id === 'ravioli')!, images: [POSTS[0]!.images[0]!] }
    const two = POSTS.find((p) => p.id === 'ravioli')!
    render(
      <BrandProvider>
        <PostTile post={one} eager={false} onOpen={() => {}} />
        <PostTile post={two} eager={false} onOpen={() => {}} />
      </BrandProvider>,
    )
    expect(screen.getByRole('button', { name: new RegExp(`^Photo: ${one.hook}`) })).toBeTruthy()
    expect(screen.getByRole('button', { name: new RegExp(`^Carousel: ${two.hook}`) })).toBeTruthy()
  })
})

describe('the day view', () => {
  it('gives each empty hour a name and a place in the tab order, and opens a post at it', () => {
    const { container } = render(
      <BrandProvider>
        <SchedulePage />
      </BrandProvider>,
    )
    // Wed 7 Oct, a day ahead of the demo's today.
    act(() => setCalendarPlace({ view: 'day', offset: 0, week: 1, day: 2 }))
    const desk = container.querySelector<HTMLElement>('.bb-swap.max-md\\:hidden')!
    const hour = within(desk).getByRole('button', { name: 'New post at 11:00' })
    expect(hour).not.toHaveAttribute('tabindex', '-1')
    fireEvent.click(hour)
    expect(told.push).toHaveBeenCalledWith(
      expect.stringMatching(/^\/post\/new\?day=.+&time=11%3A00$/),
    )
  })
})

describe('the month view', () => {
  function monthDesk() {
    const { container } = render(
      <BrandProvider>
        <SchedulePage />
      </BrandProvider>,
    )
    act(() => setCalendarPlace({ view: 'month', offset: 0, week: 1, day: 1 }))
    // The desktop half of the page; a change of view mounts it anew.
    return () => container.querySelector<HTMLElement>('.bb-swap.max-md\\:hidden')!
  }

  it('shows a busy day as its first post with the time, the rest counted', () => {
    // Thu 8 Oct: posts at 12:00 and 18:00, and three stories out.
    const cell = monthDesk()().querySelector<HTMLElement>('[data-drop="2026-10-08"]')!
    expect(within(cell).getByText('12:00')).toBeTruthy()
    expect(within(cell).getByText('+1 more')).toBeTruthy()
    expect(within(cell).getByText('3 stories')).toBeTruthy()
    expect(cell.querySelectorAll('img').length).toBeGreaterThanOrEqual(1)
  })

  it('reads an idea as "1 idea", in words, not as a glyph with a number', () => {
    const cell = monthDesk()().querySelector<HTMLElement>('[data-drop="2026-10-09"]')!
    expect(within(cell).getByText('1 idea')).toBeTruthy()
    expect(within(cell).queryByText('1')).toBeNull()
  })

  it('opens the composer on the day from the plus, and the day view from the rest of the cell', () => {
    const desk = monthDesk()
    const cell = desk().querySelector<HTMLElement>('[data-drop="2026-10-08"]')!
    fireEvent.click(within(cell).getByRole('button', { name: 'New post on 8' }))
    expect(told.push).toHaveBeenCalledWith('/post/new?day=2026-10-08')
    fireEvent.click(within(cell).getByRole('button', { name: /^Open 8 in the day view/ }))
    expect(within(desk()).getByRole('button', { name: 'New post at 11:00' })).toBeTruthy()
  })
})

describe('the phone calendar', () => {
  it('opens a new post from the plus at once, with New shoot in the title menu', () => {
    const { container } = render(
      <BrandProvider>
        <SchedulePage />
      </BrandProvider>,
    )
    act(() => setCalendarPlace({ view: 'week', offset: 0, week: 1, day: 1 }))
    const phone = container.querySelector<HTMLElement>('.md\\:hidden')!
    fireEvent.click(within(phone).getByRole('button', { name: 'New post' }))
    expect(told.push).toHaveBeenCalledWith(expect.stringMatching(/^\/post\/new/))
    fireEvent.click(within(phone).getByRole('button', { name: /Change view or month/ }))
    expect(within(phone).getByRole('button', { name: 'New shoot' })).toBeTruthy()
    expect(within(phone).getByRole('button', { name: /^Filters/ })).toBeTruthy()
  })
})
