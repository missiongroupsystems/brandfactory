'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import type { ConnectionStatus } from '@/data/connections'
import { useBrand } from '@/features/schedule/posts-store'
import { remote } from '@/lib/remote'

import { ConnectSheet, SOURCES, SourceMark } from './connect-sheet'
import {
  connect,
  disconnect,
  useAccountName,
  useConnections,
  type SourceKey,
} from './connections-store'

const EYEBROW = 'font-mono text-[10.5px] tracking-[0.08em] text-ink-4 uppercase'
/** How long a disconnected row's line takes to step out before the new one steps in. */
const LEAVE_MS = 180

/** The sources by the job they do, in the order a week uses them. */
const GROUPS: Array<{ label: string; keys: SourceKey[] }> = [
  { label: 'Publishing', keys: ['ig', 'tt', 'fb'] },
  { label: 'Moodboard', keys: ['pinterest'] },
  { label: 'Files and calendar', keys: ['drive', 'lark'] },
  { label: 'Insights', keys: ['web', 'gbp', 'res'] },
]

/**
 * The Connections page (`/brand/connections`): every account and tool the brand in the header
 * has linked, in one list. Each row says what it is linked as and whether it works; one action
 * fixes it. What changes here, the composer, the Drive picker, the call sheet and the moodboard
 * read. Simulated: a Connect is a pretend sign-in (`ConnectSheet`).
 */
export function ConnectionsPage() {
  const { brand } = useBrand()
  const status = useConnections(brand.id)
  const [connecting, setConnecting] = React.useState<SourceKey | null>(null)
  const router = useRouter()

  // On the API, Pinterest is a board to pick, which the moodboard does, and Instagram, Facebook
  // and TikTok are real sign-ins that leave for the platform.
  function open(key: SourceKey) {
    if (remote && key === 'pinterest') router.push('/ideate')
    else if (remote && (key === 'ig' || key === 'fb' || key === 'tt')) connect(brand.id, key)
    else setConnecting(key)
  }

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main
        key={brand.id}
        className="bb-swap mx-auto flex w-full max-w-[640px] flex-col gap-10 px-4 pb-24 max-md:gap-8"
      >
        <h1 className="pt-6 font-display text-[56px] leading-none tracking-[-0.035em] max-md:pt-2 max-md:text-[34px]">
          Connections
        </h1>

        {GROUPS.map((g) => (
          <section key={g.label} aria-label={g.label} className="flex flex-col gap-3">
            <h2 className={`${EYEBROW} px-1`}>{g.label}</h2>
            <ul className="flex flex-col rounded-[18px] bg-page shadow-[0_0_0_1px_var(--line)]">
              {g.keys.map((key) => (
                <Row key={key} source={key} status={status[key]} onConnect={() => open(key)} />
              ))}
            </ul>
          </section>
        ))}
      </main>
      {connecting && <ConnectSheet source={connecting} onClose={() => setConnecting(null)} />}
    </div>
  )
}

function Row({
  source,
  status,
  onConnect,
}: {
  source: SourceKey
  status: ConnectionStatus
  onConnect: () => void
}) {
  const { brand } = useBrand()
  const info = SOURCES[source]
  const name = useAccountName(brand.id, source)
  // A change made on this page plays: the old line steps out, the new one steps in. The first
  // draw and a brand switch stay still.
  const [shown, setShown] = React.useState(status)
  const [changed, setChanged] = React.useState(false)
  const [leaving, setLeaving] = React.useState(false)
  if (shown !== status) {
    setShown(status)
    setChanged(true)
  }

  function leave() {
    setLeaving(true)
    window.setTimeout(() => {
      setLeaving(false)
      disconnect(brand.id, source)
    }, LEAVE_MS)
  }

  return (
    <li className="flex items-center gap-3.5 border-t border-line px-4 py-3.5 first:border-t-0 max-md:gap-3 max-md:px-3.5">
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-surface transition-colors duration-300 ${status === 'off' || leaving ? 'text-ink-4' : 'text-ink'}`}
      >
        <SourceMark source={source} size={16} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[14.5px] font-medium">{info.name}</span>
        <span
          key={status}
          style={{ '--y': leaving ? '-4px' : '4px' } as React.CSSProperties}
          className={`flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-4 ${leaving ? 'bb-step-out' : changed ? 'bb-step' : ''}`}
        >
          {status !== 'off' && (
            <span
              aria-hidden="true"
              className={`size-1.5 shrink-0 rounded-full ${status === 'connected' ? 'bg-(--live)' : 'bg-fail'}`}
            />
          )}
          <span className={`truncate ${status === 'attention' ? 'text-fail-ink' : ''}`}>
            {status === 'off'
              ? info.brings
              : status === 'attention'
                ? 'Signed out · sign in again'
                : (name ?? info.account(brand))}
          </span>
        </span>
      </span>
      {status === 'connected' ? (
        <RowMenu
          name={info.name}
          onReconnect={onConnect}
          onDisconnect={leave}
          // On the API, Instagram and Facebook are one Page on Meta.
          disconnectLabel={
            remote && (source === 'ig' || source === 'fb')
              ? 'Disconnect Instagram and Facebook'
              : undefined
          }
        />
      ) : (
        <button
          key={status}
          type="button"
          aria-label={`${status === 'off' ? 'Connect' : 'Reconnect'} ${info.name}`}
          onClick={onConnect}
          className={`bb-press h-8 shrink-0 rounded-full px-3.5 text-[12.5px] font-medium transition-colors ${status === 'off' ? 'bg-surface text-ink hover:bg-paper' : 'bg-ink text-page hover:opacity-85'} ${changed ? 'bb-fade' : ''}`}
        >
          {status === 'off' ? 'Connect' : 'Reconnect'}
        </button>
      )}
    </li>
  )
}

/** Reconnect or disconnect: kept behind one quiet button, since nobody does them often. */
function RowMenu({
  name,
  onReconnect,
  onDisconnect,
  disconnectLabel = 'Disconnect',
}: {
  name: string
  onReconnect: () => void
  onDisconnect: () => void
  /** Says when Disconnect takes more than this row with it. */
  disconnectLabel?: string
}) {
  const [open, setOpen] = React.useState(false)
  const root = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const item = (label: string, act: () => void, danger = false) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false)
        act()
      }}
      className={`rounded-[8px] px-2.5 py-[7px] text-left text-[13.5px] transition-colors hover:bg-surface-2 ${danger ? 'text-fail-ink' : 'text-ink'}`}
    >
      {label}
    </button>
  )

  return (
    <div ref={root} className="relative -mr-1.5">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More for ${name}`}
        onClick={() => setOpen((o) => !o)}
        className={`flex size-9 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-surface hover:text-ink ${open ? 'bg-surface text-ink' : ''}`}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="currentColor">
          <circle cx="2.5" cy="7" r="1.3" />
          <circle cx="7" cy="7" r="1.3" />
          <circle cx="11.5" cy="7" r="1.3" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          aria-label={`${name} actions`}
          className="bb-menu absolute top-10 right-0 z-30 flex w-max min-w-[160px] origin-top-right flex-col rounded-[12px] bg-page p-1.5 shadow-pop"
        >
          {item('Reconnect', onReconnect)}
          {item(disconnectLabel, onDisconnect, true)}
        </div>
      )}
    </div>
  )
}
