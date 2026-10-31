import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { DRIVE, searchDrive } from '@/data/publish'
import { resetConnections } from '@/features/connections/connections-store'
import { resetIdeas } from '@/features/ideate/ideas-store'
import { BrandProvider } from '@/features/schedule/posts-store'

import { Composer } from './composer'
import { LEAVE } from './drive-picker'

vi.mock('next/navigation', () => ({
  usePathname: () => '/post/new',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))

// jsdom has no matchMedia: every test here sees the desktop picker, with its folder column.
vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
}))

// jsdom lays nothing out: the preview's carousel scrolls to a slide it cannot measure.
beforeAll(() => {
  Element.prototype.scrollTo = vi.fn()
})
beforeEach(() => {
  resetConnections()
  resetIdeas()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

/** Opens the picker from the composer; a carousel unless the test says otherwise. */
function open(ui: React.ReactElement = <Composer start={{ format: 'carousel' }} />) {
  render(<BrandProvider>{ui}</BrandProvider>)
  const opener = screen.getByRole('button', { name: 'Google Drive' })
  // A click focuses its button; jsdom's does not.
  opener.focus()
  fireEvent.click(opener)
  return screen.getByRole('dialog', { name: 'Google Drive' })
}
const dialog = () => screen.queryByRole('dialog', { name: 'Google Drive' })
const tile = (name: string) => screen.getByRole('checkbox', { name })
const folders = () => screen.getByRole('navigation', { name: 'Folders' })
const add = () => screen.getByRole('button', { name: /^Add \d+$|^Select photos$/ })
/** The picker's leaving animation has run. */
const settle = () =>
  act(() => {
    vi.advanceTimersByTime(LEAVE)
  })
/** The post's media, in order, read from the strip: each tile holds its photo and its Remove. */
const strip = () =>
  screen.getAllByRole('button', { name: 'Remove' }).map((remove) => {
    const img = remove.parentElement!.parentElement!.querySelector('img')!
    return decodeURIComponent(img.getAttribute('src') ?? '')
  })

describe('the folders', () => {
  it('opens on this month, every folder in view; another folder is one click away and back', () => {
    open()
    const tree = within(folders())
    expect(tree.getByRole('button', { name: 'October' })).toHaveAttribute('aria-current', 'true')
    expect(tile('wine-night.jpg')).toBeInTheDocument()

    fireEvent.click(tree.getByRole('button', { name: 'September' }))
    expect(tile('crust.jpg')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'wine-night.jpg' })).toBeNull()
    expect(tree.getByRole('button', { name: 'September' })).toHaveAttribute('aria-current', 'true')

    fireEvent.click(tree.getByRole('button', { name: 'October' }))
    expect(tile('wine-night.jpg')).toBeInTheDocument()

    // A folder of folders lists them, and a month folds away under its parent.
    fireEvent.click(tree.getByRole('button', { name: 'Final edits' }))
    expect(screen.getAllByRole('button', { name: 'August' })).toHaveLength(2)
    fireEvent.click(tree.getByRole('button', { name: 'Collapse Final edits' }))
    expect(tree.queryByRole('button', { name: 'August' })).toBeNull()
  })

  it('finds a file in another folder by name and says where it is', () => {
    open()
    expect(searchDrive(DRIVE['casa-vostra'].root, 'CRUST')).toEqual([
      { file: { name: 'crust.jpg', src: '/demo/crust.jpg' }, path: ['Final edits', 'September'] },
    ])
    const search = screen.getByRole('searchbox', { name: 'Search files' })
    fireEvent.change(search, { target: { value: 'crust' } })
    expect(tile('crust.jpg')).toHaveTextContent('Final edits › September')
    expect(screen.queryByRole('checkbox', { name: 'wine-night.jpg' })).toBeNull()

    // Escape clears the search first, and only an empty search lets it close the picker.
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(search).toHaveValue('')
    expect(tile('wine-night.jpg')).toBeInTheDocument()
    fireEvent.keyDown(search, { key: 'Escape' })
    settle()
    expect(dialog()).toBeNull()
  })
})

describe('the selection', () => {
  it('numbers the tiles in the order ticked, and Add puts them in the post in that order', () => {
    open()
    expect(add()).toHaveTextContent('Select photos')
    expect(add()).toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(tile('wine-night.jpg'))
    fireEvent.click(tile('tagliatelle.jpg'))
    fireEvent.click(tile('ravioli.jpg'))
    expect(tile('wine-night.jpg')).toHaveTextContent(/^1/)
    expect(tile('tagliatelle.jpg')).toHaveTextContent(/^2/)
    expect(tile('ravioli.jpg')).toHaveTextContent(/^3/)
    expect(screen.getByText('3 selected')).toBeInTheDocument()

    // Unticking one renumbers the rest.
    fireEvent.click(tile('tagliatelle.jpg'))
    expect(tile('tagliatelle.jpg')).toHaveAttribute('aria-checked', 'false')
    expect(tile('ravioli.jpg')).toHaveTextContent(/^2/)
    expect(add()).toHaveTextContent('Add 2')

    fireEvent.click(add())
    settle()
    expect(dialog()).toBeNull()
    expect(strip()).toEqual([
      expect.stringContaining('/demo/casa-vostra/wine-night.jpg'),
      expect.stringContaining('/demo/casa-vostra/ravioli.jpg'),
    ])
  })

  it('takes a range with shift, and Clear empties it', () => {
    open()
    fireEvent.click(tile('wine-night.jpg'))
    fireEvent.click(tile('ravioli.jpg'), { shiftKey: true })
    expect(screen.getByText('4 selected')).toBeInTheDocument()
    expect(tile('margherita.jpg')).toHaveTextContent(/^3/)
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(add()).toHaveTextContent('Select photos')
  })

  it('starts a range over once a search shows other tiles', () => {
    open()
    fireEvent.click(tile('wood-oven.jpg'))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search files' }), {
      target: { value: 'ta' },
    })
    // Four results. A range from October's seventh tile would take them all; there is none.
    fireEvent.click(tile('margherita-reel.mp4'), { shiftKey: true })
    expect(screen.getByText('2 selected')).toBeInTheDocument()
  })

  it('keeps one for a reel: a second tick replaces the first', () => {
    open(<Composer start={{ format: 'reel' }} />)
    fireEvent.click(tile('margherita-reel.mp4'))
    fireEvent.click(tile('wine-night.jpg'))
    expect(tile('margherita-reel.mp4')).toHaveAttribute('aria-checked', 'false')
    expect(tile('wine-night.jpg')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(add()).toHaveTextContent('Add 1')
  })

  it('rests the other tiles once a post has all it takes', () => {
    // Seven in, three to go: the fourth tick does nothing, and the footer says why.
    open()
    for (const name of DRIVE['casa-vostra'].root.folders[0]!.folders[0]!.files) {
      fireEvent.click(tile(name.name))
    }
    fireEvent.click(add())
    settle()
    fireEvent.click(screen.getByRole('button', { name: 'Google Drive' }))
    fireEvent.click(within(folders()).getByRole('button', { name: 'September' }))
    fireEvent.click(tile('crust.jpg'))
    fireEvent.click(tile('pasta.jpg'))
    expect(tile('pizza-service.jpg')).not.toHaveAttribute('aria-disabled')
    fireEvent.click(tile('pizza-service.jpg'))
    expect(screen.getByText('3 of 3 selected')).toBeInTheDocument()

    fireEvent.click(within(folders()).getByRole('button', { name: 'August' }))
    expect(tile('dough.jpg')).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(tile('dough.jpg'))
    fireEvent.keyDown(tile('dough.jpg'), { key: ' ' })
    expect(tile('dough.jpg')).toHaveAttribute('aria-checked', 'false')
    expect(add()).toHaveTextContent('Add 3')
  })
})

describe('a video tile', () => {
  it('shows its poster and its length, and never plays in the picker', () => {
    const picker = open()
    expect(tile('margherita-reel.mp4')).toHaveTextContent('0:14')
    expect(picker.querySelector('video')).toBeNull()
    expect(picker.querySelector('img[src*="margherita-reel.jpg"]')).toBeInTheDocument()
  })
})

describe('the keyboard', () => {
  it('moves by arrow, ticks by Space or Enter, and Escape closes back to the opener', () => {
    open()
    const opener = screen.getByRole('button', { name: 'Google Drive' })
    const first = tile('margherita-reel.mp4')
    // One tile is in the Tab order; the rest are reached by arrow.
    expect(first).toHaveAttribute('tabindex', '0')
    expect(tile('wine-night.jpg')).toHaveAttribute('tabindex', '-1')

    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(tile('wine-night.jpg'))
    fireEvent.keyDown(tile('wine-night.jpg'), { key: ' ' })
    expect(tile('wine-night.jpg')).toHaveAttribute('aria-checked', 'true')
    // Down a row: four tiles across on a desktop.
    fireEvent.keyDown(tile('wine-night.jpg'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(tile('burrata.jpg'))
    fireEvent.keyDown(tile('burrata.jpg'), { key: 'Enter' })
    expect(tile('burrata.jpg')).toHaveTextContent(/^2/)

    fireEvent.keyDown(tile('burrata.jpg'), { key: 'Escape' })
    settle()
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('keeps Tab inside the picker', () => {
    open()
    const search = screen.getByRole('searchbox', { name: 'Search files' })
    add().focus()
    fireEvent.keyDown(add(), { key: 'Tab' })
    expect(document.activeElement).toBe(search)
    fireEvent.keyDown(search, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(add())
  })
})
