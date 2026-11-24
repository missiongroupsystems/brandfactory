import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEMO_ROSTER } from '@/data/roster'
import { BrandProvider } from '@/features/schedule/posts-store'

import { RosterPage } from './roster-page'
import { resetRoster, useProfiles } from './roster-store'

vi.mock('next/navigation', () => ({ usePathname: () => '/creators' }))

function Names() {
  return <output>{useProfiles().map((p) => `${p.handle}=${p.name}`)}</output>
}

/** A laptop, or a phone (below 768px): the page shows cards, or rows. */
function screenWidth(phone: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: phone && q === '(max-width: 767px)',
    addEventListener() {},
    removeEventListener() {},
  }))
}

describe('the Creators page in the demo', () => {
  beforeEach(() => {
    resetRoster()
    screenWidth(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('lists the roster as rows on a laptop and on a phone', () => {
    for (const phone of [false, true]) {
      screenWidth(phone)
      const { unmount } = render(
        <BrandProvider>
          <RosterPage />
        </BrandProvider>,
      )
      expect(screen.getByText('Clara Goh').closest('li')?.parentElement?.tagName).toBe('UL')
      fireEvent.click(screen.getByText('Clara Goh'))
      expect(screen.getByRole('dialog', { name: 'Clara Goh' })).toBeInTheDocument()
      unmount()
    }
  })

  it('shows active creators first, and past ones once the filter asks', () => {
    render(
      <BrandProvider>
        <RosterPage />
      </BrandProvider>,
    )
    // Dev Patel is past in the demo: the page opens on Active, so he is not listed.
    const status = screen.getByRole('combobox', { name: 'Status' })
    expect(status).toHaveValue('active')
    expect(screen.queryByText('Dev Patel')).toBeNull()
    fireEvent.change(status, { target: { value: 'past' } })
    expect(screen.getByText('Dev Patel')).toBeInTheDocument()
    expect(screen.queryByText('Aiko Tan')).toBeNull()
    fireEvent.change(status, { target: { value: 'all' } })
    expect(screen.getByText('Dev Patel')).toBeInTheDocument()
    expect(screen.getByText('Aiko Tan')).toBeInTheDocument()
  })

  it('saves a note being typed when Escape closes the panel', () => {
    vi.useFakeTimers()
    render(
      <BrandProvider>
        <RosterPage />
      </BrandProvider>,
    )
    fireEvent.click(screen.getByText('Aiko Tan'))
    const notes = screen.getByRole('textbox', { name: 'Notes' })
    notes.focus()
    fireEvent.change(notes, { target: { value: 'Rates sent.' } })
    fireEvent.keyDown(window, { key: 'Escape' })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    vi.useRealTimers()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByText('Aiko Tan'))
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('Rates sent.')
  })

  it('lists the roster as cards, searches it and opens a person in a side panel', () => {
    render(
      <BrandProvider>
        <RosterPage />
      </BrandProvider>,
    )
    expect(screen.getAllByText('Aiko Tan').length).toBeGreaterThan(0)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search creators' }), {
      target: { value: 'clara' },
    })
    expect(screen.queryByText('Aiko Tan')).toBeNull()
    fireEvent.click(screen.getByText('Clara Goh'))
    const panel = screen.getByRole('dialog', { name: 'Clara Goh' })
    expect(within(panel).getByText('@winewithclara')).toBeInTheDocument()
    // The brands a person is linked to show; they follow the brand's posts, not a click.
    expect(within(panel).getByText(/Temper/)).toBeInTheDocument()
    expect(within(panel).queryByRole('checkbox')).toBeNull()
  })

  it('says how a person gets linked when no brand is yet', () => {
    render(
      <BrandProvider>
        <RosterPage />
      </BrandProvider>,
    )
    fireEvent.click(screen.getByText('Aiko Tan'))
    const panel = screen.getByRole('dialog', { name: 'Aiko Tan' })
    expect(within(panel).getByText(/Linked when a brand’s post tags them/)).toBeInTheDocument()
  })

  it('sets a person’s status from the panel', () => {
    render(
      <BrandProvider>
        <RosterPage />
      </BrandProvider>,
    )
    fireEvent.click(screen.getByText('Aiko Tan'))
    const past = screen.getByRole('radio', { name: 'Past' })
    fireEvent.click(past)
    expect(past).toHaveAttribute('aria-checked', 'true')
  })

  it('slides the panel out, then closes it', () => {
    vi.useFakeTimers()
    try {
      render(
        <BrandProvider>
          <RosterPage />
        </BrandProvider>,
      )
      fireEvent.click(screen.getByText('Aiko Tan'))
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.getByRole('dialog', { name: 'Aiko Tan' })).toHaveClass('bb-sheet-out')
      act(() => {
        vi.advanceTimersByTime(300)
      })
      expect(screen.queryByRole('dialog')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('opens a handle no one on the roster holds in the panel, and names it there', () => {
    // Casa Vostra saves @danielfooddiary; without Daniel on the roster it is a handle alone.
    resetRoster(DEMO_ROSTER.filter((p) => p.name !== 'Daniel Ang'))
    render(
      <BrandProvider>
        <RosterPage />
        <Names />
      </BrandProvider>,
    )
    // A press on its card opens the panel, as for anyone: the card itself edits nothing.
    fireEvent.click(screen.getByText('danielfooddiary'))
    expect(screen.queryByRole('textbox', { name: /Name for/ })).toBeNull()
    const panel = screen.getByRole('dialog', { name: 'danielfooddiary' })
    const field = within(panel).getByRole('textbox', { name: 'Name' })
    fireEvent.change(field, { target: { value: ' Daniel Ang ' } })
    fireEvent.blur(field)
    expect(screen.getByRole('status')).toHaveTextContent('danielfooddiary=Daniel Ang')
    expect(within(panel).getByText('@danielfooddiary')).toBeInTheDocument()
  })

  it('sorts by followers, most first, or by name', () => {
    render(
      <BrandProvider>
        <RosterPage />
      </BrandProvider>,
    )
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Aiko Tan')
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), {
      target: { value: 'followers' },
    })
    // Ella Wong has the most followers of the demo roster (215K).
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Ella Wong')
  })

  it('opens every card in the panel', () => {
    render(
      <BrandProvider>
        <RosterPage />
      </BrandProvider>,
    )
    const cards = screen.getAllByRole('listitem')
    for (const card of cards) {
      fireEvent.click(within(card).getByRole('button'))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))
    }
    expect(cards.length).toBeGreaterThan(20)
  })

  it('shows a creator’s tags as chips, removes one and adds one in one spelling', () => {
    render(
      <BrandProvider>
        <RosterPage />
      </BrandProvider>,
    )
    fireEvent.click(screen.getByText('Clara Goh'))
    const panel = screen.getByRole('dialog', { name: 'Clara Goh' })
    const tags = within(panel).getByRole('list', { name: 'Tags' })
    expect(
      within(tags)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['fine dining', 'wine', 'date night', ''])
    fireEvent.click(within(tags).getByRole('button', { name: 'Remove wine' }))
    expect(within(tags).queryByText('wine')).toBeNull()
    const field = within(tags).getByRole('textbox', { name: 'Add a tag' })
    fireEvent.change(field, { target: { value: '#Natural  Wine ' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(within(tags).getByText('natural wine')).toBeInTheDocument()
    expect(field).toHaveValue('')
    // One it has already is not added twice; one that is no tag stays in the field.
    fireEvent.change(field, { target: { value: 'Fine Dining' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(within(tags).getAllByText('fine dining')).toHaveLength(1)
    fireEvent.change(field, { target: { value: '!!' } })
    fireEvent.blur(field)
    expect(field).toHaveValue('!!')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    // Escape empties the field, adds nothing (a valid tag too) and leaves the panel open.
    fireEvent.change(field, { target: { value: 'oops' } })
    fireEvent.keyDown(field, { key: 'Escape' })
    fireEvent.blur(field)
    expect(field).toHaveValue('')
    expect(within(tags).queryByText('oops')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Clara Goh' })).not.toHaveClass('bb-sheet-out')
  })

  it('keeps a tag typed in the field when the panel goes', () => {
    vi.useFakeTimers()
    try {
      render(
        <BrandProvider>
          <RosterPage />
        </BrandProvider>,
      )
      fireEvent.click(screen.getByText('Aiko Tan'))
      fireEvent.change(screen.getByRole('textbox', { name: 'Add a tag' }), {
        target: { value: 'ramen' },
      })
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))
      act(() => {
        vi.advanceTimersByTime(300)
      })
      expect(screen.queryByRole('dialog')).toBeNull()
      fireEvent.click(screen.getByText('Aiko Tan'))
      expect(
        within(screen.getByRole('list', { name: 'Tags' })).getByText('ramen'),
      ).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('finds creators by a tag', () => {
    render(
      <BrandProvider>
        <RosterPage />
      </BrandProvider>,
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'all' },
    })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search creators' }), {
      target: { value: '#tapas' },
    })
    const names = screen.getAllByRole('listitem').map((li) => li.textContent ?? '')
    expect(names).toHaveLength(2)
    expect(names.some((n) => n.includes('Carlos Ruiz'))).toBe(true)
    expect(names.some((n) => n.includes('Javier Ortega'))).toBe(true)
    // Each row says why it is there: the tag the search found.
    expect(names.every((n) => n.includes('tapas'))).toBe(true)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search creators' }), {
      target: { value: 'carlos' },
    })
    expect(screen.getByRole('listitem')).not.toHaveTextContent('tapas')
  })
})
