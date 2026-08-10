import type {
  IdeateKeyDate,
  IdeateTakenSlot,
  IdeateThemesInput,
  PostIdea,
  SocialPlatform,
  SocialPost,
} from '@brandfactory/shared'
import {
  IDEATE_MAX_COPY_ITEMS,
  IDEATE_MAX_KEY_DATES,
  IDEATE_MAX_TAKEN_SLOTS,
} from '@brandfactory/shared'
import { dayKeyToDate, groupByDay, localDayKey } from '@/lib/calendar'
import { KEY_DATE_SET_LABELS, splitByShape, type KeyDate } from '@/lib/key-dates'

// ---------------------------------------------------------------------------
// social-plan — what a month is shaped like, before any model exists
// ---------------------------------------------------------------------------
//
// Pure arithmetic over the post list and the key-date dataset, both of which the
// calendar page already holds. Nothing here fetches, renders or spends anything,
// and the most useful sentence on the surface — *National Day (9 Aug) has no
// post* — comes out of this file with no LLM behind it.
//
// **Day keys are compared as strings, never as `Date`s**, and every day key this
// file produces comes from `groupByDay`. That is the invariant `calendar.ts`
// opens with: a wire timestamp is UTC and a calendar is local, so the conversion
// from an instant to a day happens in exactly one place. A second
// `new Date(post.scheduledAt)` here would be a second answer to *which cell does
// this post belong to*, and the two would disagree for every post near midnight.
//
// **Live posts only.** A soft-deleted post occupies no slot, claims no key date
// and is no evidence of a cadence — it is a row somebody removed. Every function
// here filters through `livePosts` first.

/** The window `inferCadence` reads, in days. Four weeks, ending today. */
const CADENCE_WINDOW_DAYS = 28

/**
 * Below this many posts in the window there is nothing to infer from.
 *
 * Two posts in four weeks is as likely to be a brand that started last Tuesday
 * as a brand that posts twice a month, and `round(2 / 4)` would answer the
 * question with `1` either way. Three is where the number starts being a
 * measurement rather than a rounding artefact.
 */
const CADENCE_MIN_HISTORY = 3

/** What a brand with no history is offered. Never zero — see `inferCadence`. */
const SUGGESTED_CADENCE = 3

/** Q6: half again as many ideas as slots, so half a batch can be rejected. */
const BATCH_SURPLUS = 1.5
const MIN_BATCH = 6
const MAX_BATCH = 18

/** Soft-deleted posts are not part of any plan. */
function livePosts(posts: SocialPost[]): SocialPost[] {
  return posts.filter((post) => post.deletedAt === null)
}

/** The month's first and last day, as day keys — `month` **0-based**. */
function monthBounds(year: number, month: number): { first: string; last: string } {
  // Day 0 of the next month is the last day of this one — `monthGridDays`'
  // trick, same reason.
  return {
    first: localDayKey(new Date(year, month, 1)),
    last: localDayKey(new Date(year, month + 1, 0)),
  }
}

/**
 * **The** definition of *taken*: which platforms already have a live post on
 * each day.
 *
 * Q3 — full is per day **and** per platform. One post on Instagram and one on
 * LinkedIn on a Tuesday is a normal Tuesday; a planner that treated the day as
 * full after the first would refuse the second. So the value is a set of
 * platforms, not a boolean and not a count.
 *
 * **This function has two readers and must never grow a third definition.** The
 * month's arithmetic on screen reads it, and the planner's request body is built
 * from it. If a second rule for *taken* ever appears, the planner will propose
 * into days the summary has already called full — and the bug will look like a
 * model failure when it is an arithmetic one. One function, two readers.
 *
 * Days with no live scheduled post are **absent**, not present with an empty
 * set: `taken.has(dayKey)` is then the whole question *does anything land here*,
 * which is what `unclaimedKeyDates` asks.
 */
export function postsByDayPlatform(posts: SocialPost[]): Map<string, Set<SocialPlatform>> {
  const taken = new Map<string, Set<SocialPlatform>>()
  for (const [dayKey, dayPosts] of groupByDay(livePosts(posts))) {
    taken.set(dayKey, new Set(dayPosts.map((post) => post.platform)))
  }
  return taken
}

/**
 * The key dates inside a month that no post lands on — `month` **0-based**.
 *
 * **Single days only. A season is never unclaimed.** It has no one day to hang a
 * post off, which is the same reason `SocialPostList`'s heading suffixes exclude
 * seasons and the reason `splitByShape` exists at all. *The Hungry Ghost month
 * has no post* is not a sentence a marketer can act on; *National Day has no
 * post* is.
 *
 * Claimed means **any** live post on the day, whatever its platform. This is
 * deliberately looser than `postsByDayPlatform`'s per-platform rule: the
 * question here is whether the date has been noticed at all, and one Instagram
 * post on National Day means it has been.
 *
 * Sorted by `start`, so *the first unclaimed key date* is the earliest one
 * whatever order the caller passed the dataset in.
 */
export function unclaimedKeyDates(
  keyDates: KeyDate[],
  posts: SocialPost[],
  year: number,
  month: number,
): KeyDate[] {
  const { days } = splitByShape(keyDates)
  const { first, last } = monthBounds(year, month)
  const taken = postsByDayPlatform(posts)
  return days
    .filter((date) => date.start >= first && date.start <= last && !taken.has(date.start))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
}

/** Everything the sentence under the month's header states. */
export interface MonthPlanSummary {
  /** Days in the month — 28, 29, 30 or 31. */
  days: number
  /** Live posts scheduled inside it. Unscheduled posts are in no month. */
  planned: number
  /**
   * Single-day key dates falling in the month, claimed or not.
   *
   * Carried so the sentence can drop its third clause entirely when the month
   * holds none. *No key dates unclaimed* on a calendar with every set switched
   * off is a claim about an empty set, which reads as reassurance and is not.
   */
  keyDays: number
  /** Those of them no post lands on, earliest first. */
  unclaimed: KeyDate[]
}

/**
 * The month, in numbers — `month` **0-based**.
 *
 * One pass over the same two inputs the grid already renders, so the sentence
 * and the cells beneath it cannot disagree.
 */
export function monthPlanSummary(
  posts: SocialPost[],
  keyDates: KeyDate[],
  year: number,
  month: number,
): MonthPlanSummary {
  const { first, last } = monthBounds(year, month)
  let planned = 0
  for (const [dayKey, dayPosts] of groupByDay(livePosts(posts))) {
    if (dayKey >= first && dayKey <= last) planned += dayPosts.length
  }
  const keyDays = splitByShape(keyDates).days.filter(
    (date) => date.start >= first && date.start <= last,
  ).length
  return {
    days: new Date(year, month + 1, 0).getDate(),
    planned,
    keyDays,
    unclaimed: unclaimedKeyDates(keyDates, posts, year, month),
  }
}

/** What `inferCadence` answers, and where the answer came from. */
export interface InferredCadence {
  /** Posts per week. **Never zero** — see below. */
  perWeek: number
  /** `history` = measured from the last four weeks. `suggested` = a default. */
  source: 'history' | 'suggested'
}

/**
 * How often this brand posts, measured from the four weeks before `now`.
 *
 * **The source is returned, not just the number**, and every surface that shows
 * the number must show the source with it. An inference nobody can see is a
 * guess wearing the clothes of a fact, and this particular number is the one the
 * whole planner batch is sized from.
 *
 * **Never zero, on purpose.** A brand with no history is exactly the brand most
 * likely to be opening a planner — the day the brand starts — and a planner that
 * opens at `0 posts/week` proposes nothing on the one day it is most needed. So
 * a thin history returns `SUGGESTED_CADENCE` and says so.
 *
 * `now` is injectable, the `upcomingKeyDates` precedent: this is the only
 * function here whose answer changes without any data changing, and a test
 * cannot pin it otherwise.
 */
export function inferCadence(posts: SocialPost[], now: Date): InferredCadence {
  // Walked by day rather than by 28 × 86 400 000 milliseconds: `calendar.ts`'
  // second invariant, and the reason a DST boundary inside the window does not
  // shorten it. `- 1` because the window ends today and includes it.
  const from = localDayKey(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - (CADENCE_WINDOW_DAYS - 1)),
  )
  const to = localDayKey(now)
  let count = 0
  for (const [dayKey, dayPosts] of groupByDay(livePosts(posts))) {
    if (dayKey >= from && dayKey <= to) count += dayPosts.length
  }
  if (count < CADENCE_MIN_HISTORY) return { perWeek: SUGGESTED_CADENCE, source: 'suggested' }
  return { perWeek: Math.max(1, Math.round(count / (CADENCE_WINDOW_DAYS / 7))), source: 'history' }
}

/** What a planner run would ask for, stated before anything is spent. */
export interface PlannerBatchSize {
  /** Posts the window has room for at this cadence. */
  slots: number
  /** Ideas to ask for. Always at least `MIN_BATCH`, never above `MAX_BATCH`. */
  count: number
}

/**
 * Q6, as one expression: `slots = ceil(weeks × perWeek)`, then
 * `count = clamp(round(slots × 1.5), 6, 18)`.
 *
 * The surplus is what the reject-half mechanic runs on, and reviewing is work.
 * Half again is enough to throw away a third of a batch and still fill the
 * month; twice over turns a planning session into a triage queue, which is the
 * state a marketer opened the planner to escape. The floor stops a single week
 * returning two ideas and calling it a choice; the ceiling is where a review
 * stage stops being a review.
 */
export function plannerBatchSize(weeks: number, perWeek: number): PlannerBatchSize {
  const slots = Math.max(0, Math.ceil(weeks * perWeek))
  const count = Math.min(MAX_BATCH, Math.max(MIN_BATCH, Math.round(slots * BATCH_SURPLUS)))
  return { slots, count }
}

// ---------------------------------------------------------------------------
// The planner's request, and what the user accepted out of its answer
// ---------------------------------------------------------------------------
//
// Everything below turns what is already on the page into the two request
// bodies `POST /brands/:id/ideate/*` takes, and the answer back into rows.
// Still pure, still no fetch: the panel states its brief from these before
// anything is spent, and the page sends the same values it stated.

/** The two windows the brief offers. */
export type PlannerWindowChoice = 'month' | 'four-weeks'

/** Days in the rolling window — four weeks, starting today. */
const FOUR_WEEKS_DAYS = 28

export interface PlannerWindow {
  /** Inclusive first day, `YYYY-MM-DD`. */
  start: string
  /** Inclusive last day. */
  end: string
  /** The span in weeks, fractional — `plannerBatchSize`'s first argument. */
  weeks: number
}

/**
 * The window a run plans into — the month on screen, or the next four weeks.
 *
 * **The month window never starts in the past.** Opening the planner on the
 * 20th and asking it to fill *this month* means the eleven days that are left,
 * not the nineteen that are gone: an idea dated last Tuesday is a card the user
 * can only reject, and `applyBoundaries` would have kept it because it does fall
 * inside the month. The clamp happens only when today is inside the month — a
 * month deliberately navigated to in the past is planned whole, because someone
 * asking for July in August has said what they mean.
 *
 * `weeks` is fractional on purpose: a 31-day month is 4.43 weeks, and rounding
 * it to 4 would size the batch for six fewer days than the user is looking at.
 *
 * `now` is injectable, `inferCadence`'s precedent and for the same reason.
 */
export function plannerWindow(
  choice: PlannerWindowChoice,
  cursor: { year: number; month: number },
  now: Date,
): PlannerWindow {
  const todayKey = localDayKey(now)
  if (choice === 'four-weeks') {
    const end = localDayKey(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + (FOUR_WEEKS_DAYS - 1)),
    )
    return { start: todayKey, end, weeks: FOUR_WEEKS_DAYS / 7 }
  }
  const { first, last } = monthBounds(cursor.year, cursor.month)
  const start = todayKey > first && todayKey <= last ? todayKey : first
  return { start, end: last, weeks: (dayCount(start, last) || 1) / 7 }
}

/** Inclusive day count between two day keys, `0` when they are out of order. */
function dayCount(start: string, end: string): number {
  const from = dayKeyToDate(start)
  const to = dayKeyToDate(end)
  if (!from || !to) return 0
  // Walked by day rather than by milliseconds — `calendar.ts`' second
  // invariant, and the reason a DST boundary inside the window does not add or
  // lose a day.
  let days = 0
  for (let d = new Date(from); localDayKey(d) <= end; d.setDate(d.getDate() + 1)) days += 1
  return days
}

/**
 * The key dates the request quotes — the ones **overlapping** the window.
 *
 * Overlap, not containment, for `seasonsInMonth`' reason: mid-season is exactly
 * when a brand is most likely to be planning inside one, and a Hungry Ghost
 * month that started three days before the window is still the fact that shapes
 * what may be posted in it.
 *
 * Seasons are quoted with their `end`; single days without one. `set` becomes
 * the set's **display name**, which is what `IdeateKeyDate` documents: the model
 * should be able to tell a gazetted public holiday from a festival organiser's
 * announcement, and `sg-events` does not say that to anybody.
 *
 * Clamped to the schema's ceiling, earliest first, so a run can never be
 * refused for quoting too much of a dataset the user did not choose the size of.
 */
export function keyDatesInWindow(keyDates: KeyDate[], window: PlannerWindow): IdeateKeyDate[] {
  return keyDates
    .filter((d) => d.start <= window.end && (d.end ?? d.start) >= window.start)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
    .slice(0, IDEATE_MAX_KEY_DATES)
    .map((d) => ({
      name: d.name,
      start: d.start,
      ...(d.end ? { end: d.end } : {}),
      ...(d.note ? { note: d.note } : {}),
      set: KEY_DATE_SET_LABELS[d.set],
    }))
}

/**
 * The day+platform pairs the run may not propose onto, **from
 * `postsByDayPlatform` and from nothing else**.
 *
 * This is the second of that function's two readers, and the reason its comment
 * forbids a third: the sentence under the month's header and the list handed to
 * the model are the same arithmetic, so the planner cannot propose into a day
 * the summary has already called full.
 *
 * **Restricted to the window, and the restriction is what makes the list
 * correct rather than merely shorter.** An earlier version sent every live
 * scheduled post on the argument that an out-of-window post cannot collide with
 * an in-window idea, so filtering bought nothing. That argument holds only while
 * nothing truncates. `IDEATE_MAX_TAKEN_SLOTS` is a real ceiling,
 * `listSocialPostsByBrand` returns the brand's whole history ordered
 * `scheduledAt asc`, and `postsByDayPlatform` preserves that order — so the
 * slice kept the **oldest** 400 pairs and dropped the newest. The dropped ones
 * were precisely the pairs inside the window, the only ones that could collide
 * at all, and the planner would then double-book a slot it was built never to
 * touch. A brand posting three times a week to two platforms reaches 400 pairs
 * in about sixteen months.
 *
 * Filtered first, the ceiling becomes the backstop it was meant to be: a 31-day
 * window across all eight platforms is 248 pairs, so the slice can no longer
 * fire on any window this product offers.
 */
export function takenSlots(posts: SocialPost[], window: PlannerWindow): IdeateTakenSlot[] {
  const slots: IdeateTakenSlot[] = []
  for (const [day, platforms] of postsByDayPlatform(posts)) {
    if (day < window.start || day > window.end) continue
    for (const platform of platforms) slots.push({ day, platform })
  }
  return slots.slice(0, IDEATE_MAX_TAKEN_SLOTS)
}

/** Live scheduled posts inside the window — the brief's *already there* count. */
export function plannedInWindow(posts: SocialPost[], window: PlannerWindow): number {
  let planned = 0
  for (const [dayKey, dayPosts] of groupByDay(livePosts(posts))) {
    if (dayKey >= window.start && dayKey <= window.end) planned += dayPosts.length
  }
  return planned
}

/** What the platform picker opens on when the brand has no history at all. */
const DEFAULT_PLATFORM: SocialPlatform = 'instagram'

/**
 * The platforms this brand actually posts to, most-used first.
 *
 * The same shape of answer as `inferCadence` and for the same reason: a picker
 * that opens on all eight would have the user turn seven off before every run,
 * and one that opens on none would refuse to run at all. It is a starting point
 * the user edits, so it is not labelled with its source — unlike the cadence,
 * which is a *number* the batch size is computed from and which nobody could
 * otherwise tell was measured.
 *
 * A brand with no posts opens on Instagram alone.
 */
export function inferPlatforms(posts: SocialPost[]): SocialPlatform[] {
  const counts = new Map<SocialPlatform, number>()
  for (const post of livePosts(posts)) {
    counts.set(post.platform, (counts.get(post.platform) ?? 0) + 1)
  }
  if (counts.size === 0) return [DEFAULT_PLATFORM]
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([platform]) => platform)
}

/**
 * What the user has decided about one idea card.
 *
 * **Every idea starts accepted, and rejecting is the gesture.** Q6 sizes the
 * batch at half again the slots precisely so that half of it can be thrown
 * away — *open August, run the planner, reject half* — and a panel that opened
 * with twelve cards all needing a click to keep would make the surplus a cost
 * rather than a convenience.
 *
 * `platforms` starts as the idea's own and only shrinks: a chip removed is one
 * fewer row, and a card whose last chip goes is a card that commits nothing.
 */
export interface IdeaSelection {
  rejected: boolean
  platforms: SocialPlatform[]
}

/** One selection per idea, in the order the ideas arrived. */
export function initialSelections(ideas: readonly PostIdea[]): IdeaSelection[] {
  return ideas.map((idea) => ({ rejected: false, platforms: [...idea.platforms] }))
}

/**
 * The (idea × platform) pairs a commit would write — **one row per chip**
 * (Q8), which is what the commit button states and never the number of cards.
 *
 * Pass 2 takes this list, and so does the write loop, in this order: the
 * caption at index *i* is the caption for row *i*, and nothing between the two
 * may re-sort it.
 */
export function commitPairs(
  ideas: readonly PostIdea[],
  selections: readonly IdeaSelection[],
): { idea: PostIdea; platform: SocialPlatform }[] {
  const pairs: { idea: PostIdea; platform: SocialPlatform }[] = []
  ideas.forEach((idea, index) => {
    const selection = selections[index]
    if (!selection || selection.rejected) return
    for (const platform of selection.platforms) pairs.push({ idea, platform })
  })
  return pairs
}

/**
 * The copy pass, split into requests the validator will accept.
 *
 * **`IdeateCopyInputSchema` caps one call at 24 items, and a full batch can
 * exceed it**: eighteen ideas naming two platforms each is thirty-six rows, and
 * that is an ordinary plan rather than an abuse. So a commit is one call per
 * chunk, run in order, and the answers are concatenated by position.
 *
 * It costs some of what E's *one call, not one per row* bought — the model sees
 * one chunk rather than the whole set, so it can vary openings within twenty-four
 * captions instead of across thirty-six. That is a far smaller loss than
 * refusing the commit, and the alternative — one call per row — throws the
 * property away entirely.
 */
export function chunkCopyPairs<T>(pairs: readonly T[], size = IDEATE_MAX_COPY_ITEMS): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < pairs.length; i += size) chunks.push(pairs.slice(i, i + size))
  return chunks
}

// ---------------------------------------------------------------------------
// Door 3 — the same engine, asked about one day
// ---------------------------------------------------------------------------

/**
 * How many angles the `New post` dialog asks for.
 *
 * Three, and the number is the whole design. One is an answer the user has to
 * take or leave; two is a coin toss; six is a review queue inside a form
 * somebody opened to write one post. Three is enough to see a direction and
 * still fit beside the fields it is feeding.
 */
export const BRAINSTORM_IDEA_COUNT = 3

export interface BrainstormOptions {
  /** The day the post is for — the dialog's **own date field**, resolved. */
  dayKey: string
  /** The platform the copy will be written for. */
  platform: SocialPlatform
  /** The enabled sets' dates, whole. Narrowed to the day here. */
  keyDates: KeyDate[]
  /** The brand's own pillars, when it has written them. Empty means propose. */
  pillars: string[]
}

/**
 * What Door 3 sends: a window of exactly one day, one platform, three ideas.
 *
 * **`taken` is empty, and that is deliberate rather than an omission.** The
 * planner's rule — never propose onto a day+platform that already has a post —
 * exists so a run the user asked about a *month* does not double-book a day it
 * was never asked about. This request is the opposite: the user is standing on
 * one day with one platform chosen, asking for an angle for it. Sending the
 * taken list would have `applyBoundaries` drop every idea the moment that slot
 * already holds a post, and the panel would answer *no ideas* to the one
 * question it was asked most directly.
 *
 * Nothing is double-booked by this, because nothing here writes: the answer
 * fills a field in a form the user still has to submit.
 *
 * `cadencePerWeek: 1` is the honest number for a one-day window. It sizes
 * nothing — `count` is fixed — and the prompt states it as background about the
 * brand rather than as an instruction.
 */
export function brainstormRequest({
  dayKey,
  platform,
  keyDates,
  pillars,
}: BrainstormOptions): IdeateThemesInput {
  return {
    window: { start: dayKey, end: dayKey },
    platforms: [platform],
    // The same quotation builder the planner uses, over a window one day wide,
    // so a key date and the chip the dialog draws above it come from one rule.
    keyDates: keyDatesInWindow(keyDates, { start: dayKey, end: dayKey, weeks: 1 / 7 }),
    taken: [],
    cadencePerWeek: 1,
    pillars,
    count: BRAINSTORM_IDEA_COUNT,
  }
}
