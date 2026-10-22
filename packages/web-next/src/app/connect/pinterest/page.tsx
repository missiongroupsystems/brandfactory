import type { Metadata } from 'next'

import { PinterestReturn } from '@/features/ideate/pinterest-return'

export const metadata: Metadata = { title: 'Pinterest · brand base' }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string }>
}) {
  const { code, state } = await searchParams
  return <PinterestReturn code={code ?? null} state={state ?? null} />
}
