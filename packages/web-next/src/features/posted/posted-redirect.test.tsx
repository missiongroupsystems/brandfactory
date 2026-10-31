import { describe, expect, it, vi } from 'vitest'

import InsightsPage from '@/app/insights/page'
import Page from '@/app/posted/page'

// `/posted` was a page until 2.48.0; a bookmark or a shared link still lands on the feed.
const redirect = vi.fn()
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))

describe('/posted', () => {
  it('redirects to the feed, on the platform it named', async () => {
    await Page({ searchParams: Promise.resolve({ on: 'fb' }) })
    expect(redirect).toHaveBeenLastCalledWith('/feed?on=fb')
    await Page({ searchParams: Promise.resolve({}) })
    expect(redirect).toHaveBeenLastCalledWith('/feed')
    // A platform it does not know is dropped, not passed on.
    await Page({ searchParams: Promise.resolve({ on: 'yt' }) })
    expect(redirect).toHaveBeenLastCalledWith('/feed')
  })
})

describe('/insights', () => {
  // Insights became Feed in 2.50.0: an old link keeps its view and platform.
  it('redirects to /feed with the same view and platform', async () => {
    await InsightsPage({ searchParams: Promise.resolve({ view: 'sentiment', on: 'fb' }) })
    expect(redirect).toHaveBeenLastCalledWith('/feed?view=sentiment&on=fb')
    await InsightsPage({ searchParams: Promise.resolve({}) })
    expect(redirect).toHaveBeenLastCalledWith('/feed')
    // Only a view and a platform it knows go on; the old feed view is the plain address.
    await InsightsPage({
      searchParams: Promise.resolve({ view: 'feed', on: 'yt', x: '1' } as never),
    })
    expect(redirect).toHaveBeenLastCalledWith('/feed')
  })
})
