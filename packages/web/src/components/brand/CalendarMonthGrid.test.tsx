import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SocialPost } from '@brandfactory/shared'
import { CalendarMonthGrid } from './CalendarMonthGrid'

const STAMPS = {
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} as const

// August 2026: the 1st is a Saturday, so the grid pads back to Monday 27 July
// and runs to Sunday 6 September — six rows. Fixed `now` at local noon on the
// 3rd, so the today ring is a fact of the fixture, not of the machine's clock.
const NOW = new Date(2026, 7, 3, 12, 0)

/** Scheduled at a **local** wall-clock time, stated the way the wire states it. */
function post(id: string, local: Date | null, overrides: Partial<SocialPost> = {}): SocialPost {
  return {
    id: id as SocialPost['id'],
    brandId: 'b-1' as SocialPost['brandId'],
    platform: 'instagram',
    scheduledAt: local === null ? null : local.toISOString(),
    body: `Copy for ${id}`,
    status: 'draft',
    assetIds: [],
    deletedAt: null,
    ...STAMPS,
    ...overrides,
  }
}

const today = post('p-today', new Date(2026, 7, 3, 18, 30), { body: 'Tonight’s service' })
const later = post('p-later', new Date(2026, 7, 20, 9, 0), { body: 'The long weekend' })
const tray = post('p-tray', null, { body: 'An idea with no date' })

function renderGrid(props: Partial<React.ComponentProps<typeof CalendarMonthGrid>> = {}) {
  const onPrevMonth = vi.fn()
  const onNextMonth = vi.fn()
  const onToday = vi.fn()
  render(
    <CalendarMonthGrid
      year={2026}
      month={7}
      posts={[tray, today, later]}
      now={NOW}
      onPrevMonth={onPrevMonth}
      onNextMonth={onNextMonth}
      onToday={onToday}
      {...props}
    />,
  )
  return { onPrevMonth, onNextMonth, onToday }
}

describe('CalendarMonthGrid — the geometry', () => {
  it('labels the month and starts the week on Monday', () => {
    renderGrid()
    expect(screen.getByText('August 2026')).toBeTruthy()
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    weekdays.forEach((day) => expect(screen.getByText(day)).toBeTruthy())
  })

  it('pads to whole weeks with the neighbouring months’ days', () => {
    renderGrid({ onNewPost: vi.fn() })
    // 27–31 July lead, 1–6 September trail: six rows of seven.
    expect(screen.getByLabelText('New post on Sat 1 Aug')).toBeTruthy()
    // A padding day gets no add button — it belongs to a month this grid is
    // not showing, and creating there would write into a view nobody is on.
    expect(screen.queryByLabelText('New post on Mon 27 Jul')).toBeNull()
    expect(screen.queryByLabelText('New post on Tue 1 Sep')).toBeNull()
  })

  it('moves the cursor with the arrows and the Today button', async () => {
    const user = userEvent.setup()
    const { onPrevMonth, onNextMonth, onToday } = renderGrid()

    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    await user.click(screen.getByRole('button', { name: 'Today' }))

    expect(onPrevMonth).toHaveBeenCalledTimes(1)
    expect(onNextMonth).toHaveBeenCalledTimes(1)
    expect(onToday).toHaveBeenCalledTimes(1)
  })
})

describe('CalendarMonthGrid — the chips', () => {
  it('puts a post in its own local day, with time and platform', () => {
    renderGrid({ onEditPost: vi.fn() })
    const chip = screen.getByRole('button', { name: 'Edit Tonight’s service' })
    expect(within(chip).getByText(/18:30 · Instagram/)).toBeTruthy()
  })

  it('names a post with no copy by its platform rather than rendering blank', () => {
    // `body: ''` is a claimed slot; a blank chip would read as a fault.
    renderGrid({
      posts: [post('p-1', new Date(2026, 7, 5, 9, 0), { body: '', platform: 'tiktok' })],
      onEditPost: vi.fn(),
    })
    expect(screen.getByRole('button', { name: 'Edit TikTok' })).toBeTruthy()
  })

  it('reports the post a chip belongs to', async () => {
    const user = userEvent.setup()
    const onEditPost = vi.fn()
    renderGrid({ onEditPost })

    await user.click(screen.getByRole('button', { name: 'Edit Tonight’s service' }))
    expect(onEditPost).toHaveBeenCalledWith(today)
  })

  it('still shows a chip when there is nothing to edit with — just not as a button', () => {
    renderGrid()
    expect(screen.getByText('Tonight’s service')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit Tonight’s service' })).toBeNull()
  })

  it('shows no unscheduled post anywhere in the grid', () => {
    renderGrid({ onEditPost: vi.fn() })
    expect(screen.queryByText('An idea with no date')).toBeNull()
  })
})

describe('CalendarMonthGrid — the unscheduled pointer', () => {
  it('counts the tray and offers the list, which is the only place they show', async () => {
    const user = userEvent.setup()
    const onShowUnscheduled = vi.fn()
    renderGrid({ onShowUnscheduled })

    await user.click(screen.getByRole('button', { name: /1 unscheduled/ }))
    expect(onShowUnscheduled).toHaveBeenCalledTimes(1)
  })

  it('states the count without a link when there is nowhere to send it', () => {
    renderGrid()
    expect(screen.getByText('1 unscheduled')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /unscheduled/ })).toBeNull()
  })

  it('says nothing at all when the tray is empty', () => {
    renderGrid({ posts: [today], onShowUnscheduled: vi.fn() })
    expect(screen.queryByText(/unscheduled/)).toBeNull()
  })
})

describe('CalendarMonthGrid — creating from a cell', () => {
  it('hands back the day whose empty space was clicked', async () => {
    const user = userEvent.setup()
    const onNewPost = vi.fn()
    renderGrid({ onNewPost })

    await user.click(screen.getByLabelText('New post on Mon 10 Aug'))
    expect(onNewPost).toHaveBeenCalledWith('2026-08-10')
  })

  it('offers the cell affordance on a day that already has posts', async () => {
    const user = userEvent.setup()
    const onNewPost = vi.fn()
    renderGrid({ onNewPost })

    // The 3rd holds a chip; the add button fills what the chip leaves.
    await user.click(screen.getByLabelText('New post on Today'))
    expect(onNewPost).toHaveBeenCalledWith('2026-08-03')
  })

  it('renders no add affordance at all without the callback', () => {
    renderGrid()
    expect(screen.queryByLabelText(/^New post on/)).toBeNull()
  })
})
