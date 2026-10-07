import type { Metadata } from 'next'

import { InsightsPage } from '@/features/insights/insights-page'

export const metadata: Metadata = { title: 'Insights · brand base' }

export default function Page() {
  return <InsightsPage />
}
