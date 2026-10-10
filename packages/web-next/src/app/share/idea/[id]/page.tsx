import type { Metadata } from 'next'

import { SharedIdea } from '@/features/share/share-page'

export const metadata: Metadata = { title: 'Brief · brand base' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <SharedIdea id={id} />
}
