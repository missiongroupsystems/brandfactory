import type { Metadata } from 'next'

import { PLATFORMS } from '@/features/posted/model'
import { PostedPage } from '@/features/posted/posted-page'

export const metadata: Metadata = { title: 'Posted · brand base' }

export default async function Page({ searchParams }: { searchParams: Promise<{ on?: string }> }) {
  const { on } = await searchParams
  return <PostedPage on={PLATFORMS.find((p) => p === on)} />
}
