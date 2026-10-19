import type { Metadata } from 'next'

import { SignIn } from '@/components/sign-in'

export const metadata: Metadata = { title: 'Sign in · brand base' }

export default function Page() {
  return <SignIn />
}
