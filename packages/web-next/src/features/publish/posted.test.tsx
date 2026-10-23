import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Post } from '@/data/demo'
import { BrandProvider } from '@/features/schedule/posts-store'

import { shotOf } from './model'
import { PostedPost, type PostedView } from './posted'

// jsdom has no layout: the caption's fold is measured through these. `tall` says the text runs
// past the fold; this observer, unlike the setup file's, reports once, as a browser does after
// the first layout.
let tall = false
vi.stubGlobal(
  'ResizeObserver',
  class {
    constructor(private cb: () => void) {}
    observe() {
      this.cb()
    }
    disconnect() {}
  },
)
beforeEach(() => {
  tall = false
  Object.defineProperty(HTMLParagraphElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => (tall ? 300 : 100),
  })
  Object.defineProperty(HTMLParagraphElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 100,
  })
})
afterEach(() => {
  delete (HTMLParagraphElement.prototype as { scrollHeight?: number }).scrollHeight
  delete (HTMLParagraphElement.prototype as { clientHeight?: number }).clientHeight
})

const post: Post = {
  id: 'p',
  format: 'reel',
  hook: 'Pasta, hand cut every morning',
  images: ['/demo/pasta.jpg'],
  stage: 'posted',
  slot: 'Mon 19 Oct, 12:40',
  slotShort: 'Mon, 12:40',
  channels: ['tt'],
  metrics: { likes: 1834, comments: 41, views: 22100 },
}
const base: PostedView = {
  post,
  media: post.images.map(shotOf),
  went: ['tt'],
  on: 'Mon 19 Oct',
  at: '12:40',
  caption: 'Pasta, hand cut, every morning.',
  collabs: [],
  tagged: [],
  location: '',
  labels: [],
  video: false,
}
const LONG = `Pasta, hand cut, every morning before the doors open.

Nonna Rosa taught us to feel the dough, not time it.

Open Tue–Sun · Club Street. #casavostra #freshpasta`

const open = (v: Partial<PostedView>) =>
  render(
    <BrandProvider>
      <PostedPost v={{ ...base, ...v }} />
    </BrandProvider>,
  )
const aside = () => document.querySelector('aside')!
const analytics = () => screen.getByRole('region', { name: 'Analytics' })

describe('the caption', () => {
  it('folds a long one after six lines, and More opens it with its blank lines back', () => {
    tall = true
    open({ caption: LONG })
    const p = screen.getByText(/Nonna Rosa/)
    expect(p.style.webkitLineClamp).toBe('6')
    expect(p.textContent).not.toContain('\n\n')
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(p.style.webkitLineClamp).toBe('')
    expect(p.textContent).toContain('\n\n')
    expect(screen.getByRole('button', { name: 'Less' })).toBeInTheDocument()
  })

  it('offers no More on a caption that fits', () => {
    open({ caption: 'One line.' })
    expect(screen.getByText('One line.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull()
  })

  it('shows nothing, not an empty fold, when the post went out with none', () => {
    open({ caption: '' })
    expect(document.querySelector('p[style]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull()
  })

  it('sets each hashtag apart from the words, and nothing else', () => {
    open({ caption: 'Fresh today #freshpasta, see site.com/#menu' })
    const tag = screen.getByText('#freshpasta')
    expect(tag.tagName).toBe('SPAN')
    expect(tag.closest('p')).toHaveTextContent('Fresh today #freshpasta, see site.com/#menu')
    expect(screen.queryByText('#menu')).toBeNull()
  })
})

describe('the cover', () => {
  it('is a tall frame for a reel, and says Cover only when only the cover came across', () => {
    open({ video: true })
    expect(aside().querySelector('.aspect-\\[9\\/16\\]')).not.toBeNull()
    const pill = within(aside()).getByRole('button', { name: 'Cover only' })
    expect(pill).toHaveAccessibleDescription('Video plays once TikTok is connected.')
    expect(within(aside()).queryByText(/^1\//)).toBeNull()
  })

  it('says nothing about the cover when the video is there', () => {
    open({ video: false })
    expect(screen.queryByRole('button', { name: 'Cover only' })).toBeNull()
  })

  it('shows a carousel as its first slide, the count, and the rest as a strip', () => {
    const images = ['/demo/dish.jpg', '/demo/pasta.jpg', '/demo/crust.jpg']
    open({ post: { ...post, format: 'carousel', images }, media: images.map(shotOf), went: ['ig'] })
    expect(within(aside()).getByText('1/3')).toBeInTheDocument()
    expect(aside().querySelectorAll('img')).toHaveLength(3)
    expect(aside().querySelector('.aspect-\\[4\\/5\\]')).not.toBeNull()
    expect(screen.getByText('Post · Mon 19 Oct, 12:40')).toBeInTheDocument()
  })

  it('shows no frame, and keeps no room for one, when no picture came across', () => {
    open({ media: [] })
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('aside')).toBeNull()
    expect(document.querySelector('header')!.className).not.toMatch(/grid-cols-\[112px/)
  })

  it('names no account when none is recorded', () => {
    open({ went: [], video: true, permalink: 'https://www.instagram.com/p/C1/' })
    expect(within(aside()).getByRole('button', { name: 'Cover only' })).toHaveAccessibleDescription(
      'Video plays once the account is connected.',
    )
    expect(
      within(analytics()).getByRole('button', { name: 'Unavailable' }),
    ).toHaveAccessibleDescription('Analytics isn’t connected yet.')
    expect(screen.getByRole('link', { name: 'Open post' })).toBeInTheDocument()
  })
})

describe('the counts', () => {
  it('are the real ones, views first, in short form', () => {
    open({})
    const labels = screen
      .getAllByText(/^(Views|Likes|Comments|Shares|Saves)$/)
      .map((e) => e.textContent)
    expect(labels).toEqual(['Views', 'Likes', 'Comments'])
    expect(screen.getByText('22.1k')).toBeInTheDocument()
    expect(screen.getByText('1.8k')).toBeInTheDocument()
    expect(screen.getByText('41')).toBeInTheDocument()
  })

  it('rounds up to a million, never to "1000k"', () => {
    open({ post: { ...post, metrics: { views: 999_950, likes: 999 } } })
    expect(screen.getByText('1m')).toBeInTheDocument()
    expect(screen.getByText('999')).toBeInTheDocument()
  })

  it('show nothing when the post has none: no number is invented', () => {
    open({ post: { ...post, metrics: undefined } })
    expect(screen.queryByText(/^(Views|Likes|Comments|Shares|Saves)$/)).toBeNull()
    expect(screen.queryByText(/^[\d.,]+k?$/)).toBeNull()
  })

  it('say the day they were read, in Singapore, since they are not live', () => {
    open({ post: { ...post, measuredAt: '2026-10-21T17:00:00.000Z' } })
    expect(screen.getByText('as of 22 Oct')).toBeInTheDocument()
  })

  it('give the year only when it is not this one', () => {
    open({ post: { ...post, measuredAt: '2025-12-30T04:00:00.000Z' } })
    expect(screen.getByText('as of 30 Dec 2025')).toBeInTheDocument()
  })

  it('give no date when none was read, or when there are no counts', () => {
    open({})
    expect(screen.queryByText(/^as of/)).toBeNull()
    cleanup()
    open({ post: { ...post, metrics: undefined, measuredAt: '2026-10-21T17:00:00.000Z' } })
    expect(screen.queryByText(/^as of/)).toBeNull()
  })
})

describe('the facts and the link', () => {
  it('lists only the facts the post has', () => {
    open({ collabs: ['@giulia.cooks'], labels: ['Pasta'], location: '', tagged: [] })
    expect(screen.getByText('Collaborators').nextSibling).toHaveTextContent('@giulia.cooks')
    expect(screen.getByText('Labels').nextSibling).toHaveTextContent('Pasta')
    expect(screen.queryByText('Location')).toBeNull()
    expect(screen.queryByText('Tagged')).toBeNull()
  })

  it('opens the post on its account in a new tab, only when it has an address', () => {
    open({ permalink: 'https://www.tiktok.com/@casavostrasg/video/7' })
    const link = screen.getByRole('link', { name: 'Open on TikTok' })
    expect(link).toHaveAttribute('href', 'https://www.tiktok.com/@casavostrasg/video/7')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toMatch(/\bnoopener\b/)
  })

  it('offers no link when the post has no address', () => {
    open({})
    expect(screen.queryByRole('link', { name: /^Open on/ })).toBeNull()
  })

  it('names the account on the link', () => {
    open({ went: ['ig'], permalink: 'https://www.instagram.com/p/C1/' })
    expect(screen.getByRole('link', { name: 'Open on Instagram' })).toBeInTheDocument()
  })
})

describe('the analytics preview', () => {
  it('is marked Unavailable, and says which analytics on hover', () => {
    open({})
    const pill = within(analytics()).getByRole('button', { name: 'Unavailable' })
    expect(pill).toHaveAccessibleDescription('TikTok analytics isn’t connected yet.')
    expect(within(analytics()).getByText('Preview')).toBeInTheDocument()
  })

  it('shows reach by account when there are collaborators', () => {
    open({ collabs: ['@giulia.cooks'] })
    expect(within(analytics()).getByText('Reach by account')).toBeInTheDocument()
    expect(within(analytics()).getByText('Casa Vostra')).toBeInTheDocument()
    expect(within(analytics()).getByText('@giulia.cooks')).toBeInTheDocument()
    expect(within(analytics()).queryByText('Found it through')).toBeNull()
  })

  it('shows where people found it when there are none: For You on TikTok', () => {
    open({})
    expect(within(analytics()).getByText('Found it through')).toBeInTheDocument()
    expect(within(analytics()).getByText('For You')).toBeInTheDocument()
    expect(within(analytics()).queryByText('Explore')).toBeNull()
    expect(within(analytics()).queryByText('Reach by account')).toBeNull()
  })

  it('says Explore on Instagram', () => {
    open({ went: ['ig'] })
    expect(within(analytics()).getByText('Explore')).toBeInTheDocument()
    expect(within(analytics()).queryByText('For You')).toBeNull()
  })

  it('prints no figure anywhere: the bars and the rows are shapes', () => {
    open({ post: { ...post, metrics: undefined }, at: '' })
    expect(analytics().textContent!.replace(/Day \d+/g, '')).not.toMatch(/\d/)
  })

  it('offers watch time on a reel and profile visits on a post', () => {
    open({})
    expect(screen.getAllByRole('radio', { name: 'Watch time' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('radio', { name: 'Profile visits' })).toBeNull()
  })

  it("switches the number from a phone's row of pills", () => {
    open({})
    // The desktop control and the phone's pills are both in the DOM; the phone's is the second.
    const phone = screen.getAllByRole('radiogroup', { name: 'Number' })[1]!
    fireEvent.click(within(phone).getByRole('radio', { name: 'Watch time' }))
    expect(within(phone).getByRole('radio', { name: 'Watch time' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(within(analytics()).getByText('minutes')).toBeInTheDocument()
  })
})
