// Client — singleton pg Pool + drizzle instance.
export { db, pool } from './client'

// Schema — tables and pgEnums, grouped per aggregate under `./schema`.
export * from './schema'

// Query helpers, grouped by aggregate. "Dumb" CRUD; no business rules.
export * from './queries/users'
export * from './queries/workspaces'
export * from './queries/brands'
export * from './queries/assets'
export * from './queries/blob-refs'
export * from './queries/research'
export * from './queries/autofill'
export * from './queries/social-posts'
export * from './queries/projects'
export * from './queries/canvas'
export * from './queries/events'
export * from './queries/workspace-settings'
export * from './queries/agent-messages'
// The Passport projection's write path. Deliberately NOT on the `Db` facade in
// `packages/server/src/db.ts` — only the sync receiver and the login path may
// reach these, and `passport-write-guard.test.ts` enforces that.
export * from './queries/passport'
// The read path, by contrast, is unrestricted: reading the projection from
// anywhere is the entire point of having it. Reads are projection-first — no TTL
// cache in front of these, and no API-first path with the projection as fallback.
export * from './queries/passport-read'
// PKCE attempts for hosted login. App-owned, and the redemption is a single atomic
// DELETE ... RETURNING so single-use is structural rather than conventional.
export * from './queries/passport-login-attempts'
// Structure writes to Passport that failed and may be retried. App-owned, and legitimate
// only while the four properties in its schema header hold — chiefly that NOTHING but the
// retry surface reads it.
export * from './queries/passport-write-attempts'
// The join between this app's own structure and Passport's, plus the link the sync sets.
// ONE query, no mode switch: a row is linked or it is not, and both answer. Read its header
// before adding a `passport.unit` read anywhere else — the LEFT JOIN is load-bearing.
export * from './queries/structure'
