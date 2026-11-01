import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as React from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetConnections } from '@/features/connections/connections-store'
import { resetIdeas } from '@/features/ideate/ideas-store'
import { BrandProvider } from '@/features/schedule/posts-store'

import type * as Media from '@/components/media'

import { Composer } from './composer'

// A new post in the demo: what it starts on, and what it does by itself so nobody has to fix it.
vi.mock('next/navigation', () => ({
  usePathname: () => '/post/new',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
// jsdom never loads a video's metadata, so a video file is taken as it comes, with no length.
vi.mock('@/components/media', async (load) => {
  const media = await load<typeof Media>()
  return {
    ...media,
    fromFile: (file: File) =>
      file.type.startsWith('video/')
        ? Promise.resolve({ src: `blob:${file.name}#video` })
        : media.fromFile(file),
  }
})
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
/** Files through the file picker, as a drop or Upload brings them: an .mp4 is a video. */
const upload = (...names: string[]) =>
  fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
    target: {
      files: names.map(
        (name) =>
          new File(['x'], name, { type: name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg' }),
      ),
    },
  })
/** Files in, and the post holding them. */
const add = async (...names: string[]) => {
  upload(...names)
  await act(async () => undefined)
}
/** The day and the time the post is on, as the When panel's calendar button names them. */
const when = () =>
  screen.getByRole('button', { name: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+ \w+, \d\d:\d\d$/ })
const on = () => when().getAttribute('aria-label')

describe('a new post in the demo', () => {
  it('starts in the format the New menu picked, and a file does not change it', async () => {
    render(
      <BrandProvider>
        <Composer start={{ format: 'reel' }} />
      </BrandProvider>,
    )
    expect(format('Reel')).toHaveAttribute('aria-checked', 'true')
    upload('one.jpg')
    await act(async () => undefined)
    expect(format('Reel')).toHaveAttribute('aria-checked', 'true')
  })

  it('starts a Story from the New menu on the first day with no story out', () => {
    render(
      <BrandProvider>
        <Composer start={{ format: 'story' }} />
      </BrandProvider>,
    )
    // The demo's today, Tue 6 Oct, has its stories out already: Wednesday is the first free day.
    expect(format('Story')).toHaveAttribute('aria-checked', 'true')
    expect(on()).toContain('Wed 7 Oct')
    expect(screen.queryByText(/A story is already on that day/)).toBeNull()
  })

  it('offers only the accounts that take the format: a Story has no TikTok, and a switch back does not tick it', () => {
    const chips = () =>
      screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label') ?? c.textContent)
    show()
    expect(chips()).toEqual(['Instagram', 'TikTok', 'Facebook'])
    fireEvent.click(format('Story'))
    expect(chips()).toEqual(['Instagram', 'Facebook'])
    fireEvent.click(format('Post'))
    // TikTok is offered again, unticked: a hidden account was dropped, not kept in secret.
    const tiktok = screen.getAllByRole('checkbox', { name: /TikTok/ })[0]!
    expect(tiktok).toHaveAttribute('aria-checked', 'false')
    expect(screen.getAllByRole('checkbox', { name: /Instagram/ })[0]).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('opens today at the best time, as a photo post, on the caption', () => {
    show()
    // The demo's today is Tue 6 Oct, and Casa Vostra posts best at 18:00.
    expect(on()).toContain('Tue 6 Oct, 18:00')
    expect(format('Post')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('textbox', { name: 'Caption' })).toHaveFocus()
  })

  it('holds an empty Story back until it has a photo or video, as a post and a reel are', async () => {
    show()
    fireEvent.click(format('Story'))
    // A Story is its picture: with nothing in it there is nothing to put up.
    expect(screen.getAllByText('Add a photo or video.').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /^Schedule/ })[0]).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await add('story.jpg')
    expect(screen.queryAllByText('Add a photo or video.')).toHaveLength(0)
  })

  it('keeps the caption per account in More options, and shows its tabs once asked', () => {
    show()
    // By the caption only the AI draft: the split is a rarer need.
    expect(screen.queryByRole('tablist', { name: 'Caption for' })).toBeNull()
    const more = screen.getByRole('region', { name: 'More options' })
    fireEvent.click(within(more).getByRole('button', { name: /^More options/ }))
    fireEvent.click(within(more).getByRole('button', { name: 'Different caption per account' }))
    expect(screen.getByRole('tablist', { name: 'Caption for' })).toBeTruthy()
    // On, it is no longer offered.
    expect(screen.queryByRole('button', { name: 'Different caption per account' })).toBeNull()
  })

  it('follows the first file in: a video makes a Reel, a photo keeps a photo post', async () => {
    show()
    await add('clip.mp4')
    expect(format('Reel')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await add('a.jpg')
    expect(format('Post')).toHaveAttribute('aria-checked', 'true')
    // Picked by hand, the format stays whatever comes in next.
    fireEvent.click(format('Reel'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await add('b.jpg')
    expect(format('Reel')).toHaveAttribute('aria-checked', 'true')
  })

  it('moves a Story off a day that has one already, and back when Story is left', () => {
    show()
    // Tue 6 Oct has a story out; Wed 7 Oct is free.
    fireEvent.click(format('Story'))
    expect(on()).toContain('Wed 7 Oct, 18:00')
    fireEvent.click(format('Post'))
    expect(on()).toContain('Tue 6 Oct, 18:00')
  })

  it('keeps a day the calendar gave, and says a story is on it', () => {
    render(
      <BrandProvider>
        <Composer start={{ day: '2026-10-06' }} />
      </BrandProvider>,
    )
    fireEvent.click(format('Story'))
    expect(on()).toContain('Tue 6 Oct, 18:00')
    expect(
      screen.getAllByText('A story is already on that day: pick another.').length,
    ).toBeGreaterThan(0)
  })

  it('keeps every photo when a video joins them, and the video when a photo joins it', async () => {
    show()
    await add('a.jpg', 'b.jpg', 'c.jpg')
    await add('clip.mp4')
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(4)
    expect(format('Post')).toHaveAttribute('aria-checked', 'true')
    // A lone video is a Reel; a photo after it makes a photo post of both, nothing dropped.
    while (screen.queryAllByRole('button', { name: 'Remove' }).length > 0) {
      fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]!)
    }
    await add('clip.mp4')
    expect(format('Reel')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(format('Post'))
    await add('d.jpg')
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2)
    expect(format('Post')).toHaveAttribute('aria-checked', 'true')
  })

  it('keeps the location and collaborators in view, and the rest shut in More options', () => {
    show()
    // What a post often changes is never behind the fold.
    expect(screen.getByRole('combobox', { name: 'Location' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'First comment' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^More options/, expanded: false }))
    expect(screen.getByRole('textbox', { name: 'First comment' })).toBeInTheDocument()
    // Opened, More options does not show the location a second time.
    expect(screen.getAllByRole('combobox', { name: 'Location' })).toHaveLength(1)
  })

  it('takes tomorrow in two clicks, and an hour with one more, on the page', () => {
    show()
    fireEvent.click(when())
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow 18:00' }))
    expect(screen.queryByRole('dialog', { name: 'When' })).toBeNull()
    expect(on()).toContain('Wed 7 Oct, 18:00')
    // The hours are on the page, under the preview: a bar settles the hour at once.
    fireEvent.click(screen.getByRole('radio', { name: '12:00' }))
    expect(on()).toContain('Wed 7 Oct, 12:00')
  })

  it('shows a day picked off the week strip on the calendar button, and a day picked closes it', () => {
    show()
    fireEvent.click(when())
    const dialog = within(screen.getByRole('dialog', { name: 'When' }))
    fireEvent.click(dialog.getByRole('button', { name: '28' }))
    expect(screen.queryByRole('dialog', { name: 'When' })).toBeNull()
    // Three weeks out is off the strip: the button says the day, so it is on the page.
    expect(when()).toHaveTextContent('Wed 28 Oct')
    expect(on()).toContain('Wed 28 Oct, 18:00')
  })

  it('names a carousel, and says when a Reel holds a photo', async () => {
    show()
    expect(screen.queryByText(/^Carousel · /)).toBeNull()
    await add('a.jpg', 'b.jpg')
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
    upload(...Array.from({ length: 10 }, (_, i) => `photo-${i}.jpg`))
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(10))
    // Full: an upload says what it could not take.
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
    await add('clip.mp4')
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
    const dialog = within(screen.getByRole('dialog', { name: 'When' }))
    expect(dialog.queryByRole('button', { name: /^Today/ })).toBeNull()
    expect(dialog.getByRole('button', { name: 'Tomorrow 18:00' })).toBeInTheDocument()
  })

  it('takes a time typed on the page, and gives the old one back on Escape', () => {
    show()
    const field = screen.getByRole('textbox', { name: 'Post time' })
    act(() => field.focus())
    fireEvent.change(field, { target: { value: '7.30pm' } })
    fireEvent.blur(field)
    expect(on()).toContain('Tue 6 Oct, 19:30')
    act(() => field.focus())
    fireEvent.change(field, { target: { value: '21' } })
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(field).toHaveValue('19:30')
  })
})
