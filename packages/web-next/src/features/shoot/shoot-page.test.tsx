import { createEvent, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PAST_CREW } from '@/data/suggestions'
import { IdeaPage } from '@/features/ideate/idea-page'
import { resetIdeas } from '@/features/ideate/ideas-store'
import { BrandProvider } from '@/features/schedule/posts-store'

import { pastCrew } from './model'
import { ShootPage } from './shoot-page'
import { resetShoots, shootOfIdea, useShoots } from './shoots-store'

vi.mock('next/navigation', () => ({
  usePathname: () => '/shoot/cv-shoot-raffles',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

if (!window.matchMedia) {
  window.matchMedia = () =>
    ({
      matches: false,
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
const shotList = () => screen.getByRole('region', { name: 'Shot list' })

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
 * A drag as a mouse makes it: start on one, over another, drop there. jsdom lays nothing out, so
 * every box is at 0,0: a pointer at -1 is on the near side of the frame it is over, and the lifted
 * one goes before it.
 */
function dragTo(from: HTMLElement, to: HTMLElement) {
  const dataTransfer = { setData: vi.fn(), types: [] as string[], effectAllowed: 'move' }
  fireEvent.dragStart(from, { dataTransfer })
  const over = createEvent.dragOver(to, { dataTransfer })
  Object.defineProperty(over, 'clientX', { value: -1 })
  Object.defineProperty(over, 'clientY', { value: -1 })
  fireEvent(to, over)
  fireEvent.drop(to, { dataTransfer })
  fireEvent.dragEnd(from, { dataTransfer })
}

describe('the shot list', () => {
  const line = () => screen.getByRole('list', { name: 'Shots in order' })
  const frame = (title: string) =>
    within(line())
      .getAllByRole('listitem')
      .find((li) => li.dataset.drop?.startsWith('shot:') && li.textContent?.includes(title))!
  const label = (hook: string) =>
    within(line()).getByText(hook).closest<HTMLElement>('[draggable]')!
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

  it('reorders the frames by a drag, and the idea page sees the new order', () => {
    const { unmount } = open()
    expect(frame('The cut, then the pass')).toHaveTextContent(/^03/)
    // The last frame dragged onto the first lands first; the numbers follow.
    dragTo(frame('The cut, then the pass'), frame('Flour and eggs, overhead'))
    expect(frame('The cut, then the pass')).toHaveTextContent(/^01/)
    expect(frame('Flour and eggs, overhead')).toHaveTextContent(/^02/)
    unmount()
    expect(ideaPageShots()).toEqual([
      'The cut, then the pass',
      'Flour and eggs, overhead',
      'The sheet through the roller, hands only',
    ])
  })

  it('keeps a frame in its own group: a drag onto another idea changes nothing', () => {
    open()
    dragTo(frame('Bibs on the table'), frame('Flour and eggs, overhead'))
    expect(frame('Bibs on the table')).toHaveTextContent(/^04/)
    expect(frame('Flour and eggs, overhead')).toHaveTextContent(/^01/)
    expect(ideaOrder()).toEqual(['cv-dough', 'cv-carb-up'])
  })

  it('moves a whole group by its label, and the shoot shoots the ideas in that order', () => {
    open()
    // The second idea dragged onto the first comes first; its shots become 01 to 03.
    dragTo(label("Carb up before tomorrow's race."), label('Watch the dough become tagliatelle.'))
    expect(ideaOrder()).toEqual(['cv-carb-up', 'cv-dough'])
    expect(frame('Bibs on the table')).toHaveTextContent(/^01/)
    expect(frame('Flour and eggs, overhead')).toHaveTextContent(/^04/)
  })

  it('moves a frame or a group with Option and an arrow key on its handle', () => {
    const { unmount } = open()
    const shot = within(line()).getByRole('button', {
      name: 'Move shot 1: Flour and eggs, overhead',
    })
    fireEvent.keyDown(shot, { key: 'ArrowRight', altKey: true })
    expect(frame('Flour and eggs, overhead')).toHaveTextContent(/^02/)
    // An arrow without Option is the page's, not a move.
    fireEvent.keyDown(shot, { key: 'ArrowRight' })
    expect(frame('Flour and eggs, overhead')).toHaveTextContent(/^02/)
    const group = within(line()).getByRole('button', {
      name: 'Move group: Watch the dough become tagliatelle.',
    })
    fireEvent.keyDown(group, { key: 'ArrowRight', altKey: true })
    expect(ideaOrder()).toEqual(['cv-carb-up', 'cv-dough'])
    expect(frame('Flour and eggs, overhead')).toHaveTextContent(/^05/)
    unmount()
    expect(ideaPageShots()[0]).toBe('The sheet through the roller, hands only')
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
  })
})
