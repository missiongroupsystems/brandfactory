import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Me } from '@/api/queries/me'
import { AccountMenu } from './AccountMenu'

const state: { me: Me | undefined } = { me: undefined }
const signOut = vi.fn()

vi.mock('@/api/queries/me', () => ({
  useMe: () => ({ data: state.me }),
  meKeys: { me: () => ['me'] },
}))

vi.mock('@/auth/session', () => ({
  signOut: () => signOut(),
}))

function me(overrides: Partial<Me> = {}): Me {
  return {
    id: 'u-1',
    email: 'phil@ebbflowgroup.com',
    displayName: 'Phil Holke',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Me
}

describe('AccountMenu', () => {
  beforeEach(() => {
    state.me = me()
    signOut.mockReset()
  })

  // The trigger's accessible name is *which account*, not what the control
  // does — the same rule `WorkspaceSwitcher` follows, and the reason neither
  // uses `aria-label`.
  it('names the signed-in user on the trigger', () => {
    render(<AccountMenu />)
    expect(screen.getByRole('button', { name: /Phil Holke/ })).toBeTruthy()
  })

  it('shows the display name over the email once both are known', async () => {
    const user = userEvent.setup()
    render(<AccountMenu />)

    await user.click(screen.getByRole('button', { name: /Phil Holke/ }))
    // Scoped to the menu: the trigger carries the same label in an `sr-only`
    // span, which is the point of it.
    const menu = within(screen.getByRole('menu'))
    expect(menu.getByText('Phil Holke')).toBeTruthy()
    expect(menu.getByText('phil@ebbflowgroup.com')).toBeTruthy()
  })

  // A display name of null puts the email on the primary line. Repeating it
  // underneath in grey is the same string twice in 32 pixels.
  it('does not print the email twice when there is no display name', async () => {
    state.me = me({ displayName: null })
    const user = userEvent.setup()
    render(<AccountMenu />)

    await user.click(screen.getByRole('button', { name: /phil@ebbflowgroup.com/ }))
    expect(within(screen.getByRole('menu')).getAllByText('phil@ebbflowgroup.com')).toHaveLength(1)
  })

  // Free text, and therefore possibly whitespace. Every row has an email —
  // `notNull` and `unique` in the schema — so nothing has to fall back to "?".
  it('falls through a whitespace display name to the email', () => {
    state.me = me({ displayName: '   ' })
    render(<AccountMenu />)
    expect(screen.getByRole('button', { name: /phil@ebbflowgroup.com/ })).toBeTruthy()
  })

  it('signs out from the menu', async () => {
    const user = userEvent.setup()
    render(<AccountMenu />)

    await user.click(screen.getByRole('button', { name: /Phil Holke/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  // **The defect this guards.** A sign-out control that appears a round trip
  // after the page does is a control the user cannot rely on being there —
  // and signing out needs no knowledge of who is signing out.
  it('is usable before /me answers', async () => {
    state.me = undefined
    const user = userEvent.setup()
    render(<AccountMenu />)

    const trigger = screen.getByRole('button', { name: 'Account' })
    await user.click(trigger)
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('omits the identity label entirely rather than labelling an unknown user', async () => {
    state.me = undefined
    const user = userEvent.setup()
    render(<AccountMenu />)

    await user.click(screen.getByRole('button', { name: 'Account' }))
    expect(screen.queryByText('?')).toBeNull()
    expect(screen.getAllByRole('menuitem')).toHaveLength(1)
  })
})
