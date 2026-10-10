import type { Metadata } from 'next'

import { ShootPage } from '@/features/shoot/shoot-page'

export const metadata: Metadata = { title: 'Shoot · brand base' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ShootPage id={id} />
}
