import type { Metadata } from 'next'
import Link from 'next/link'

import { AppHeader } from '@/components/app-header'

export const metadata: Metadata = { title: 'Not found · brand base' }

/** An address with no page: the app's own header, one line, and the way back to the calendar. */
export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[760px] flex-col items-start gap-4 px-4 pt-6 pb-24">
        <h1 className="font-display text-[56px] leading-none tracking-[-0.035em] max-md:text-[34px]">
          Not found
        </h1>
        <p className="text-[15px] text-ink-3">There is no page at this address.</p>
        <Link
          href="/"
          className="flex h-9 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-page hover:opacity-85"
        >
          Back to Schedule
        </Link>
      </main>
    </div>
  )
}
