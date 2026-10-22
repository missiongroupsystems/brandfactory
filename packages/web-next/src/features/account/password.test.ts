import { describe, expect, it } from 'vitest'

import { RemoteError } from '@/lib/remote'

import { problem, refusal } from './password'

describe('problem', () => {
  it('lets a repeated password of eight characters through', () => {
    expect(problem({ password: 'eight-ch', again: 'eight-ch' })).toBeNull()
  })

  it('asks for length first, then for the two to match', () => {
    expect(problem({ password: 'seven-c', again: 'seven-c' })).toBe('Use at least 8 characters.')
    expect(problem({ password: 'eight-ch', again: 'eight-cx' })).toBe('The two passwords differ.')
  })
})

describe('refusal', () => {
  it("answers Supabase's weak and same-password refusals in words, and keeps an unknown message", () => {
    expect(refusal(new RemoteError(422, 'weak_password', 'x'))).toBe('That password is too weak.')
    expect(refusal(new RemoteError(422, 'same_password', 'x'))).toMatch(/signed in with/)
    expect(refusal(new RemoteError(422, 'reauthentication_needed', 'x'))).toMatch(/Sign in again/)
    expect(refusal(new RemoteError(500, 'ODD', 'The server is down.'))).toBe('The server is down.')
    expect(refusal(null)).toBe('The password was not set.')
  })
})
