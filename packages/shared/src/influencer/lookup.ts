import { z } from 'zod'
import { ResearchSourceSchema } from '../research/job'
import {
  InfluencerHandleSchema,
  InfluencerNameSchema,
  InfluencerPlatformSchema,
  InfluencerVerticalSchema,
  type InfluencerPlatform,
} from './influencer'

// ---------------------------------------------------------------------------
// Creator lookup — a platform and a handle in, a draft somebody confirms out
// ---------------------------------------------------------------------------
//
// **Nothing here is written to a table.** The lookup produces a *draft* that a
// person reads, corrects and submits through the ordinary create route, so every
// rule that route enforces — the brand check, the 409 on a taken handle, the
// slug — applies unchanged. This file describes what crosses the wire between
// asking and confirming, and it is deliberately not `Influencer`: a draft may be
// half-empty, and the record may not.
//
// The shapes follow the plan's Phase F, with the one narrowing the spike forced:
// see `LOOKUP_PLATFORMS`.

/**
 * The platforms quick add will look up. **Five of the six.**
 *
 * XiaoHongShu is excluded, and it is a refusal rather than a degradation. The
 * Phase E spike ran three XHS creators against three search-grounded models and
 * **not one of them was correctly named**; the two follower figures that did come
 * back were 47% and 80% below the media list, the second of which files a
 * Mid-tier creator as Micro.
 *
 * Leaving the platform in and blanking the numbers would be the softer call and
 * it is the wrong one, because the failure there is not a blank. The candidate
 * that retrieved nothing at all answered two of the three XHS cases with a name,
 * a plausible follower count, a Chinese-language page title and an opaque
 * numeric RED profile id of exactly the form the real platform uses — an
 * invention no reviewer could disbelieve. This feature's safety rests on
 * *nothing is written that a person has not seen*, and that assumes the person
 * can tell. On this platform they cannot.
 *
 * **The record still holds XHS accounts** — six of the roster's 216 — and the
 * full `InfluencerForm` still writes them. Only the lookup declines, which is the
 * same line `InfluencerAccountSchema.url` already draws: *"a handle resolves to a
 * URL by guessing for five of the six platforms. It does not for xiaohongshu."*
 * The platform that cannot be addressed by handle is the platform a handle cannot
 * look up.
 */
export const LOOKUP_PLATFORMS = [
  'instagram',
  'tiktok',
  'youtube',
  'facebook',
  'linkedin',
] as const satisfies readonly InfluencerPlatform[]

/**
 * Derived from `InfluencerPlatformSchema` by exclusion rather than written out
 * as a second list, so a seventh platform added to the enum is looked up unless
 * somebody decides otherwise — the failure mode worth having, because the
 * alternative is a platform silently missing from quick add with nothing to
 * catch it. `influencer.test.ts` pins the six; `lookup.test.ts` pins the five.
 */
export const LookupPlatformSchema = InfluencerPlatformSchema.exclude(['xiaohongshu'])
export type LookupPlatform = z.infer<typeof LookupPlatformSchema>

/**
 * What the client asks for. Two fields, and that is the whole point of the
 * feature: what somebody knows when they want to add a creator is one platform
 * and one handle.
 *
 * `InfluencerHandleSchema` is reused rather than loosened, so a leading `@` is
 * **refused here too**. Stripping it in the client would admit two spellings of
 * one handle into a lookup whose result is checked against the roster for
 * duplicates, and the check is a string comparison.
 */
export const LookupInfluencerInputSchema = z.object({
  platform: LookupPlatformSchema,
  handle: InfluencerHandleSchema,
})
export type LookupInfluencerInput = z.infer<typeof LookupInfluencerInputSchema>

/**
 * A URL a draft may carry — `http`/`https` only, and capped at the length the
 * record's own column accepts.
 *
 * Named rather than written twice inline because the **engine parses these two
 * fields on their own**, not as part of the account: a model that answers
 * `instagram.com/lennardy` with no scheme must lose the link, not the follower
 * count beside it. `applyLookupBoundaries` reads this schema directly for that.
 *
 * The `http`/`https` filter is `WebsiteUrlSchema`'s and is not decoration: the
 * value is rendered into an `href`, and zod accepts `javascript:alert(1)` as a
 * valid URL.
 */
export const LookupUrlSchema = z.url({ protocol: /^https?$/ }).max(2048)

/**
 * One account in a draft — `InfluencerAccountSchema`'s shape with the two
 * figures made nullable.
 *
 * **It is not `InfluencerAccountSchema.partial()`.** That schema's
 * `followers` is non-nullable on purpose and its docstring explains why: a
 * creator's reach figure is what keeps the tier grouping total, so the record
 * has no "we have not recorded it" state. A draft is the one place that state
 * genuinely exists — the model looked and did not find — and it exists here
 * *only* so that the form can render an empty box the person fills in. The
 * create still refuses without a number.
 *
 * `sourceUrl` is the page the figure was read from. It rides on the account
 * rather than in a flat list because a two-account draft with one citation would
 * otherwise read as fully sourced when half of it is not.
 */
export const LookupAccountDraftSchema = z.object({
  platform: InfluencerPlatformSchema,
  handle: InfluencerHandleSchema,
  /** `null` = looked for, not found. Never a zero, which would be a claim. */
  followers: z.number().int().nonnegative().nullable(),
  engagementRate: z.number().min(0).max(100).nullable(),
  url: LookupUrlSchema.nullable(),
  /** The page `followers` was read from, and the only reason to believe it. */
  sourceUrl: LookupUrlSchema.nullable(),
})
export type LookupAccountDraft = z.infer<typeof LookupAccountDraftSchema>

/**
 * The draft, in `CreateInfluencerInput`'s own field names so the sheet can map
 * it across without a translation layer.
 *
 * **No `brandIds` and no `status`.** Which brands a creator is engaged for is a
 * fact about this company that no public page knows, and `prospect` is already
 * the create default — a model has no business proposing either.
 *
 * **No `notes`.** The roster's notes carry rate cards and RSVP history; a model's
 * summary of a public profile would sit in the same column and read as the same
 * kind of fact.
 */
export const LookupDraftSchema = z.object({
  name: InfluencerNameSchema.nullable(),
  accounts: z.array(LookupAccountDraftSchema),
  vertical: InfluencerVerticalSchema.nullable(),
})
export type LookupDraft = z.infer<typeof LookupDraftSchema>

/**
 * Which fields the lookup actually found, so the sheet can mark the rest as
 * blanks a person fills in rather than as zeros a person accepts.
 *
 * **A separate map rather than reading `null` off the draft**, because the two
 * say different things and the difference is the feature's whole safety
 * argument. `followers: null` in the draft means "no number"; `found.followers
 * === false` means "we looked and could not verify one". They coincide today and
 * they will not the day a boundary rule drops a figure that *was* returned — at
 * which point the draft shows a blank and this map is the only thing that can
 * explain it.
 */
export const LookupFoundSchema = z.object({
  name: z.boolean(),
  followers: z.boolean(),
  vertical: z.boolean(),
  url: z.boolean(),
})
export type LookupFound = z.infer<typeof LookupFoundSchema>

/**
 * The three outcomes, and **the engine decides all of them, never the model.**
 *
 * `ideatePostThemes` settled this shape: a model asked to report its own outcome
 * can claim `ok` over an empty answer. So the model returns what it found and
 * this vocabulary is applied to the result afterwards.
 *
 * - `ok` — a draft worth showing. It may still carry a null follower count.
 * - `not-found` — the account does not exist, is unreadable, or nothing
 *   retrieved names the handle. **Not an error**: it is not a fault the client
 *   can act on by retrying, so it rides in the body with a 200 beside it.
 * - `invalid-shape` — the model answered off-schema past salvaging. Names the
 *   model rather than the creator, which is a different sentence to the user.
 */
export const LookupOutcomeSchema = z.enum(['ok', 'not-found', 'invalid-shape'])
export type LookupOutcome = z.infer<typeof LookupOutcomeSchema>

export const LookupInfluencerResultSchema = z.object({
  outcome: LookupOutcomeSchema,
  /** `null` on every outcome but `ok`. */
  draft: LookupDraftSchema.nullable(),
  found: LookupFoundSchema,
  /**
   * **What the search layer retrieved, not what the model cited.**
   *
   * The spike's sharpest finding: a candidate that fetched nothing across 26
   * calls still returned confident, specific, entirely fabricated sources. So
   * this list comes from the provider's retrieval log, and a caller showing it
   * to a person is showing them pages that were really read.
   */
  sources: z.array(ResearchSourceSchema),
})
export type LookupInfluencerResult = z.infer<typeof LookupInfluencerResultSchema>
