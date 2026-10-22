/**
 * The first sign-in's password form: what stops it being sent, and Supabase's refusals in words.
 * Supabase's own minimum is six characters; the form asks for eight.
 */

import { RemoteError } from '@/lib/remote'

export const MIN_PASSWORD = 8

/** The one thing wrong with the form, in words, or null when it can be sent. */
export function problem(form: { password: string; again: string }): string | null {
  if (form.password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`
  if (form.again !== form.password) return 'The two passwords differ.'
  return null
}

/** Supabase's error codes (docs/guides/auth/debugging/error-codes) the form can answer. */
const REFUSALS: Record<string, string> = {
  weak_password: 'That password is too weak.',
  same_password: 'Choose a password that is not the one you signed in with.',
  // "Secure password change" asks for a fresh sign-in after 24 hours; this screen comes right
  // after one, so this is rare.
  reauthentication_needed: 'Sign in again, then set your password.',
}

/** The refusal as the form shows it. */
export function refusal(err: unknown): string {
  if (err instanceof RemoteError && REFUSALS[err.code]) return REFUSALS[err.code]!
  return err instanceof Error && err.message ? err.message : 'The password was not set.'
}
