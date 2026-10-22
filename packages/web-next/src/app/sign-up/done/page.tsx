import type { Metadata } from 'next'

import { SignUpDone } from '@/components/sign-up-done'

export const metadata: Metadata = { title: 'Signing in · brand base' }

export default function Page() {
  return <SignUpDone />
}
