import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type * as Remote from '@/lib/remote'

// On the core, with the account as `/me` loaded it. `leave` stays the real one.
const core = vi.hoisted(() => ({
  user: { name: 'Priya Sharma', email: 'priya@missiongroup.com' } as {
    name: string
    email: string
    avatar?: string | null
  },
}))
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  onUser: (listener: (user: unknown) => void) => {
    listener(core.user)
    return () => undefined
  },
}))

import { BrandProvider } from '@/features/schedule/posts-store'

import { AccountMenu, initials } from './account-menu'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

const avatar = () => screen.getByRole('button', { name: /Account/ })

describe('the account menu on the core', () => {
  it("shows the signed-in person's own initials, not the demo's", () => {
    render(
      <BrandProvider>
        <AccountMenu />
      </BrandProvider>,
    )
    expect(avatar()).toHaveTextContent('PS')
  })

  it("shows the person's own photo when they added one, not the initials", () => {
    const src = 'https://core.test/files/s/brandbase/a.jpg'
    core.user = { ...core.user, avatar: src }
    try {
      render(
        <BrandProvider>
          <AccountMenu />
        </BrandProvider>,
      )
      expect(avatar().querySelector('img')?.getAttribute('src')).toContain(encodeURIComponent(src))
      expect(avatar()).not.toHaveTextContent('PS')
    } finally {
      core.user = { name: 'Priya Sharma', email: 'priya@missiongroup.com' }
    }
  })

  it("takes the first name's and last name's first letters, else the email's", () => {
    expect(initials('Natalie Ng', 'nat@missiongroup.com')).toBe('NN')
    expect(initials('Mary Ann de Souza', 'm@x.com')).toBe('MS')
    expect(initials('', 'pranav.pappu@missiongroup.com')).toBe('PP')
    expect(initials('', 'marketing@missiongroup.com')).toBe('M')
  })

  it('names the person, and keeps the brand kit, connections, Edit profile and Sign out together', () => {
    render(
      <BrandProvider>
        <AccountMenu />
      </BrandProvider>,
    )
    fireEvent.click(avatar())
    expect(screen.getByText('Priya Sharma')).toBeInTheDocument()
    expect(screen.getByText('priya@missiongroup.com')).toBeInTheDocument()
    const items = screen.getAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringMatching(/^Brand kit/),
      'Connections',
      'Edit profile',
      'Sign out',
    ])
    expect(items[0]).toHaveAttribute('href', '/brand')
    expect(items[1]).toHaveAttribute('href', '/brand/connections')
    expect(items[2]).toHaveAttribute('href', '/profile')
  })

  it('signs out and loads the sign-in page afresh, so the next person starts clean', () => {
    localStorage.setItem('brandbase.session', JSON.stringify({ access: 'token' }))
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    render(
      <BrandProvider>
        <AccountMenu />
      </BrandProvider>,
    )
    fireEvent.click(avatar())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(localStorage.getItem('brandbase.session')).toBeNull()
    expect(assign).toHaveBeenCalledWith('/sign-in')
  })

  it('opens from the keyboard, moves with the arrows and closes on Escape', () => {
    render(
      <BrandProvider>
        <AccountMenu />
      </BrandProvider>,
    )
    fireEvent.keyDown(avatar(), { key: 'ArrowDown' })
    const first = screen.getByRole('menuitem', { name: /^Brand kit/ })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: 'ArrowUp' })
    const signOut = screen.getByRole('menuitem', { name: 'Sign out' })
    expect(signOut).toHaveFocus()
    fireEvent.keyDown(signOut, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(avatar()).toHaveFocus()
  })
})
