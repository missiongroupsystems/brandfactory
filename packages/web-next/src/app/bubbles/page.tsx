import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { BubblesPage } from '@/features/bubbles/bubbles-page'

export const metadata: Metadata = { title: 'Bubbles · brand base' }

// With no Bubbles address there is nothing to chat with: the address leads home, not to a dead end.
export default function Page() {
  // The same address the chat reads (`BUBBLES_URL` in features/bubbles/client.ts).
  if (!process.env.NEXT_PUBLIC_BUBBLES_URL) redirect('/')
  return <BubblesPage />
}
