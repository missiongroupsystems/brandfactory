import type { Metadata } from 'next'

import { PostPage } from '@/features/publish/post-page'

export const metadata: Metadata = { title: 'Post · brand base' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PostPage id={id} />
}
