import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RemoteError } from '@/lib/remote'
import type * as Remote from '@/lib/remote'

const remote = vi.hoisted(() => ({ setPassword: vi.fn(async () => {}) }))
vi.mock('@/lib/remote', async (actual) => ({
  ...(await actual<typeof Remote>()),
  setPassword: remote.setPassword,
}))

import { SetPassword } from './set-password'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  )
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function send(password: string, again = password) {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('New password again'), { target: { value: again } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }))
  })
}

describe('SetPassword', () => {
  it('shows the check mark once the password is set, then hands over to the app', async () => {
    const onDone = vi.fn()
    render(<SetPassword onDone={onDone} onSignOut={vi.fn()} />)
    await send('eight-ch')
    expect(remote.setPassword).toHaveBeenCalledWith('eight-ch')
    expect(screen.getByRole('status')).toHaveTextContent('Password set')
    expect(onDone).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(1300)
    })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('moves on sooner where motion is reduced', async () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList)
    const onDone = vi.fn()
    render(<SetPassword onDone={onDone} onSignOut={vi.fn()} />)
    await send('eight-ch')
    await act(async () => {
      vi.advanceTimersByTime(700)
    })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('names what is wrong before it sends, and shows a refusal in words', async () => {
    const onDone = vi.fn()
    render(<SetPassword onDone={onDone} onSignOut={vi.fn()} />)
    await send('eight-ch', 'eight-cx')
    expect(screen.getByRole('alert')).toHaveTextContent('The two passwords differ.')
    expect(remote.setPassword).not.toHaveBeenCalled()

    remote.setPassword.mockRejectedValueOnce(new RemoteError(422, 'same_password', 'differ'))
    await send('eight-ch')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose a password that is not the one you signed in with.',
    )
    expect(screen.getByRole('button', { name: 'Set password' })).toBeEnabled()
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(onDone).not.toHaveBeenCalled()
  })
})
