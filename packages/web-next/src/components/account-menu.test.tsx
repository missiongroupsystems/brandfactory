import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type * as Remote from '@/lib/remote'

// On the core, with the account as `/me` loaded it. `leave` stays the real one.
const core = vi.hoisted(() => ({
  user: { name: 'Priya Sharma', email: 'priya@missiongroup.com' },
}))
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  onUser: (listener: (user: unknown) => void) => {
    listener(core.user)
    return () => undefined
  },
}))

import { AccountMenu, initials } from './account-menu'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

const avatar = () => screen.getByRole('button', { name: /Account/ })

describe('the account menu on the core', () => {
  it("shows the signed-in person's own initials, not the demo's", () => {
    render(<AccountMenu />)
    expect(avatar()).toHaveTextContent('PS')
  })

  it("takes the first name's and last name's first letters, else the email's", () => {
    expect(initials('Natalie Ng', 'nat@missiongroup.com')).toBe('NN')
    expect(initials('Mary Ann de Souza', 'm@x.com')).toBe('MS')
    expect(initials('', 'pranav.pappu@missiongroup.com')).toBe('PP')
    expect(initials('', 'marketing@missiongroup.com')).toBe('M')
  })

  it('names the person and offers Edit profile and Sign out', () => {
    render(<AccountMenu />)
    fireEvent.click(avatar())
    expect(screen.getByText('Priya Sharma')).toBeInTheDocument()
    expect(screen.getByText('priya@missiongroup.com')).toBeInTheDocument()
    const items = screen.getAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual(['Edit profile', 'Sign out'])
    expect(items[0]).toHaveAttribute('href', '/profile')
  })

  it('signs out and loads the sign-in page afresh, so the next person starts clean', () => {
    localStorage.setItem('brandbase.session', JSON.stringify({ access: 'token' }))
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    render(<AccountMenu />)
    fireEvent.click(avatar())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(localStorage.getItem('brandbase.session')).toBeNull()
    expect(assign).toHaveBeenCalledWith('/sign-in')
  })

  it('opens from the keyboard, moves with the arrows and closes on Escape', () => {
    render(<AccountMenu />)
    fireEvent.keyDown(avatar(), { key: 'ArrowDown' })
    const first = screen.getByRole('menuitem', { name: 'Edit profile' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    const signOut = screen.getByRole('menuitem', { name: 'Sign out' })
    expect(signOut).toHaveFocus()
    fireEvent.keyDown(signOut, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(avatar()).toHaveFocus()
  })
})
