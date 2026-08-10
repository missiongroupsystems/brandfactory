import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SocialPost } from '@brandfactory/shared'
import type { KeyDate, KeyDateSet } from '@/lib/key-dates'
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
    createdBy: 'user',
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

    // The 3rd holds a chip; the cell is the target all the same.
    await user.click(screen.getByLabelText('New post on Today'))
    expect(onNewPost).toHaveBeenCalledWith('2026-08-03')
  })

  it('renders no add affordance at all without the callback', () => {
    renderGrid()
    expect(screen.queryByLabelText(/^New post on/)).toBeNull()
  })

  it('lays the target over the whole cell, not under the date strip', () => {
    renderGrid({ onNewPost: vi.fn() })

    const add = screen.getByLabelText('New post on Mon 10 Aug')
    // Over the cell rather than after its contents, so the date number and
    // every gap between the chips resolve to the same click.
    expect(add.className).toContain('absolute')
    expect(add.className).toContain('inset-0')

    const cell = add.parentElement as HTMLElement
    const date = within(cell).getByText('10')
    // The number is a sibling the button covers, not a row stacked above it —
    // and transparent to the pointer, so a click on it reaches the button.
    expect(date.parentElement).toBe(cell)
    expect(date.className).toContain('pointer-events-none')
  })

  it('leaves a chip its own click through the cell-wide target', async () => {
    const user = userEvent.setup()
    const onNewPost = vi.fn()
    const onEditPost = vi.fn()
    renderGrid({ onNewPost, onEditPost })

    const chip = screen.getByRole('button', { name: 'Edit Tonight’s service' })
    // `relative`, because an absolutely positioned sibling paints over static
    // content whatever the source order says — the chip would be unclickable.
    expect(chip.className).toContain('relative')

    await user.click(chip)
    expect(onEditPost).toHaveBeenCalledWith(today)
    expect(onNewPost).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Key dates — the same grid, with the borrowed dates switched on
// ---------------------------------------------------------------------------
//
// No mocks: real selectors, real appearance map, hand-built `KeyDate` fixtures.
// Every assertion above this line runs with `keyDates` omitted and is the proof
// that the default renders exactly what the grid rendered before.

function day(id: string, start: string, set: KeyDateSet = 'sg-holidays'): KeyDate {
  return { id, set, name: id, start, source: 'test' }
}
function span(id: string, start: string, end: string, set: KeyDateSet = 'sg-events'): KeyDate {
  return { id, set, name: id, start, end, source: 'test' }
}

describe('CalendarMonthGrid — key dates', () => {
  it('puts a single day in its own cell and a season in neither cell', () => {
    renderGrid({
      onNewPost: vi.fn(),
      keyDates: [day('Deepavali', '2026-08-20'), span('i Light', '2026-08-05', '2026-08-09')],
    })

    // The single day is a marker in the cell it belongs to.
    expect(screen.getByText('Deepavali')).toBeTruthy()
    // The season is in the strip above, and in **no** cell — painting it into
    // every covered day would bury the posts the grid exists to show.
    const strip = screen.getByRole('list')
    expect(within(strip).getByText('i Light')).toBeTruthy()
    expect(screen.getAllByText('i Light')).toHaveLength(1)
  })

  it('leaves a marked cell’s add button its click, seeded to that day', async () => {
    const user = userEvent.setup()
    const onNewPost = vi.fn()
    renderGrid({ onNewPost, keyDates: [day('Deepavali', '2026-08-20')] })

    // The marker is `pointer-events-none`, so the cell-wide button under it
    // still takes the press — which is exactly what a marketer clicking a day
    // marked *Deepavali* wants, with no new interaction to learn.
    expect(screen.getByText('Deepavali').className).toContain('pointer-events-none')
    await user.click(screen.getByLabelText(/New post on Thu 20 Aug/))
    expect(onNewPost).toHaveBeenCalledWith('2026-08-20')
  })

  it('carries the day’s key dates in the add button’s accessible name', () => {
    renderGrid({
      onNewPost: vi.fn(),
      keyDates: [
        day('National Day', '2026-08-09'),
        day('National Day Parade', '2026-08-09', 'sg-events'),
      ],
    })
    // The full names, so the fall-through is announced rather than merely
    // convenient — and so a truncated marker loses nothing.
    expect(
      screen.getByLabelText('New post on Sun 9 Aug — National Day, National Day Parade'),
    ).toBeTruthy()
  })

  it('draws at most two markers on a day but names every one of them', () => {
    renderGrid({
      onNewPost: vi.fn(),
      keyDates: [
        day('First', '2026-08-09'),
        day('Second', '2026-08-09'),
        day('Third', '2026-08-09'),
      ],
    })
    expect(screen.getByText('First')).toBeTruthy()
    expect(screen.getByText('Second')).toBeTruthy()
    // Capped for space, not dropped from the record: the label still has it.
    expect(screen.queryByText('Third')).toBeNull()
    expect(screen.getByLabelText('New post on Sun 9 Aug — First, Second, Third')).toBeTruthy()
  })

  it('shows a season that starts before the visible month, at its true range', () => {
    renderGrid({ keyDates: [span('Hungry Ghost', '2026-07-13', '2026-08-10')] })
    // Overlap, not containment — and the band states 13 Jul, not a range
    // clipped to the 1st.
    expect(screen.getByRole('listitem').textContent).toContain('13 Jul – 10 Aug')
  })

  it('omits a season that does not touch the visible month', () => {
    renderGrid({ keyDates: [span('Art Week', '2026-01-22', '2026-01-31')] })
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  it('says so when an enabled set has run out of data', () => {
    renderGrid({ staleSets: ['sg-events'] })
    expect(screen.getByText(/Singapore events: curated through December 2026\./)).toBeTruthy()
  })

  it('names each stale set without assuming its label is plural', () => {
    // `{label} are curated through …` read "Global are curated through", which
    // is the one label in the map that is not grammatically plural. The colon
    // form is agnostic to every label, so this asserts the awkward one.
    renderGrid({ staleSets: ['global'] })
    expect(screen.getByText(/Global: curated through December 2027\./)).toBeTruthy()
    expect(screen.queryByText(/Global are curated/)).toBeNull()
  })

  it('separates two horizon sentences with a real space, not a margin', () => {
    // A margin is what the eye sees; this is what the text content says, and
    // `2027.Singapore` is the same bug the day heading in `SocialPostList`
    // carries a paragraph of comment about.
    renderGrid({ staleSets: ['global', 'sg-events'] })
    const line = screen.getByText(/curated through/).textContent ?? ''
    expect(line).toContain('December 2027. Singapore events')
    expect(line).not.toContain('2027.Singapore')
  })

  it('says nothing about the horizon while every set still has data', () => {
    renderGrid({ keyDates: [day('Deepavali', '2026-08-20')] })
    expect(screen.queryByText(/curated through/)).toBeNull()
  })

  it('announces a marker on a padding day, which has no button to carry it', () => {
    // 31 July is a padding cell in the August grid: no add button, because
    // creating there would write into a month this grid is not showing. The
    // marker was `aria-hidden` regardless, which put it on screen and nowhere
    // in the accessibility tree — ten days in the curated range land in a
    // neighbouring month's grid this way.
    renderGrid({
      onNewPost: vi.fn(),
      keyDates: [day('National Day', '2026-07-31'), day('Deepavali', '2026-08-20')],
    })
    expect(screen.getByText('National Day').getAttribute('aria-hidden')).toBeNull()
    // The in-month one stays hidden: its cell's add button already names it,
    // and un-hiding it would have it read twice.
    expect(screen.getByText('Deepavali').getAttribute('aria-hidden')).toBe('true')
  })

  it('colours a marker from its own set', () => {
    renderGrid({
      keyDates: [day('Deepavali', '2026-08-20'), day('Halloween', '2026-08-21', 'global')],
    })
    expect(screen.getByText('Deepavali').className).toContain('keydate-sg-holidays')
    expect(screen.getByText('Halloween').className).toContain('keydate-global')
  })
})

describe('CalendarMonthGrid — Brainstorm this day', () => {
  it('renders no button without the callback', () => {
    renderGrid({ onNewPost: vi.fn() })
    expect(screen.queryByLabelText(/^Brainstorm this day/)).toBeNull()
  })

  it('opens the day it sits in', async () => {
    const user = userEvent.setup()
    const onBrainstormDay = vi.fn()
    renderGrid({ onNewPost: vi.fn(), onBrainstormDay })

    await user.click(screen.getByLabelText('Brainstorm this day — Thu 20 Aug'))
    expect(onBrainstormDay).toHaveBeenCalledWith('2026-08-20')
  })

  it('keeps its own click rather than falling through to the cell', async () => {
    const user = userEvent.setup()
    const onNewPost = vi.fn()
    const onBrainstormDay = vi.fn()
    renderGrid({ onNewPost, onBrainstormDay })

    await user.click(screen.getByLabelText('Brainstorm this day — Thu 20 Aug'))
    expect(onNewPost).not.toHaveBeenCalled()
  })

  it('stays out of the padding days', () => {
    // A padding day belongs to a month this grid is not showing, `addable`'s
    // reason verbatim: brainstorming there would seed a dialog for a day
    // nobody is looking at.
    renderGrid({ onNewPost: vi.fn(), onBrainstormDay: vi.fn() })
    expect(screen.queryByLabelText('Brainstorm this day — Mon 27 Jul')).toBeNull()
    expect(screen.getByLabelText('Brainstorm this day — Sat 1 Aug')).toBeTruthy()
  })

  it('appears on every day of the month, posts or none', () => {
    renderGrid({ onBrainstormDay: vi.fn() })
    expect(screen.getAllByLabelText(/^Brainstorm this day/)).toHaveLength(31)
  })
})
