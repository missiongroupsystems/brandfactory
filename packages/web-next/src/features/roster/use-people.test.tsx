import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { DEMO_ROSTER } from '@/data/roster'

import { resetRoster, useProfiles, useRoster } from './roster-store'
import { usePeople } from './use-people'

const fields = (brandId: string) =>
  renderHook(() => ({ api: usePeople(brandId), roster: useRoster(), profiles: useProfiles() }))

describe('the people fields in the demo', () => {
  beforeEach(() => resetRoster())

  it('fixes a roster person’s own name from a row, and keeps it when the field is emptied', () => {
    const { result } = fields('casa-vostra')
    const aiko = () => result.current.roster.find((p) => p.slug === 'aiko-tan')
    act(() => result.current.api.rename('aikoeats', 'Aiko T.'))
    expect(aiko()?.name).toBe('Aiko T.')
    act(() => result.current.api.rename('aikoeats', null))
    expect(aiko()?.name).toBe('Aiko T.')
    expect(result.current.profiles).toEqual([])
  })

  it('names a handle no one on the roster holds for the company', () => {
    const { result } = fields('casa-vostra')
    act(() => result.current.api.rename('@CasaNostraSG', 'Casa Nostra'))
    expect(result.current.profiles).toEqual([
      {
        orgId: 'demo',
        handle: 'casanostrasg',
        name: 'Casa Nostra',
        picture: null,
        followers: null,
      },
    ])
  })

  it('offers only the people of the brand’s own company', () => {
    const other = {
      ...DEMO_ROSTER[0]!,
      id: 'other-1',
      orgId: 'other-company',
      slug: 'other',
      name: 'Other Company Person',
      accounts: [{ ...DEMO_ROSTER[0]!.accounts[0]!, handle: 'othercompany.person' }],
      brands: [],
    }
    resetRoster([...DEMO_ROSTER, other])
    const { result } = fields('casa-vostra')
    expect(result.current.api.all.some((r) => r.value === '@othercompany.person')).toBe(false)
    expect(result.current.api.all.length).toBeGreaterThan(0)
  })
})
