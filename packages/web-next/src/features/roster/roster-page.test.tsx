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

  it('lists the roster as rows on a phone, and opens a person from a row', () => {
    screenWidth(true)
    render(
      <BrandProvider>
        <RosterPage />
      </BrandProvider>,
    )
    // Rows, not cards: a row holds the followers without the word a card has.
    expect(screen.queryByText(/followers/)).toBeNull()
    fireEvent.click(screen.getByText('Clara Goh'))
    expect(screen.getByRole('dialog', { name: 'Clara Goh' })).toBeInTheDocument()
  })

  it('shows cards on a laptop', () => {
    render(
      <BrandProvider>
        <RosterPage />
      </BrandProvider>,
    )
    expect(screen.getAllByText(/followers/).length).toBeGreaterThan(0)
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

  it('names a handle no one on the roster holds in place: Enter saves, Escape leaves it', () => {
    // Casa Vostra saves @danielfooddiary; without Daniel on the roster it is a handle alone.
    resetRoster(DEMO_ROSTER.filter((p) => p.name !== 'Daniel Ang'))
    render(
      <BrandProvider>
        <RosterPage />
        <Names />
      </BrandProvider>,
    )
    fireEvent.click(screen.getByText('danielfooddiary'))
    const field = screen.getByRole('textbox', { name: 'Name for @danielfooddiary' })
    fireEvent.change(field, { target: { value: 'Ignored' } })
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(screen.getByRole('status')).toHaveTextContent('')
    fireEvent.click(screen.getByText('danielfooddiary'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name for @danielfooddiary' }), {
      target: { value: ' Daniel Ang ' },
    })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name for @danielfooddiary' }), {
      key: 'Enter',
    })
    expect(screen.getByRole('status')).toHaveTextContent('danielfooddiary=Daniel Ang')
    expect(screen.getByText('@danielfooddiary')).toBeInTheDocument()
  })
})
