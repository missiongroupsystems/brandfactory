/**
 * The sign-up form's rules: what stops a form being sent, and Supabase's refusals in words.
 * Supabase's own minimum is six characters; the form asks for eight.
 */

import { RemoteError } from '@/lib/remote'

export const MIN_PASSWORD = 8

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The one thing wrong with the form, in words, or null when it can be sent. */
export function problem(form: { name: string; email: string; password: string }): string | null {
  if (!form.name.trim()) return 'Tell us your name.'
  if (!EMAIL.test(form.email.trim())) return 'That email does not look right.'
  if (form.password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`
  return null
}

/** Supabase's error codes (docs/guides/auth/debugging/error-codes) the form can answer. */
const REFUSALS: Record<string, string> = {
  user_already_exists: 'This email has an account. Sign in instead.',
  email_exists: 'This email has an account. Sign in instead.',
  weak_password: 'That password is too weak.',
  validation_failed: 'That email does not look right.',
  email_address_invalid: 'That email does not look right.',
  over_email_send_rate_limit: 'Too many emails went out. Try again in an hour.',
  // The built-in mailer writes only to the Supabase organisation's own members.
  email_address_not_authorized: 'Email to this address is not set up yet. Ask an admin.',
  signup_disabled: 'Sign-up is closed. Ask an admin for an account.',
  email_provider_disabled: 'Sign-up is closed. Ask an admin for an account.',
}

/** The refusal as the form shows it. */
export function refusal(err: unknown): string {
  if (err instanceof RemoteError && REFUSALS[err.code]) return REFUSALS[err.code]!
  return err instanceof Error && err.message ? err.message : 'The account was not made.'
}
