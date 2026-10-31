import type { Metadata } from 'next'

import { InsightsPage } from '@/features/insights/insights-page'
import { fromAddress } from '@/features/insights/views'

export const metadata: Metadata = { title: 'Insights · brand base' }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; on?: string }>
}) {
  const { view, on } = await searchParams
  return <InsightsPage {...fromAddress(new URLSearchParams({ view: view ?? '', on: on ?? '' }))} />
}
