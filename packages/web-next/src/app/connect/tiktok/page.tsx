import type { Metadata } from 'next'

import { TikTokReturn } from '@/features/connections/tiktok-return'

export const metadata: Metadata = { title: 'TikTok · brand base' }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string
    state?: string
    error?: string
    error_description?: string
  }>
}) {
  const { code, state, error, error_description } = await searchParams
  return (
    <TikTokReturn
      code={code ?? null}
      state={state ?? null}
      declined={!error ? null : error === 'access_denied' ? error : (error_description ?? error)}
    />
  )
}
