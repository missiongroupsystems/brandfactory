'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/', label: 'Schedule', icon: <CalendarGlyph /> },
  { href: '/ideate', label: 'Ideate', icon: <IdeaGlyph /> },
  { href: '/insights', label: 'Insights', icon: <ChartGlyph /> },
] as const

/**
 * A phone's navigation, at the bottom where a thumb reaches it: the three pages. The header keeps
 * the brand; Schedule has its own new-post button. A post's own page is a task, so it hides the bar and
 * keeps its own back link and send buttons.
 */
export function TabBar() {
  const pathname = usePathname()
  if (pathname.startsWith('/post')) return null
  const current = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))
  const tab = (t: (typeof TABS)[number]) => (
    <Link
      key={t.href}
      href={t.href}
      aria-current={current(t.href) ? 'page' : undefined}
      className={`flex flex-1 flex-col items-center gap-1 pt-2 text-[10.5px] font-medium transition-colors ${current(t.href) ? 'text-ink' : 'text-ink-4'}`}
    >
      {t.icon}
      {t.label}
    </Link>
  )
  return (
    <>
      {/* Room at the end of the page, so the bar never covers its last row. */}
      <div aria-hidden="true" className="h-[calc(64px+env(safe-area-inset-bottom))] md:hidden" />
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex items-start border-t border-line bg-page/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden print:hidden"
      >
        <div className="flex h-[60px] w-full items-start">{TABS.map(tab)}</div>
      </nav>
    </>
  )
}

function CalendarGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect
        x="3.5"
        y="4.5"
        width="15"
        height="14"
        rx="3.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M3.5 9h15M7.5 2.8v3M14.5 2.8v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IdeaGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path
        d="M11 3.2l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M17 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" fill="currentColor" />
    </svg>
  )
}

function ChartGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path
        d="M4.5 18.5v-5M9.5 18.5V8.5M14.5 18.5v-7M19 18.5V4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}
