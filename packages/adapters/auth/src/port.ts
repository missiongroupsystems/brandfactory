import type { User } from '@brandfactory/db'

// Identity-provider port. Three methods:
//   - verifyToken: validate an opaque bearer token and resolve the user id
//   - getUserById: resolve our `users` row from the id surfaced by verifyToken
//   - setPassword:  replace the credential behind that id
//
// Listing users intentionally stays off the port — that's a DB read against
// our `users` table, not an identity-provider concern. Putting it here would
// hide the difference between our table and (e.g.) Supabase Auth's
// `auth.users`. Callers that need a roster import from `@brandfactory/db`.
export interface AuthProvider {
  /**
   * Whether this provider holds passwords at all.
   *
   * **Read by the create route, and the reason is `must_set_password`.** That
   * column means *an administrator chose the password on this account*, and on
   * the local dev provider — where the bearer token is the user id and no
   * credential exists — the statement is vacuous. Flagging such an account
   * would park every dev session on a set-password screen that `setPassword`
   * then refuses to satisfy.
   *
   * A declared capability rather than an `instanceof` check or a provider name
   * in domain code, which `CLAUDE.md` forbids.
   */
  readonly holdsPasswords: boolean
  verifyToken(token: string): Promise<{ userId: string }>
  getUserById(id: string): Promise<User | null>
  /**
   * Creates the identity-provider account and returns the id it assigned.
   *
   * ⚠️ **This must happen before our `users` row is written, and the row must
   * use the returned id.** `users.id` *is* the Supabase `sub`, and
   * `upsertUserById` conflicts on that column only — so a row created with any
   * other id collides on `email` the first time its owner signs in, the
   * adapter swallows that error, and the row is unreachable forever.
   *
   * The account is created with no session and, where the provider holds
   * passwords, with the password the caller supplies.
   */
  createUser(input: { email: string; password?: string }): Promise<{ userId: string }>
  /**
   * Deletes the identity-provider account.
   *
   * **The compensation for a failed create**, not a product feature. If the
   * transaction that writes our rows throws, the provider account already
   * exists, and leaving it there makes the administrator's retry answer a
   * conflict forever.
   */
  deleteUser(userId: string): Promise<void>
  /**
   * Suspends or restores the account at the identity provider.
   *
   * Paired with `users.deactivated_at`, and both are reversible. Launchpad bans
   * for about a hundred years and comments *"ban, not delete — preserves audit
   * trail"*; the same reasoning applies, with the difference that we expect to
   * undo it.
   *
   * ⚠️ **Our column is the boundary, not this call.** The gate refuses a
   * deactivated row whatever the provider thinks, so a failure here must not be
   * reported as a failed deactivation — it is a provider that still holds a
   * credential nobody can use.
   */
  setSuspended(userId: string, suspended: boolean): Promise<void>
  /**
   * Sets the credential for `userId`. Used by two callers: an admin creating
   * or resetting somebody's account, and a person choosing their own password.
   *
   * **On the port because only the provider can do it.** The password is the
   * identity provider's to hold, and this is the one seam Passport replaces
   * rather than a route.
   *
   * ⚠️ **The implementation must not log the password, and must not return
   * it.** The only record of the act belongs in `credential_audit`, which
   * stores that it happened and never what was set.
   *
   * Throws `PasswordNotSupportedError` where the provider has no concept of
   * one, and `PasswordRejectedError` where the provider refused this
   * particular password. Everything else is a fault and propagates.
   */
  setPassword(userId: string, password: string): Promise<void>
}

export class InvalidTokenError extends Error {
  constructor(message = 'invalid token') {
    super(message)
    this.name = 'InvalidTokenError'
  }
}

/**
 * The configured provider cannot hold a password — the local dev provider,
 * where the bearer token *is* the user id and no credential exists.
 *
 * A distinct error rather than a silent success: a no-op here would clear
 * `must_set_password` on an account whose password was never set, which is the
 * one lie this column must not tell.
 */
export class PasswordNotSupportedError extends Error {
  constructor(message = 'this auth provider does not hold passwords') {
    super(message)
    this.name = 'PasswordNotSupportedError'
  }
}

/**
 * The provider refused this password — too short for its own floor, or on a
 * breach list it checks.
 *
 * **Separate from a fault, because the caller answers them differently.** This
 * is a 400 with the reason on screen, which the person fixes by typing another
 * password. A network failure or a bad service key is a 500 they cannot fix,
 * and conflating the two puts an opaque *Internal Server Error* on the one
 * screen somebody locked out of the app has to complete.
 *
 * The message comes from the provider, which names the rule. It never echoes
 * the password.
 */
export class PasswordRejectedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PasswordRejectedError'
  }
}

export type { User }
