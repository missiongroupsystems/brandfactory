import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LocationPicker } from './location-picker'
import { resetLocations } from './locations-store'

// The demo: casa-vostra starts on its venue and the places its posts were tagged at.
function Field({ start = 'Casa Vostra, Raffles City' }: { start?: string }) {
  const [value, setValue] = React.useState(start)
  return <LocationPicker brandId="casa-vostra" value={value} onChange={setValue} />
}

const trigger = () => screen.getByRole('button', { name: /^Location/ })
const menu = () => screen.getByRole('menu', { name: 'Location' })
const rows = () =>
  within(menu())
    .getAllByRole('menuitemradio')
    .map((r) => r.textContent)

beforeEach(() => {
  resetLocations()
})

describe('the Location field', () => {
  it('opens on the brand’s saved locations with the post’s one ticked, and a pick sets it', () => {
    render(<Field />)
    expect(trigger()).toHaveTextContent('Casa Vostra, Raffles City')
    fireEvent.click(trigger())
    expect(rows()).toEqual([
      'Casa Vostra, Raffles City',
      'Raffles City Shopping Centre',
      'Singapore',
      'CHIJMES',
    ])
    const ticked = screen.getByRole('menuitemradio', { checked: true })
    expect(ticked).toHaveTextContent('Casa Vostra, Raffles City')
    expect(ticked).toHaveFocus()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'CHIJMES' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger()).toHaveTextContent('CHIJMES')
    expect(trigger()).toHaveFocus()
  })

  it('moves with Up and Down, round the ends, and Escape closes it back on the field', () => {
    render(<Field />)
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    fireEvent.keyDown(menu(), { key: 'ArrowUp' })
    expect(screen.getByRole('menuitem', { name: 'Add location' })).toHaveFocus()
    fireEvent.keyDown(menu(), { key: 'ArrowDown' })
    expect(screen.getByRole('menuitemradio', { name: 'Casa Vostra, Raffles City' })).toHaveFocus()
    fireEvent.keyDown(menu(), { key: 'ArrowDown' })
    // Enter on the focused row is the browser's click.
    fireEvent.click(document.activeElement!)
    expect(trigger()).toHaveTextContent('Raffles City Shopping Centre')
    fireEvent.click(trigger())
    fireEvent.keyDown(menu(), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger()).toHaveFocus()
  })

  it('closes on Tab back on the field, so the focus never leaves the composer', () => {
    render(<Field />)
    fireEvent.click(trigger())
    fireEvent.keyDown(menu(), { key: 'Tab' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger()).toHaveFocus()
  })

  it('clears the post’s location with a press on the ticked row', () => {
    render(<Field />)
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitemradio', { checked: true }))
    expect(trigger()).toHaveTextContent('None')
  })

  it('adds a location in place: Enter saves and picks it, once whatever its case; Escape leaves the menu open', () => {
    render(<Field />)
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add location' }))
    const input = screen.getByRole('textbox', { name: 'New location' })
    expect(input).toHaveFocus()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(menu()).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'New location' })).toBeNull()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Add location' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New location' }), {
      target: { value: '  Casa Vostra,  JEM ' },
    })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'New location' }), { key: 'Enter' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger()).toHaveTextContent('Casa Vostra, JEM')

    // The same name again picks the one saved: no twin.
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add location' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New location' }), {
      target: { value: 'chijmes' },
    })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'New location' }), { key: 'Enter' })
    expect(trigger()).toHaveTextContent('CHIJMES')
    fireEvent.click(trigger())
    expect(rows().at(-1)).toBe('Casa Vostra, JEM')
    expect(rows()).toHaveLength(5)
  })

  it('removes a saved location in two presses, asked in its own row and never in a browser dialog', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    render(<Field />)
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('button', { name: 'Remove CHIJMES' }))
    const yes = screen.getByRole('button', { name: 'Remove' })
    expect(yes).toHaveFocus()
    // Cancel keeps it.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(rows()).toContain('CHIJMES')

    fireEvent.click(screen.getByRole('button', { name: 'Remove CHIJMES' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    // The row folds away, then goes.
    expect(screen.getByText('CHIJMES')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('CHIJMES')).toBeNull())
    expect(menu()).toBeInTheDocument()
    expect(trigger()).toHaveTextContent('Casa Vostra, Raffles City')
    expect(confirm).not.toHaveBeenCalled()
  })

  it('keeps a removed location on the post that has it, as its own row with nothing to remove', async () => {
    render(<Field />)
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('button', { name: 'Remove Casa Vostra, Raffles City' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    // Once folded, the brand no longer has it, but the post still does.
    await waitFor(() =>
      expect(screen.getByRole('menuitemradio', { checked: true })).toHaveTextContent(
        'Casa Vostra, Raffles City',
      ),
    )
    expect(screen.queryByRole('button', { name: 'Remove Casa Vostra, Raffles City' })).toBeNull()
    expect(trigger()).toHaveTextContent('Casa Vostra, Raffles City')
  })

  it('shows a location the brand does not save as the value, ticked first, with nothing to remove', () => {
    render(<Field start="Club Street" />)
    expect(trigger()).toHaveTextContent('Club Street')
    fireEvent.click(trigger())
    expect(rows()[0]).toBe('Club Street')
    expect(screen.getByRole('menuitemradio', { checked: true })).toHaveTextContent('Club Street')
    expect(screen.queryByRole('button', { name: 'Remove Club Street' })).toBeNull()
  })

  it('closes on a press outside, and an Escape inside does not reach the sheet around it', () => {
    const sheet = vi.fn()
    window.addEventListener('keydown', sheet)
    render(<Field />)
    fireEvent.click(trigger())
    fireEvent.keyDown(menu(), { key: 'Escape' })
    expect(sheet).not.toHaveBeenCalled()
    window.removeEventListener('keydown', sheet)
    fireEvent.click(trigger())
    act(() => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
