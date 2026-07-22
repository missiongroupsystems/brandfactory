import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EntityMenu } from './EntityMenu'

describe('EntityMenu', () => {
  it('labels the trigger and exposes both actions', async () => {
    const user = userEvent.setup()
    render(<EntityMenu label="Actions for Acme" onRename={vi.fn()} onDelete={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Actions for Acme' }))
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeTruthy()
  })

  it('closes the menu when an action is chosen', async () => {
    const user = userEvent.setup()
    const onRename = vi.fn()
    render(<EntityMenu label="Actions for Acme" onRename={onRename} onDelete={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Actions for Acme' }))
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))

    // The callback opens a dialog. If the menu stayed mounted (the behaviour
    // `e.preventDefault()` in `onSelect` produces) there would be two live
    // focus scopes: Escape would need pressing twice, and cancelling the
    // dialog would drop focus back into a menu the user thinks is closed.
    await waitFor(() => expect(onRename).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Rename' })).toBeNull())
  })
})
