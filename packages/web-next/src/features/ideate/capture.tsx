'use client'

import * as React from 'react'
import { loadBrand, remote, request } from '@/lib/remote'

/**
 * Instagram capture on the Ideas page (docs/executing/meta-capture-plan.md): a reel or a post
 * DM'd to the capture account lands under Shared, added by the sender's @handle.
 */

/** The capture account's handle, from the server; null while capture is off or unknown. */
let handle: string | null | undefined
const handleListeners = new Set<() => void>()
let asking: Promise<void> | null = null

function askHandle() {
  asking ??= request<{ handle: string | null }>('GET', '/capture')
    .then((r) => {
      handle = r.handle ? `@${r.handle.replace(/^@/, '')}` : null
    })
    .catch(() => {
      handle = null
    })
    .finally(() => handleListeners.forEach((l) => l()))
  return asking
}

/** The capture account's handle (`@name`), or null while there is none. */
export function useCaptureHandle(): string | null {
  const subscribe = React.useCallback((listener: () => void) => {
    handleListeners.add(listener)
    if (handle === undefined && remote) void askHandle()
    return () => handleListeners.delete(listener)
  }, [])
  return React.useSyncExternalStore(
    subscribe,
    () => handle ?? null,
    () => null,
  )
}

/** What lands by DM shows without a reload: the brand is read again every 10 s while in view. */
export function useSharedRefresh(brandId: string, on: boolean) {
  React.useEffect(() => {
    if (!remote || !on) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadBrand(brandId).catch(() => undefined)
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [brandId, on])
}

/**
 * One line under the paste field: where to share a reel or a post so it lands here. The sender
 * taps the brand in Instagram; nothing to set up first.
 */
export function CaptureLink() {
  const account = useCaptureHandle()
  if (!account) return null
  return (
    <p className="px-4 text-[12px] text-ink-4">
      Or share a reel or a post to <span className="font-medium text-ink-2">{account}</span> on
      Instagram.
    </p>
  )
}
