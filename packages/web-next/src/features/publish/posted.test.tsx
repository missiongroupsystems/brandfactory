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

describe('the caption', () => {
  it('folds a long one after three lines, and More opens it with its blank lines back', () => {
    tall = true
    open({ caption: LONG })
    const p = screen.getByText(/Nonna Rosa/)
    expect(p.style.maxHeight).toBe(`${3 * 1.55}em`)
    expect(p.textContent).not.toContain('\n\n')
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(p.style.maxHeight).toBe('')
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
  it('is a tall frame for a reel, with no note about it: a still cover says enough', () => {
    open({})
    expect(aside().querySelector('.aspect-\\[9\\/16\\]')).not.toBeNull()
    expect(screen.queryByText('Cover only')).toBeNull()
    expect(within(aside()).queryByText(/^1\//)).toBeNull()
  })

  it('shows a carousel as its first slide, the count, and the rest as a strip', () => {
    const images = ['/demo/dish.jpg', '/demo/pasta.jpg', '/demo/crust.jpg']
    open({ post: { ...post, format: 'carousel', images }, media: images.map(shotOf), went: ['ig'] })
    expect(within(aside()).getByText('1/3')).toBeInTheDocument()
    expect(aside().querySelectorAll('img')).toHaveLength(3)
    expect(aside().querySelector('.aspect-\\[4\\/5\\]')).not.toBeNull()
    expect(screen.getByText('Mon 19 Oct, 12:40')).toBeInTheDocument()
  })

  it('shows no frame, and keeps no room for one, when no picture came across', () => {
    open({ media: [] })
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('aside')).toBeNull()
    expect(document.querySelector('header')!.className).not.toMatch(/grid-cols-\[96px/)
  })

  it('names no account, and offers no counts or link, when none is recorded', () => {
    open({ went: [], post: { ...post, permalink: 'https://www.instagram.com/p/C1/' } })
    expect(screen.getByText('No numbers yet.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Open on/ })).toBeNull()
    expect(screen.queryByText('22.1k')).toBeNull()
  })
})

describe('the counts', () => {
  it('are the real ones, views first, in short form', () => {
    open({})
    const labels = screen
      .getAllByText(/^(views|likes|comments|shares|saves)$/)
      .map((e) => e.textContent)
    expect(labels).toEqual(['views', 'likes', 'comments'])
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
    expect(screen.queryByText(/^(views|likes|comments|shares|saves)$/)).toBeNull()
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
    open({ post: { ...post, permalink: 'https://www.tiktok.com/@casavostrasg/video/7' } })
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
    open({ went: ['ig'], post: { ...post, permalink: 'https://www.instagram.com/p/C1/' } })
    expect(screen.getByRole('link', { name: 'Open on Instagram' })).toBeInTheDocument()
  })
})

describe('a post with no numbers', () => {
  // A chart of grey bars with an "Unavailable" pill read as a broken page: one line says it.
  it('says so in one line, with no empty chart and no Spend', () => {
    open({ post: { ...post, metrics: undefined } })
    expect(screen.getByText('No numbers yet.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Analytics' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Unavailable' })).toBeNull()
    expect(screen.queryByText('Spend')).toBeNull()
  })

  it('has no such line when the counts are there', () => {
    open({})
    expect(screen.getByText('22.1k')).toBeInTheDocument()
    expect(screen.queryByText('No numbers yet.')).toBeNull()
  })
})

describe('a post on more than one account', () => {
  const both: Post = {
    ...post,
    format: 'carousel',
    channels: ['ig', 'fb'],
    metrics: { reach: 800, likes: 64 },
    measuredAt: '2026-10-29T05:00:00.000Z',
    permalink: 'https://www.instagram.com/p/DSent1/',
    readings: {
      ig: {
        metrics: { reach: 800, likes: 64 },
        readAt: '2026-10-29T05:00:00.000Z',
        permalink: 'https://www.instagram.com/p/DSent1/',
      },
      fb: {
        metrics: { likes: 12, shares: 2 },
        readAt: '2026-10-21T05:00:00.000Z',
        permalink: 'https://www.facebook.com/casa/posts/2',
      },
    },
  }
  const account = () => screen.getByRole('radiogroup', { name: 'Account' })

  it('opens on the account it came from, and switches the counts, their date and the link', () => {
    open({ post: both, went: ['ig', 'fb'], asked: 'fb' })
    expect(within(account()).getByRole('radio', { name: 'Facebook' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('as of 21 Oct')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open on Facebook' })).toHaveAttribute(
      'href',
      'https://www.facebook.com/casa/posts/2',
    )
    fireEvent.click(within(account()).getByRole('radio', { name: 'Instagram' }))
    expect(screen.getByText('800')).toBeInTheDocument()
    expect(screen.queryByText('12')).toBeNull()
    expect(screen.getByText('as of 29 Oct')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open on Instagram' })).toHaveAttribute(
      'href',
      'https://www.instagram.com/p/DSent1/',
    )
  })

  it('opens on the first account with numbers when none is asked for', () => {
    const fbOnly: Post = {
      ...both,
      metrics: undefined,
      measuredAt: undefined,
      readings: { fb: both.readings!.fb! },
    }
    open({ post: fbOnly, went: ['ig', 'fb'] })
    expect(within(account()).getByRole('radio', { name: 'Facebook' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('shows no counts and no link on an account with no reading: nothing is filled in', () => {
    const igOnly: Post = { ...both, readings: { ig: both.readings!.ig! } }
    open({ post: igOnly, went: ['ig', 'fb'], asked: 'fb' })
    expect(screen.queryByText(/^(reach|likes|shares)$/)).toBeNull()
    expect(screen.queryByText(/^as of/)).toBeNull()
    expect(screen.queryByRole('link', { name: /^Open on/ })).toBeNull()
  })

  it('keeps the cover the same size while switching to an account with no reading', () => {
    const fbOnly: Post = { ...both, metrics: undefined, readings: { fb: both.readings!.fb! } }
    open({ post: fbOnly, went: ['ig', 'fb'], asked: 'fb' })
    const width = () => aside().parentElement!.className
    const before = width()
    fireEvent.click(within(account()).getByRole('radio', { name: 'Instagram' }))
    expect(screen.getByText('No numbers yet.')).toBeInTheDocument()
    expect(width()).toBe(before)
  })

  it('has no switch when it went to one account; its mark sits in the line above the title', () => {
    open({ went: ['ig'], post: { ...post, channels: ['ig'] } })
    expect(screen.queryByRole('radiogroup', { name: 'Account' })).toBeNull()
  })

  it('does not say the title twice when the caption starts with it', () => {
    open({ caption: 'Pasta, hand cut every morning\nBook a table.' })
    expect(screen.getAllByText(/Pasta, hand cut every morning/)).toHaveLength(1)
    expect(screen.getByText('Book a table.')).toBeInTheDocument()
  })
})
