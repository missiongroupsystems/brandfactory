import { z } from 'zod'
import { AssetLinkUrlSchema } from '../asset/asset'
import {
  BrandIdSchema,
  FunnelActivityIdSchema,
  FunnelStageIdSchema,
  PlatformIdSchema,
  SocialPostIdSchema,
} from '../ids'

// ---------------------------------------------------------------------------
// The marketing funnel — a brand's user journey, stage by stage
// ---------------------------------------------------------------------------
//
// One view of what a brand runs and where in the journey: for planning,
// alignment and simple tracking. **Not measurement** — the request is explicit
// that the deep platforms do that.

export const FunnelStageNameSchema = z.string().trim().min(1).max(120)

export const FunnelStageSchema = z.object({
  id: FunnelStageIdSchema,
  brandId: BrandIdSchema,
  name: FunnelStageNameSchema,
  /** The journey's order. See `defaults.ts` for why this column exists here and not elsewhere. */
  position: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type FunnelStage = z.infer<typeof FunnelStageSchema>

// ---------------------------------------------------------------------------
// Platforms — brand-scoped rows, and **not** `social_platform`
// ---------------------------------------------------------------------------
//
// A funnel stage names Google Ads, email, SEO, a review site, the shop window.
// `social_platform` is an eight-member *social* enum; reusing it would file
// three quarters of a brand's funnel under `other`.
//
// **And not a row per stage, either.** Instagram serves Awareness and it serves
// Loyalty; as per-stage rows it would be typed twice, linked twice, and
// corrected once. That is the duplication `vendor_brands` and
// `influencer_brands` were each built to avoid — so a platform is a row the
// brand owns and `stage_platforms` joins it to as many stages as it serves.

export const PlatformNameSchema = z.string().trim().min(1).max(120)

export const PlatformSchema = z.object({
  id: PlatformIdSchema,
  brandId: BrandIdSchema,
  name: PlatformNameSchema,
  /** Where the stage links to. Optional — the shop window has no URL. */
  url: AssetLinkUrlSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type Platform = z.infer<typeof PlatformSchema>

// ---------------------------------------------------------------------------
// Activities — what the brand runs at a stage, now
// ---------------------------------------------------------------------------

/**
 * Small, closed, and stated by the request — and **explicitly bounded away from
 * performance**: *"not performance; the deep platforms measure that."*
 *
 * An enum rather than a table, unlike the photography subjects: these four are
 * the same four for every brand, because they describe a lifecycle rather than a
 * taste. `social_post_status` is the precedent.
 *
 * Member list duplicated with the pgEnum in `@brandfactory/db`, per the
 * zod-⇄-pgEnum convention; `funnel.test.ts` is the pin.
 */
export const FunnelActivityStatusSchema = z.enum(['planned', 'running', 'paused', 'done'])
export type FunnelActivityStatus = z.infer<typeof FunnelActivityStatusSchema>

export const FunnelActivityTitleSchema = z.string().trim().min(1).max(200)
export const FunnelActivityNoteSchema = z.string().trim().max(1000)

export const FunnelActivitySchema = z.object({
  id: FunnelActivityIdSchema,
  stageId: FunnelStageIdSchema,
  /**
   * **A `platformId`, not a platform name.** A string here would reintroduce,
   * one level down, the exact duplication the platforms table exists to remove.
   * Nullable: an activity can be planned before anybody has decided where.
   */
  platformId: PlatformIdSchema.nullable(),
  title: FunnelActivityTitleSchema,
  status: FunnelActivityStatusSchema,
  /**
   * **Two dates, though the request says only "dates", and both nullable.** A
   * Planned activity often has neither, a Running one has a start and no end, and
   * a Done one has both. One date cannot express the middle case, which is the
   * state most activities are in when anybody looks.
   */
  startsOn: z.iso.date().nullable(),
  endsOn: z.iso.date().nullable(),
  /**
   * **A link to a social-calendar push, when there is one.**
   *
   * The request names three things an activity may point at — a social push, an
   * influencer program, or a contract. Only the first exists: there is no
   * `program` record in this schema, and contracts are a fixture with no server.
   * So this is one nullable id rather than a polymorphic `(type, id)` pair, and
   * the other two get columns beside it the day their aggregates land. A
   * discriminator listing two values nothing can hold would be a lie the schema
   * tells about itself.
   */
  socialPostId: SocialPostIdSchema.nullable(),
  /**
   * Free text, and still the fallback the request asks for: *"otherwise it is
   * plain text."* An activity pointing at a contract writes it here until
   * contracts is an aggregate.
   */
  note: FunnelActivityNoteSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type FunnelActivity = z.infer<typeof FunnelActivitySchema>

/** A stage with everything hanging off it — what the screen renders per block. */
export type FunnelStageWithDetail = FunnelStage & {
  platforms: Platform[]
  activities: FunnelActivity[]
}

export const CreateFunnelStageInputSchema = z.object({ name: FunnelStageNameSchema })
export const UpdateFunnelStageInputSchema = z.object({
  name: FunnelStageNameSchema.optional(),
  position: z.number().int().optional(),
})
export type CreateFunnelStageInput = z.infer<typeof CreateFunnelStageInputSchema>
export type UpdateFunnelStageInput = z.infer<typeof UpdateFunnelStageInputSchema>

export const CreatePlatformInputSchema = z.object({
  name: PlatformNameSchema,
  url: AssetLinkUrlSchema.nullable().optional(),
})
export type CreatePlatformInput = z.infer<typeof CreatePlatformInputSchema>

export const CreateFunnelActivityInputSchema = z.object({
  title: FunnelActivityTitleSchema,
  status: FunnelActivityStatusSchema,
  platformId: PlatformIdSchema.nullable().optional(),
  socialPostId: SocialPostIdSchema.nullable().optional(),
  startsOn: z.iso.date().nullable().optional(),
  endsOn: z.iso.date().nullable().optional(),
  note: FunnelActivityNoteSchema.nullable().optional(),
})
export type CreateFunnelActivityInput = z.infer<typeof CreateFunnelActivityInputSchema>

export const UpdateFunnelActivityInputSchema = CreateFunnelActivityInputSchema.partial().refine(
  (body) => Object.keys(body).length > 0,
  { message: 'at least one field is required' },
)
export type UpdateFunnelActivityInput = z.infer<typeof UpdateFunnelActivityInputSchema>
