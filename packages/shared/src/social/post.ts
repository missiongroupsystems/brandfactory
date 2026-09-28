import { z } from 'zod'
import { BrandAssetIdSchema, BrandIdSchema, SocialPostIdSchema, UserIdSchema } from '../ids'

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

/**
 * Where the post is destined. `other` keeps the enum from gating the plan.
 *
 * `xiaohongshu` is not decoration: the influencer roster has carried accounts
 * on it since 1.47.0, and a brand cannot plan a post for a platform its own
 * creators already publish to.
 */
export const SocialPlatformSchema = z.enum([
  'instagram',
  'facebook',
  'tiktok',
  'xiaohongshu',
  'linkedin',
  'x',
  'youtube',
  'threads',
  'pinterest',
  'other',
])
export type SocialPlatform = z.infer<typeof SocialPlatformSchema>

/**
 * The production pipeline, in order, every step set by a person.
 *
 * `idea` = the slot is claimed and nothing is settled. `approved` = somebody
 * cleared it. `filming` and `editing` are where a shoot actually is.
 * `posted` is the done-marker.
 *
 * **Nothing publishes and nothing auto-flips when the scheduled time passes.**
 * An `approved` post whose time is gone is a plan that slipped, which is
 * information, not an error. The same is true at the other end: Brandwatch
 * still does the scheduling, so `posted` is a person saying it went out, not
 * this app observing that it did.
 *
 * The order is the order the array is written in, and the UI reads it from
 * here rather than restating it — see {@link SOCIAL_POST_STATUS_ORDER}.
 *
 * **Replaces `draft | ready | posted`** (migration 0023), which described a
 * post that was written rather than a production that has stages. `draft`
 * became `idea` and `ready` became `approved`; the marketing team named all
 * five in the 16 September workshop.
 */
export const SocialPostStatusSchema = z.enum(['idea', 'approved', 'filming', 'editing', 'posted'])
export type SocialPostStatus = z.infer<typeof SocialPostStatusSchema>

/**
 * The pipeline in order, for a stepper or a legend.
 *
 * `z.enum` preserves declaration order in `.options`, so this is the enum
 * itself rather than a second list free to disagree with it.
 */
export const SOCIAL_POST_STATUS_ORDER: readonly SocialPostStatus[] = SocialPostStatusSchema.options

/**
 * What the row *is*. A shoot is not a post at a different stage — it has a
 * date, a crew and a location, and it feeds posts that are scheduled
 * separately, often on other days and other platforms.
 *
 * Both live in this one table because the calendar draws them on one grid and
 * every field below is common to the two. The link is {@link SocialPostSchema}'s
 * `shootId`: a post names the shoot it came from, one shoot feeds many posts.
 */
export const SocialPostKindSchema = z.enum(['post', 'shoot'])
export type SocialPostKind = z.infer<typeof SocialPostKindSchema>

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
 * `createdBy === 'agent' && status === 'idea'` — the unreviewed pile, the only
 * pile that matters before something goes out under the brand's name. Marking a
 * post `approved` then becomes a real act of approval rather than a status that
 * was always there. Neither field answers it alone.
 *
 * The composition survived the pipeline: the statuses after `idea` describe
 * where a production has got to, and none of them is a second way of saying
 * *nobody has read this*.
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

/**
 * The content plan — format, hook, dish, talent, who films.
 *
 * **All free text, all nullable, and that is the decision rather than a
 * shortcut.** Talent is a chef one week, a floor team the next and a booked
 * creator the week after; the freelancer behind a camera may be a vendor row
 * or a name somebody has in their phone. Structure picked now would be a guess
 * about which, and the first wrong guess costs more than the typing. What the
 * team writes here for a month is the evidence for linking any of them to a
 * real record later, and nothing typed is lost when that happens.
 *
 * `null` and `''` mean the same thing — nobody has filled it in — so the
 * mappers normalise blank input to `null` and no reader has to test for both.
 */
export const SOCIAL_POST_PLAN_FIELD_MAX_CHARS = 500

/** A hook is a sentence or two of intent, not a label. */
export const SOCIAL_POST_HOOK_MAX_CHARS = 1000

/** Room for a Canva link with its query string, and no CHECK — the `brands.websiteUrl` precedent. */
export const SOCIAL_POST_URL_MAX_CHARS = 2048

/** Shared by the row and both input schemas so the maxima cannot drift. */
export const SocialPostPlanFieldSchema = z.string().max(SOCIAL_POST_PLAN_FIELD_MAX_CHARS).nullable()
export const SocialPostHookSchema = z.string().max(SOCIAL_POST_HOOK_MAX_CHARS).nullable()
export const SocialPostUrlSchema = z.string().max(SOCIAL_POST_URL_MAX_CHARS).nullable()

const PlanField = SocialPostPlanFieldSchema

export const SocialPostSchema = z.object({
  id: SocialPostIdSchema,
  brandId: BrandIdSchema,
  /** `post` or `shoot`; the calendar draws both and the fields are common. */
  kind: SocialPostKindSchema,
  platform: SocialPlatformSchema,
  /** `null` = unscheduled — the idea tray in the list view, not an error. */
  scheduledAt: z.iso.datetime().nullable(),
  /** `''` = slot claimed, copy pending. */
  body: SocialPostBodySchema,
  status: SocialPostStatusSchema,
  createdBy: SocialPostCreatedBySchema,

  // The content plan.
  format: PlanField,
  hook: z.string().max(SOCIAL_POST_HOOK_MAX_CHARS).nullable(),
  dish: PlanField,
  talent: PlanField,
  filmedBy: PlanField,
  /** Where the design lives. Canva stays the design tool; this is the link to it. */
  canvaUrl: z.string().max(SOCIAL_POST_URL_MAX_CHARS).nullable(),

  /**
   * The shoot this post came from, or `null`. A shoot's own `shootId` is
   * always `null` — the link points one way, from post to shoot.
   */
  shootId: SocialPostIdSchema.nullable(),

  /**
   * The event in Mission Events this entry is for, or `null`.
   *
   * **No foreign key, by necessity**: the row it names lives in another
   * database owned by another app. A reader that cannot find it says so rather
   * than failing — see the plan's note on events leaving the feed.
   */
  eventsEventId: z.uuid().nullable(),

  /**
   * The approval stamp: when the row first reached `approved`, and who moved
   * it. Server-owned — a client cannot set either, and neither is cleared by a
   * later status change, because the question they answer is *did anybody ever
   * clear this?*
   */
  approvedAt: z.iso.datetime().nullable(),
  approvedBy: UserIdSchema.nullable(),

  /**
   * Who signed it off outside the app, free text.
   *
   * Approval today is anyone who is signed in, because the marketing team uses
   * this tool alone and the people they clear work with are not on the
   * platform. This field is where that fact is recorded honestly, instead of
   * a role column that would claim an authority the product does not have.
   */
  clearedWith: PlanField,

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
