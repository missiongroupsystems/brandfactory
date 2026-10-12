import { fireEvent, render, renderHook, screen, within } from '@testing-library/react'
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

describe('the shot list', () => {
  it('moves a shot inside its idea with the arrows', () => {
    open()
    const rows = () =>
      within(shotList())
        .getAllByRole('listitem')
        .map((li) => li.textContent ?? '')
    expect(rows()[0]).toContain('Flour and eggs, overhead')
    fireEvent.click(
      within(shotList()).getByRole('button', { name: 'Move Flour and eggs, overhead down' }),
    )
    expect(rows()[0]).toContain('The sheet through the roller, hands only')
    expect(rows()[1]).toContain('Flour and eggs, overhead')
    // The first shot of an idea has nowhere to go up; the last, nowhere down.
    expect(
      within(shotList()).getByRole('button', {
        name: 'Move The sheet through the roller, hands only up',
      }),
    ).toBeDisabled()
    expect(
      within(shotList()).getByRole('button', { name: 'Move The route, out the window down' }),
    ).toBeDisabled()
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
    const dough = within(shotList()).getByRole('region', {
      name: 'Watch the dough become tagliatelle.',
    })
    fireEvent.click(
      within(dough).getByRole('button', { name: 'Remove Watch the dough become tagliatelle.' }),
    )
    expect(within(shotList()).queryByText(/Watch the dough/)).not.toBeInTheDocument()
    expect(shootOfIdea(shoots(), 'cv-dough')).toBeUndefined()
    expect(shoots().find((s) => s.id === 'cv-shoot-raffles')?.ideaIds).toEqual(['cv-carb-up'])
  })
})
