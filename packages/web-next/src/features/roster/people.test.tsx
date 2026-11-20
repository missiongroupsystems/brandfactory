import { fireEvent, render, screen, within } from '@testing-library/react'
import * as React from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { BrandMark } from '@/components/brand-mark'
import { Combobox, rank } from '@/components/suggest'
import type { RosterAccount, RosterPerson } from '@/data/roster'
import { BrandProvider } from '@/features/schedule/posts-store'

import { initialsOf, PEOPLE_LIMIT, peopleFor, personOfHandle } from './people'

const ig = (handle: string, picture: string | null = null): RosterAccount => ({
  platform: 'instagram',
  handle,
  followers: 1000,
  engagement: null,
  url: null,
  picture,
})
const tt = (handle: string): RosterAccount => ({ ...ig(handle), platform: 'tiktok' })
const person = (name: string, accounts: RosterAccount[], brands: string[] = []): RosterPerson => ({
  id: name,
  orgId: 'demo',
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  name,
  category: null,
  status: 'prospect',
  notes: '',
  accounts,
  brands,
})

const ROSTER = [
  person('Ana Lee', [ig('ana.cooks', '/ana.jpg')], ['casa-vostra']),
  person('Ben Tan', [ig('bentan')], ['casa-vostra', 'temper']),
  person('Cara Ong', [ig('cara.ong')], ['casa-vostra']),
  person('Dev Patel', [tt('devdines')], ['casa-vostra']),
  person('Ella Wong', [ig('ellawong.sg')]),
  person('Anton Ferri', [ig('chefanton')]),
]

const values = (rows: { value: string }[]) => rows.map((r) => r.value)

describe('the people a post offers for a brand', () => {
  it('shows the brand’s linked people first with nothing typed, the recently used of them first, then its other people', () => {
    const { idle } = peopleFor({
      brandId: 'casa-vostra',
      roster: ROSTER,
      saved: ['@thisismissiongroup'],
      recent: ['cara.ong', 'ellawong.sg', 'someone.new'],
    })
    expect(values(idle)).toEqual([
      '@cara.ong',
      '@ana.cooks',
      '@bentan',
      '@ellawong.sg',
      '@someone.new',
      '@thisismissiongroup',
    ])
    // Only the linked people carry the brand; nothing else tells the rows apart.
    expect(idle.map((r) => r.linkedTo ?? null)).toEqual([
      'casa-vostra',
      'casa-vostra',
      'casa-vostra',
      null,
      null,
      null,
    ])
    expect(idle[1]).toMatchObject({
      name: 'Ana Lee',
      detail: '@ana.cooks',
      platform: 'ig',
      initials: 'AL',
      picture: '/ana.jpg',
    })
  })

  it('offers Instagram accounts only, each once, and stops at the limit', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      person(`P ${String(i).padStart(2, '0')}`, [ig(`p${i}`)], ['temper']),
    )
    const { idle, all } = peopleFor({
      brandId: 'temper',
      roster: [...many, ...ROSTER],
      saved: ['@P1'],
      recent: [],
    })
    expect(idle).toHaveLength(PEOPLE_LIMIT)
    expect(values(all)).not.toContain('@devdines')
    expect(values(all).filter((v) => v === '@p1')).toHaveLength(1)
  })

  it('searches the whole roster when typing: the brand’s people first, then everyone else, by name or handle', () => {
    const { all } = peopleFor({
      brandId: 'casa-vostra',
      roster: ROSTER,
      saved: [],
      recent: [],
    })
    // "an" starts Ana's handle and Anton's name, and is inside Ben's handle: the linked people
    // come first, the better match first among them.
    expect(values(rank(all, 'an', PEOPLE_LIMIT))).toEqual(['@ana.cooks', '@bentan', '@chefanton'])
    expect(values(rank(all, 'wong', PEOPLE_LIMIT))).toEqual(['@ellawong.sg'])
    expect(rank(all, 'zzz', PEOPLE_LIMIT)).toEqual([])
    // For Temper only Ben is linked: he leads, and Ana is anyone.
    const other = peopleFor({ brandId: 'temper', roster: ROSTER, saved: [], recent: [] }).all
    expect(values(rank(other, 'an', PEOPLE_LIMIT))).toEqual(['@bentan', '@ana.cooks', '@chefanton'])
  })
})

describe('a row’s name', () => {
  it('has the same two lines: a name and the handle once named, else the handle and the platform', () => {
    const { all } = peopleFor({
      brandId: 'casa-vostra',
      roster: ROSTER,
      saved: ['@casanostrasg', '@whatisdieting'],
      recent: [],
      names: new Map([['casanostrasg', { name: 'Casa Nostra', picture: '/cn.jpg' }]]),
    })
    const row = (v: string) => all.find((r) => r.value === v)
    expect(row('@casanostrasg')).toMatchObject({
      name: 'Casa Nostra',
      detail: '@casanostrasg',
      initials: 'CN',
      picture: '/cn.jpg',
      rename: 'casanostrasg',
    })
    expect(row('@whatisdieting')).toMatchObject({
      name: 'whatisdieting',
      detail: 'Instagram',
      initials: 'WH',
      rename: 'whatisdieting',
    })
    // Every row's name can be fixed from the list: a roster person's is their own.
    expect(row('@ana.cooks')?.rename).toBe('ana.cooks')
    expect(personOfHandle(ROSTER, 'demo', '@Ana.Cooks')?.name).toBe('Ana Lee')
    expect(personOfHandle(ROSTER, 'demo', 'casanostrasg')).toBeNull()
    expect(personOfHandle(ROSTER, 'other-company', 'ana.cooks')).toBeNull()
    // A name is searched like a person's.
    expect(values(rank(all, 'nostra', PEOPLE_LIMIT))).toEqual(['@casanostrasg'])
    expect(initialsOf('365days2play - SG Eats • Hotels')).toBe('3S')
  })
})

function Field({ brandId = 'casa-vostra' }: { brandId?: string }) {
  const [value, setValue] = React.useState('')
  const [picked, setPicked] = React.useState('')
  const people = peopleFor({ brandId, roster: ROSTER, saved: [], recent: [] })
  return (
    <>
      <Combobox
        value={value}
        onChange={setValue}
        options={people.all}
        idle={people.idle}
        limit={PEOPLE_LIMIT}
        mark={(id) => <BrandMark brandId={id} size={14} />}
        create={(t) => `@${t.trim().replace(/^@/, '').toLowerCase()}`}
        onPick={setPicked}
        aria-label="Collaborators"
      />
      <output>{picked}</output>
    </>
  )
}

describe('the people list', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('marks only the people linked to the brand with its logo, and adds a handle that matches nobody as typed', () => {
    render(
      <BrandProvider>
        <Field />
      </BrandProvider>,
    )
    const field = screen.getByRole('combobox', { name: 'Collaborators' })
    fireEvent.focus(field)
    const rows = () => within(screen.getByRole('listbox')).getAllByRole('option')
    expect(rows().map((r) => r.textContent)).toEqual([
      'Ana Lee@ana.cooks',
      'BTBen Tan@bentan',
      'COCara Ong@cara.ong',
    ])
    expect(rows().every((r) => r.querySelector('[style*="--brand-casa-vostra"]'))).toBe(true)

    fireEvent.change(field, { target: { value: 'an' } })
    expect(rows().map((r) => r.textContent)).toEqual([
      'Ana Lee@ana.cooks',
      'BTBen Tan@bentan',
      'AFAnton Ferri@chefanton',
      'Use @an',
    ])
    expect(rows()[2]!.querySelector('[style*="--brand-"]')).toBeNull()

    fireEvent.change(field, { target: { value: 'nobody.here' } })
    expect(rows().map((r) => r.textContent)).toEqual(['Use @nobody.here'])
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(screen.getByRole('status')).toHaveTextContent('@nobody.here')
  })
})
