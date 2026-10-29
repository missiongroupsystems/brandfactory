import { describe, expect, it, vi } from 'vitest'

import { RemoteError } from '@/lib/remote'

import { signInError } from './sign-in'

// The judge saw the core's raw "Not Found" in red. A person at the door gets a plain sentence.
// With no Supabase address, the demo signs in by user id.
describe('a failed sign-in', () => {
  it('says there is no account with that id when the sign-in refuses it', () => {
    expect(signInError(new RemoteError(401, 'SIGN_IN', 'Sign in again'))).toBe(
      'No account with that user id.',
    )
  })

  // A 404 or 403 from the core is not a wrong id or password: saying so would mislead.
  it('asks to try again for any other failure, and logs its words', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(signInError(new RemoteError(404, 'ERROR', 'Not Found'))).toBe(
      'Sign-in did not work. Try again.',
    )
    expect(log).toHaveBeenCalledWith('sign-in failed:', 'Not Found')
    expect(signInError(new RemoteError(500, 'ERROR', 'Internal Server Error'))).toBe(
      'Sign-in did not work. Try again.',
    )
    expect(signInError(new TypeError('Failed to fetch'))).toBe('Sign-in did not work. Try again.')
    log.mockRestore()
  })
})
