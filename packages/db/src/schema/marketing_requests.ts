import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { brands } from './brands'
import { outlets } from './outlets'
import { users } from './users'
import { workspaces } from './workspaces'

// Member lists duplicated with the schemas in `@brandfactory/shared`'s
// `marketing-request/request.ts`, per the zod-⇄-pgEnum convention.
export const marketingRequestType = pgEnum('marketing_request_type', [
  'social_post',
  'email_campaign',
  'print_collateral',
  'in_store_signage',
  'photography_video',
  'event_activation',
  'website_update',
  'other',
])
export const marketingRequestPriority = pgEnum('marketing_request_priority', [
  'low',
  'medium',
  'high',
  'urgent',
])
export const marketingRequestStatus = pgEnum('marketing_request_status', [
  'new',
  'in_review',
  'resolved',
  'declined',
])

// What the business asks marketing for. MKT-5, Phase 1.
//
// **Workspace-scoped, one brand each, outlet optional.** The brand is
// `ON DELETE CASCADE`: a request is about a brand and means nothing without
// one, and the column cannot be nulled. The outlet is `SET NULL` — a closed
// site's row going away must not take the request with it. That the outlet
// belongs to the brand spans two tables, so the query layer checks it, not a
// constraint (`queries/marketing-requests.ts`).
//
// **`number` is per workspace and assigned in the insert's transaction**, with
// the workspace row locked, so two concurrent submits cannot take the same one.
// The unique key is the backstop, not the mechanism.
//
// **Soft delete.** A request somebody filed is a record of an ask, and a delete
// is far more often a mis-click in an inbox than a wish to unsay it.
export const marketingRequests = pgTable(
  'marketing_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    outletId: uuid('outlet_id').references(() => outlets.id, { onDelete: 'set null' }),
    number: integer('number').notNull(),
    type: marketingRequestType('type').notNull(),
    priority: marketingRequestPriority('priority').notNull().default('medium'),
    status: marketingRequestStatus('status').notNull().default('new'),
    summary: text('summary').notNull(),
    details: text('details'),
    // `date`, not `timestamp`: work is needed by a day, not an instant.
    neededBy: date('needed_by', { mode: 'string' }),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    assigneeUserId: uuid('assignee_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    // Set when the status moves into `resolved` or `declined`, cleared when it
    // moves out. The inbox's "closed this week" reads it.
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    unique('marketing_requests_workspace_number_key').on(table.workspaceId, table.number),
    // The read path: a workspace's inbox, newest first.
    index('marketing_requests_workspace_created_idx').on(table.workspaceId, table.createdAt),
    index('marketing_requests_brand_idx').on(table.brandId),
  ],
)
