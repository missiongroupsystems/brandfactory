import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ProfilePage } from '@/features/account/profile-page'
import { remote } from '@/lib/remote'

export const metadata: Metadata = { title: 'Profile · brand base' }

// The static demo has no account to edit.
export default function Page() {
  if (!remote) notFound()
  return <ProfilePage />
}
