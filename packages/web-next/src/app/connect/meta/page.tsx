import type { Metadata } from 'next'

import { MetaReturn } from '@/features/connections/meta-return'

export const metadata: Metadata = { title: 'Facebook · brand base' }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string
    state?: string
    error?: string
    error_reason?: string
    error_description?: string
  }>
}) {
  const { code, state, error, error_reason, error_description } = await searchParams
  return (
    <MetaReturn
      code={code ?? null}
      state={state ?? null}
      declined={
        !error
          ? null
          : error_reason === 'user_denied'
            ? 'Access was not allowed on Facebook.'
            : (error_description ?? error)
      }
    />
  )
}
