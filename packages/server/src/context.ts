import type { User } from '@brandfactory/adapter-auth'
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
  // The `users` row for `userId`, resolved once by `createAuthMiddleware` so
  // the password gate and (from Phase C) the authorization helpers read one
  // query's answer instead of one each. Undefined when the token verified but
  // no row exists — Phase C turns that into the 401 it should be.
  user?: User
}

export interface AppEnv {
  Bindings: ServerBindings
  Variables: ServerVariables
}

export type ServerHono = Hono<AppEnv>
