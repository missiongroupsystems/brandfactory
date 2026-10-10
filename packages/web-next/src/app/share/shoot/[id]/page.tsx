import type { Metadata } from 'next'

import { SharedShoot } from '@/features/share/share-page'

export const metadata: Metadata = { title: 'Call sheet · brand base' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <SharedShoot id={id} />
}
