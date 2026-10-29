import Link from 'next/link'

import { AppHeader } from '@/components/app-header'
import { TITLE } from '@/components/page-title'

// An address with no page, or the profile in the static demo: the header stays, a title at the
// page size, and one quiet way home.
export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 pb-32 text-center">
        <h1 className={TITLE}>No page here</h1>
        <Link
          href="/"
          className="text-[14px] text-ink-3 underline decoration-ink-5 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
        >
          Go to Schedule
        </Link>
      </main>
    </div>
  )
}
