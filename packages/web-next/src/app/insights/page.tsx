import type { Metadata } from 'next'

import { InsightsPage } from '@/features/insights/insights-page'
import { INSIGHTS_VIEWS } from '@/features/insights/views'
import { PLATFORMS } from '@/features/posted/model'

export const metadata: Metadata = { title: 'Insights · brand base' }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; on?: string }>
}) {
  const { view, on } = await searchParams
  return (
    // Keyed by the address, so a link to another view (the nav, a post's way back) opens it.
    <InsightsPage
      key={`${view}-${on}`}
      view={INSIGHTS_VIEWS.find((v) => v === view)}
      on={PLATFORMS.find((p) => p === on)}
    />
  )
}
