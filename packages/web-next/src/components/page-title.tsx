'use client'

import * as React from 'react'

/** The one size a page's title has: 34px on a desktop, 28px on a phone. */
export const TITLE = 'font-display text-[34px] leading-none tracking-[-0.03em] max-md:text-[28px]'

/** The one style a section's heading has, on every page. */
export const SECTION =
  'font-display text-[16px] leading-tight font-medium tracking-[-0.01em] text-ink'

/** The column every reading page sits in; its left edge is where every title starts. */
export const PAGE = 'mx-auto w-full max-w-[1120px] px-10 max-md:px-4'

/**
 * A page's title row: the h1 at the shared size, and at its end the page's one action. A page the
 * tab bar has no tab for (Brand kit, Connections) is left by the tab bar or the avatar menu, so
 * every title starts at the same height.
 */
export function PageTitle({
  title,
  actions,
}: {
  title: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 pt-6 pb-6 max-md:pt-2 max-md:pb-4">
      <div className="flex min-h-9 items-center justify-between gap-x-4 gap-y-3 max-md:flex-wrap">
        <h1 className={`min-w-0 truncate ${TITLE}`}>{title}</h1>
        {actions}
      </div>
    </div>
  )
}
