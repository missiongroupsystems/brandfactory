import { describe, expect, it } from 'vitest'

import { contentFor } from '@/data/brands'
import type { Day, Post } from '@/data/demo'

import { ALL_STAGES, composeChannels, failedOf, itemsOf, sentChannels } from './calendar-items'

const casa = contentFor('casa-vostra')
const byId = (id: string) => casa.posts.find((p) => p.id === id)
const date = (n: string) => casa.weeks.flatMap((w) => w.days).find((d) => d.date === n)!
const onlyFailed = { ...ALL_STAGES, idea: false, draft: false, scheduled: false, posted: false }
// The demo seeds no failed post (an edge case for later), so these tests make their own.
const failed = (id: string, on: Post['failedOn']): Post => ({
  ...byId(id)!,
  stage: 'failed',
  failedOn: on,
})

describe('the failed pill', () => {
  it('counts a failed post once, on the account it failed on', () => {
    // 5 Oct holds one post: the wine night carousel, for Instagram and Facebook, failed on Facebook.
    const wine = failed('wine-night', 'fb')
    const lookup = (id: string) => (id === wine.id ? wine : byId(id))
    const day: Day = { ...date('2026-10-05'), feed: { kind: 'post', postId: wine.id } }
    for (const stages of [ALL_STAGES, onlyFailed]) {
      const items = itemsOf(day, lookup, stages)
      expect(failedOf(items)).toEqual([{ channel: 'fb', n: 1 }])
    }
  })
})

describe('a retry', () => {
  it('starts on the account the post failed on, not on the ones it already went out on', () => {
    // The margherita reel went to Instagram and TikTok, and failed on Instagram.
    const post = failed('margherita', 'ig')
    expect(composeChannels(post)).toEqual(['ig'])
    // Once retried, the post is on both: the retry adds Instagram, it does not drop TikTok.
    expect(sentChannels(post, ['ig'])).toEqual(['ig', 'tt'])
  })

  it('leaves a post that did not fail on all its accounts, and a send replaces them', () => {
    const post = byId('pasta')!
    expect(composeChannels(post)).toEqual(['ig', 'tt'])
    expect(sentChannels(post, ['ig'])).toEqual(['ig'])
  })
})
