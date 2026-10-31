'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { BUBBLES_URL } from '@/features/bubbles/client'
import { useWaiting } from '@/features/inbox/inbox-store'
import { useBrand } from '@/features/schedule/posts-store'

import { AccountMenu } from './account-menu'
import { BrandSwitcher } from './brand-switcher'
import { LogoMark } from './icons'

const NAV = [
  { href: '/', label: 'Schedule' },
  { href: '/ideate', label: 'Ideas' },
  { href: '/insights', label: 'Feed' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/bubbles', label: 'Bubbles' },
] as const
// Bubbles has a link only where it is connected.
const SHOWN = NAV.filter((n) => n.href !== '/bubbles' || BUBBLES_URL)

/**
 * `section` names the page's section where its address alone does not: a post opened from the
 * feed belongs to Insights. `tinted` matches the header to a page on the grey surface.
 */
export function AppHeader({
  section,
  tinted,
}: { section?: (typeof NAV)[number]['href']; tinted?: boolean } = {}) {
  const pathname = usePathname()
  const { brand } = useBrand()
  const waiting = useWaiting(brand.id)
  return (
    <header
      className={`grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-10 py-[22px] max-md:px-4 max-md:py-3 md:sticky md:top-0 md:z-40 md:backdrop-blur-xl ${tinted ? 'md:bg-surface-2/90' : 'md:bg-page/90'}`}
    >
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
        {SHOWN.map((n) => {
          // A post's own page belongs to Schedule, unless its page names another section.
          const current = section
            ? n.href === section
            : n.href === '/'
              ? pathname === '/' || pathname.startsWith('/post/')
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
        <AccountMenu />
      </div>
    </header>
  )
}
