import type { Metadata } from 'next'

import { RosterPage } from '@/features/roster/roster-page'

export const metadata: Metadata = { title: 'Creators · brand base' }

/** `?look=a|b|c`: the three layouts on the same roster, until the owner picks one. */
export default async function Page({ searchParams }: { searchParams: Promise<{ look?: string }> }) {
  const { look } = await searchParams
  return <RosterPage look={look === 'b' || look === 'c' ? look : 'a'} />
}
