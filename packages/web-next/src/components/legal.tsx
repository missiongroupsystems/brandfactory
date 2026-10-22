import Link from 'next/link'
import type * as React from 'react'

/** The pages anyone may open with no sign-in, also on the core. */
export const PUBLIC_PATHS = ['/sign-in', '/terms', '/privacy']

/** The address for questions about these pages and the data brand base keeps. */
export const CONTACT = 'tech@ebbflowgroup.com'

/** A plain page of text in the sign-in page's type: the terms and the privacy policy. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[600px] flex-col gap-8 px-4 py-16 max-md:py-10">
      <header className="flex flex-col gap-3">
        <Link href="/sign-in" className="text-[15px] font-semibold tracking-[-0.02em]">
          brand base
        </Link>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
        <p className="text-[13px] text-ink-3">Last updated 22 October 2026</p>
      </header>
      <div className="flex flex-col gap-6 text-[14.5px] leading-[1.6] text-ink-2 [&_h2]:mb-1.5 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-4 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
        {children}
      </div>
      <footer className="flex gap-4 border-t border-line pt-6 text-[13px] text-ink-3">
        <Link href="/terms" className="hover:text-ink">
          Terms
        </Link>
        <Link href="/privacy" className="hover:text-ink">
          Privacy
        </Link>
        <Link href="/sign-in" className="hover:text-ink">
          Sign in
        </Link>
      </footer>
    </main>
  )
}

export function Mail() {
  return (
    <a
      href={`mailto:${CONTACT}`}
      className="text-ink underline decoration-ink-5 underline-offset-4"
    >
      {CONTACT}
    </a>
  )
}
