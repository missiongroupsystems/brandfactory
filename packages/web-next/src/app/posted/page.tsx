import { redirect } from 'next/navigation'

import { insightsUrl } from '@/features/insights/views'
import { PLATFORMS } from '@/features/posted/model'

/** Posted became the Feed view of Insights (2.48.0): an old link lands there, on its platform. */
export default async function Page({ searchParams }: { searchParams: Promise<{ on?: string }> }) {
  const { on } = await searchParams
  redirect(
    insightsUrl(
      'feed',
      PLATFORMS.find((p) => p === on),
    ),
  )
}
