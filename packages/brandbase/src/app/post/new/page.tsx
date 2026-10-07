import type { Metadata } from 'next'

import { PostPage } from '@/features/publish/post-page'

export const metadata: Metadata = { title: 'New post · brand base' }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; time?: string; format?: string }>
}) {
  const { day, time, format } = await searchParams
  return <PostPage start={{ day, time, format: format === 'story' ? 'story' : undefined }} />
}
