'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { BRAND } from '@/data/demo'
import { useWaiting } from '@/features/inbox/inbox-store'
import { useBrand } from '@/features/schedule/posts-store'

import { BrandSwitcher } from './brand-switcher'
import { LogoMark } from './icons'

const NAV = [
  { href: '/', label: 'Schedule' },
  { href: '/ideate', label: 'Ideate' },
  { href: '/insights', label: 'Insights' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/bubbles', label: 'Bubbles' },
] as const

export function AppHeader() {
  const pathname = usePathname()
  const { brand } = useBrand()
  const waiting = useWaiting(brand.id)
  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-10 py-[22px] max-md:px-4 max-md:py-3">
      <Link
        href="/"
        aria-label="brand base"
        className="flex items-center gap-2 justify-self-start text-ink"
      >
        <LogoMark />
        <span className="text-[17px] font-semibold tracking-[-0.03em] max-[400px]:hidden">
          brand base
        </span>
      </Link>
      {/* A phone has the tab bar at the bottom instead. */}
      <nav aria-label="Main" className="flex gap-7 max-md:hidden">
        {NAV.map((n) => {
          // A post's own page belongs to Schedule.
          const current =
            n.href === '/'
              ? pathname === '/' || pathname.startsWith('/post')
              : pathname.startsWith(n.href)
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={current ? 'page' : undefined}
              className={`text-sm transition-colors ${current ? 'font-medium text-ink' : 'text-ink-4 hover:text-ink'}`}
            >
              {n.label}
              {/* Inbox counts what still needs a reply, quietly. */}
              {n.href === '/inbox' && waiting > 0 && (
                <span className="ml-1.5 text-[11px] text-ink-4 tabular-nums">{waiting}</span>
              )}
            </Link>
          )
        })}
      </nav>
      <div className="col-start-3 flex items-center gap-2.5 justify-self-end">
        <BrandSwitcher />
        <span
          aria-label="You"
          className="flex size-9 items-center justify-center rounded-full text-xs font-semibold"
          style={{ background: 'var(--avatar)', color: 'var(--avatar-ink)' }}
        >
          {BRAND.user}
        </span>
      </div>
    </header>
  )
}
