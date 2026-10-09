import type { Metadata } from 'next'

import { IdeaPage } from '@/features/ideate/idea-page'

export const metadata: Metadata = { title: 'Idea · brand base' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <IdeaPage id={id} />
}
