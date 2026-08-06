import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CalendarDays } from 'lucide-react'
import type { SocialPost } from '@brandfactory/shared'
import { SocialCalendarView } from './SocialCalendarView'
import type { MiniApp } from './miniApps'

const STAMPS = {
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} as const

const NOW = new Date(2026, 7, 3, 12, 0)

const APP = {
  id: 'social',
  title: 'Social calendar',
  description: 'Plan and schedule a week of on-brand posts.',
  icon: CalendarDays,
} as MiniApp

const scheduled: SocialPost = {
  id: 'p-1' as SocialPost['id'],
  brandId: 'b-1' as SocialPost['brandId'],
  platform: 'instagram',
  scheduledAt: new Date(2026, 7, 3, 18, 30).toISOString(),
  body: 'Tonight’s service',
  status: 'draft',
  assetIds: [],
  deletedAt: null,
  ...STAMPS,
}

const tray: SocialPost = {
  ...scheduled,
  id: 'p-2' as SocialPost['id'],
  scheduledAt: null,
  body: 'An idea',
}

function renderView(props: Partial<React.ComponentProps<typeof SocialCalendarView>> = {}) {
  const onViewChange = vi.fn()
  const onNewPost = vi.fn()
  const onEditPost = vi.fn()
  render(
    <SocialCalendarView
      app={APP}
      posts={[tray, scheduled]}
      assets={[]}
      resolveBlob={() => ''}
      now={NOW}
      view="calendar"
      onViewChange={onViewChange}
      year={2026}
      month={7}
      onPrevMonth={vi.fn()}
      onNextMonth={vi.fn()}
      onToday={vi.fn()}
      onNewPost={onNewPost}
      onEditPost={onEditPost}
      onMarkPosted={vi.fn()}
      onDeletePost={vi.fn()}
      dialogOpen={false}
      onDialogOpenChange={vi.fn()}
      editingPost={null}
      seedDayKey={null}
      onCreate={vi.fn()}
      onUpdate={vi.fn()}
      {...props}
    />,
  )
  return { onViewChange, onNewPost, onEditPost }
}

describe('SocialCalendarView — the header', () => {
  it('names the app and offers the primary action', () => {
    renderView()
    expect(screen.getByRole('heading', { name: /Social calendar/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New post' })).toBeTruthy()
  })

  it('seeds no day from the header — the page decides what "New post" means', async () => {
    const user = userEvent.setup()
    const { onNewPost } = renderView()
    await user.click(screen.getByRole('button', { name: 'New post' }))
    expect(onNewPost).toHaveBeenCalledWith(null)
  })
})

describe('SocialCalendarView — the view toggle', () => {
  it('carries its state in aria-pressed, not only in the fill', () => {
    renderView()
    expect(screen.getByRole('button', { name: /Calendar/ }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(screen.getByRole('button', { name: /List/ }).getAttribute('aria-pressed')).toBe('false')
  })

  it('reports the other view when the other button is pressed', async () => {
    const user = userEvent.setup()
    const { onViewChange } = renderView()
    await user.click(screen.getByRole('button', { name: /List/ }))
    expect(onViewChange).toHaveBeenCalledWith('list')
  })

  it('dispatches to the grid on calendar and to the list on list', () => {
    renderView()
    // The grid's month label; the list's region headings are absent.
    expect(screen.getByText('August 2026')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Unscheduled' })).toBeNull()
  })

  it('shows the tray only in the list view', () => {
    renderView({ view: 'list' })
    expect(screen.queryByText('August 2026')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Unscheduled' })).toBeTruthy()
    expect(screen.getByText('An idea')).toBeTruthy()
  })

  it('sends the grid’s unscheduled pointer to the list view', async () => {
    const user = userEvent.setup()
    const { onViewChange } = renderView()
    await user.click(screen.getByRole('button', { name: /1 unscheduled/ }))
    expect(onViewChange).toHaveBeenCalledWith('list')
  })
})

describe('SocialCalendarView — the dialog', () => {
  it('keeps the dialog closed until the page says otherwise', () => {
    renderView()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('mounts it in create mode with the page’s seed', () => {
    renderView({ dialogOpen: true, seedDayKey: '2026-08-10' })
    expect(screen.getByRole('heading', { name: 'New post' })).toBeTruthy()
    expect(screen.getByLabelText('Date and time (optional)')).toHaveProperty('value', '2026-08-10')
  })

  it('mounts it in edit mode on the post the page is editing', () => {
    renderView({ dialogOpen: true, editingPost: scheduled })
    expect(screen.getByRole('heading', { name: 'Edit post' })).toBeTruthy()
    expect(screen.getByLabelText('Copy')).toHaveProperty('value', 'Tonight’s service')
  })
})

describe('SocialCalendarView — the key-dates menu', () => {
  it('is absent until the page hands it both a value and a handler', () => {
    // A menu without a handler would be a control that silently does nothing,
    // so it is both props or neither.
    renderView()
    expect(screen.queryByRole('button', { name: /Key dates/ })).toBeNull()

    renderView({ enabledSets: ['global'] })
    expect(screen.queryByRole('button', { name: /Key dates/ })).toBeNull()
  })

  it('mounts in the header with the page’s sets, and reports a change', async () => {
    const user = userEvent.setup()
    const onEnabledSetsChange = vi.fn()
    renderView({ enabledSets: ['global'], onEnabledSetsChange })

    await user.click(screen.getByRole('button', { name: 'Key dates, 1 of 3 on' }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Singapore events/ }))
    expect(onEnabledSetsChange).toHaveBeenCalledWith(['global', 'sg-events'])
  })

  it('passes its key dates through to the grid', () => {
    renderView({
      keyDates: [
        { id: 'k-1', set: 'sg-holidays', name: 'National Day', start: '2026-08-09', source: 't' },
      ],
    })
    expect(screen.getByText('National Day')).toBeTruthy()
  })

  it('passes a stale set through to the grid', () => {
    renderView({ staleSets: ['sg-events'] })
    expect(screen.getByText(/curated through December 2026/)).toBeTruthy()
  })
})
