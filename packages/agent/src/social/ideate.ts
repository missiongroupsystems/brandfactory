import { generateObject, jsonSchema } from 'ai'
import { z } from 'zod'
import type { LLMProvider, LLMProviderSettings } from '@brandfactory/adapter-llm'
import {
  CONTENT_PILLAR_MAX_CHARS,
  MEDIA_DIRECTION_MAX_CHARS,
  PostIdeaSchema,
  SOCIAL_POST_BODY_MAX_CHARS,
  type BrandWithSections,
  type IdeateCopyInput,
  type IdeateCopyResult,
  type IdeateThemesInput,
  type IdeateThemesResult,
  type SocialPlatform,
} from '@brandfactory/shared'
import { buildSystemPrompt } from '../prompts/system-prompt'

// ---------------------------------------------------------------------------
// The Post Planner's engine — two passes, one brand header
// ---------------------------------------------------------------------------
//
// Pass 1 turns a window of calendar into post ideas. Pass 2 turns the accepted
// ideas into copy, one caption per platform. Nothing here writes a row, reads
// the database or knows what a project is — the caller hands in a brand and a
// brief and gets structured objects back.
//
// **The brand header is `buildSystemPrompt`'s, verbatim.** A planner that
// assembled its own would be the second answer to *what does the model know
// about this brand*, and the first one to drift — the TL;DR precedence rule,
// the section ordering and the empty-TL;DR trap all live in that function and
// none of them is worth reimplementing. What this file adds is the `## Planning
// brief`: the things `buildSystemPrompt` has no business knowing, because they
// are facts about one request rather than about the brand.
//
// **The boundaries are enforced here, not trusted to the prompt** — the
// `resolveCitedSources` precedent. The rules below are written for the model
// because a model that understands them produces better ideas, and then
// `applyBoundaries` drops whatever ignored them anyway. A model that forgets
// rule 2 must not be able to write a duplicate post.

/** The `ai` 4.0.20 / zod 4 mismatch — JSON Schema in, local `safeParse` after. */
function schemaFor<T>(schema: z.ZodType<T>) {
  return jsonSchema<T>(z.toJSONSchema(schema) as Record<string, unknown>)
}

/**
 * What the model may return from pass 1.
 *
 * Deliberately **not** `IdeateThemesResultSchema`: that carries `outcome`,
 * which is this file's judgement about the answer rather than part of it. A
 * model asked to report its own outcome would be able to claim `ok` over an
 * empty list.
 */
const ThemesResponseSchema = z.object({
  ideas: z.array(PostIdeaSchema),
  pillars: z.array(z.string().min(1).max(CONTENT_PILLAR_MAX_CHARS)).default([]),
})

/** Pass 2's, for the same reason. */
const CopyResponseSchema = z.object({
  copies: z.array(
    z.object({
      index: z.number().int().min(0),
      body: z.string(),
      mediaDirection: z.string().default(''),
    }),
  ),
})

export interface IdeateThemesAgentInput extends IdeateThemesInput {
  brand: BrandWithSections
  llmProvider: LLMProvider
  llmSettings: LLMProviderSettings
  signal?: AbortSignal
}

export interface IdeateCopyAgentInput extends IdeateCopyInput {
  brand: BrandWithSections
  llmProvider: LLMProvider
  llmSettings: LLMProviderSettings
  signal?: AbortSignal
}

/**
 * The `## Planning brief` block — everything true about this request and
 * nothing true about the brand.
 *
 * Exported for its test. The assertions worth making are that every key date
 * name, every pillar and the window's dates reach the model, and none of those
 * is observable through `generateObject`.
 */
export function buildThemesPrompt(input: IdeateThemesInput): string {
  const lines: string[] = [
    '## Planning brief',
    '',
    `You are planning social posts for the window ${input.window.start} to ${input.window.end} (inclusive).`,
    `Propose ${input.count} ideas. The brand posts about ${input.cadencePerWeek} times a week.`,
    `Platforms in play: ${input.platforms.join(', ')}.`,
  ]

  if (input.keyDates.length > 0) {
    lines.push(
      '',
      'Key dates inside the window. A date with a note carries the note for a reason — read it.',
      '',
      ...input.keyDates.map((d) => {
        const when = d.end ? `${d.start} to ${d.end}` : d.start
        return `- ${when} — ${d.name} (${d.set})${d.note ? ` — ${d.note}` : ''}`
      }),
    )
  }

  if (input.taken.length > 0) {
    lines.push(
      '',
      'Already taken. Each line is a day and a platform that already has a post; never propose onto one:',
      '',
      ...input.taken.map((t) => `- ${t.day} — ${t.platform}`),
    )
  }

  lines.push(
    '',
    input.pillars.length > 0
      ? `Content pillars, from this brand's own guidelines. Group every idea under one of these, and propose no others:\n\n${input.pillars.map((p) => `- ${p}`).join('\n')}`
      : 'This brand has not written its content pillars. Propose three to five that genuinely fit it, and group the ideas under those.',
    '',
    'Rules, in order of importance:',
    '',
    // Rule 1 first because it is the one whose violation is invisible: a
    // caption naming a photograph the model has never seen reads perfectly.
    '1. **Describe images in words. Never name, invent or select an asset.** You cannot see this brand\'s photo library. Say what the image should show — "the pass at service, hands in frame, no faces" — and leave the choosing to a person.',
    '2. **Never propose onto a day and platform listed as taken.** The list above is complete.',
    '3. **Every date falls inside the window, or is null.** A null date is an idea worth keeping whose day is not decided — it goes to the unscheduled tray, which is a real place in this product, not a failure.',
    '4. **Group under the pillars.** One pillar per idea, named exactly as given.',
    '5. **One idea may name more than one platform** when it genuinely belongs on both. Its copy is written separately for each, so do not water it down to fit all of them.',
    '6. **Return fewer ideas rather than invent filler.** A short honest list is worth more than a padded one, and the person reading this has to review every card you write.',
    "7. Anchor an idea to a key date only when the date is genuinely relevant to this brand. Put the date's name in `keyDateName` when you do, and null when you do not.",
    '8. `reason` is one sentence saying why this idea suits *this* brand. It is what lets someone reject a card without reading the rest of it, so make it specific — a reason that would fit any brand is not a reason.',
  )

  return lines.join('\n')
}

/** Pass 2's brief. Exported for its test, same reason. */
export function buildCopyPrompt(input: IdeateCopyInput): string {
  const lines: string[] = [
    '## Copywriting brief',
    '',
    'Write the copy for each of the posts below. Return one entry per item, keyed by the item index.',
    '',
    'Rules, in order of importance:',
    '',
    '1. **Write for the platform named on each item.** A LinkedIn caption is not an Instagram one — length, register and how hard the opening works are all different. Do not write one caption and reshape it.',
    '2. **Vary the openings.** You can see the whole set. Three posts in one week that all open the same way is the single most obvious sign a feed was written by a machine.',
    "3. **Describe the image in words in `mediaDirection`.** Never name a file, an asset or a photograph — you have not seen this brand's library. Say what the shot should be so a person can take it or find it.",
    "4. **Write in the brand's voice**, as the guidelines above describe it. That is the whole reason this runs here rather than in a generic tool.",
    "5. No hashtag walls, no emoji unless the brand's own voice uses them, and never a caption that explains the image instead of adding to it.",
    '6. Return an empty `body` rather than invent something you have nothing for. An empty caption is a claimed slot in this product, not an error.',
    '',
    'The posts:',
    '',
  ]

  input.items.forEach((item, index) => {
    const parts = [
      `${index}. [${item.platform}] ${item.idea.title}`,
      `   Angle: ${item.idea.angle}`,
    ]
    if (item.idea.pillar) parts.push(`   Pillar: ${item.idea.pillar}`)
    if (item.idea.date) parts.push(`   Scheduled: ${item.idea.date}`)
    if (item.idea.keyDateName) parts.push(`   Key date: ${item.idea.keyDateName}`)
    lines.push(parts.join('\n'))
  })

  return lines.join('\n')
}

/**
 * Drop everything the prompt asked for and did not get.
 *
 * Four filters, in the order a violation costs the most:
 *
 * 1. A date outside the window would put a post in a month nobody is looking
 *    at.
 * 2. A **(date, platform) pair already claimed** would write a second post onto
 *    a slot that is already spoken for. This is the one that must be enforced in
 *    code: rule 2 in the prompt is an instruction, and an instruction is not a
 *    guarantee.
 * 3. A platform outside the request is a row the user never asked to publish.
 * 4. The clamp is what keeps a model's enthusiasm from turning a 12-idea brief
 *    into a 30-card review queue.
 *
 * **Claimed means taken by an existing post *or* by an earlier idea in this same
 * batch.** The request's `taken` list seeds the set and every kept idea adds to
 * it. Seeding alone would enforce rule 2 against the table and not against the
 * answer: a model writing eighteen ideas cannot see its own output as a set
 * while it produces it, and two cards landing on one day+platform commit two
 * posts that the grid then stacks in one cell — a collision the summary
 * sentence would immediately call a full day. The prompt is not asked to
 * guarantee this for the same reason it is not asked to guarantee the rest.
 *
 * An idea whose platforms are *all* dropped is dropped with them: a card with
 * no platform commits no rows and is a card the user has to reject by hand for
 * no reason.
 */
export function applyBoundaries(
  ideas: readonly z.infer<typeof PostIdeaSchema>[],
  input: Pick<IdeateThemesInput, 'window' | 'platforms' | 'taken' | 'count'>,
): z.infer<typeof PostIdeaSchema>[] {
  const allowed = new Set<SocialPlatform>(input.platforms)
  const claimed = new Set(input.taken.map((t) => `${t.day}\0${t.platform}`))
  const kept: z.infer<typeof PostIdeaSchema>[] = []

  for (const idea of ideas) {
    // Day keys compare as strings — `YYYY-MM-DD` sorts lexicographically the
    // way it sorts chronologically, which is the whole reason for the shape.
    if (idea.date !== null && (idea.date < input.window.start || idea.date > input.window.end)) {
      continue
    }
    const platforms = idea.platforms.filter(
      (p) => allowed.has(p) && !(idea.date !== null && claimed.has(`${idea.date}\0${p}`)),
    )
    if (platforms.length === 0) continue
    // Claimed only once the idea is kept, and only for the platforms that
    // survived: a platform dropped here never blocks a later idea from using
    // that slot. A dateless idea claims nothing — the tray has no slots to
    // collide over, and two tray ideas are two perfectly ordinary cards.
    if (idea.date !== null) {
      for (const platform of platforms) claimed.add(`${idea.date}\0${platform}`)
    }
    kept.push({ ...idea, platforms })
    if (kept.length >= input.count) break
  }

  return kept
}

/**
 * Pass 1. A window of calendar in, post ideas out.
 *
 * Throws only what `generateObject` throws — network, provider, abort — which
 * the caller maps the way it maps every vendor failure. A model that answers
 * off-schema is `invalid-shape`, and a model that answers in-schema with
 * nothing is `no-ideas`; neither is an exception, because neither is a fault
 * the user can do anything about by retrying.
 */
export async function ideatePostThemes(input: IdeateThemesAgentInput): Promise<IdeateThemesResult> {
  const { object } = await generateObject({
    model: input.llmProvider.getModel(input.llmSettings),
    schema: schemaFor(ThemesResponseSchema),
    // Parts 1–3 of the standard prompt — the brand — then this request's brief.
    // Part 4 is withheld: there is no canvas and no conversation here.
    system: `${buildSystemPrompt(input.brand, { surfaceContract: false })}\n\n${buildThemesPrompt(input)}`,
    prompt: 'Plan the window described in the brief.',
    abortSignal: input.signal,
  })

  const parsed = ThemesResponseSchema.safeParse(object)
  if (!parsed.success) return { ideas: [], pillars: [], outcome: 'invalid-shape' }

  const ideas = applyBoundaries(parsed.data.ideas, input)
  if (ideas.length === 0) return { ideas: [], pillars: [], outcome: 'no-ideas' }

  // **The brand's own pillars are never marked proposed**, whatever the model
  // returned. When the brand has written them the request names them and the
  // answer is not the model's to make; when it has not, every pillar in the
  // answer is an invention and is labelled one. Reading `proposed` off the
  // model would let a run quietly present its own inventions as the brand's.
  const pillars = (input.pillars.length > 0 ? input.pillars : parsed.data.pillars).map((name) => ({
    name,
    proposed: input.pillars.length === 0,
  }))

  return { ideas, pillars, outcome: 'ok' }
}

/**
 * Pass 2. Accepted (idea × platform) pairs in, one caption each out.
 *
 * **A missing index commits as `body: ''`** rather than dropping the row. That
 * string is already defined by `social/post.ts` as *slot claimed, copy pending*
 * — the user agreed to the post, and losing it because the model skipped an
 * index would throw away the decision rather than the caption.
 */
export async function writePostCopy(input: IdeateCopyAgentInput): Promise<IdeateCopyResult> {
  const { object } = await generateObject({
    model: input.llmProvider.getModel(input.llmSettings),
    schema: schemaFor(CopyResponseSchema),
    system: `${buildSystemPrompt(input.brand, { surfaceContract: false })}\n\n${buildCopyPrompt(input)}`,
    prompt: 'Write the copy for every post in the brief.',
    abortSignal: input.signal,
  })

  const parsed = CopyResponseSchema.safeParse(object)
  if (!parsed.success) return { copies: [], outcome: 'invalid-shape' }

  // Index-keyed, deduplicated by first answer, and every requested item gets a
  // row whether the model wrote one or not. The caller commits by position, so
  // a sparse or out-of-order answer must not shift a caption onto the wrong
  // post.
  const byIndex = new Map<number, { body: string; mediaDirection: string }>()
  for (const copy of parsed.data.copies) {
    if (copy.index < 0 || copy.index >= input.items.length) continue
    if (byIndex.has(copy.index)) continue
    byIndex.set(copy.index, {
      // Clamped rather than rejected: a caption 20 characters over the column's
      // bound is a cosmetic loss the user can fix, and a rejected batch is the
      // whole paid pass on the floor — `GUIDELINE_LABEL_MAX_CHARS`' rule.
      //
      // The bounds are imported, never written out here: this clamp and the
      // schema that would reject the row are two readers of one number.
      body: copy.body.slice(0, SOCIAL_POST_BODY_MAX_CHARS),
      mediaDirection: copy.mediaDirection.slice(0, MEDIA_DIRECTION_MAX_CHARS),
    })
  }

  if (byIndex.size === 0) return { copies: [], outcome: 'no-ideas' }

  const copies = input.items.map((_, index) => ({
    index,
    body: byIndex.get(index)?.body ?? '',
    mediaDirection: byIndex.get(index)?.mediaDirection ?? '',
  }))

  return { copies, outcome: 'ok' }
}
