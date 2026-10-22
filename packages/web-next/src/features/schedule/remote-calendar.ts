import { BRANDS, contentFor, type BrandId } from '@/data/brands'
import type { Day, FeedMark, Post, StoryMark, Week } from '@/data/demo'
import { mondayOf, slotOf, todayDate } from '@/lib/dates'
import { srcOf } from '@/lib/remote-days'
import { type BrandState } from '@/lib/remote'

import { blankWeek, mondaysBetween, monthSpan } from './month'

/**
 * The calendar as the server stores it, in the demo's shapes: a run of weeks from two months
 * before today's month to six months after it, stretched to hold every dated post, idea and
 * shoot, filled with the brand's posts and idea tiles. The demo's October weeks keep their city
 * events; other weeks get the holidays.
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
  const today: string = state.today ?? todayDate()
  // Stories already out are a count in the story row, as in the demo, not posts of their own.
  const outStory = (p: ServerPost) => p.format === 'story' && p.stage === 'posted'
  const posts = all.filter((p) => !outStory(p)).map(postOf)

  const dated = [
    ...all.map((p) => p.day),
    ...ideas.map((i) => i.day),
    ...((state.shoots ?? []) as Array<{ day: string | null }>).map((s) => s.day),
  ]
    .filter((d): d is string => Boolean(d))
    .sort()
  const span = monthSpan(2, 6, today)
  const from = dated[0] && dated[0] < span.from ? mondayOf(dated[0]) : span.from
  const to = dated.at(-1) && dated.at(-1)! > span.to ? mondayOf(dated.at(-1)!) : span.to
  const skeleton = contentFor(brandId).weeks

  // A run of weeks holds hundreds of days: each day's posts and ideas are found by date.
  const postsOn = groupBy(all, (p) => p.day)
  const ideasOn = groupBy(
    ideas.filter((i) => !i.postId),
    (i) => i.day,
  )

  function fill(day: Day): Day {
    const here = postsOn.get(day.date) ?? []
    const tiles = ideasOn.get(day.date) ?? []
    const feed: FeedMark[] = [
      ...here
        .filter((p) => p.format !== 'story')
        .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
        .map((p) => ({ kind: 'post' as const, postId: p.id })),
      ...tiles
        .filter((i) => i.format !== 'story')
        .map((i) => ({
          kind: 'idea' as const,
          format: i.format as Exclude<Post['format'], 'story'>,
          hook: i.hook,
          why: i.why ?? '',
          ...(i.status === 'suggested' && { suggested: true }),
        })),
    ]
    const stories = here.filter((p) => p.format === 'story')
    const out = stories.filter(outStory)
    const planned = stories.find((p) => !outStory(p))
    const storyIdea = tiles.some((i) => i.format === 'story')
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
  }

  // A brand made on the core shares the city's events and holidays, not a demo brand's own.
  const own = BRANDS.some((b) => b.id === brandId)
  const weeks = mondaysBetween(from, to).map((monday): Week => {
    const blank = blankWeek(monday, today)
    const demo = skeleton.find((w) => w.days[0]!.date === monday)
    const events = demo?.events.filter((e) => own || e.layer === 'city' || e.layer === 'holiday')
    return {
      ...blank,
      ...(demo && events && { label: demo.label, events }),
      days: blank.days.map(fill),
    }
  })
  const saved: Saved = Object.fromEntries(
    all.map((p) => [p.id, { caption: p.caption, draft: p.draft }]),
  )
  return { posts, weeks, saved }
}

function groupBy<T>(items: T[], key: (item: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    if (k) out.set(k, [...(out.get(k) ?? []), item])
  }
  return out
}
