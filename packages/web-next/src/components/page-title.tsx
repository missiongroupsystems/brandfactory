'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'

import { cameFromApp } from './path-trail'

/** The one size a page's title has: 34px on a desktop, 28px on a phone. */
export const TITLE = 'font-display text-[34px] leading-none tracking-[-0.03em] max-md:text-[28px]'

/** The column every reading page sits in; its left edge is where every title starts. */
export const PAGE = 'mx-auto w-full max-w-[1120px] px-10 max-md:px-4'

/**
 * A page's title row: the h1 at the shared size, and at its end the page's one action. On a
 * phone a page the tab bar has no tab for (Brand kit, Connections) shows a way back above it.
 */
export function PageTitle({
  title,
  actions,
  back,
}: {
  title: React.ReactNode
  actions?: React.ReactNode
  back?: boolean
}) {
  const router = useRouter()
  return (
    <div className="flex flex-col gap-3 pt-6 pb-6 max-md:pt-2 max-md:pb-4">
      {back && (
        <button
          type="button"
          onClick={() => (cameFromApp() ? router.back() : router.push('/'))}
          className="-ml-1 flex h-8 w-fit items-center gap-1.5 rounded-full px-1 text-[13px] text-ink-3 transition-colors hover:text-ink md:hidden"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M9.5 6h-7M5.5 3l-3 3 3 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back
        </button>
      )}
      <div className="flex min-h-9 items-center justify-between gap-x-4 gap-y-3 max-md:flex-wrap">
        <h1 className={`min-w-0 truncate ${TITLE}`}>{title}</h1>
        {actions}
      </div>
    </div>
  )
}
