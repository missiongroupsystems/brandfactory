'use client'

import * as React from 'react'
import { PlatformLogo } from '@/components/platform-logos'
import { loadBrand, remote, request } from '@/lib/remote'

/**
 * Instagram capture on the Ideas page (docs/executing/meta-capture-plan.md): a reel or a post
 * DM'd to the capture account lands under Shared. Linking is once per person: the page shows a
 * code, the person DMs `LINK <code>` to the account, and the account answers "Linked to <name>".
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

interface Code {
  code: string
  expiresAt: string
}

/** "9:41" until the time, or null once it has passed. */
function left(until: string, now: number) {
  const s = Math.floor((Date.parse(until) - now) / 1000)
  if (s <= 0) return null
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * One line under the paste field: where to share, and "Add from Instagram" for a person who has
 * not linked their Instagram yet. Pressed, it shows a code for ten minutes.
 */
export function CaptureLink() {
  const account = useCaptureHandle()
  const [code, setCode] = React.useState<Code | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    if (!code) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [code])

  if (!account) return null
  const remaining = code ? left(code.expiresAt, now) : null

  async function make() {
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      setCode(await request<Code>('POST', '/capture/code'))
      setNow(Date.now())
      setCopied(false)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      /* the code stays on screen to type */
    }
  }

  if (code && remaining) {
    const message = `LINK ${code.code}`
    return (
      <div
        role="region"
        aria-label="Add from Instagram"
        className="bb-pop flex flex-col gap-3 rounded-[18px] bg-surface p-5"
      >
        <span className="flex items-center gap-2 text-[13px] text-ink-2">
          <PlatformLogo platform="ig" size={13} brand />
          DM this to <span className="font-medium text-ink">{account}</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="font-mono text-[22px] tracking-[0.06em] text-ink tabular-nums select-all">
            {message}
          </span>
          <button
            type="button"
            onClick={() => void copy(message)}
            className="bb-press ml-auto flex h-8 items-center rounded-full bg-page px-3.5 text-[12.5px] font-medium text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-paper"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </span>
        <span className="text-[12px] text-ink-4">
          Expires in <span className="tabular-nums">{remaining}</span>. Then share any reel or post
          to {account}.
        </span>
      </div>
    )
  }

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-4 text-[12px] text-ink-4">
      <span>
        Or share a post to <span className="font-medium text-ink-2">{account}</span>.
      </span>
      <button
        type="button"
        onClick={() => void make()}
        disabled={busy}
        className="font-medium text-ink underline decoration-ink-5 underline-offset-[3px] hover:decoration-ink disabled:opacity-50"
      >
        {code ? 'New code' : 'Add from Instagram'}
      </button>
      {failed && <span className="text-ink-3">Try again in a moment.</span>}
    </p>
  )
}
