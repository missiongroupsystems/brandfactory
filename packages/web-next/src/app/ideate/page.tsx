import type { Metadata } from 'next'

import { IdeatePage } from '@/features/ideate/ideate-page'

export const metadata: Metadata = { title: 'Ideas · brand base' }

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams
  return <IdeatePage view={view === 'ideas' ? 'ideas' : undefined} />
}
