import { act, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { setCalendarPlace } from './calendar-view'
import { BrandProvider } from './posts-store'
import { SchedulePage } from './schedule-page'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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

// Imported posts reach back years: the title on the desktop and the phone says which year a
// period is in when it is not this one. The demo's today is Tue 6 Oct 2026; month 0 is October.
describe('the schedule title', () => {
  const shown = (place: Parameters<typeof setCalendarPlace>[0]) => {
    render(
      <BrandProvider>
        <SchedulePage />
      </BrandProvider>,
    )
    act(() => setCalendarPlace(place))
  }
  // Every h1 on the page: the desktop toolbar's title is one of them.
  const titles = () => screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)
  const phone = () =>
    screen.getByRole('button', { name: /\. Change view or month$/ }).getAttribute('aria-label')

  it('names no year in this year', () => {
    shown({ view: 'month', offset: 0, week: 0, day: 0 })
    // One h1: the phone's title is not a second heading on a desktop.
    expect(titles()).toEqual(['October'])
    expect(phone()).toBe('October. Change view or month')
  })

  it("names a month's own year: December 2025, though its last week runs into January", () => {
    shown({ view: 'month', offset: -10, week: 0, day: 0 })
    expect(titles()).toContain('December 2025')
    expect(phone()).toBe('December 2025. Change view or month')
  })

  it("names a week's year by its last day: the week into January is next year's", () => {
    // December 2026 is month 2; its last week is Mon 28 Dec – Sun 3 Jan.
    shown({ view: 'week', offset: 2, week: 3, day: 0 })
    expect(titles()).toContain('28 Dec – 3 Jan 2027')
    expect(phone()).toBe('28 Dec–3 Jan 2027. Change view or month')
  })

  it('names a day by its own year', () => {
    shown({ view: 'day', offset: -10, week: 0, day: 0 })
    expect(titles()).toEqual(['Monday 1 Dec 2025'])
    expect(phone()).toBe('Mon 1 Dec 2025. Change view or month')
  })
})
