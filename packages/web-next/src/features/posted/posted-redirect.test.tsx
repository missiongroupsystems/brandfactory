import { describe, expect, it, vi } from 'vitest'

import Page from '@/app/posted/page'

// `/posted` was a page until 2.48.0; a bookmark or a shared link still lands on the feed.
const redirect = vi.fn()
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))

describe('/posted', () => {
  it('redirects to the feed, on the platform it named', async () => {
    await Page({ searchParams: Promise.resolve({ on: 'fb' }) })
    expect(redirect).toHaveBeenLastCalledWith('/insights?on=fb')
    await Page({ searchParams: Promise.resolve({}) })
    expect(redirect).toHaveBeenLastCalledWith('/insights')
    // A platform it does not know is dropped, not passed on.
    await Page({ searchParams: Promise.resolve({ on: 'yt' }) })
    expect(redirect).toHaveBeenLastCalledWith('/insights')
  })
})
