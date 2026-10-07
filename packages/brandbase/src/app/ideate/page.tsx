import type { Metadata } from 'next'

import { IdeatePage } from '@/features/ideate/ideate-page'

export const metadata: Metadata = { title: 'Ideas · brand base' }

export default function Page() {
  return <IdeatePage />
}
