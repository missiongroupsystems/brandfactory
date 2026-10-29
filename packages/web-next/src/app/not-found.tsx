import Link from 'next/link'

import { AppHeader } from '@/components/app-header'

// An address with no page, or the profile in the static demo: the header stays, and one way home.
export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-5 px-4 pb-32 text-center">
        <h1 className="text-[15px] font-normal text-ink-2">There is no page here.</h1>
        <Link
          href="/"
          className="bb-press flex h-10 items-center rounded-full bg-ink px-5 text-[14px] font-medium text-page"
        >
          Go to Schedule
        </Link>
      </main>
    </div>
  )
}
