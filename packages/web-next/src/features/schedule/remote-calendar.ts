import { contentFor, type BrandId } from '@/data/brands'
import type { Day, FeedMark, Post, StoryMark, Week } from '@/data/demo'
import { dayNOf, slotOf, srcOf } from '@/lib/remote-days'
import { type BrandState } from '@/lib/remote'

/**
 * The calendar as the server stores it, in the demo's shapes: the month's weeks (the static
 * skeleton, with its city events and holidays) filled with the brand's posts and idea tiles.
 */

interface ServerMedia {
  src: string
  kind: 'photo' | 'video'
  duration?: string
}

interface ServerPost {
  id: string
  format: Post['format']
  hook: string
  day: string | null
  time: string | null
  channels: NonNullable<Post['channels']>
  media: ServerMedia[]
  fromIdea: Post['fromIdea'] | null
  stage: Post['stage']
  jobs: { channel: string; status: string; error: string | null }[]
  caption: string
  draft: Record<string, unknown>
}

interface ServerIdea {
  id: string
  format: Post['format']
  hook: string
  day: string | null
  why: string | null
  status: 'suggested' | 'idea'
  postId: string | null
}

export function postOf(p: ServerPost): Post {
  const failed = p.jobs.find((j) => j.status === 'failed')
  return {
    id: p.id,
    format: p.format,
    hook: p.hook,
    images: p.media.map(srcOf),
    ...(p.media[0]?.duration && { duration: p.media[0].duration }),
    stage: p.stage,
    ...slotOf(p.day, p.time),
    ...(p.channels.length > 0 && { channels: p.channels }),
    ...(p.fromIdea && { fromIdea: p.fromIdea }),
    ...(failed && {
      error: failed.error ?? 'It did not go out.',
      failedOn: failed.channel as Post['failedOn'],
    }),
  }
}

/** What the composer saved with each post: its caption and the rest of its draft. */
export type Saved = Record<string, { caption: string; draft: Record<string, unknown> }>

export function calendarOf(
  brandId: BrandId,
  state: BrandState,
): { posts: Post[]; weeks: Week[]; saved: Saved } {
  const all = state.posts as ServerPost[]
  const ideas = state.ideas as ServerIdea[]
  // Stories already out are a count in the story row, as in the demo, not posts of their own.
  const outStory = (p: ServerPost) => p.format === 'story' && p.stage === 'posted'
  const posts = all.filter((p) => !outStory(p)).map(postOf)

  const weeks = contentFor(brandId).weeks.map((week) => ({
    ...week,
    days: week.days.map((skeleton): Day => {
      const { feed: _feed, story: _story, ...day } = skeleton
      if (day.outside) return { ...day, story: { kind: 'open', draftsReady: false } }
      const onDay = (d: string | null) => dayNOf(d) === day.n
      const feed: FeedMark[] = [
        ...all
          .filter((p) => p.format !== 'story' && onDay(p.day))
          .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
          .map((p) => ({ kind: 'post' as const, postId: p.id })),
        ...ideas
          .filter((i) => i.format !== 'story' && !i.postId && onDay(i.day))
          .map((i) => ({
            kind: 'idea' as const,
            format: i.format as Exclude<Post['format'], 'story'>,
            hook: i.hook,
            why: i.why ?? '',
            ...(i.status === 'suggested' && { suggested: true }),
          })),
      ]
      const stories = all.filter((p) => p.format === 'story' && onDay(p.day))
      const out = stories.filter(outStory)
      const planned = stories.find((p) => !outStory(p))
      const storyIdea = ideas.find((i) => i.format === 'story' && !i.postId && onDay(i.day))
      const story: StoryMark =
        out.length > 0
          ? {
              kind: 'posted',
              image: srcOf(out[0]!.media[0] ?? { src: '', kind: 'photo' }),
              count: out.length,
            }
          : planned
            ? { kind: 'post', postId: planned.id }
            : storyIdea
              ? { kind: 'idea' }
              : { kind: 'open', draftsReady: false }
      return {
        ...day,
        story,
        ...(feed.length > 0 && { feed: feed.length === 1 ? feed[0] : feed }),
      }
    }),
  }))
  const saved: Saved = Object.fromEntries(
    all.map((p) => [p.id, { caption: p.caption, draft: p.draft }]),
  )
  return { posts, weeks, saved }
}
