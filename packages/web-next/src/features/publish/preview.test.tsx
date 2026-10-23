import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { isVideo, posterOf } from '@/components/media'
import { POSTS, VIDEO } from '@/data/demo'
import { resetConnections } from '@/features/connections/connections-store'
import { resetIdeas } from '@/features/ideate/ideas-store'
import { BrandProvider } from '@/features/schedule/posts-store'

import { archiveFor } from '@/features/schedule/month'

import { Composer } from './composer'
import { shotOf } from './model'
import { PhoneMock } from './phone-mocks'

vi.mock('next/navigation', () => ({
  usePathname: () => '/post/new',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))

// jsdom has no layout, no media playback and no object URLs: the tests see the desktop composer
// (reduced motion only when a test asks), a player whose play and pause are counted, and one
// blob URL for every dropped file.
let reduced = false
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: reduced && query.includes('reduced-motion'),
  addEventListener() {},
  removeEventListener() {},
}))
const play = vi.fn(() => Promise.resolve())
const pause = vi.fn()
const scrollTo = vi.fn()
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.scrollTo = scrollTo
  HTMLMediaElement.prototype.play = play
  HTMLMediaElement.prototype.pause = pause
  URL.createObjectURL = vi.fn(() => 'blob:dropped')
})
beforeEach(() => {
  resetConnections()
  resetIdeas()
  reduced = false
  play.mockClear()
  pause.mockClear()
  scrollTo.mockClear()
})

const inBrand = (ui: React.ReactElement) => render(<BrandProvider>{ui}</BrandProvider>)
const reel = [shotOf(VIDEO.margherita)]
const photos = ['/demo/crust.jpg', '/demo/pasta.jpg', '/demo/dish.jpg'].map(shotOf)
const preview = () => screen.getByRole('region', { name: 'Preview' })
const placeholder = () => screen.queryByRole('button', { name: 'Add a photo or video' })

describe('the demo reel', () => {
  it('is a video post with the poster beside its file', () => {
    const post = POSTS.find((p) => p.id === 'margherita')!
    expect(post.format).toBe('reel')
    expect(post.images).toEqual([VIDEO.margherita])
    expect(isVideo(VIDEO.margherita)).toBe(true)
    expect(posterOf(VIDEO.margherita)).toBe('/demo/casa-vostra/margherita-reel.jpg')
    // A dropped video has no poster: the browser shows its first frame.
    expect(posterOf('blob:x#video')).toBeUndefined()
    // Nor does one uploaded to the core: no JPEG sits beside it, and a guessed one shows broken.
    expect(posterOf('https://core.test/files/sig/brandbase/a.mp4#video')).toBeUndefined()
  })
})

describe('the counts on a preview', () => {
  it('are a post’s own when it was brought in from its account, and invented only for the rest', () => {
    const { unmount } = inBrand(
      <PhoneMock
        channel="ig"
        format="carousel"
        shots={photos}
        text=""
        counts={{ likes: 37, comments: 1 }}
      />,
    )
    expect(screen.getByText('37 likes')).toBeInTheDocument()
    expect(screen.getByText('View 1 comment')).toBeInTheDocument()
    expect(screen.queryByText('2,418 likes')).toBeNull()
    unmount()

    const single = inBrand(
      <PhoneMock channel="ig" format="carousel" shots={photos} text="" counts={{ likes: 1 }} />,
    )
    expect(screen.getByText('1 like')).toBeInTheDocument()
    single.unmount()

    // Hidden likes stay hidden; a mock with no counts keeps its fixed ones.
    const hidden = inBrand(
      <PhoneMock channel="ig" format="carousel" shots={photos} text="" counts={{ comments: 4 }} />,
    )
    expect(screen.queryByText(/likes$/)).toBeNull()
    hidden.unmount()
    inBrand(<PhoneMock channel="ig" format="carousel" shots={photos} text="" />)
    expect(screen.getByText('2,418 likes')).toBeInTheDocument()
  })

  it('reads as TikTok prints them on a TikTok post', () => {
    inBrand(
      <PhoneMock
        channel="tt"
        format="reel"
        shots={photos}
        text=""
        counts={{ likes: 24812, comments: 6, views: 5900, shares: 14, saves: 1500 }}
      />,
    )
    expect(screen.getByText('24.8K')).toBeInTheDocument()
    expect(screen.getByText('1.5K')).toBeInTheDocument()
    expect(screen.queryByText('312')).toBeNull()
  })
})

describe('a reel preview', () => {
  it('plays the video muted from its poster, and a tap pauses and plays it', () => {
    const { container } = inBrand(
      <PhoneMock channel="ig" format="reel" shots={reel} text="" live />,
    )
    const video = container.querySelector('video')!
    expect(video).toHaveAttribute('poster', '/demo/casa-vostra/margherita-reel.jpg')
    expect(video.muted).toBe(true)
    expect(video).toHaveAttribute('loop')
    expect(video).toHaveAttribute('playsinline')
    expect(play).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(pause).toHaveBeenCalledTimes(1)
    play.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(play).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('turns the sound on from its corner switch', () => {
    const { container } = inBrand(
      <PhoneMock channel="ig" format="reel" shots={reel} text="" live />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }))
    expect(container.querySelector('video')!.muted).toBe(false)
    expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument()
  })

  it('keeps the still mocks still: without `live` there is no tap to pause', () => {
    inBrand(<PhoneMock channel="ig" format="reel" shots={reel} text="" />)
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
  })

  it('waits for a tap under reduced motion: the poster rests behind a play glyph', () => {
    reduced = true
    const { container } = inBrand(
      <PhoneMock channel="ig" format="reel" shots={reel} text="" live />,
    )
    expect(container.querySelector('video')).not.toHaveAttribute('autoplay')
    expect(play).not.toHaveBeenCalled()
    expect(pause).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(play).toHaveBeenCalledTimes(1)
  })
})

describe('a carousel preview', () => {
  it('moves by arrow and by key, with the dots and the counter in step', () => {
    const { container } = inBrand(
      <PhoneMock channel="ig" format="carousel" shots={photos} text="" live />,
    )
    const dots = () => [...container.querySelectorAll('[data-dots] > *')]
    const liveDot = () => dots().findIndex((d) => d.hasAttribute('data-active'))
    const slide = (n: number) => screen.getByRole('group', { name: `Slide ${n} of 3` })

    expect(slide(1)).toBeInTheDocument()
    expect(dots()).toHaveLength(3)
    expect(liveDot()).toBe(0)
    // jsdom lays nothing out: the strip is given a width so the scroll target can be checked.
    const strip = slide(1)
    Object.defineProperty(strip, 'clientWidth', { value: 172 })

    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }))
    expect(slide(2)).toBeInTheDocument()
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 172 })
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(liveDot()).toBe(1)

    fireEvent.keyDown(screen.getByRole('button', { name: 'Next slide' }), { key: 'ArrowRight' })
    expect(slide(3)).toBeInTheDocument()
    expect(liveDot()).toBe(2)
    // The end: the arrow stays, inert, so focus is not lost.
    expect(screen.getByRole('button', { name: 'Next slide' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )

    fireEvent.keyDown(screen.getByRole('button', { name: 'Previous slide' }), { key: 'ArrowLeft' })
    expect(slide(2)).toBeInTheDocument()
  })

  it('follows a swipe once the snap settles, and not a slide a scroll passes through', () => {
    inBrand(<PhoneMock channel="ig" format="carousel" shots={photos} text="" live />)
    const strip = screen.getByRole('group', { name: 'Slide 1 of 3' })
    Object.defineProperty(strip, 'clientWidth', { value: 172 })
    const at = (left: number) => {
      Object.defineProperty(strip, 'scrollLeft', { value: left, configurable: true })
      fireEvent.scroll(strip)
    }
    // Mid-swipe, between slides: nothing moves yet.
    at(90)
    expect(screen.getByRole('group', { name: 'Slide 1 of 3' })).toBeInTheDocument()
    // Settled on the third slide.
    at(344)
    expect(screen.getByRole('group', { name: 'Slide 3 of 3' })).toBeInTheDocument()

    // An arrow scrolls back to the first; the second slide is only passed through.
    fireEvent.click(screen.getByRole('button', { name: 'Previous slide' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous slide' }))
    expect(screen.getByRole('group', { name: 'Slide 1 of 3' })).toBeInTheDocument()
    at(172)
    expect(screen.getByRole('group', { name: 'Slide 1 of 3' })).toBeInTheDocument()
    at(0)
    expect(screen.getByRole('group', { name: 'Slide 1 of 3' })).toBeInTheDocument()
    // The guard lifted, a later swipe counts again.
    at(172)
    expect(screen.getByRole('group', { name: 'Slide 2 of 3' })).toBeInTheDocument()
  })

  it('is a plain photo with one slide: no arrows, no counter, no dots', () => {
    const { container } = inBrand(
      <PhoneMock channel="ig" format="carousel" shots={photos.slice(0, 1)} text="" live />,
    )
    expect(screen.queryByRole('button', { name: 'Next slide' })).toBeNull()
    expect(container.querySelector('[data-dots]')).toBeNull()
  })
})

describe('the grid preview', () => {
  it('marks a reel with the reel glyph and a multi-photo post with the stacked squares', () => {
    // This post is the first tile, then the brand's feed posts fill the grid to nine.
    const post = POSTS.find((p) => p.id === 'five-pastas')!
    expect(post.images.length).toBeGreaterThan(1)
    inBrand(<Composer post={post} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Grid' }))
    // The feed after it, without the post itself: it is drawn once.
    const feed = POSTS.filter(
      (p) => p.id !== post.id && p.images.length > 0 && p.format !== 'story',
    ).slice(0, 8)
    const reels = feed.filter((p) => p.format === 'reel').length
    const carousels = feed.filter((p) => p.format === 'carousel' && p.images.length > 1).length
    expect(reels).toBeGreaterThan(0)
    expect(carousels).toBeGreaterThan(0)
    expect(within(preview()).getAllByRole('img', { name: 'Reel' })).toHaveLength(reels)
    expect(within(preview()).getAllByRole('img', { name: 'Carousel' })).toHaveLength(carousels + 1)
    const first = preview().querySelector('.grid-cols-3 > span')!
    expect(within(first as HTMLElement).getByRole('img', { name: 'Carousel' })).toBeInTheDocument()
  })
})

describe('a post from an earlier month in the demo', () => {
  it('names its usual accounts, though it records none', () => {
    const old = archiveFor('casa-vostra')[0]!
    expect(old.channels).toBeUndefined()
    inBrand(<Composer post={old} />)
    const header = document.querySelector('header')!
    expect(within(header).getAllByText(/^(Instagram|TikTok|Facebook)$/).length).toBeGreaterThan(0)
  })
})

describe('the preview before any media', () => {
  it('shows the placeholder on a tinted surface, not a black frame, and opens the picker', () => {
    inBrand(<Composer />)
    const empty = placeholder()!
    expect(empty).toHaveTextContent('Add a photo or video')
    expect(empty.style.background).toContain('gradient')
    expect(preview().querySelector('video')).toBeNull()

    const input = preview().querySelector<HTMLInputElement>('input[type="file"]')!
    const open = vi.spyOn(input, 'click').mockImplementation(() => undefined)
    fireEvent.click(empty)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('takes files dropped on the phone, through the same path as Upload', async () => {
    inBrand(<Composer />)
    const files = {
      types: ['Files'],
      files: [new File(['x'], 'crust.jpg', { type: 'image/jpeg' })],
      dropEffect: '',
    }
    const target = placeholder()!

    fireEvent.dragEnter(target, { dataTransfer: files })
    expect(screen.getByText('Drop to add')).toBeInTheDocument()
    // Crossing into a child fires a second enter, then a leave for the parent: still over.
    fireEvent.dragEnter(target, { dataTransfer: files })
    fireEvent.dragLeave(target, { dataTransfer: files })
    expect(screen.getByText('Drop to add')).toBeInTheDocument()
    fireEvent.dragLeave(target, { dataTransfer: files })
    expect(screen.queryByText('Drop to add')).toBeNull()

    fireEvent.dragEnter(target, { dataTransfer: files })
    fireEvent.drop(target, { dataTransfer: files })
    expect(screen.queryByText('Drop to add')).toBeNull()
    await waitFor(() => expect(placeholder()).toBeNull())
    expect(preview().querySelector('img[src="blob:dropped#photo"]')).toBeInTheDocument()
  })

  it('ignores a drag that carries text, not files', () => {
    inBrand(<Composer />)
    fireEvent.dragEnter(placeholder()!, { dataTransfer: { types: ['text/plain'], files: [] } })
    expect(screen.queryByText('Drop to add')).toBeNull()
  })
})
