import { redirect } from 'next/navigation'

import { fromAddress, insightsUrl } from '@/features/insights/views'

/** Insights became Feed (2.50.0): an old link lands on the same view and platform, and no more. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; on?: string }>
}) {
  const { view, on } = await searchParams
  const named = fromAddress(new URLSearchParams({ view: view ?? '', on: on ?? '' }))
  redirect(insightsUrl(named.view ?? 'feed', named.on))
}
