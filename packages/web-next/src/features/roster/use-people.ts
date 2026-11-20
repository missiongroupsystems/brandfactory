'use client'

import * as React from 'react'

import { BrandMark } from '@/components/brand-mark'
import { useCollaborators } from '@/features/publish/collaborators-store'

import { peopleFor } from './people'
import { recentOf } from './recent'
import { nameHandle, useOrgOf, useProfiles, useRoster } from './roster-store'

/**
 * The people a post's Collaborators and Tag people offer for the brand (`peopleFor`), and the way
 * to name an account no one on the roster holds, for the brand's company.
 */
export function usePeople(brandId: string) {
  const roster = useRoster()
  const saved = useCollaborators(brandId, 'ig')
  const org = useOrgOf()(brandId)
  const profiles = useProfiles()
  const names = new Map(profiles.filter((p) => p.orgId === org).map((p) => [p.handle, p]))
  return {
    ...peopleFor({ brandId, roster, saved, recent: recentOf(brandId), names }),
    rename: (handle: string, name: string | null) => org && nameHandle(org, handle, name),
    /** The brand's small logo at the end of a linked person's row. */
    mark: (id: string) => React.createElement(BrandMark, { brandId: id, size: 14 }),
  }
}
