import type { Metadata } from 'next'

import { PLATFORMS } from '@/features/posted/model'
import { PostPage } from '@/features/publish/post-page'

export const metadata: Metadata = { title: 'Post · brand base' }

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ posted?: string }>
}) {
  const { id } = await params
  // Opened from Posted: back goes there, to the same platform.
  const { posted } = await searchParams
  return <PostPage id={id} posted={PLATFORMS.find((p) => p === posted)} />
}
