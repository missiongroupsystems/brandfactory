// Client — singleton pg Pool + drizzle instance.
export { db, pool } from './client'

// Schema — tables and pgEnums, grouped per aggregate under `./schema`.
export * from './schema'

// Query helpers, grouped by aggregate. "Dumb" CRUD; no business rules.
export * from './queries/users'
export * from './queries/workspaces'
export * from './queries/brands'
export * from './queries/assets'
export * from './queries/resources'
export * from './queries/decks'
export * from './queries/photo-categories'
export * from './queries/blob-refs'
export * from './queries/research'
export * from './queries/autofill'
export * from './queries/social-posts'
export * from './queries/outlets'
// The shared brand gate `queries/influencers` and `queries/vendors` both call.
export * from './queries/brand-scope'
export * from './queries/influencers'
export * from './queries/vendors'
export * from './queries/projects'
export * from './queries/canvas'
export * from './queries/events'
export * from './queries/workspace-settings'
export * from './queries/agent-messages'
