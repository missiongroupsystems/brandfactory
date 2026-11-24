import { describe, expect, it } from 'vitest'

import type { RosterPerson } from '@/data/roster'

import { filterHandles, filterRoster, followersOf, savedHandles, tagOf } from './model'

const person = (name: string, handle: string, brands: string[] = []): RosterPerson => ({
  id: name,
  orgId: 'co',
  slug: name.toLowerCase(),
  name,
  category: null,
  status: 'prospect',
  notes: '',
  accounts: [
    { platform: 'instagram', handle, followers: 10, engagement: null, url: null, picture: null },
  ],
  brands,
})

describe('the Creators page', () => {
  it('prints followers short', () => {
    expect([980, 1250, 12_600, 1_200_000, null].map(followersOf)).toEqual([
      '980',
      '1.3K',
      '13K',
      '1.2M',
      '',
    ])
  })

  it('lists each brand’s saved Instagram handles once per company, without the ones on the roster', () => {
    const handles = savedHandles(
      { casa: ['@Ana.Cooks', '@casanostrasg', '@bad handle'], temper: ['@casanostrasg', '@x.y'] },
      () => 'co',
      [person('Ana', 'ana.cooks')],
      [{ orgId: 'co', handle: 'casanostrasg', name: 'Casa Nostra', picture: null, followers: 5 }],
    )
    expect(handles).toEqual([
      {
        orgId: 'co',
        handle: 'casanostrasg',
        name: 'Casa Nostra',
        picture: null,
        followers: 5,
        brands: ['casa', 'temper'],
      },
      {
        orgId: 'co',
        handle: 'x.y',
        name: null,
        picture: null,
        followers: null,
        brands: ['temper'],
      },
    ])
    const all = { query: '', brand: 'all', status: 'all' as const }
    expect(filterHandles(handles, { ...all, query: 'nostra' }).map((h) => h.handle)).toEqual([
      'casanostrasg',
    ])
    expect(filterHandles(handles, { ...all, brand: 'casa' })).toHaveLength(1)
    // A saved handle has no status of its own: it counts as active, never as past.
    expect(filterHandles(handles, { ...all, status: 'active' })).toEqual(handles)
    expect(filterHandles(handles, { ...all, status: 'past' })).toEqual([])
  })

  it('finds a person by a word of the name or a handle, and filters by brand and status', () => {
    const people = [person('Lee Ann Ong', 'leeann.eats', ['casa']), person('Zoe', 'zoe.at.home')]
    const all = { query: '', brand: 'all', status: 'all' as const }
    // "ann" starts a word of Lee Ann Ong's name; "home" is inside Zoe's handle.
    expect(filterRoster(people, { ...all, query: 'ann' }).map((p) => p.name)).toEqual([
      'Lee Ann Ong',
    ])
    expect(filterRoster(people, { ...all, query: 'home' }).map((p) => p.name)).toEqual(['Zoe'])
    expect(filterRoster(people, { ...all, query: '@leeann' }).map((p) => p.name)).toEqual([
      'Lee Ann Ong',
    ])
    expect(filterRoster(people, { ...all, brand: 'casa' }).map((p) => p.name)).toEqual([
      'Lee Ann Ong',
    ])
    expect(filterRoster(people, { ...all, status: 'past' })).toEqual([])
    // A prospect from the old roster counts as active: the filter has Active and Past only.
    expect(filterRoster(people, { ...all, status: 'active' }).map((p) => p.status)).toContain(
      'prospect',
    )
  })

  it('finds a person by a word of a tag, from its start', () => {
    const ana = { ...person('Ana', 'ana.cooks'), tags: ['italian food', 'wine'] }
    const ben = person('Ben', 'bentan')
    const find = (query: string) =>
      filterRoster([ana, ben], { query, brand: 'all', status: 'all' }).map((p) => p.name)
    expect(find('ital')).toEqual(['Ana'])
    expect(find('food')).toEqual(['Ana'])
    expect(find('#Wine')).toEqual(['Ana'])
    expect(find('ood')).toEqual([])
    expect(find('ben')).toEqual(['Ben'])
  })

  it('spells a tag as the core keeps it', () => {
    expect(tagOf(' #Italian   Food ')).toBe('italian food')
    expect(tagOf("mum's & kids")).toBe("mum's & kids")
    expect(tagOf('!!')).toBeNull()
    expect(tagOf('x'.repeat(31))).toBeNull()
    expect(tagOf('   ')).toBeNull()
  })
})
