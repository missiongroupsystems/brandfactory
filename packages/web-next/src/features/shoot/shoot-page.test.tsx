import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OUTLETS } from '@/data/shoots'
import { PAST_CREW } from '@/data/suggestions'
import { IdeaPage } from '@/features/ideate/idea-page'
import { resetIdeas } from '@/features/ideate/ideas-store'
import { BrandProvider } from '@/features/schedule/posts-store'

import { pastCrew } from './model'
import { NewShootForm } from './new-shoot'
import { ShootPage } from './shoot-page'
import { resetShoots, shootOfIdea, useShoots } from './shoots-store'

vi.mock('next/navigation', () => ({
  usePathname: () => '/shoot/cv-shoot-raffles',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// jsdom has no Web Animations, so the list runs as it does under reduced motion.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('prefers-reduced-motion'),
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList
}

beforeEach(() => {
  resetIdeas()
  resetShoots()
  Element.prototype.scrollIntoView = vi.fn()
})

const open = () =>
  render(
    <BrandProvider>
      <ShootPage id="cv-shoot-raffles" />
    </BrandProvider>,
  )
const shoots = () => renderHook(() => useShoots('casa-vostra')).result.current
const shotList = () => screen.getByRole('region', { name: 'Storyboard' })

// A shoot is planned from Ideas: the judge found no tab lit and a back link that said Calendar.
describe('where the shoot sits', () => {
  it('lights the Ideas tab and goes back to where it was opened from', () => {
    open()
    const main = screen.getByRole('navigation', { name: 'Main' })
    expect(within(main).getByRole('link', { name: 'Ideas' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    // Opened straight from a link, there is no in-app page to go back to: Back goes to Ideas.
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/ideate')
    expect(screen.queryByRole('link', { name: 'Calendar' })).toBeNull()
  })
})

describe('the address', () => {
  it('offers every outlet first, so the team picks where it shoots', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    const address = screen.getByRole('combobox', { name: 'Address' })
    expect(address).toHaveValue(OUTLETS['casa-vostra'][0])
    fireEvent.focus(address)
    // Each outlet row leads with where it is, not with the brand's name, so it reads at a glance.
    const options = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(options.slice(0, 3).map((o) => o.textContent)).toEqual([
      'Raffles City #01-23Outlet',
      '26 Lorong MambongOutlet',
      'Jewel Changi #02-215Outlet',
    ])
    fireEvent.click(options[1]!)
    expect(address).toHaveValue(OUTLETS['casa-vostra'][1])
    // Free text still works.
    fireEvent.change(address, { target: { value: 'The client’s kitchen' } })
    expect(address).toHaveValue('The client’s kitchen')
  })

  it('starts a new shoot at the first outlet', () => {
    render(
      <BrandProvider>
        <NewShootForm />
      </BrandProvider>,
    )
    expect(screen.getByRole('combobox', { name: 'Address' })).toHaveValue(OUTLETS['casa-vostra'][0])
  })
})

describe('who comes', () => {
  it('takes a role the team types, and offers that person in it next time', () => {
    open()
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'other' } })
    fireEvent.change(screen.getByLabelText('Name of the person'), { target: { value: 'Ana Lee' } })
    // A name with no role is not a crew member yet.
    const add = screen.getByRole('button', { name: 'Add' })
    expect(add).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Their role'), { target: { value: 'Food stylist' } })
    fireEvent.click(add)
    const crew = screen.getByRole('region', { name: 'Who comes' })
    expect(within(crew).getByText('Ana Lee')).toBeInTheDocument()
    expect(within(crew).getByText('Food stylist')).toBeInTheDocument()
    expect(pastCrew(shoots(), PAST_CREW['casa-vostra'])).toContainEqual(
      expect.objectContaining({ name: 'Ana Lee', role: 'Food stylist' }),
    )
  })
})

/**
 * jsdom lays nothing out, so the line gets a layout here, in DOM order: groups 600 px apart and
 * 560 wide, their clips 160 apart and 152 wide. The lifted copy is where dnd-kit puts it, its
 * inline box. The keyboard sensor reads these boxes to find the next place along the row.
 */
const box = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
  }) as DOMRect
const at = (n: Element) => [...n.parentElement!.children].indexOf(n)
function layOut(this: Element): DOMRect {
  const el = this as HTMLElement
  // The lifted copy's box, or the copy inside it that dnd-kit measures.
  const fixed = [el, el.parentElement].find((n) => n?.style.position === 'fixed')
  if (fixed?.style.width) {
    const px = (v: string) => parseFloat(v) || 0
    const s = fixed.style
    return box(px(s.left), px(s.top), px(s.width), px(s.height))
  }
  const li = el.closest('li')
  if (!li) return box(0, 0, 0, 0)
  const group = li.parentElement?.closest('li')
  return group ? box(at(group) * 600 + at(li) * 160, 40, 152, 260) : box(at(li) * 600, 0, 560, 300)
}

/** The keyboard's drag: Space on the handle lifts, an arrow moves, Space drops, Escape cancels. */
const handle = (name: string) => screen.getByRole('button', { name })
async function lift(name: string) {
  const grip = handle(name)
  grip.focus()
  fireEvent.keyDown(grip, { code: 'Space' })
  // The sensor listens for the next key from the next tick.
  await act(() => new Promise((r) => setTimeout(r, 0)))
}
// The sensor listens on the document, where a key from the focused handle arrives. A drop lets
// go of the lifted copy a tick later, inside act.
const press = (code: 'ArrowLeft' | 'ArrowRight' | 'Space' | 'Escape') =>
  act(async () => {
    fireEvent.keyDown(document.activeElement ?? document, { code })
  })

describe('the shot list', () => {
  const measure = Element.prototype.getBoundingClientRect
  beforeEach(() => {
    Element.prototype.getBoundingClientRect = layOut
  })
  afterEach(() => {
    Element.prototype.getBoundingClientRect = measure
  })

  const line = () => screen.getByRole('list', { name: 'Shots in order' })
  // A clip: a list item in a group's own row.
  const frame = (title: string) =>
    within(line())
      .getAllByRole('listitem')
      .find(
        (li) =>
          li.parentElement?.getAttribute('aria-label')?.startsWith('Shots of') &&
          li.textContent?.includes(title),
      )!
  const ideaOrder = () => shoots().find((s) => s.id === 'cv-shoot-raffles')!.ideaIds
  const ideaPageShots = () => {
    render(
      <BrandProvider>
        <IdeaPage id="cv-dough" />
      </BrandProvider>,
    )
    return ['Shot 1', 'Shot 2', 'Shot 3'].map(
      (n) => (screen.getByLabelText(n) as HTMLTextAreaElement).value,
    )
  }

  it('reorders the frames by a lift and two moves, and the idea page sees the new order', async () => {
    const { unmount } = open()
    expect(frame('The cut, then the pass')).toHaveTextContent(/^03/)
    await lift('Move shot 3: The cut, then the pass')
    // The numbers follow the lifted clip as it is held over each place.
    await press('ArrowLeft')
    expect(frame('The cut, then the pass')).toHaveTextContent(/^02/)
    await press('ArrowLeft')
    expect(frame('The cut, then the pass')).toHaveTextContent(/^01/)
    await press('Space')
    expect(frame('The cut, then the pass')).toHaveTextContent(/^01/)
    expect(frame('Flour and eggs, overhead')).toHaveTextContent(/^02/)
    unmount()
    expect(ideaPageShots()).toEqual([
      'The cut, then the pass',
      'Flour and eggs, overhead',
      'The sheet through the roller, hands only',
    ])
  })

  it('keeps a frame in its own group: past its last place there is nowhere to go', async () => {
    open()
    await lift('Move shot 3: The cut, then the pass')
    await press('ArrowRight')
    expect(frame('The cut, then the pass')).toHaveTextContent(/^03/)
    // No place was offered at all: the next group's clips are not its row.
    expect(screen.getByRole('status')).toHaveTextContent(
      'Picked up shot 3: The cut, then the pass.',
    )
    await press('Space')
    expect(frame('The cut, then the pass')).toHaveTextContent(/^03/)
    expect(frame('Bibs on the table')).toHaveTextContent(/^04/)
    await lift('Move shot 4: Bibs on the table')
    await press('ArrowLeft')
    await press('Space')
    expect(frame('Bibs on the table')).toHaveTextContent(/^04/)
    expect(ideaOrder()).toEqual(['cv-dough', 'cv-carb-up'])
  })

  it('moves a whole group by its handle, and the shoot shoots the ideas in that order', async () => {
    open()
    await lift("Move group: Carb up before tomorrow's race.")
    await press('ArrowLeft')
    await press('Space')
    expect(ideaOrder()).toEqual(['cv-carb-up', 'cv-dough'])
    expect(frame('Bibs on the table')).toHaveTextContent(/^01/)
    expect(frame('Flour and eggs, overhead')).toHaveTextContent(/^04/)
    // The handle keeps the focus, so the next move can follow.
    expect(handle("Move group: Carb up before tomorrow's race.")).toHaveFocus()
  })

  it('puts a lifted group back on Escape, and nothing changes', async () => {
    open()
    await lift("Move group: Carb up before tomorrow's race.")
    await press('ArrowLeft')
    // Held over the first place, it already reads as first.
    expect(frame('Bibs on the table')).toHaveTextContent(/^01/)
    await press('Escape')
    expect(frame('Bibs on the table')).toHaveTextContent(/^04/)
    expect(ideaOrder()).toEqual(['cv-dough', 'cv-carb-up'])
  })

  it('tells a screen reader how to move an item, and what it has done', async () => {
    open()
    expect(handle('Move shot 1: Flour and eggs, overhead')).toHaveAccessibleDescription(
      /Press Space to lift it/,
    )
    await lift('Move shot 1: Flour and eggs, overhead')
    const said = () => screen.getByRole('status').textContent
    expect(said()).toBe('Picked up shot 1: Flour and eggs, overhead.')
    await press('ArrowRight')
    expect(said()).toBe('Moved to position 2.')
    await press('Space')
    expect(said()).toBe('Dropped at position 2.')
  })
})

describe('ideas on the shoot', () => {
  const picker = () => screen.getByRole('dialog', { name: 'Add an idea' })

  it('adds an idea from the page, and the idea page shows this shoot as its day', () => {
    const { unmount } = open()
    fireEvent.click(screen.getByRole('button', { name: 'Add an idea' }))
    // Ideas already on this shoot are not offered.
    expect(within(picker()).queryByText(/Watch the dough/)).not.toBeInTheDocument()
    fireEvent.click(within(picker()).getByRole('button', { name: /Blindfold pizza/ }))
    expect(screen.queryByRole('dialog', { name: 'Add an idea' })).not.toBeInTheDocument()
    expect(
      within(shotList()).getByRole('link', { name: 'Blindfold pizza: the rematch.' }),
    ).toBeInTheDocument()
    expect(shootOfIdea(shoots(), 'cv-blindfold')?.id).toBe('cv-shoot-raffles')
    unmount()

    // No retyping on the idea page: its shoot line is this shoot, day and hours.
    render(
      <BrandProvider>
        <IdeaPage id="cv-blindfold" />
      </BrandProvider>,
    )
    expect(screen.getByText('Wed 7 Oct, 12:00–17:00 · Raffles City')).toBeInTheDocument()
  })

  it('asks before it moves an idea off another shoot; Cancel changes nothing', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Add an idea' }))
    const pastas = () => within(picker()).getByRole('button', { name: /Five pastas/ })
    expect(pastas()).toHaveTextContent('On Pasta day, Wed 21 Oct')
    fireEvent.click(pastas())
    expect(picker()).toHaveTextContent('On Pasta day, Wed 21 Oct. Move it to this shoot?')
    fireEvent.click(within(picker()).getByRole('button', { name: 'Cancel' }))
    expect(shootOfIdea(shoots(), 'cv-five-pastas')?.id).toBe('cv-shoot-pasta')
    expect(pastas()).toBeInTheDocument()

    fireEvent.click(pastas())
    fireEvent.click(within(picker()).getByRole('button', { name: 'Move' }))
    expect(shootOfIdea(shoots(), 'cv-five-pastas')?.id).toBe('cv-shoot-raffles')
    // Pasta day keeps its other idea.
    expect(shoots().find((s) => s.id === 'cv-shoot-pasta')?.ideaIds).toEqual(['cv-st-poll'])
  })

  it('takes an idea off the shoot from its heading', () => {
    open()
    fireEvent.click(
      within(shotList()).getByRole('button', {
        name: 'Remove Watch the dough become tagliatelle.',
      }),
    )
    expect(within(shotList()).queryByText(/Watch the dough/)).not.toBeInTheDocument()
    expect(shootOfIdea(shoots(), 'cv-dough')).toBeUndefined()
    expect(shoots().find((s) => s.id === 'cv-shoot-raffles')?.ideaIds).toEqual(['cv-carb-up'])
    // A finger has no hover: the same comes from the small menu beside the label.
    fireEvent.click(
      within(shotList()).getByRole('button', { name: "More for Carb up before tomorrow's race." }),
    )
    fireEvent.click(within(shotList()).getByRole('button', { name: 'Remove from shoot' }))
    expect(shoots().find((s) => s.id === 'cv-shoot-raffles')?.ideaIds).toEqual([])
  })
})
