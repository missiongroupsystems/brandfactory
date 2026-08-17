import { and, eq, lt, sql } from 'drizzle-orm'
import { db } from '../client'
import { passportLoginAttempts } from '../schema'

/**
 * The PKCE attempt store. Plan: phase 6b.
 *
 * Two functions, and the second one's atomicity is the security property.
 */

/**
 * Persist one attempt, sweeping expired rows on the way in.
 *
 * The sweep is not housekeeping: `/auth/passport/start` is reachable
 * unauthenticated and writes a row on every hit, so without it this table grows
 * without bound. The route's rate limit is the other half of that bound.
 */
export async function createPassportLoginAttempt(input: {
  state: string
  codeVerifier: string
  expiresAt: Date
}): Promise<void> {
  await db.delete(passportLoginAttempts).where(lt(passportLoginAttempts.expiresAt, sql`now()`))
  await db.insert(passportLoginAttempts).values({
    state: input.state,
    codeVerifier: input.codeVerifier,
    expiresAt: input.expiresAt.toISOString(),
  })
}

/**
 * Redeem an attempt: return its verifier and delete it, **atomically**.
 *
 * `DELETE … RETURNING` makes single-use structural rather than conventional — two
 * concurrent callbacks for one `state` cannot both succeed, because only one
 * statement can delete the row. Reading and then deleting would leave a replay
 * window, and replay is precisely what `state` exists to prevent.
 *
 * The expiry is in the `WHERE`, so an expired row is not redeemable even though it
 * may still be present between sweeps.
 *
 * Returns null for an unknown, expired or already-redeemed state. All three are the
 * same answer to the caller — this is not a live sign-in attempt — and distinguishing
 * them would tell an attacker which of their guesses was closest.
 */
export async function redeemPassportLoginAttempt(state: string): Promise<string | null> {
  const rows = await db
    .delete(passportLoginAttempts)
    .where(
      and(eq(passportLoginAttempts.state, state), sql`${passportLoginAttempts.expiresAt} > now()`),
    )
    .returning({ codeVerifier: passportLoginAttempts.codeVerifier })

  return rows[0]?.codeVerifier ?? null
}
