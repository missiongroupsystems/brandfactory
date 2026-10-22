import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { setCalendarPlace } from './calendar-view'
import { firstPostYear, monthPlace } from './month'
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

// The demo's today is Tue 6 Oct 2026, so month 0 is October 2026. Imported posts reach back years,
// so the title jumps to any month: a step at a time would take dozens of clicks.
describe('the month picker on the calendar title', () => {
  const shown = (view: 'month' | 'week' | 'day') => {
    render(
      <BrandProvider>
        <SchedulePage />
      </BrandProvider>,
    )
    act(() => setCalendarPlace({ view, offset: 0, week: 0, day: 0 }))
  }
  const titles = () => screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)
  const open = () => fireEvent.click(screen.getByRole('button', { name: /\. Pick a month$/ }))
  const nextYear = () => fireEvent.click(screen.getByRole('button', { name: 'Next year' }))

  it('jumps the month view to the month and year picked', () => {
    shown('month')
    open()
    nextYear()
    fireEvent.click(screen.getByRole('button', { name: 'April 2027' }))
    expect(titles()).toContain('April 2027')
    expect(screen.queryByRole('dialog', { name: 'Pick a month' })).toBeNull()
  })

  it("jumps the week view to the month's first week", () => {
    // 1 Apr 2027 is a Thursday: April's first week starts on Monday 5 April.
    shown('week')
    open()
    nextYear()
    fireEvent.click(screen.getByRole('button', { name: 'April 2027' }))
    expect(titles()).toContain('5 – 11 Apr 2027')
  })

  it("jumps the day view to the month's 1st", () => {
    shown('day')
    open()
    nextYear()
    fireEvent.click(screen.getByRole('button', { name: 'April 2027' }))
    expect(titles()).toContain('Thu 1 Apr 2027')
  })

  it('moves by arrow keys into the next year, picks the month focused and closes with Escape', () => {
    shown('month')
    open()
    // Focus starts on the month shown; down a row is four months on, again is next year.
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'October 2026, this month' }),
    )
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'February 2027' }))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    // Enter on a button clicks it, in a browser; jsdom needs the click itself.
    fireEvent.click(document.activeElement!)
    expect(titles()).toContain('January 2027')

    open()
    expect(screen.getByRole('dialog', { name: 'Pick a month' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Pick a month' })).toBeNull()
    expect(titles()).toContain('January 2027')
  })

  it('offers the years from the first post to next year, no further', () => {
    shown('month')
    open()
    expect(screen.getByRole('button', { name: 'Previous year' })).toHaveProperty('disabled', true)
    nextYear()
    expect(screen.getByRole('button', { name: 'Next year' })).toHaveProperty('disabled', true)
  })
})

describe('where a picked month lands', () => {
  it('reaches back to the year of the first post, as imported posts from 2023 do', () => {
    const post = { kind: 'post' as const, postId: 'old' }
    const open = { kind: 'open' as const, draftsReady: false }
    const weeks = [
      { label: 'WK 1', events: [], days: [{ date: '2023-03-06', story: open, feed: post }] },
    ]
    expect(firstPostYear(weeks)).toBe(2023)
    expect(
      firstPostYear([{ label: 'WK 1', events: [], days: [{ date: '2023-03-06', story: open }] }]),
    ).toBe(2026)
  })

  it('counts months from the home month, and the day view lands on the 1st', () => {
    expect(monthPlace('month', 2023, 2)).toEqual({ offset: -43, week: 0 })
    // 1 Mar 2023 is a Wednesday, in the week of Mon 27 Feb: February's last week.
    expect(monthPlace('day', 2023, 2)).toEqual({ offset: -44, week: 3, day: 2 })
  })
})
