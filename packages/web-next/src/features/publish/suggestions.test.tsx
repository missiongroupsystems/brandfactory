import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetConnections } from '@/features/connections/connections-store'
import { resetIdeas } from '@/features/ideate/ideas-store'
import { BrandProvider } from '@/features/schedule/posts-store'
import { pastCrew } from '@/features/shoot/model'
import { SHOOTS_BY_BRAND } from '@/data/shoots'
import { PAST_CREW } from '@/data/suggestions'

import { Composer } from './composer'
import { COLLAB_MAX } from './model'
import { peopleOf } from './suggestions'

vi.mock('next/navigation', () => ({
  usePathname: () => '/post/new',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))

// jsdom has no matchMedia or layout: every test here sees the desktop composer.
vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
}))
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
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

const collaborators = () => screen.getByRole('combobox', { name: /^@account, up to/ })
const offered = () => screen.getAllByRole('option').map((o) => o.textContent)

describe('who the people fields offer', () => {
  it('ranks a recent collaborator above an account the brand only tagged', () => {
    // Both handles start with "chef"; the collaborator of 12 Sep comes first.
    const chefs = peopleOf('casa-vostra', 'collab').filter((p) => p.value.startsWith('@chef'))
    expect(chefs.map((p) => p.value)).toEqual(['@chefantonio', '@chefmarco.cv'])
    expect(chefs[0]!.meta).toBe('Collab · 12 Sep')
  })

  it('puts the most tagged first when tagging, and a stranger after everyone the brand knows', () => {
    const tags = peopleOf('casa-vostra', 'tag')
    expect(tags[0]!.value).toBe('@chefmarco.cv')
    // A creator who posted about the brand is known, never worked with: last.
    expect(tags.at(-1)!.meta).toBe('Posted about you')
  })
})

describe('Collaborators', () => {
  it('suggests @chefantonio first for "chef", and a pick becomes a chip', () => {
    show()
    fireEvent.focus(collaborators())
    fireEvent.change(collaborators(), { target: { value: 'chef' } })
    expect(offered()[0]).toContain('@chefantonio')
    expect(offered()[0]).toContain('Collab · 12 Sep')
    fireEvent.keyDown(collaborators(), { key: 'Enter' })

    expect(screen.getByRole('button', { name: 'Remove @chefantonio' })).toBeInTheDocument()
    expect(collaborators()).toHaveValue('')
    expect(
      screen.getByText(
        '@chefantonio gets an invite in their own Instagram. Once accepted, the post shows both names.',
      ),
    ).toBeInTheDocument()
  })

  it('says "They get" before anyone is added', () => {
    show()
    expect(screen.getByText(/^They get an invite in their own Instagram\./)).toBeInTheDocument()
  })

  it('takes a handle nobody suggested, spelled as Instagram keeps it', () => {
    show()
    fireEvent.focus(collaborators())
    fireEvent.change(collaborators(), { target: { value: 'New Place SG' } })
    expect(offered()).toEqual(['Use @newplacesg'])
    fireEvent.keyDown(collaborators(), { key: 'Enter' })
    expect(screen.getByRole('button', { name: 'Remove @newplacesg' })).toBeInTheDocument()
  })

  it('still stops at Instagram’s limit, picking with the keyboard', () => {
    show()
    for (let i = 0; i < COLLAB_MAX; i++) {
      fireEvent.focus(collaborators())
      fireEvent.keyDown(collaborators(), { key: 'ArrowDown' })
      fireEvent.keyDown(collaborators(), { key: 'Enter' })
    }
    const details = screen.getByRole('region', { name: 'Details' })
    expect(within(details).getAllByRole('button', { name: /^Remove @/ })).toHaveLength(COLLAB_MAX)
    // Full: the field is gone, so nothing more can be typed or picked.
    expect(screen.queryByRole('combobox', { name: /^@account, up to/ })).toBeNull()
    expect(
      screen.getByText(/^@danielfooddiary, @chefantonio and @sfoglina\.bologna each get an invite/),
    ).toBeInTheDocument()
  })
})

describe('Labels and the location', () => {
  it('offers the labels the team used, and a pick adds one', () => {
    show()
    const labels = screen.getByRole('combobox', { name: /^e\.g\. TMP_Wine/ })
    fireEvent.focus(labels)
    fireEvent.change(labels, { target: { value: 'pas' } })
    expect(offered()[0]).toContain('CV_Pasta')
    fireEvent.keyDown(labels, { key: 'Enter' })
    expect(screen.getByRole('button', { name: 'Remove CV_Pasta' })).toBeInTheDocument()
  })

  it('shows every place on focus, though the field holds the venue, and a pick replaces it', () => {
    show()
    const location = screen.getByRole('combobox', { name: 'Location' })
    fireEvent.focus(location)
    expect(offered()[0]).toContain('Casa Vostra, Raffles City')
    fireEvent.click(screen.getByRole('option', { name: /CHIJMES/ }))
    expect(location).toHaveValue('CHIJMES')
  })
})

describe('the caption', () => {
  it('offers people after an "@" and swaps the word for the pick', () => {
    show()
    const caption = screen.getByRole('textbox', { name: 'Caption' })
    fireEvent.change(caption, { target: { value: 'Tonight with @chef' } })
    expect(offered()[0]).toContain('@chefantonio')
    fireEvent.keyDown(caption, { key: 'Enter' })
    expect(caption).toHaveValue('Tonight with @chefantonio ')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('offers the brand’s hashtags after a "#", the ones on every post first', () => {
    show()
    const caption = screen.getByRole('textbox', { name: 'Caption' })
    fireEvent.change(caption, { target: { value: 'Fire #' } })
    expect(offered()[0]).toContain('#casavostra')
    fireEvent.change(caption, { target: { value: 'Fire #wood' } })
    expect(offered()).toEqual([expect.stringContaining('#woodfired')])
  })
})

describe('the shoot crew', () => {
  it('offers the people of most shoots first, in the role they had', () => {
    const crew = pastCrew(SHOOTS_BY_BRAND['casa-vostra'], PAST_CREW['casa-vostra'])
    expect(crew[0]).toEqual({ name: 'Jules Tan', role: 'Videographer', shoots: 2 })
    // Someone from an earlier month is still offered, after this month's crew.
    expect(crew.at(-1)).toMatchObject({ name: 'Giulia Conti', shoots: 0 })
  })
})
