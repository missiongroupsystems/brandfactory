import type { Metadata } from 'next'

import { BubblesPage } from '@/features/bubbles/bubbles-page'

export const metadata: Metadata = { title: 'Bubbles · brand base' }

export default function Page() {
  return <BubblesPage />
}
