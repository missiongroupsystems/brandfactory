import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CollaboratorPicker } from './collaborator-picker'
import { resetCollaborators } from './collaborators-store'

// The demo: casa-vostra starts on the accounts its posts were collaborations with.
function Field({ start = [] as string[] }: { start?: string[] }) {
  const [value, setValue] = React.useState(start)
  return (
    <CollaboratorPicker
      brandId="casa-vostra"
      platform="ig"
      value={value}
      onChange={setValue}
      max={3}
    />
  )
}

const trigger = () => screen.getByRole('button', { name: /^Collaborators/ })
const menu = () => screen.getByRole('menu', { name: 'Collaborators' })
const rows = () =>
  within(menu())
    .getAllByRole('menuitemcheckbox')
    .map((r) => r.textContent)
const row = (name: string) => screen.getByRole('menuitemcheckbox', { name })

beforeEach(() => {
  resetCollaborators()
})

describe('the Collaborators field', () => {
  it('offers the accounts the brand works with, ticks several, and stays open while they are picked', () => {
    render(<Field />)
    expect(trigger()).toHaveTextContent('None, up to 3')
    fireEvent.click(trigger())
    expect(rows()).toEqual(['@danielfooddiary', '@chefantonio', '@sfoglina.bologna'])
    fireEvent.click(row('@chefantonio'))
    fireEvent.click(row('@danielfooddiary'))
    expect(menu()).toBeInTheDocument()
    expect(trigger()).toHaveTextContent('@chefantonio, @danielfooddiary')
    // A second press takes one off again.
    fireEvent.click(row('@chefantonio'))
    expect(trigger()).toHaveTextContent('@danielfooddiary')
    expect(row('@chefantonio')).toHaveAttribute('aria-checked', 'false')
  })

  it('stops at Instagram’s limit: the other rows rest until one is taken off', () => {
    render(<Field start={['@a', '@b']} />)
    fireEvent.click(trigger())
    fireEvent.click(row('@chefantonio'))
    expect(row('@danielfooddiary')).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(row('@danielfooddiary'))
    expect(trigger()).toHaveTextContent('@a, @b, @chefantonio')
    fireEvent.click(row('@a'))
    expect(row('@danielfooddiary')).toHaveAttribute('aria-disabled', 'false')
  })

  it('adds an account in place, spelled as Instagram keeps it, saved once and ticked', () => {
    render(<Field />)
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add account' }))
    const input = screen.getByRole('textbox', { name: 'New collaborator' })
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: 'New Place SG' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(menu()).toBeInTheDocument()
    expect(rows().at(-1)).toBe('@newplacesg')
    expect(row('@newplacesg')).toHaveAttribute('aria-checked', 'true')
    // The same account again, in another case, adds no twin.
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add account' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New collaborator' }), {
      target: { value: '@ChefAntonio' },
    })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'New collaborator' }), { key: 'Enter' })
    expect(rows()).toHaveLength(4)
    expect(trigger()).toHaveTextContent('@newplacesg, @chefantonio')
  })

  it('removes an account from the brand in two presses, and a post that has it keeps it', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    render(<Field start={['@chefantonio']} />)
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('button', { name: 'Remove @chefantonio' }))
    expect(screen.getByRole('button', { name: 'Remove' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    // The saved row folds away; the post's own pick stays first, with nothing to remove.
    await waitFor(() =>
      expect(rows()).toEqual(['@chefantonio', '@danielfooddiary', '@sfoglina.bologna']),
    )
    expect(row('@chefantonio')).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByRole('button', { name: 'Remove @chefantonio' })).toBeNull()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('keeps the focus in the menu when a pick the brand does not save is taken off', async () => {
    render(<Field start={['@old']} />)
    fireEvent.click(trigger())
    expect(row('@old')).toHaveFocus()
    fireEvent.click(row('@old'))
    // The row goes; the next one takes the focus, so the keys still work.
    await waitFor(() => expect(row('@danielfooddiary')).toHaveFocus())
    expect(rows()).toEqual(['@danielfooddiary', '@chefantonio', '@sfoglina.bologna'])
    fireEvent.keyDown(menu(), { key: 'Escape' })
    expect(trigger()).toHaveFocus()
  })
})
