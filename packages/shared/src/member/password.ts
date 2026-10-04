import { z } from 'zod'

/**
 * The password rules, in one place, so the password an admin picks on the
 * create form and the one a person picks on the set-password screen cannot
 * drift apart. Both forms import this; so does the server, which re-checks it.
 *
 * **Length is the rule that carries the weight.** Composition rules — one
 * capital, one digit, one symbol — push people towards `Password1!` and buy
 * very little. A floor of 14 characters is worth more than four character
 * classes, and it is the rule somebody can satisfy with a passphrase.
 */
export const PASSWORD_MIN_LENGTH = 14

/** Supabase refuses beyond this, so reject it here with a sentence instead. */
export const PASSWORD_MAX_LENGTH = 72

export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`)

/**
 * Why `password` and `email` are checked together: the most common weak
 * password on a work account is the address it belongs to. This is cheap and
 * catches the case a length rule cannot.
 *
 * Returns the reason it is refused, or `null` when it passes. A string rather
 * than a boolean so the caller renders the reason, and so the two call sites
 * cannot word it differently.
 */
export function passwordProblem(password: string, email: string): string | null {
  const parsed = PasswordSchema.safeParse(password)
  if (!parsed.success) return parsed.error.issues[0]?.message ?? 'That password is not allowed.'

  const local = email.split('@')[0]?.toLowerCase() ?? ''
  const lower = password.toLowerCase()
  if (local.length >= 3 && lower.includes(local)) {
    return 'Do not use your email address in your password.'
  }
  return null
}

// Unambiguous alphabet: no `0`/`O`, no `1`/`l`/`I`. A generated password is
// read off one screen and typed into another, often from a phone, and a
// character somebody cannot transcribe is a support conversation.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

/**
 * Generates a password **in the browser**. The admin reads the value from
 * their own screen and the server only ever receives it, so no password this
 * app suggests was ever chosen on a server or written to a server log.
 *
 * ⚠️ **The server must not call this.** It lives in `shared` because the
 * length rule above lives here, not because both sides should generate.
 *
 * Uses `crypto.getRandomValues` with rejection sampling — `% ALPHABET.length`
 * would favour the first few letters, which is a real bias at this length and
 * free to avoid.
 */
export function generatePassword(length = 18): string {
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length
  const out: string[] = []
  const buf = new Uint8Array(1)
  while (out.length < length) {
    crypto.getRandomValues(buf)
    const byte = buf[0]!
    if (byte >= max) continue
    out.push(ALPHABET[byte % ALPHABET.length]!)
  }
  return out.join('')
}
