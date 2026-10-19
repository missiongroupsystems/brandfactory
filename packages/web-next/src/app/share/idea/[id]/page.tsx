import type { Metadata } from 'next'

import { GuestShare } from '@/features/share/guest-share'
import { SharedIdea } from '@/features/share/share-page'
import { remote } from '@/lib/remote'

export const metadata: Metadata = { title: 'Brief · brand base' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // With the server on, the id in the address is the link's token.
  return remote ? <GuestShare token={id} /> : <SharedIdea id={id} />
}
