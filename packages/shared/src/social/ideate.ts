import { z } from 'zod'
import { CONTENT_PILLAR_MAX_CHARS, MAX_CONTENT_PILLARS } from '../brand/content-pillars'
import { SocialPlatformSchema, SocialPostBodySchema } from './post'

// ---------------------------------------------------------------------------
// Ideation — a window of calendar in, post ideas and copy out
// ---------------------------------------------------------------------------
//
// The contract for a **stateless** brand-scoped route. No project, no canvas, no
// message history: a planning run is a question with an answer, not a
// conversation, and the two things a conversation would buy — memory and
// follow-up — are exactly what the user gets by editing the plan on the grid
// instead.
//
// **Nothing here is persisted.** The route writes no row. The client turns
// accepted ideas into posts through `POST /brands/:id/social-posts`, which is
// the one writer this table has ever had.
//
// Two passes, and the split is deliberate. Pass 1 decides *what to say and
// when*; pass 2 writes the words. A model asked for both at once writes twelve
// captions before anybody has agreed to twelve posts, and the user pays for
// every one they reject.
//
// **`IdeateKeyDate` is a quotation, not the dataset.** `key-dates/types.ts`
// records that the 92 curated dates get no table, no route and no wire type —
// they are the same for every brand and nobody edits them. That decision is
// about *storage* and it stands. What crosses the wire here is the handful of
// entries one request is about, shaped for a prompt, exactly as the visible
// month and the chosen platform already do.

/**
 * A local calendar day, `YYYY-MM-DD` — never an ISO instant.
 *
 * The same string `calendar.ts` calls a day key and `<input type="date">`
 * takes. A holiday has no time, and a planning window has no timezone: the user
 * is planning *August*, not the 3.6 million milliseconds either side of it.
 */
export const DayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')

/** The span being planned. Inclusive at both ends. */
export const IdeateWindowSchema = z.object({
  start: DayKeySchema,
  end: DayKeySchema,
})
export type IdeateWindow = z.infer<typeof IdeateWindowSchema>

/**
 * One key date, as the request quotes it.
 *
 * `set` is the set's **display name** — `Global`, `Singapore holidays` — and
 * deliberately a plain string rather than the dataset's union. A gazetted public
 * holiday and a festival organiser's announcement carry different planning
 * weight and the model should be told which it is looking at; teaching
 * `packages/shared` the members of a dataset that lives in `packages/web` would
 * undo the decision in the paragraph above.
 */
export const IdeateKeyDateSchema = z.object({
  name: z.string().min(1).max(120),
  start: DayKeySchema,
  /** Inclusive last day. **Absent means a single day**, as in the dataset. */
  end: DayKeySchema.optional(),
  note: z.string().max(240).optional(),
  set: z.string().min(1).max(60),
})
export type IdeateKeyDate = z.infer<typeof IdeateKeyDateSchema>

/**
 * A day+platform pair that already has a live post.
 *
 * **The pair, not the day** (Q3). One post on Instagram and one on LinkedIn on a
 * Tuesday is a normal Tuesday; a planner told the day was full after the first
 * would refuse the second. The client builds this list from
 * `postsByDayPlatform`, which is the single definition of *taken* on the web
 * side — see that function's comment on why there must never be a second.
 */
export const IdeateTakenSlotSchema = z.object({
  day: DayKeySchema,
  platform: SocialPlatformSchema,
})
export type IdeateTakenSlot = z.infer<typeof IdeateTakenSlotSchema>

/** The largest batch the planner will ever ask for — `plannerBatchSize`'s ceiling. */
export const IDEATE_MAX_IDEAS = 18

/** The largest number of (idea × platform) rows one copy pass will write. */
export const IDEATE_MAX_COPY_ITEMS = 24

/**
 * The most key dates one request may quote, and the most taken slots it may
 * list.
 *
 * **Named rather than inline, because the client sizes its request against
 * them.** A window that overran either bound would be a 400 on a request the
 * user has already been shown the brief for — so the two builders clamp, and
 * they must clamp to the same numbers the validator enforces.
 */
export const IDEATE_MAX_KEY_DATES = 60
export const IDEATE_MAX_TAKEN_SLOTS = 400

/**
 * The longest image brief pass 2 may return.
 *
 * Named for `SOCIAL_POST_BODY_MAX_CHARS`' reason: the copy pass clamps to it
 * rather than rejecting a paid batch, so the number has two readers and must
 * have one definition.
 */
export const MEDIA_DIRECTION_MAX_CHARS = 400

/**
 * One proposed post, before anybody has agreed to it.
 *
 * `date: null` is not a failure — it is the unscheduled tray, which
 * `SocialPostList` already describes as exactly this: an idea worth keeping
 * whose day has not been decided.
 *
 * **`platforms` is a list, and that is Q8.** One idea may be worth saying on
 * two platforms, and its copy is written separately for each, because a
 * LinkedIn caption is not an Instagram one. The client shows one card with a
 * chip per platform and commits one row per chip.
 */
export const PostIdeaSchema = z.object({
  /** A few words the user reads on the card. Not stored on the post. */
  title: z.string().min(1).max(120),
  /** What the post actually says or shows — the substance of the idea. */
  angle: z.string().min(1).max(600),
  /** Which pillar it belongs under, or `null` when the run has no pillars. */
  pillar: z.string().max(CONTENT_PILLAR_MAX_CHARS).nullable(),
  /** A day inside the window, or `null` for the tray. */
  date: DayKeySchema.nullable(),
  platforms: z.array(SocialPlatformSchema).min(1).max(8),
  /** The key date this idea hangs off, by name, when it hangs off one. */
  keyDateName: z.string().max(120).nullable(),
  /** Why this, for this brand — the line that makes a card rejectable on sight. */
  reason: z.string().max(400),
})
export type PostIdea = z.infer<typeof PostIdeaSchema>

/**
 * A pillar the run grouped ideas under.
 *
 * `proposed: true` means the brand has no `Content pillars` section and the
 * model invented these for this run. The client marks them and offers to save
 * them — which is the fix for pillars drifting between runs, and the marker is
 * what tells the user the fix exists.
 */
export const IdeatePillarSchema = z.object({
  name: z.string().min(1).max(CONTENT_PILLAR_MAX_CHARS),
  proposed: z.boolean(),
})
export type IdeatePillar = z.infer<typeof IdeatePillarSchema>

/**
 * Why a pass produced what it produced — `SectionShapeOutcome`'s vocabulary in
 * this domain, and for the same reason.
 *
 * - `no-ideas` — the model answered **in schema** that it has nothing to
 *   propose. Not an error: a fully booked window is a real answer, and the
 *   client has one honest line for it.
 * - `invalid-shape` — the model did not answer in the schema at all. A fact
 *   about the configured model, not about the brand.
 */
export const IdeateOutcomeSchema = z.enum(['ok', 'no-ideas', 'invalid-shape'])
export type IdeateOutcome = z.infer<typeof IdeateOutcomeSchema>

export const IdeateThemesInputSchema = z.object({
  window: IdeateWindowSchema,
  /** The platforms this run may propose onto. Nothing else survives the filter. */
  platforms: z.array(SocialPlatformSchema).min(1).max(8),
  keyDates: z.array(IdeateKeyDateSchema).max(IDEATE_MAX_KEY_DATES).default([]),
  taken: z.array(IdeateTakenSlotSchema).max(IDEATE_MAX_TAKEN_SLOTS).default([]),
  /** Posts per week, from `inferCadence` — measured or suggested, never zero. */
  cadencePerWeek: z.number().int().min(1).max(21),
  /** The brand's own pillars when it has written them. Empty means propose. */
  pillars: z
    .array(z.string().min(1).max(CONTENT_PILLAR_MAX_CHARS))
    .max(MAX_CONTENT_PILLARS)
    .default([]),
  /** How many ideas to ask for — `plannerBatchSize`'s `count`. */
  count: z.number().int().min(1).max(IDEATE_MAX_IDEAS),
})
export type IdeateThemesInput = z.infer<typeof IdeateThemesInputSchema>

export const IdeateThemesResultSchema = z.object({
  ideas: z.array(PostIdeaSchema),
  pillars: z.array(IdeatePillarSchema),
  outcome: IdeateOutcomeSchema,
})
export type IdeateThemesResult = z.infer<typeof IdeateThemesResultSchema>

/**
 * Pass 2's request: the accepted (idea × platform) pairs, all of them.
 *
 * **One call, not one per row.** It is cheaper, but the reason is that captions
 * written together stop three posts in one week from opening the same way — a
 * set the model can see is a set it can vary.
 */
export const IdeateCopyInputSchema = z.object({
  items: z
    .array(z.object({ idea: PostIdeaSchema, platform: SocialPlatformSchema }))
    .min(1)
    .max(IDEATE_MAX_COPY_ITEMS),
})
export type IdeateCopyInput = z.infer<typeof IdeateCopyInputSchema>

export const PostCopySchema = z.object({
  /** Index into the request's `items`. The model may not reorder. */
  index: z.number().int().min(0),
  /** The caption. `''` is `social/post.ts`'s *slot claimed, copy pending*. */
  body: SocialPostBodySchema,
  /**
   * The image or video **described in words** — never an asset id and never a
   * filename.
   *
   * A brand asset carries a `label` and `alt` text a person typed while
   * uploading, and nothing a model can look at. Naming one would be reasoning
   * from that label and presenting it as if the model had seen the picture.
   * This is a brief for whoever makes or picks the image.
   */
  mediaDirection: z.string().max(MEDIA_DIRECTION_MAX_CHARS),
})
export type PostCopy = z.infer<typeof PostCopySchema>

export const IdeateCopyResultSchema = z.object({
  copies: z.array(PostCopySchema),
  outcome: IdeateOutcomeSchema,
})
export type IdeateCopyResult = z.infer<typeof IdeateCopyResultSchema>
