import type { Metadata } from 'next'

import { AccountReturn } from '@/features/connections/account-return'

export const metadata: Metadata = { title: 'TikTok · brand base' }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string }>
}) {
  const { code, state } = await searchParams
  return <AccountReturn platform="tiktok" code={code ?? null} state={state ?? null} />
}
