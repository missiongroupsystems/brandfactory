import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * One in-flight hosted-login attempt — the server-side half of PKCE.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6b.
 *
 * **App-owned, and not a shadow.** Passport has no notion of our login attempts,
 * so this is not a copy of anything it holds — rule 7's carve-out used as intended.
 * It lives in `public`, not in the `passport` schema, precisely because nothing here
 * comes from a sync event.
 *
 * ---------------------------------------------------------------------------
 * `code_verifier` must NEVER reach the browser
 * ---------------------------------------------------------------------------
 *
 * Not in a JS-readable cookie, not in `localStorage`, not in a query parameter, not
 * in a hidden field. It lives here, server-side, keyed by the opaque `state` the
 * browser does carry — and that is the entire point of PKCE: it is what stops any
 * party who intercepts an authorization code from redeeming it, **including Passport
 * itself**. A verifier the browser can see protects nothing.
 *
 * `state` is the primary key rather than a surrogate, because redemption is a lookup
 * by `state` and there is no second way to address a row. It is 32 random bytes, so
 * a collision is not a practical concern.
 *
 * ---------------------------------------------------------------------------
 * This table is written by UNAUTHENTICATED requests
 * ---------------------------------------------------------------------------
 *
 * `/auth/passport/start` inserts a row on **every** hit, before anybody has proven
 * anything. That makes it an unbounded-growth vector on its own, so three things
 * bound it together: the route is rate-limited, `expiresAt` makes a row disposable,
 * and every insert sweeps the expired rows first.
 */
export const passportLoginAttempts = pgTable(
  'passport_login_attempts',
  {
    /** The opaque value the browser round-trips. Also the redemption key. */
    state: text('state').primaryKey(),
    /** The PKCE verifier. Server-side only, for the whole life of the row. */
    codeVerifier: text('code_verifier').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    /**
     * Short: Passport's authorization code lives 60 seconds, so an attempt needs
     * only a little more than one browser round trip. A long TTL would keep
     * redeemable verifiers around for no benefit.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (table) => [index('passport_login_attempts_expires_at_idx').on(table.expiresAt)],
)
