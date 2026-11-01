import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DayRail, type RailDay } from './day-rail'

const DAYS: RailDay[] = ['Mon 5', 'Tue 6', 'Wed 7', 'Thu 8', 'Fri 9', 'Sat 10', 'Sun 11'].map(
  (label, i) => ({ date: `2026-10-0${5 + i}`, label, busy: i === 1, today: i === 1 }),
)

/** jsdom lays nothing out: the rail's rows stand 7 × 28px tall from the top of the window. */
function place() {
  const rail = screen.getByRole('tablist', { name: 'Days of the week' })
  rail.getBoundingClientRect = () => ({ top: 0, height: 212, left: 0, width: 40 }) as DOMRect
  rail.setPointerCapture = () => undefined
  return rail
}

describe('the day rail', () => {
  it('shows the day being read as the one picked, and a press on a dot goes to its day', () => {
    const pick = vi.fn()
    render(<DayRail days={DAYS} current={3} onPick={pick} />)
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Thu 8')
    expect(screen.getByRole('tab', { name: 'Tue 6, today' })).toBeInTheDocument()
    // The keyboard's press: a click with no pointer behind it.
    fireEvent.click(screen.getByRole('tab', { name: 'Sat 10' }), { detail: 0 })
    expect(pick).toHaveBeenCalledWith(5)
  })

  it('runs through the days under a finger drawn along it, once a day, then settles on the last', () => {
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    const pick = vi.fn()
    render(<DayRail days={DAYS} current={0} onPick={pick} />)
    const rail = place()
    fireEvent.pointerDown(rail, { clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(rail, { clientY: 20, pointerId: 1 })
    fireEvent.pointerMove(rail, { clientY: 40, pointerId: 1 })
    fireEvent.pointerMove(rail, { clientY: 100, pointerId: 1 })
    // Monday, Tuesday, Thursday: a day the finger stays on is not picked again.
    expect(pick.mock.calls).toEqual([[0], [1], [3]])
    expect(vibrate).toHaveBeenCalledTimes(3)
    // The day under the finger is said beside it, and the bar stays on it once the finger lifts.
    expect(screen.getByText('Thu 8')).toBeInTheDocument()
    fireEvent.pointerUp(rail, { clientY: 100, pointerId: 1 })
    expect(pick).toHaveBeenCalledTimes(3)
  })
})
