import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEMO_ROSTER } from '@/data/roster'
import { BrandProvider } from '@/features/schedule/posts-store'

import { RosterPage } from './roster-page'
import { resetRoster, useProfiles } from './roster-store'

vi.mock('next/navigation', () => ({ usePathname: () => '/creators' }))

function Names() {
  return <output>{useProfiles().map((p) => `${p.handle}=${p.name}`)}</output>
}

describe('the Creators page in the demo', () => {
  beforeEach(() => resetRoster())

  for (const look of ['a', 'b', 'c'] as const) {
    it(`look ${look}: lists the roster, searches it and opens a person in a side panel`, () => {
      render(
        <BrandProvider>
          <RosterPage look={look} />
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
      expect(within(panel).getByRole('checkbox', { name: /Temper/ })).toHaveAttribute(
        'aria-checked',
        'true',
      )
    })
  }

  it('links a person to a brand from the panel', () => {
    render(
      <BrandProvider>
        <RosterPage look="a" />
      </BrandProvider>,
    )
    fireEvent.click(screen.getByText('Aiko Tan'))
    const casa = screen.getByRole('checkbox', { name: /Casa Vostra/ })
    expect(casa).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(casa)
    expect(casa).toHaveAttribute('aria-checked', 'true')
  })

  it('names a handle no one on the roster holds in place: Enter saves, Escape leaves it', () => {
    // Casa Vostra saves @danielfooddiary; without Daniel on the roster it is a handle alone.
    resetRoster(DEMO_ROSTER.filter((p) => p.name !== 'Daniel Ang'))
    render(
      <BrandProvider>
        <RosterPage look="a" />
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
