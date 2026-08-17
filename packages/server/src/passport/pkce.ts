import { createHash, randomBytes } from 'node:crypto'
import { createPassportLoginAttempt, redeemPassportLoginAttempt } from '@brandfactory/db'

/**
 * PKCE (RFC 7636) for the hosted-login handoff.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6b.
 *
 * The `code_verifier` must **never** reach the browser — not in a JS-readable cookie,
 * not in `localStorage`, not in a query parameter, not in a hidden field. It lives
 * server-side keyed by the opaque `state` the browser does carry. That is the entire
 * point of PKCE: it is what stops any party who intercepts an authorization code from
 * redeeming it, **including Passport itself**.
 *
 * A fresh pair per attempt, always. A fixed verifier is a shared secret sitting in
 * the source tree.
 */

/** Passport's authorization code lives 60s; an attempt needs a little more than one round trip. */
const ATTEMPT_TTL_MS = 5 * 60 * 1000

export interface PkcePair {
  state: string
  verifier: string
  challenge: string
}

export interface PkceStore {
  create: typeof createPassportLoginAttempt
  redeem: typeof redeemPassportLoginAttempt
}

const realStore: PkceStore = {
  create: createPassportLoginAttempt,
  redeem: redeemPassportLoginAttempt,
}

/**
 * `base64url(sha256(verifier))`, **unpadded**.
 *
 * The stripped `=` is mandatory rather than cosmetic: a padded challenge is a
 * different string, and the exchange then fails with a flat refusal that says nothing
 * about why. Node's `base64url` digest encoding is already unpadded.
 */
export function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function createPkce(store: PkceStore = realStore) {
  return {
    /**
     * Create and persist one attempt.
     *
     * 64 random bytes gives an 86-character verifier, inside RFC 7636's 43–128.
     */
    async createAttempt(now = Date.now()): Promise<PkcePair> {
      const verifier = randomBytes(64).toString('base64url')
      const state = randomBytes(32).toString('base64url')

      await store.create({
        state,
        codeVerifier: verifier,
        expiresAt: new Date(now + ATTEMPT_TTL_MS),
      })

      return { state, verifier, challenge: challengeFor(verifier) }
    },

    /**
     * Redeem an attempt: its verifier, and the row is gone.
     *
     * Single-use is structural — see `redeemPassportLoginAttempt`, which is one
     * atomic `DELETE ... RETURNING`. Null for an unknown, expired or already-redeemed
     * state; all three are the same answer, because distinguishing them would tell an
     * attacker which guess was closest.
     */
    async redeemAttempt(state: string): Promise<string | null> {
      return store.redeem(state)
    },
  }
}

export type Pkce = ReturnType<typeof createPkce>
