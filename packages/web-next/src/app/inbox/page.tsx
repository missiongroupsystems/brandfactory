import type { Metadata } from 'next'

import { InboxPage } from '@/features/inbox/inbox-page'

export const metadata: Metadata = { title: 'Inbox · brand base' }

export default function Page() {
  return <InboxPage />
}
