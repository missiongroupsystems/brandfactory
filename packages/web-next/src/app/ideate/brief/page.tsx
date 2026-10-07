import type { Metadata } from 'next'

import { ShootBrief } from '@/features/ideate/shoot-brief'

export const metadata: Metadata = { title: 'Shoot brief · brand base' }

export default function Page() {
  return <ShootBrief />
}
