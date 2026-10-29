'use client'

import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import type { ConnectionStatus } from '@/data/connections'
import { useBrand } from '@/features/schedule/posts-store'
import { remote, report } from '@/lib/remote'

import { TikTokPicture } from '@/features/publish/tiktok-inbox'

import { ConnectSheet, SOURCES, SourceMark } from './connect-sheet'
import {
  connect,
  disconnect,
  useAccountName,
  useConnections,
  type SourceKey,
} from './connections-store'
import { makeOn, type MakeKey, unlinkMake, useMakeAccount } from './make'
import { MakeSheet } from './make-sheet'
import { NotAvailable, notAvailable, reasonOf } from './not-available'
import { connectTikTok, disconnectTikTok, tiktokOn, useTikTokAccount } from './tiktok'

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
 * read. Simulated: a Connect is a pretend sign-in (`ConnectSheet`), except Pinterest on the core,
 * which leaves for Pinterest's own sign-in and comes back to the moodboard to pick the board, and
 * TikTok on the core once the server has its app, which leaves for TikTok's sign-in (upload only:
 * `tiktok.ts`) and comes back here, and Instagram and Facebook on the core once the server posts
 * through Make, which take the account's id and name in a small sheet (`make.ts`).
 */
export function ConnectionsPage() {
  const { brand } = useBrand()
  const status = useConnections(brand.id)
  const [connecting, setConnecting] = React.useState<SourceKey | null>(null)
  const [making, setMaking] = React.useState<MakeKey | null>(null)

  function open(key: SourceKey) {
    if (makeOn(key)) setMaking(key)
    else if (remote && key === 'pinterest') connect(brand.id, key)
    else if (key === 'tt' && tiktokOn()) {
      // A real sign-in: the browser leaves for TikTok and comes back to `/connect/tiktok`.
      connectTikTok(brand.id).catch((err: unknown) =>
        report(err instanceof Error && err.message ? err.message : 'That did not work.'),
      )
    } else setConnecting(key)
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
          // Each row says what it brings: the group is named for a screen reader only.
          <section key={g.label} aria-label={g.label} className="flex flex-col gap-3">
            <ul className="flex flex-col rounded-[18px] bg-page shadow-[0_0_0_1px_var(--line)]">
              {g.keys.map((key) => (
                <Row key={key} source={key} status={status[key]} onConnect={() => open(key)} />
              ))}
            </ul>
          </section>
        ))}
      </main>
      {connecting && <ConnectSheet source={connecting} onClose={() => setConnecting(null)} />}
      {making && <Making source={making} onClose={() => setMaking(null)} />}
    </div>
  )
}

function Row({
  source,
  status: stored,
  onConnect,
}: {
  source: SourceKey
  status: ConnectionStatus
  onConnect: () => void
}) {
  const { brand } = useBrand()
  const info = SOURCES[source]
  const linkedName = useAccountName(brand.id, source)
  // TikTok on the core, once the server has its app: the brand's own account, upload only.
  const tiktok = source === 'tt' && tiktokOn()
  const account = useTikTokAccount(brand.id)
  // Instagram and Facebook through Make: the id and name an owner or admin typed.
  const make = makeOn(source)
  const linked = useMakeAccount(brand.id, source === 'fb' ? 'fb' : 'ig')
  const status: ConnectionStatus = tiktok
    ? account
      ? 'connected'
      : 'off'
    : make
      ? linked
        ? 'connected'
        : 'off'
      : stored
  const name = tiktok ? (account?.name ?? null) : make ? (linked?.name ?? null) : linkedName
  return (
    <li className="flex items-center gap-3.5 border-t border-line px-4 py-3.5 first:border-t-0 max-md:gap-3 max-md:px-3.5">
      <span
        className={`relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[11px] bg-surface ${status === 'off' ? 'text-ink-4' : 'text-ink'}`}
      >
        {tiktok && account ? (
          <TikTokPicture src={account.avatar} />
        ) : (
          <SourceMark source={source} size={16} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[14.5px] font-medium">{info.name}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-4">
          {status !== 'off' && (
            <span
              aria-hidden="true"
              className={`size-1.5 shrink-0 rounded-full ${status === 'connected' ? 'bg-(--live)' : 'bg-fail'}`}
            />
          )}
          <span className={`truncate ${status === 'attention' ? 'text-fail-ink' : ''}`}>
            {status === 'off'
              ? tiktok
                ? 'Videos to the TikTok inbox'
                : make
                  ? MAKE_BRINGS[source as MakeKey]
                  : info.brings
              : status === 'attention'
                ? 'Signed out · sign in again'
                : (name ?? info.account(brand))}
          </span>
        </span>
      </span>
      {notAvailable(source) && !tiktok && !make ? (
        <NotAvailable reason={reasonOf(info.name)} />
      ) : status === 'connected' ? (
        <RowMenu
          name={info.name}
          reconnect={make ? 'Change' : 'Reconnect'}
          onReconnect={onConnect}
          onDisconnect={() =>
            tiktok || make
              ? (tiktok
                  ? disconnectTikTok(brand.id)
                  : unlinkMake(brand.id, source as MakeKey)
                ).catch((err: unknown) =>
                  report(err instanceof Error && err.message ? err.message : 'That did not work.'),
                )
              : disconnect(brand.id, source)
          }
        />
      ) : (
        <button
          type="button"
          aria-label={`${status === 'off' ? 'Connect' : 'Reconnect'} ${info.name}`}
          onClick={onConnect}
          className={`bb-press h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors ${status === 'off' ? 'bg-surface text-ink hover:bg-paper' : 'bg-ink text-page hover:opacity-85'}`}
        >
          {status === 'off' ? 'Connect' : 'Reconnect'}
        </button>
      )}
    </li>
  )
}

/** What Instagram and Facebook bring through Make: no Stories, which Make cannot post. */
const MAKE_BRINGS: Record<MakeKey, string> = {
  ig: 'Posts and reels',
  fb: 'Posts and reels to the Page',
}

/** The Make sheet for the brand in the header, with the account it holds now. */
function Making({ source, onClose }: { source: MakeKey; onClose: () => void }) {
  const { brand } = useBrand()
  const current = useMakeAccount(brand.id, source)
  return <MakeSheet source={source} current={current} onClose={onClose} />
}

/** Reconnect or disconnect: kept behind one quiet button, since nobody does them often. */
function RowMenu({
  name,
  reconnect = 'Reconnect',
  onReconnect,
  onDisconnect,
}: {
  name: string
  reconnect?: string
  onReconnect: () => void
  onDisconnect: () => void
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
          className="bb-menu absolute top-10 right-0 z-30 flex w-[160px] origin-top-right flex-col rounded-[12px] bg-page p-1.5 shadow-pop"
        >
          {item(reconnect, onReconnect)}
          {item('Disconnect', onDisconnect, true)}
        </div>
      )}
    </div>
  )
}
