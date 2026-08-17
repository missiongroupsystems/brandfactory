import type { Hono } from 'hono'
import type { Logger } from './logger'

// Hono bindings + variables for the server. Route modules type their
// `new Hono<AppEnv>()` against `AppEnv` so `c.var.log` / `c.var.userId`
// resolve everywhere.

export type ServerBindings = Record<string, never>

export interface ServerVariables {
  requestId: string
  log: Logger
  userId?: string
  /**
   * Which issuer signed the bearer token on this request.
   *
   * Set by `createAuthMiddleware`. Two things need it and neither can recover it later
   * without re-verifying: the sign-out must run on the client that holds the session,
   * and the structure write-through (proposal §7) may forward **only** a
   * Passport-issued token — sending BrandFactory's own issuer's token outward is wrong
   * regardless of what Passport answers.
   */
  tokenIssuer?: 'app-native' | 'passport'
}

export interface AppEnv {
  Bindings: ServerBindings
  Variables: ServerVariables
}

export type ServerHono = Hono<AppEnv>
