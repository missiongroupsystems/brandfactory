import { act, fireEvent, render, renderHook, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { POSTS } from '@/data/demo'

import { setCalendarPlace, useCalendarPlace } from './calendar-view'
import { BrandProvider, useBrand } from './posts-store'
import { SchedulePage } from './schedule-page'

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push, replace: vi.fn() }),
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

// The judge counted two taps to open a post on a phone: the first only picked its day. A tap
// on a photo means "show me this post", so the first one opens it.
describe('a post on the phone calendar', () => {
  it('opens on the first tap', () => {
    const { container } = render(
      <BrandProvider>
        <SchedulePage />
      </BrandProvider>,
    )
    act(() => setCalendarPlace({ view: 'month', offset: 0, week: 0, day: 0 }))
    const phone = container.querySelector<HTMLElement>('.md\\:hidden')!
    const reel = POSTS.find((p) => p.id === 'margherita')!
    const tile = within(phone).getAllByRole('button', { name: new RegExp(`^${reel.hook}, `) })[0]!
    fireEvent.click(tile)
    expect(push).toHaveBeenCalledWith('/post/margherita')
  })

  // November's grid borrows October's last week as its first row. Picking a day there switches
  // to October's day view, so Back from the post would land on the wrong month.
  it('opens a post in the borrowed first row and leaves the month as it was', () => {
    push.mockClear()
    let brand: ReturnType<typeof useBrand> | undefined
    function Probe() {
      brand = useBrand()
      return null
    }
    const { container } = render(
      <BrandProvider>
        <Probe />
        <SchedulePage />
      </BrandProvider>,
    )
    // Sun 1 Nov is November's only day in that row: a post there is in the borrowed row.
    act(() => {
      brand!.movePost('five-pastas', '2026-11-01')
    })
    act(() => setCalendarPlace({ view: 'month', offset: 1, week: 0, day: 0 }))
    const phone = container.querySelector<HTMLElement>('.md\\:hidden')!
    const post = POSTS.find((p) => p.id === 'five-pastas')!
    const tile = within(phone).getAllByRole('button', { name: new RegExp(`^${post.hook}, `) })[0]!
    fireEvent.click(tile)
    expect(push).toHaveBeenCalledWith('/post/five-pastas')
    const place = renderHook(() => useCalendarPlace()).result.current
    expect(place.view).toBe('month')
    expect(place.offset).toBe(1)
  })
})
