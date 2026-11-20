import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

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
})
