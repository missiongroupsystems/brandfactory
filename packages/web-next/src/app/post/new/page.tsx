import type { Metadata } from 'next'

import { PostPage } from '@/features/publish/post-page'
import { formatOfParam } from '@/features/publish/publishers'

export const metadata: Metadata = { title: 'New post · brand base' }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; time?: string; format?: string }>
}) {
  const { day, time, format } = await searchParams
  // `format=post|reel|story` starts the composer in that format, from the New menu.
  return <PostPage start={{ day, time, format: formatOfParam(format) }} />
}
