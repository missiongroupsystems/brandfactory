import { z } from 'zod'
import { BrandAssetIdSchema, BrandIdSchema, SocialPostIdSchema } from '../ids'

// ---------------------------------------------------------------------------
// SocialPost — a planned post, not a published one
// ---------------------------------------------------------------------------
//
// The social calendar is a conceptual scheduling tool (`docs/executing/
// social-calendar.md`): the marketing team writes down what will be posted,
// where, when and with which assets. Nothing here talks to a platform API —
// the plan is the product, so the row is deliberately small.
//
// There is no title/label field by decision: the copy *is* the artifact, and
// every surface that needs a caption shows platform + time + a body excerpt.

/** Where the post is destined. `other` keeps the enum from gating the plan. */
export const SocialPlatformSchema = z.enum([
  'instagram',
  'facebook',
  'tiktok',
  'linkedin',
  'x',
  'youtube',
  'pinterest',
  'other',
])
export type SocialPlatform = z.infer<typeof SocialPlatformSchema>

/**
 * Manual, all three states set by a person. `draft` = slot claimed, `ready` =
 * approved as written, `posted` = the done-marker. Nothing publishes and
 * nothing auto-flips when the scheduled time passes — a `ready` post whose
 * time is gone is a plan that slipped, which is information, not an error.
 */
export const SocialPostStatusSchema = z.enum(['draft', 'ready', 'posted'])
export type SocialPostStatus = z.infer<typeof SocialPostStatusSchema>

/**
 * Who wrote the post — a person, or the planner.
 *
 * **The word is `agent`, not `planner`.** `GuidelineSectionCreatedBySchema` and
 * the canvas block enum both spell it that way, and one word for one meaning
 * outranks the fact that this particular writer has a product name.
 *
 * **This is a provenance label, not a security boundary.** The client sets it,
 * and nothing on the server checks that a row claiming `'agent'` came from one.
 * The product is single-owner: a user who forges the field is lying only to
 * themselves, and the alternative — deriving it from the route that wrote the
 * row — would put the planner's identity into every create path that is not the
 * planner.
 *
 * **The reason the field exists is a composition, not the field alone.** The
 * marketer's question is not *which of these did I write?* It is *which of next
 * week's posts has a human actually read?*, and that is
 * `createdBy === 'agent' && status === 'draft'` — the unreviewed pile, the only
 * pile that matters before something goes out under the brand's name. Marking a
 * post `ready` then becomes a real act of approval rather than a status that was
 * always there. Neither field answers it alone, which is why there is no fourth
 * status.
 */
export const SocialPostCreatedBySchema = z.enum(['user', 'agent'])
export type SocialPostCreatedBy = z.infer<typeof SocialPostCreatedBySchema>

/**
 * The longest caption the column will hold.
 *
 * **Named rather than inline, because a second reader clamps to it.** The copy
 * pass trims what the model returns instead of rejecting a whole paid batch over
 * twenty characters, and a `slice(0, 5000)` written out there would be a second
 * copy of this number free to drift from the schema that enforces it.
 */
export const SOCIAL_POST_BODY_MAX_CHARS = 5000

/** Shared by the row and both input schemas so the max cannot drift. */
export const SocialPostBodySchema = z.string().max(SOCIAL_POST_BODY_MAX_CHARS)

/**
 * Attachments ride the wire as **ids, not rows**, in display order. The
 * calendar page already loads the brand's full asset list (it needs the
 * library for the picker and `useSignedReadUrls` for thumbnails), so the
 * client joins via a `Map` — a second copy of asset rows in cache would be
 * one `applyAssetToCache` could never reach. Unresolved ids (soft-deleted
 * assets) are skipped at render; restoring the asset brings it back onto its
 * posts for free.
 */
export const SocialPostAssetIdsSchema = z
  .array(BrandAssetIdSchema)
  .max(20)
  // The join table's PK is `(post_id, asset_id)`, so a duplicate attachment is
  // unrepresentable — reject it here as a 400 rather than letting it surface
  // as a unique-violation 500 from the insert.
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'assetIds must not contain duplicates',
  })

export const SocialPostSchema = z.object({
  id: SocialPostIdSchema,
  brandId: BrandIdSchema,
  platform: SocialPlatformSchema,
  /** `null` = unscheduled — the idea tray in the list view, not an error. */
  scheduledAt: z.iso.datetime().nullable(),
  /** `''` = slot claimed, copy pending. */
  body: SocialPostBodySchema,
  status: SocialPostStatusSchema,
  createdBy: SocialPostCreatedBySchema,
  /** Ordered; order is the array order. */
  assetIds: SocialPostAssetIdsSchema,
  deletedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type SocialPost = z.infer<typeof SocialPostSchema>

/**
 * The canonical ordering, mirroring `listSocialPostsByBrand`'s SQL
 * (`scheduled_at asc nulls first, created_at asc`): unscheduled posts as
 * their own group first, then scheduled ones chronologically, with
 * `createdAt` breaking ties everywhere. The cache applier re-sorts with this
 * after every insert-or-replace — unlike an asset, a patched post *moves* in
 * the ordering.
 *
 * String comparison is correct here because the mappers normalise every
 * timestamp to ISO UTC, where lexicographic order is chronological order.
 */
export function bySchedule(a: SocialPost, b: SocialPost): number {
  if (a.scheduledAt === null || b.scheduledAt === null) {
    if (a.scheduledAt !== b.scheduledAt) return a.scheduledAt === null ? -1 : 1
  } else if (a.scheduledAt !== b.scheduledAt) {
    return a.scheduledAt.localeCompare(b.scheduledAt)
  }
  return a.createdAt.localeCompare(b.createdAt)
}
