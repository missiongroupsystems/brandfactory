import { z } from 'zod'
import {
  BrandIdSchema,
  MarketingRequestIdSchema,
  OutletIdSchema,
  UserIdSchema,
  WorkspaceIdSchema,
} from '../ids'

/**
 * A marketing request — what somebody in the business asks the marketing team
 * for: a post, signage, a shoot. MKT-5; the plan is
 * `docs/executing/marketing-request-form-plan.md`.
 *
 * **Workspace-scoped, one brand each.** Brand Base's unit is the brand, so a
 * request names exactly one; a request for the whole group picks the brand it
 * is mostly for, and the team splits the rest. The outlet is optional and must
 * belong to that brand — an outlet belongs to exactly one brand, so a pair that
 * disagrees is a mistake rather than a state.
 *
 * Member lists are duplicated with the pgEnums in
 * `packages/db/src/schema/marketing_requests.ts`, per the zod-⇄-pgEnum
 * convention; `request.test.ts` pins the values the schema refuses.
 */
export const MarketingRequestTypeSchema = z.enum([
  'social_post',
  'email_campaign',
  'print_collateral',
  'in_store_signage',
  'photography_video',
  'event_activation',
  'website_update',
  'other',
])
export type MarketingRequestType = z.infer<typeof MarketingRequestTypeSchema>

export const MarketingRequestPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent'])
export type MarketingRequestPriority = z.infer<typeof MarketingRequestPrioritySchema>

/**
 * The ladder. `declined` is not `resolved`: a request marketing will not do and
 * one it did look the same in a ladder of three, and the person who asked needs
 * to know which happened. Both are closing states — see `isClosedStatus`.
 */
export const MarketingRequestStatusSchema = z.enum(['new', 'in_review', 'resolved', 'declined'])
export type MarketingRequestStatus = z.infer<typeof MarketingRequestStatusSchema>

/** The two states that set `resolvedAt`. Leaving them clears it again. */
export function isClosedStatus(status: MarketingRequestStatus): boolean {
  return status === 'resolved' || status === 'declined'
}

/**
 * `MR-1001`. The number is per workspace and starts at 1001, so the first real
 * request does not read as a test. People quote it in chat, so it is short and
 * never changes; the id is for machines.
 */
export const MARKETING_REQUEST_FIRST_NUMBER = 1001

export function marketingRequestReference(number: number): string {
  return `MR-${number}`
}

/**
 * A person on a request, resolved from `users` at read time. `null` on the
 * request when the account is gone (`ON DELETE SET NULL`) — the request
 * outlives whoever sent it.
 */
export const MarketingRequestPersonSchema = z.object({
  id: UserIdSchema,
  email: z.string(),
  displayName: z.string().nullable(),
})
export type MarketingRequestPerson = z.infer<typeof MarketingRequestPersonSchema>

export const MarketingRequestSummarySchema = z.string().trim().min(1).max(200)
export const MarketingRequestDetailsSchema = z.string().max(5000)
/** A Singapore day, never an instant — the outlets' rule for the same reason. */
export const MarketingRequestDateSchema = z.iso.date()

export const MarketingRequestSchema = z.object({
  id: MarketingRequestIdSchema,
  workspaceId: WorkspaceIdSchema,
  brandId: BrandIdSchema,
  outletId: OutletIdSchema.nullable(),
  number: z.number().int(),
  /** `marketingRequestReference(number)`, sent so no client re-derives it. */
  reference: z.string(),
  type: MarketingRequestTypeSchema,
  priority: MarketingRequestPrioritySchema,
  status: MarketingRequestStatusSchema,
  summary: z.string(),
  details: z.string().nullable(),
  neededBy: MarketingRequestDateSchema.nullable(),
  requestedBy: MarketingRequestPersonSchema.nullable(),
  assignee: MarketingRequestPersonSchema.nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type MarketingRequest = z.infer<typeof MarketingRequestSchema>

/**
 * What a requester sends. **No status and no requester**: a request always
 * arrives `new`, and who sent it comes from the session, never from the body —
 * a body that could name its sender could name somebody else.
 */
export const CreateMarketingRequestInputSchema = z.object({
  brandId: BrandIdSchema,
  outletId: OutletIdSchema.nullable().optional(),
  type: MarketingRequestTypeSchema,
  priority: MarketingRequestPrioritySchema.default('medium'),
  summary: MarketingRequestSummarySchema,
  details: MarketingRequestDetailsSchema.nullable().optional(),
  neededBy: MarketingRequestDateSchema.nullable().optional(),
})
export type CreateMarketingRequestInput = z.infer<typeof CreateMarketingRequestInputSchema>

/**
 * What the inbox sends. `undefined` leaves a key alone and `null` clears it.
 * The requester and the number never change.
 */
export const UpdateMarketingRequestInputSchema = z.object({
  brandId: BrandIdSchema.optional(),
  outletId: OutletIdSchema.nullable().optional(),
  type: MarketingRequestTypeSchema.optional(),
  priority: MarketingRequestPrioritySchema.optional(),
  status: MarketingRequestStatusSchema.optional(),
  summary: MarketingRequestSummarySchema.optional(),
  details: MarketingRequestDetailsSchema.nullable().optional(),
  neededBy: MarketingRequestDateSchema.nullable().optional(),
  assigneeUserId: UserIdSchema.nullable().optional(),
})
export type UpdateMarketingRequestInput = z.infer<typeof UpdateMarketingRequestInputSchema>
