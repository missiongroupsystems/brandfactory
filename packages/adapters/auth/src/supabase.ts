import type { UserId } from '@brandfactory/shared'
import {
  getUserById as dbGetUserById,
  upsertUserById as dbUpsertUserById,
  type User,
} from '@brandfactory/db'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import {
  type AuthProvider,
  InvalidTokenError,
  PasswordNotSupportedError,
  PasswordRejectedError,
} from './port'

export interface SupabaseAuthConfig {
  jwksUrl: string
  audience?: string
  issuer?: string
  // Needed only by `setPassword`, which calls the GoTrue Admin API. Absent in
  // a verify-only deployment, and `setPassword` then refuses rather than
  // pretending — see the method.
  url?: string
  serviceKey?: string
}

export interface SupabaseAuthDeps {
  getUserById?: (id: string) => Promise<User | null>
  // Called on first verify per process per `sub`: inserts a `public.users`
  // row for the Supabase-auth user so every downstream FK resolves. See
  // `upsertUserById` in `@brandfactory/db` for the `ON CONFLICT DO NOTHING`
  // semantics. Idempotent; swap in a test double for unit tests.
  ensureUser?: (input: { id: string; email: string }) => Promise<void>
  // Test seam: substitute a JWKS resolver instead of fetching one.
  jwks?: JWTVerifyGetKey
  // Test seam for the provision-once-per-process dedup cache.
  provisionedCache?: Set<string>
  // Test seam: the admin client `setPassword` writes through. Supplying it
  // keeps the unit tests off the network and out of a real project.
  adminClient?: Pick<SupabaseClient['auth']['admin'], 'updateUserById'>
}

export function createSupabaseAuthProvider(
  config: SupabaseAuthConfig,
  deps: SupabaseAuthDeps = {},
): AuthProvider {
  const jwks = deps.jwks ?? createRemoteJWKSet(new URL(config.jwksUrl))
  const lookup = deps.getUserById ?? ((id: string) => dbGetUserById(id as UserId))
  const ensureUser = deps.ensureUser ?? dbUpsertUserById
  // Process-level dedup: avoid a DB round-trip on every authed request
  // once we've already provisioned a given `sub`. Grows with unique users,
  // which is bounded in practice. Cleared on process restart — that's fine,
  // the upsert is idempotent so a second provision is a no-op.
  const provisioned = deps.provisionedCache ?? new Set<string>()

  // Built once, on first use, rather than at construction: a deployment that
  // only verifies tokens should not need the service key to boot, and the one
  // that sets passwords should fail where the act is attempted rather than at
  // startup with a message about an unrelated feature.
  let adminClient: Pick<SupabaseClient['auth']['admin'], 'updateUserById'> | null =
    deps.adminClient ?? null
  function admin(): Pick<SupabaseClient['auth']['admin'], 'updateUserById'> {
    if (adminClient) return adminClient
    if (!config.url || !config.serviceKey) {
      throw new PasswordNotSupportedError(
        'SUPABASE_URL and SUPABASE_SERVICE_KEY are needed to set a password',
      )
    }
    // `persistSession: false` — this client acts as the service role on a
    // server with no browser storage, and a persisted session here would be a
    // service-key session sitting in a store nothing clears.
    adminClient = createClient(config.url, config.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).auth.admin
    return adminClient
  }

  return {
    async verifyToken(token: string) {
      let sub: string
      let emailClaim: string | undefined
      try {
        const { payload } = await jwtVerify(token, jwks, {
          audience: config.audience,
          issuer: config.issuer,
        })
        if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
          throw new InvalidTokenError('jwt missing sub claim')
        }
        sub = payload.sub
        if (typeof payload.email === 'string' && payload.email.length > 0) {
          emailClaim = payload.email
        }
      } catch (err) {
        if (err instanceof InvalidTokenError) throw err
        const msg = err instanceof Error ? err.message : 'jwt verification failed'
        throw new InvalidTokenError(`jwt verification failed: ${msg}`)
      }

      // Auto-provision the `public.users` row on first verify per process.
      // Skipped when no email claim is present — the row requires a NOT NULL
      // email, and the subsequent `getUserById` miss will surface as a 404
      // at the `/me` route, preserving the pre-auto-provision failure mode.
      // Failures here are swallowed-and-logged rather than thrown: a DB
      // hiccup shouldn't turn every authed request into a 401. The next
      // request retries.
      if (emailClaim && !provisioned.has(sub)) {
        try {
          await ensureUser({ id: sub, email: emailClaim })
          provisioned.add(sub)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`[supabase-auth] ensureUser failed for sub=${sub}: ${msg}`)
        }
      }

      return { userId: sub }
    },
    async getUserById(id: string) {
      return lookup(id)
    },
    async setPassword(userId: string, password: string) {
      const client = admin()
      // ⚠️ Nothing in this function logs `password`, and nothing returns it.
      // The Admin API call is the only place it travels, and a thrown error
      // from the SDK carries the request, not the body.
      const { error } = await client.updateUserById(userId, { password })
      if (!error) return
      // **A refusal and a fault are not the same answer.** GoTrue answers 4xx
      // when it will not accept this password — below its own minimum, or on
      // the breach list if the project checks one — and the person fixes that
      // by typing a different one. A 5xx, a timeout or a bad service key is
      // ours, and reporting it as "pick another password" sends somebody who
      // is already locked out to try variations of a password that was fine.
      //
      // The message names the rule and never echoes the value.
      const status = error.status ?? 0
      if (status >= 400 && status < 500) throw new PasswordRejectedError(error.message)
      throw new Error(`could not set the password: ${error.message}`)
    },
  }
}
