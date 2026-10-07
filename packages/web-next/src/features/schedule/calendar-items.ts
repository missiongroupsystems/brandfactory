import type { ChannelKey } from '@/features/publish/model'
import type { Day, FeedMark, Format, Post, Stage } from '@/data/demo'
import { feedsOf } from '@/data/demo'

/**
 * What the three calendar views share: a post's time and channels, the stage filter, and a day's
 * items once the filter has run.
 */

/** The stage filter's steps. An idea tile and a draft post are both "Draft". */
export type StageKey = 'idea' | Exclude<Stage, 'draft'>

export const STAGES: Array<{ key: StageKey; label: string; colour: string }> = [
  { key: 'idea', label: 'Draft', colour: 'var(--stage-draft)' },
  { key: 'awaiting', label: 'Awaiting approval', colour: 'var(--stage-awaiting)' },
  { key: 'scheduled', label: 'Scheduled', colour: 'var(--stage-scheduled)' },
  { key: 'posted', label: 'Posted', colour: 'var(--stage-posted)' },
  { key: 'failed', label: 'Failed', colour: 'var(--stage-failed)' },
]

export type StageFilter = Record<StageKey, boolean>

export const ALL_STAGES: StageFilter = {
  idea: true,
  awaiting: true,
  scheduled: true,
  posted: true,
  failed: true,
}

export function stageKey(stage: Stage): StageKey {
  return stage === 'draft' ? 'idea' : stage
}

/** "Thu 8 Oct, 18:00" → "18:00". */
export function postTime(post: Post): string {
  return post.slot.split(', ')[1] ?? '12:00'
}

/** Where a format goes by default: the demo's posts carry no channel list of their own. */
const DEFAULT_CHANNELS: Record<Format, ChannelKey[]> = {
  reel: ['ig', 'tt', 'yt'],
  carousel: ['ig', 'fb'],
  story: ['ig'],
}

export function channelsOf(post: Post): ChannelKey[] {
  return post.channels ?? DEFAULT_CHANNELS[post.format]
}

/**
 * The accounts the composer starts on. A failed post went out everywhere but the account it failed
 * on, so its retry starts on that account alone.
 */
export function composeChannels(post: Post): ChannelKey[] {
  return post.stage === 'failed' && post.failedOn ? [post.failedOn] : channelsOf(post)
}

/** The accounts a post is on after a send: a retry adds the ones retried to those it reached. */
export function sentChannels(post: Post | undefined, sent: ChannelKey[]): ChannelKey[] {
  if (post?.stage !== 'failed') return sent
  return [...new Set([...channelsOf(post), ...sent])]
}

export interface DayItems {
  /** Feed posts that pass the filter, by time. */
  posts: Post[]
  /** Idea tiles, when "Idea" is in the filter. */
  ideas: Array<Extract<FeedMark, { kind: 'idea' }>>
  /** Stories already out today, counted, and the one planned story if it passes the filter. */
  storiesPosted: number
  storyImage?: string
  plannedStory?: Post
}

export function itemsOf(
  day: Day,
  byId: (id: string) => Post | undefined,
  stages: StageFilter,
): DayItems {
  const marks = feedsOf(day)
  const posts = marks
    .flatMap((m) => (m.kind === 'post' ? [byId(m.postId)] : []))
    .filter((p): p is Post => Boolean(p) && stages[stageKey(p!.stage)])
    .sort((a, b) => postTime(a).localeCompare(postTime(b)))
  const ideas = stages.idea
    ? marks.filter((m): m is Extract<FeedMark, { kind: 'idea' }> => m.kind === 'idea')
    : []
  const story = day.story
  const planned = story.kind === 'post' ? byId(story.postId) : undefined
  return {
    posts,
    ideas,
    storiesPosted: story.kind === 'posted' && stages.posted ? story.count : 0,
    storyImage: story.kind === 'posted' ? story.image : undefined,
    plannedStory: planned && stages[stageKey(planned.stage)] ? planned : undefined,
  }
}

/** A day's story count: those already out and the one planned, as the filter allows. */
export function storyCount(items: DayItems): number {
  return items.storiesPosted + (items.plannedStory ? 1 : 0)
}

const CHANNEL_ORDER: ChannelKey[] = ['ig', 'tt', 'yt', 'fb', 'li']

/**
 * A day's feed posts per channel, failed posts left out: `failedOf` counts those, so one failed
 * post never reads as three chips. Stories have their own count (`storyCount`).
 */
export function countsOf(items: DayItems): Array<{ channel: ChannelKey; n: number }> {
  const n: Partial<Record<ChannelKey, number>> = {}
  for (const p of items.posts) {
    if (p.stage === 'failed') continue
    for (const c of channelsOf(p)) n[c] = (n[c] ?? 0) + 1
  }
  return CHANNEL_ORDER.flatMap((channel) => (n[channel] ? [{ channel, n: n[channel]! }] : []))
}

/** A day's failed posts, counted once each, by the account each one failed on. */
export function failedOf(items: DayItems): Array<{ channel?: ChannelKey; n: number }> {
  const n = new Map<ChannelKey | undefined, number>()
  for (const p of items.posts) {
    if (p.stage === 'failed') n.set(p.failedOn, (n.get(p.failedOn) ?? 0) + 1)
  }
  return [...n].map(([channel, count]) => ({ channel, n: count }))
}
