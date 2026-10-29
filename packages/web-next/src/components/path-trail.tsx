'use client'

import { usePathname } from 'next/navigation'
import * as React from 'react'

// The page shown before this one in this tab, inside the app; null after a full load.
let last: string | null = null
let previous: string | null = null

/** Whether the page before this one was in the app, so a Back link can go back, not away. */
export function cameFromApp(): boolean {
  return previous !== null
}

/**
 * The page before `current` in the app, so a Back link can say where it goes; null after a full
 * load. Read during a render, before the trail below has noted the new page, the last page noted
 * is the one before.
 */
export function previousPath(current: string): string | null {
  return last !== null && last !== current ? last : previous
}

/** Notes each page the app shows. Mounted once, in the root layout. */
export function PathTrail() {
  const pathname = usePathname()
  React.useEffect(() => {
    if (pathname === last) return
    previous = last
    last = pathname
  }, [pathname])
  return null
}
