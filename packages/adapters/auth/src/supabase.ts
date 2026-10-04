import type { UserId } from '@brandfactory/shared'
import { getUserById as dbGetUserById, type User } from '@brandfactory/db'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import {
  type AuthProvider,
  InvalidTokenError,
  PasswordNotSupportedError,
  PasswordRejectedError,
} from './port'

/** The slice of GoTrue's Admin API this adapter uses, and the test seam's shape. */
export type AdminApi = Pick<
  SupabaseClient['auth']['admin'],
  'updateUserById' | 'createUser' | 'deleteUser'
>

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
  // Test seam: substitute a JWKS resolver instead of fetching one.
  jwks?: JWTVerifyGetKey
  // Test seam: the admin client `setPassword` writes through. Supplying it
  // keeps the unit tests off the network and out of a real project.
  adminClient?: AdminApi
}

export function createSupabaseAuthProvider(
  config: SupabaseAuthConfig,
  deps: SupabaseAuthDeps = {},
): AuthProvider {
  const jwks = deps.jwks ?? createRemoteJWKSet(new URL(config.jwksUrl))
  const lookup = deps.getUserById ?? ((id: string) => dbGetUserById(id as UserId))

  // Built once, on first use, rather than at construction: a deployment that
  // only verifies tokens should not need the service key to boot, and the one
  // that sets passwords should fail where the act is attempted rather than at
  // startup with a message about an unrelated feature.
  let adminClient: AdminApi | null = deps.adminClient ?? null
  function admin(): AdminApi {
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
    holdsPasswords: true,
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

      // ⚠️ **No auto-provisioning. This is the door Phase C closed.**
      //
      // This function used to insert a `public.users` row for any `sub` whose
      // token carried an email it had never seen, and `authz.ts` then admitted
      // that row to every workspace, brand and project. Anybody who read the
      // public anon key out of the deployed JavaScript, signed up with an
      // address they controlled and signed in reached every brand. The
      // provisioner was the way in — the open signup endpoint only ever
      // produced a token.
      //
      // An account is created by an administrator, which is the only writer of
      // `users` now, and it takes this `sub` from the Admin API so the row and
      // the credential agree. A token with no row behind it reaches
      // `NoAccountError` in `middleware/auth.ts`.
      //
      // `emailClaim` is read and deliberately unused: it is the one field that
      // would let this function resolve a row by address instead, and doing
      // that would reintroduce a second way for a `users` row to come into
      // being. Resolution is by `sub`, which is the primary key.
      void emailClaim

      return { userId: sub }
    },
    async getUserById(id: string) {
      return lookup(id)
    },
    async createUser(input: { email: string; password?: string }) {
      const client = admin()
      // `email_confirm: true` — and the reason is not the one a self-signup
      // would give. **An administrator typed this address on purpose**, behind
      // the admin gate. There is no mail to send and nothing to confirm.
      //
      // The account is created with the password the administrator chose and
      // with no session, so the only way in is for somebody to sign in with it
      // and immediately replace it.
      const { data, error } = await client.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
      })
      if (error) {
        const status = error.status ?? 0
        // A duplicate address and a rejected password are both the
        // administrator's to fix, and the message names which.
        if (status >= 400 && status < 500) throw new PasswordRejectedError(error.message)
        throw new Error(`could not create the account: ${error.message}`)
      }
      const userId = data.user?.id
      if (!userId) throw new Error('the identity provider returned no user id')
      return { userId }
    },
    async deleteUser(userId: string) {
      const client = admin()
      const { error } = await client.deleteUser(userId)
      if (error) throw new Error(`could not delete the account: ${error.message}`)
    },
    async setSuspended(userId: string, suspended: boolean) {
      const client = admin()
      // About a hundred years, which is Launchpad's figure and its reasoning:
      // ban rather than delete, so the audit trail keeps a subject. `'none'`
      // lifts it, because we expect to.
      const { error } = await client.updateUserById(userId, {
        ban_duration: suspended ? '876600h' : 'none',
      })
      if (error) throw new Error(`could not change the account's suspension: ${error.message}`)
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
