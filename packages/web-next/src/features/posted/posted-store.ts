'use client'

import * as React from 'react'

import type { BrandId } from '@/data/brands'
import { feedsOf, type Post, type Week } from '@/data/demo'
import { channelsOf, postTime } from '@/features/schedule/calendar-items'
import { archive } from '@/features/schedule/month'
import { useBrand } from '@/features/schedule/posts-store'
import type { ServerPost } from '@/features/schedule/remote-calendar'
import { storiesOf } from '@/features/schedule/stories'
import { slotOf } from '@/lib/dates'
import { onState, remote, type BrandState } from '@/lib/remote'

import { fromServer, type PostedItem } from './model'

/**
 * What each brand posted, kept outside React like `connections-store.ts`. On the core it is read
 * from each brand's state, stories included (the calendar keeps only a count of those). In the
 * static demo it is the demo's own: the month's posted posts, the archive the insights page drew,
 * and the stories already out, a day's stories as one story of several frames.
 */

let byBrand: Partial<Record<string, PostedItem[]>> = {}
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** A brand's state, as the core loads it: what it posted replaces what the store had. */
export function takeState(brandId: string, s: BrandState) {
  byBrand = { ...byBrand, [brandId]: fromServer(s.posts as ServerPost[]) }
  listeners.forEach((l) => l())
}

if (remote) onState(takeState)

/** The demo's posted posts and stories, up to its today. */
export function demoItems(
  brandId: BrandId,
  weeks: Week[],
  byId: (id: string) => Post | undefined,
  captions: Record<string, string>,
  library: string[],
  today: string,
): PostedItem[] {
  const days = weeks.flatMap((w) => w.days).filter((d) => !d.outside && d.date <= today)
  const month = days.flatMap((d) =>
    feedsOf(d).flatMap((m) => {
      const post = m.kind === 'post' ? byId(m.postId) : undefined
      if (post?.stage !== 'posted') return []
      return [
        {
          post,
          went: channelsOf(post),
          day: d.date,
          time: postTime(post),
          caption: captions[post.id] ?? '',
          collabs: [],
        },
      ]
    }),
  )
  const earlier = archive(brandId).map(({ post, date, collab }) => ({
    post,
    went: channelsOf(post),
    day: date,
    time: postTime(post),
    caption: '',
    collabs: collab ?? [],
  }))
  const stories = days.flatMap((d): PostedItem[] => {
    if (d.story.kind !== 'posted') return []
    const frames = storiesOf(
      d.date,
      { posts: [], ideas: [], storiesPosted: d.story.count, storyImage: d.story.image },
      brandId,
      library,
      byId,
    )
    const first = frames[0]!
    const post: Post = {
      id: `${d.date}-stories`,
      format: 'story',
      hook: first.title,
      images: frames.flatMap((f) => (f.image ? [f.image] : [])),
      stage: 'posted',
      ...slotOf(d.date, first.time),
    }
    return [{ post, went: ['ig'], day: d.date, time: first.time, caption: '', collabs: [] }]
  })
  const seen = new Set(month.map((i) => i.post.id))
  return [...month, ...earlier.filter((i) => !seen.has(i.post.id)), ...stories]
}

/** The current brand's posted items; undefined on the core until its state has come in. */
export function usePostedItems(today: string): PostedItem[] | undefined {
  const { brand, weeks, byId, captions, library } = useBrand()
  const read = () => byBrand[brand.id]
  const core = React.useSyncExternalStore(subscribe, read, read)
  const demo = React.useMemo(
    () => (remote ? undefined : demoItems(brand.id, weeks, byId, captions, library, today)),
    [brand.id, weeks, byId, captions, library, today],
  )
  return remote ? core : demo
}
