'use client'

import * as React from 'react'

import { BrandMark } from '@/components/brand-mark'
import { useCollaborators } from '@/features/publish/collaborators-store'

import { peopleFor, personOfHandle } from './people'
import { recentOf } from './recent'
import { editPerson, nameHandle, useOrgOf, useProfiles, useRoster } from './roster-store'

/**
 * The people a post's Collaborators and Tag people offer for the brand (`peopleFor`), and the way
 * to fix a row's name. A person is linked to the brand by the brand's posts that name them (the
 * core derives it: `influencer.list`), so a pick links nothing here.
 */
export function usePeople(brandId: string) {
  const everyone = useRoster()
  const saved = useCollaborators(brandId, 'ig')
  const org = useOrgOf()(brandId)
  // The brand's own company's people only: a picked name or a fixed one is that company's.
  const roster = everyone.filter((p) => p.orgId === org)
  const profiles = useProfiles()
  const names = new Map(profiles.filter((p) => p.orgId === org).map((p) => [p.handle, p]))
  return {
    ...peopleFor({ brandId, roster, saved, recent: recentOf(brandId), names }),
    /**
     * Fixes the name a row shows: a roster person's own name (which cannot be empty), else the
     * saved account's, for the company.
     */
    rename: (handle: string, name: string | null) => {
      const person = personOfHandle(roster, org, handle)
      if (person) {
        if (name) editPerson(person.id, { name })
      } else if (org) nameHandle(org, handle, name)
    },
    /** The brand's small logo at the end of a linked person's row. */
    mark: (id: string) => React.createElement(BrandMark, { brandId: id, size: 14 }),
  }
}
