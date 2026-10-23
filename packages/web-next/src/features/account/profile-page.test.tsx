import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type * as Remote from '@/lib/remote'
import { RemoteError } from '@/lib/remote'

const remote = vi.hoisted(() => ({
  saveName: vi.fn(async (_name: string) => {}),
  setPassword: vi.fn(async (_password: string) => {}),
  uploadAvatar: vi.fn(async (_picture: Blob) => 'https://core.test/files/s/brandbase/a.jpg'),
  removeAvatar: vi.fn(async () => {}),
}))
const account = vi.hoisted(() => ({ avatar: null as string | null }))
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  ...remote,
  onUser: (listener: (user: unknown) => void) => {
    listener({ name: 'Natalie Ng', email: 'nat@missiongroup.com', avatar: account.avatar })
    return () => undefined
  },
}))
vi.mock('@/components/app-header', () => ({ AppHeader: () => null }))
// jsdom has no canvas: the crop hands over the square it would draw. Its maths is tested apart.
const square = vi.hoisted(() => new Blob(['square'], { type: 'image/jpeg' }))
vi.mock('./avatar-crop', () => ({
  AvatarCrop: (p: {
    file: File
    busy: boolean
    onSave: (b: Blob) => void
    onCancel: () => void
  }) => (
    <div>
      <span>Crop {p.file.name}</span>
      <button onClick={p.onCancel}>Cancel</button>
      <button onClick={() => p.onSave(square)}>{p.busy ? 'Uploading…' : 'Save photo'}</button>
    </div>
  ),
}))

import { ProfilePage } from './profile-page'

afterEach(() => {
  vi.clearAllMocks()
  account.avatar = null
})

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

  it('shows the initials with no photo, and only Upload photo', () => {
    render(<ProfilePage />)
    expect(screen.getByText('NN')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload photo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove photo' })).toBeNull()
  })

  it('crops a chosen file, then uploads the square and shows it', async () => {
    render(<ProfilePage />)
    const file = new File(['raw'], 'me.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Photo file'), { target: { files: [file] } })
    expect(screen.getByText('Crop me.png')).toBeInTheDocument()
    expect(remote.uploadAvatar).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save photo' })))
    // The cropped square goes up, not the file as chosen.
    expect(remote.uploadAvatar).toHaveBeenCalledWith(square)
    expect(screen.queryByText('Crop me.png')).toBeNull()
  })

  it('keeps the crop open and says so when the upload fails', async () => {
    remote.uploadAvatar.mockRejectedValueOnce(new RemoteError(400, 'BAD_AVATAR', 'nope'))
    render(<ProfilePage />)
    fireEvent.change(screen.getByLabelText('Photo file'), {
      target: { files: [new File(['raw'], 'me.jpg', { type: 'image/jpeg' })] },
    })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save photo' })))
    expect(screen.getByRole('alert')).toHaveTextContent('nope')
    expect(screen.getByText('Crop me.jpg')).toBeInTheDocument()
  })

  it('shows the photo it has, and removes it', async () => {
    account.avatar = 'https://core.test/files/s/brandbase/a.jpg'
    const { container } = render(<ProfilePage />)
    expect(container.querySelector('img')?.getAttribute('src')).toContain(
      encodeURIComponent(account.avatar),
    )
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Remove photo' })))
    expect(remote.removeAvatar).toHaveBeenCalled()
  })
})
