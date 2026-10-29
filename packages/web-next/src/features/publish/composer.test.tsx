import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetConnections } from '@/features/connections/connections-store'
import { resetIdeas } from '@/features/ideate/ideas-store'
import { BrandProvider } from '@/features/schedule/posts-store'

import { Composer } from './composer'

// A new post in the demo: what it starts on, and what it does by itself so nobody has to fix it.
vi.mock('next/navigation', () => ({
  usePathname: () => '/post/new',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
}))
beforeAll(() => {
  // A dropped file gets a blob address; jsdom has none to give.
  URL.createObjectURL = () => `blob:${Math.random()}`
  URL.revokeObjectURL = () => undefined
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.scrollTo = vi.fn()
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
  HTMLMediaElement.prototype.pause = vi.fn()
})
beforeEach(() => {
  resetConnections()
  resetIdeas()
})

const show = () =>
  render(
    <BrandProvider>
      <Composer />
    </BrandProvider>,
  )
const format = (name: string) => screen.getAllByRole('radio', { name })[0]!
/** A photo through the file picker, as a drop or Upload brings it. */
const upload = (...names: string[]) =>
  fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
    target: { files: names.map((name) => new File(['x'], name, { type: 'image/jpeg' })) },
  })
const when = () =>
  screen.getByRole('button', { name: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+ \w+, \d\d:\d\d$/ })

describe('a new post in the demo', () => {
  it('opens today at the best time, as a photo post, on the caption', () => {
    show()
    // The demo's today is Tue 6 Oct, and Casa Vostra posts best at 18:00.
    expect(when()).toHaveTextContent('Tue 6 Oct, 18:00')
    expect(format('Post')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('textbox', { name: 'Caption' })).toHaveFocus()
  })

  it('follows the first file in: a video makes a Reel, a photo keeps a photo post', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: /^Add .+\.mp4$/ }))
    expect(format('Reel')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getAllByRole('button', { name: /^Add .+\.jpg$/ })[0]!)
    expect(format('Post')).toHaveAttribute('aria-checked', 'true')
    // Picked by hand, the format stays whatever comes in next.
    fireEvent.click(format('Reel'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getAllByRole('button', { name: /^Add .+\.jpg$/ })[0]!)
    expect(format('Reel')).toHaveAttribute('aria-checked', 'true')
  })

  it('moves a Story off a day that has one already, and back when Story is left', () => {
    show()
    // Tue 6 Oct has a story out; Wed 7 Oct is free.
    fireEvent.click(format('Story'))
    expect(when()).toHaveTextContent('Wed 7 Oct, 18:00')
    fireEvent.click(format('Post'))
    expect(when()).toHaveTextContent('Tue 6 Oct, 18:00')
  })

  it('keeps a day the calendar gave, and says a story is on it', () => {
    render(
      <BrandProvider>
        <Composer start={{ day: '2026-10-06' }} />
      </BrandProvider>,
    )
    fireEvent.click(format('Story'))
    expect(when()).toHaveTextContent('Tue 6 Oct, 18:00')
    expect(
      screen.getAllByText('A story is already on that day: pick another.').length,
    ).toBeGreaterThan(0)
  })

  it('keeps every photo when a video joins them, and the video when a photo joins it', () => {
    show()
    const add = (name: RegExp, nth = 0) =>
      fireEvent.click(screen.getAllByRole('button', { name })[nth]!)
    // A photo once added reads "Remove": the first "Add" is always the next photo.
    add(/^Add .+\.jpg$/)
    add(/^Add .+\.jpg$/)
    add(/^Add .+\.jpg$/)
    add(/^Add .+\.mp4$/)
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(4)
    expect(format('Post')).toHaveAttribute('aria-checked', 'true')
    // A lone video is a Reel; a photo after it makes a photo post of both, nothing dropped.
    while (screen.queryAllByRole('button', { name: 'Remove' }).length > 0) {
      fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]!)
    }
    add(/^Add .+\.mp4$/)
    expect(format('Reel')).toHaveAttribute('aria-checked', 'true')
    add(/^Add .+\.jpg$/, 0)
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2)
    expect(format('Post')).toHaveAttribute('aria-checked', 'true')
  })

  it('keeps More options shut until they are wanted', () => {
    show()
    expect(screen.queryByRole('combobox', { name: 'Location' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^More options/, expanded: false }))
    expect(screen.getByRole('combobox', { name: 'Location' })).toBeInTheDocument()
  })

  it('takes tomorrow in two clicks: the date chip, then the quick pick, which closes the dialog', () => {
    show()
    fireEvent.click(when())
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow 18:00' }))
    expect(screen.queryByRole('dialog', { name: 'When' })).toBeNull()
    expect(when()).toHaveTextContent('Wed 7 Oct, 18:00')
    // An hour bar settles the hour and closes too.
    fireEvent.click(when())
    fireEvent.click(screen.getByRole('radio', { name: '12:00' }))
    expect(screen.queryByRole('dialog', { name: 'When' })).toBeNull()
    expect(when()).toHaveTextContent('Wed 7 Oct, 12:00')
  })

  it('names a carousel, and says when a Reel holds a photo', () => {
    show()
    expect(screen.queryByText(/^Carousel · /)).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: /^Add .+\.jpg$/ })[0]!)
    fireEvent.click(screen.getAllByRole('button', { name: /^Add .+\.jpg$/ })[1]!)
    expect(screen.getByText('Carousel · 2')).toBeInTheDocument()
    fireEvent.click(format('Reel'))
    expect(screen.getByText('A Reel is a video: this is a photo.')).toBeInTheDocument()
  })

  it('keeps Publish now behind a menu on the button, never a bare button', () => {
    show()
    expect(screen.queryByRole('button', { name: 'Publish now' })).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Other ways to send' })[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Publish now' }))
    expect(screen.getAllByRole('button', { name: /^Post on/ })[0]).toBeInTheDocument()
  })

  it('keeps what the post holds when an add goes over the limit, and says how many were left out', async () => {
    show()
    // Every library photo once (a second tap would take it out again), then uploads to ten.
    while (screen.queryAllByRole('button', { name: /^Add .+\.jpg$/ }).length > 0)
      fireEvent.click(screen.getAllByRole('button', { name: /^Add .+\.jpg$/ })[0]!)
    const fromLibrary = screen.getAllByRole('button', { name: 'Remove' }).length
    upload(...Array.from({ length: 10 - fromLibrary }, (_, i) => `photo-${i}.jpg`))
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(10))
    // Full: the library steps back, and an upload says what it could not take.
    upload('eleven.jpg')
    await screen.findByText('A post takes 10: 1 left out.')
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(10)
    // The line speaks of that add alone: a removal takes it away.
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]!)
    expect(screen.queryByText('A post takes 10: 1 left out.')).toBeNull()
  })

  it('keeps a Reel’s video when a photo is added', async () => {
    show()
    fireEvent.click(format('Reel'))
    fireEvent.click(screen.getByRole('button', { name: /^Add .+\.mp4$/ }))
    upload('still.jpg')
    await screen.findByText('A Reel takes one video: the photo was left out.')
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1)
    expect(screen.queryByText('A Reel is a video: this is a photo.')).toBeNull()
    // Two at once are counted, and the tile stays to swap the video.
    upload('a.jpg', 'b.jpg')
    await screen.findByText('A Reel takes one video: 2 photos were left out.')
    expect(screen.getByRole('button', { name: 'Replace video' })).toBeInTheDocument()
    // Leaving Reel takes the line with it.
    fireEvent.click(format('Post'))
    expect(screen.queryByText(/left out/)).toBeNull()
  })

  it('steps a Story’s quick picks past a day that has a story', () => {
    show()
    fireEvent.click(format('Story'))
    fireEvent.click(when())
    // Tue 6 Oct has a story out: the first quick pick is tomorrow, not today.
    expect(screen.queryByRole('button', { name: /^Today/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Tomorrow 18:00' })).toBeInTheDocument()
  })

  it('keeps the dialog open when Escape only gives the time field back', () => {
    show()
    fireEvent.click(when())
    const field = screen.getByRole('textbox', { name: 'Post time' })
    act(() => field.focus())
    fireEvent.change(field, { target: { value: '19' } })
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'When' })).toBeInTheDocument()
    expect(field).toHaveValue('18:00')
  })
})
