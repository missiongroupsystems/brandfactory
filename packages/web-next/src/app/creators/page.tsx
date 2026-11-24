import type { Metadata } from 'next'

import { RosterPage } from '@/features/roster/roster-page'

export const metadata: Metadata = { title: 'Creators · brand base' }

export default function Page() {
  return <RosterPage />
}
