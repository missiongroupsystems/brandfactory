import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { KeyDateSet } from '@/lib/key-dates'
import { KeyDatesMenu } from './KeyDatesMenu'

/** Open the menu and return the three checkbox items, in render order. */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Key dates/ }))
  return screen.getAllByRole('menuitemcheckbox')
}

describe('KeyDatesMenu', () => {
  it('offers one item per set, labelled and described', async () => {
    const user = userEvent.setup()
    render(<KeyDatesMenu enabled={[]} onChange={vi.fn()} />)

    const items = await openMenu(user)
    expect(items.map((i) => i.textContent)).toEqual([
      "GlobalChristmas, Valentine's, Black Friday",
      'Singapore holidaysPublic holidays and cultural observances',
      'Singapore eventsF1, festivals, conferences',
    ])
  })

  it('tracks the enabled sets with aria-checked', async () => {
    const user = userEvent.setup()
    render(<KeyDatesMenu enabled={['global', 'sg-events']} onChange={vi.fn()} />)

    const items = await openMenu(user)
    expect(items.map((i) => i.getAttribute('aria-checked'))).toEqual(['true', 'false', 'true'])
  })

  it('adds a set without disturbing the other two', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(sets: KeyDateSet[]) => void>()
    render(<KeyDatesMenu enabled={['global']} onChange={onChange} />)

    const items = await openMenu(user)
    await user.click(items[2]!)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(['global', 'sg-events'])
  })

  it('removes a set without disturbing the other two', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(sets: KeyDateSet[]) => void>()
    render(<KeyDatesMenu enabled={['global', 'sg-holidays', 'sg-events']} onChange={onChange} />)

    const items = await openMenu(user)
    await user.click(items[1]!)

    expect(onChange).toHaveBeenCalledWith(['global', 'sg-events'])
  })

  it('emits the sets in canonical order however they arrived', async () => {
    // The menu and `getEnabledSets` must agree on what "on" looks like, or a
    // toggle and a reload produce two different arrays for one selection.
    const user = userEvent.setup()
    const onChange = vi.fn<(sets: KeyDateSet[]) => void>()
    render(<KeyDatesMenu enabled={['sg-events', 'sg-holidays']} onChange={onChange} />)

    const items = await openMenu(user)
    await user.click(items[0]!)

    expect(onChange).toHaveBeenCalledWith(['global', 'sg-holidays', 'sg-events'])
  })

  it('stays open so two sets can be switched on in one gesture', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(sets: KeyDateSet[]) => void>()
    render(<KeyDatesMenu enabled={[]} onChange={onChange} />)

    const items = await openMenu(user)
    await user.click(items[0]!)

    expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(3)
  })

  it('shows no count when every set is off', () => {
    render(<KeyDatesMenu enabled={[]} onChange={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Key dates' })
    expect(trigger.textContent).toBe('Key dates')
  })

  it('counts the enabled sets on the trigger, in text and in its accessible name', () => {
    render(<KeyDatesMenu enabled={['global', 'sg-events']} onChange={vi.fn()} />)
    // A bare "2" beside the label reads as a count of nothing in particular, so
    // the accessible name says what it counts while keeping the visible label
    // inside it.
    const trigger = screen.getByRole('button', { name: 'Key dates, 2 of 3 on' })
    expect(trigger.textContent).toBe('Key dates2')
  })

  it('is operable by keyboard alone', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(sets: KeyDateSet[]) => void>()
    render(<KeyDatesMenu enabled={[]} onChange={onChange} />)

    await user.tab()
    expect(screen.getByRole('button', { name: 'Key dates' })).toBe(document.activeElement)

    // Enter opens the menu *and* focuses the first item, so the arrow key below
    // moves to the second — `sg-holidays`, not `global`. Asserted rather than
    // worked around: it is the behaviour Phase F's keyboard pass will see.
    await user.keyboard('{Enter}')
    const items = screen.getAllByRole('menuitemcheckbox')
    expect(items[0]).toBe(document.activeElement)

    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith(['sg-holidays'])
  })
})
