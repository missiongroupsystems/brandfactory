import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type * as Remote from '@/lib/remote'

vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: false,
}))

import { AccountMenu } from './account-menu'

// The judge found the demo's avatar dead: a tap did nothing. The demo has no account to edit or
// leave, so its menu goes to the brand's kit and connections, never to /profile (a 404 there).
describe('the account menu in the demo', () => {
  it('opens on the demo initials and offers the brand kit and connections', () => {
    render(<AccountMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    expect(screen.getByRole('menuitem', { name: 'Brand kit' })).toHaveAttribute('href', '/brand')
    expect(screen.getByRole('menuitem', { name: 'Connections' })).toHaveAttribute(
      'href',
      '/brand/connections',
    )
    expect(screen.queryByRole('menuitem', { name: 'Edit profile' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Sign out' })).toBeNull()
  })
})
