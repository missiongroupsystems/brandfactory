import { describe, expect, it } from 'vitest'

import { RemoteError } from '@/lib/remote'

import { problem, refusal } from './sign-up'

const good = { name: 'Nat', email: 'nat@missiongroup.com', password: 'eight-ch' }

describe('problem', () => {
  it('lets a full form through', () => {
    expect(problem(good)).toBeNull()
  })

  it('names the first thing wrong, in order: name, email, password', () => {
    expect(problem({ ...good, name: '  ' })).toBe('Tell us your name.')
    expect(problem({ ...good, email: 'nat@missiongroup' })).toBe('That email does not look right.')
    expect(problem({ ...good, password: 'seven-c' })).toBe('Use at least 8 characters.')
  })
})

describe('refusal', () => {
  it('says an email with an account should sign in, whichever code Supabase uses', () => {
    for (const code of ['user_already_exists', 'email_exists'])
      expect(refusal(new RemoteError(422, code, 'exists'))).toBe(
        'This email has an account. Sign in instead.',
      )
  })

  it('answers a weak password and a sent-email limit in words, and keeps an unknown message', () => {
    expect(refusal(new RemoteError(422, 'weak_password', 'x'))).toBe('That password is too weak.')
    expect(refusal(new RemoteError(429, 'over_email_send_rate_limit', 'x'))).toMatch(/an hour/)
    expect(refusal(new RemoteError(500, 'ODD', 'The server is down.'))).toBe('The server is down.')
    expect(refusal(null)).toBe('The account was not made.')
  })
})
