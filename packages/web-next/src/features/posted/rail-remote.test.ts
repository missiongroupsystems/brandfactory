import { describe, expect, it, vi } from 'vitest'

import type * as Remote from '@/lib/remote'

import { countOf, tally } from '@/features/publish/phone-mocks'

import { railOf } from './model'

// On the core: TikTok's tab is the connected account's own videos, read from TikTok.
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
}))

describe('the Feed rail on the core', () => {
  it('offers TikTok only once the brand’s TikTok account is connected', () => {
    // Nothing connected: no "Connect TikTok" promise, as nothing could show there yet.
    expect(railOf([], () => false)).toEqual(['ig', 'fb'])
    expect(railOf([], (p) => p === 'ig')).toEqual(['ig'])
    // Connected: its tab shows the account's videos.
    expect(railOf([], (p) => p === 'tt')).toEqual(['tt'])
    expect(railOf([], (p) => p !== 'fb')).toEqual(['ig', 'tt'])
  })
})

describe('a phone preview on the core', () => {
  it('shows no invented likes, comments or shares for a post with no counts', () => {
    expect(countOf(undefined, 'likes', '1,204')).toBeUndefined()
    expect(tally(undefined, ['64 comments', '27 shares'])).toBe('')
    // A post's own counts still show.
    expect(tally({ comments: 3, shares: 1 }, ['64 comments', '27 shares'])).toBe(
      '3 comments · 1 shares',
    )
  })
})
