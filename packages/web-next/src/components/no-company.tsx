'use client'

import { sessionEmail } from '@/lib/remote'

/**
 * A signed-in person the core knows in no company: an account, and nothing to show yet. An admin
 * adds them; until then this page, and a way out.
 */
export function NoCompany({ onSignOut }: { onSignOut: () => void }) {
  const email = sessionEmail()
  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <div className="bb-rise flex w-full max-w-[320px] flex-col gap-3">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Not in a company yet</h1>
        <p className="text-[14px] leading-[1.5] text-ink-2">
          Ask an admin at your company to add <span className="text-ink">{email}</span>. Your brands
          show here once they do.
        </p>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-3 self-start text-[13px] text-ink-4 transition-colors hover:text-ink"
        >
          Sign out
        </button>
      </div>
    </main>
  )
}
