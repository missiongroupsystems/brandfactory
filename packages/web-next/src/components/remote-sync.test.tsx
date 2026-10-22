import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const remote = vi.hoisted(() => ({
  remote: true,
  signedIn: vi.fn(() => true),
  needsPassword: vi.fn(() => false),
  loadAll: vi.fn(async () => ['casa']),
  accountEmpty: vi.fn(() => false),
  noAccess: vi.fn(() => false),
  onProblem: vi.fn(() => () => {}),
  settled: vi.fn(async () => {}),
  leave: vi.fn(),
  setPassword: vi.fn(async () => {}),
  sessionEmail: vi.fn(() => 'nat@missiongroup.com'),
}))
vi.mock('@/lib/remote', () => remote)
const nav = vi.hoisted(() => ({ path: '/' }))
vi.mock('next/navigation', () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ replace: vi.fn() }),
}))

import { RemoteSync } from './remote-sync'

beforeEach(() => {
  nav.path = '/'
  remote.signedIn.mockReturnValue(true)
  remote.needsPassword.mockReturnValue(false)
  remote.accountEmpty.mockReturnValue(false)
})
afterEach(() => vi.clearAllMocks())

// A fresh element each time: React skips a rerender of the very same element.
const tree = () => (
  <RemoteSync>
    <p>the app</p>
  </RemoteSync>
)
const passwordScreen = () => screen.queryByRole('heading', { name: 'Set your password' })

describe('RemoteSync', () => {
  it('opens the terms and the privacy policy with no sign-in, for TikTok and anyone else', () => {
    remote.signedIn.mockReturnValue(false)
    for (const path of ['/terms', '/privacy']) {
      nav.path = path
      const { unmount } = render(tree())
      expect(screen.getByText('the app')).toBeInTheDocument()
      unmount()
    }
    expect(remote.loadAll).not.toHaveBeenCalled()
  })

  it('asks a first sign-in for a password before anything loads', async () => {
    remote.needsPassword.mockReturnValue(true)
    render(tree())
    expect(await screen.findByRole('heading', { name: 'Set your password' })).toBeInTheDocument()
    expect(screen.queryByText('the app')).not.toBeInTheDocument()
    expect(remote.loadAll).not.toHaveBeenCalled()
  })

  it("goes straight to the app when the password is already the person's own", async () => {
    render(tree())
    expect(await screen.findByText('the app')).toBeInTheDocument()
    expect(passwordScreen()).not.toBeInTheDocument()
  })

  it('shows the waiting page for an account in no company', async () => {
    remote.accountEmpty.mockReturnValue(true)
    render(tree())
    expect(await screen.findByRole('heading', { name: 'Not in a company yet' })).toBeInTheDocument()
    expect(screen.getByText('nat@missiongroup.com')).toBeInTheDocument()
  })

  it('does not reload the account behind the password screen when the tab comes back', async () => {
    remote.needsPassword.mockReturnValue(true)
    render(tree())
    await screen.findByRole('heading', { name: 'Set your password' })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(remote.loadAll).not.toHaveBeenCalled()
  })

  it('starts afresh for whoever signs in next after a visit to sign-in', async () => {
    // One person is on the password step; another signs in from the address bar.
    remote.needsPassword.mockReturnValue(true)
    const { rerender } = render(tree())
    await screen.findByRole('heading', { name: 'Set your password' })
    nav.path = '/sign-in'
    rerender(tree())
    expect(passwordScreen()).not.toBeInTheDocument()
    remote.needsPassword.mockReturnValue(false)
    nav.path = '/'
    rerender(tree())
    expect(await screen.findByText('the app')).toBeInTheDocument()
    expect(passwordScreen()).not.toBeInTheDocument()
  })
})
