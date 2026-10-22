import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type * as Remote from '@/lib/remote'
import { RemoteError } from '@/lib/remote'

const remote = vi.hoisted(() => ({
  saveName: vi.fn(async (_name: string) => {}),
  setPassword: vi.fn(async (_password: string) => {}),
}))
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  ...remote,
  onUser: (listener: (user: unknown) => void) => {
    listener({ name: 'Natalie Ng', email: 'nat@missiongroup.com' })
    return () => undefined
  },
}))
vi.mock('@/components/app-header', () => ({ AppHeader: () => null }))

import { ProfilePage } from './profile-page'

afterEach(() => vi.clearAllMocks())

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('the profile page', () => {
  it('fills in the name, shows the email to read, and saves first and last as one name', async () => {
    render(<ProfilePage />)
    expect(screen.getByLabelText('First name')).toHaveValue('Natalie')
    expect(screen.getByLabelText('Last name')).toHaveValue('Ng')
    expect(screen.getByText('nat@missiongroup.com')).toBeInTheDocument()
    // Nothing to save until the name changes.
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Email' })).toBeNull()
    type('Last name', ' Tan Ng ')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(remote.saveName).toHaveBeenCalledWith('Natalie Tan Ng')
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('changes the password with the first sign-in rules, then draws the check mark', async () => {
    render(<ProfilePage />)
    type('New password', 'short')
    type('New password again', 'short')
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Use at least 8 characters.')
    expect(remote.setPassword).not.toHaveBeenCalled()

    type('New password', 'eight-ch')
    type('New password again', 'eight-ch')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Change password' })))
    expect(remote.setPassword).toHaveBeenCalledWith('eight-ch')
    expect(screen.getByRole('status')).toHaveTextContent('Password changed')
    expect(screen.getByLabelText('New password')).toHaveValue('')
  })

  it("answers Supabase's refusal in the same words as the first sign-in", async () => {
    remote.setPassword.mockRejectedValueOnce(new RemoteError(422, 'weak_password', 'weak'))
    render(<ProfilePage />)
    type('New password', 'eight-ch')
    type('New password again', 'eight-ch')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Change password' })))
    expect(screen.getByRole('alert')).toHaveTextContent('That password is too weak.')
  })
})
