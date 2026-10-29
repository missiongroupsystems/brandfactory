'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

import { useBrand } from '@/features/schedule/posts-store'

import { SourceMark } from './connect-sheet'
import { linkMake, type MakeAccount, type MakeKey } from './make'

const COPY: Record<MakeKey, { title: string; id: string; idHint: string; name: string }> = {
  ig: {
    title: 'Connect Instagram',
    id: 'Instagram account ID',
    idHint: 'Meta Business Suite › Settings › Instagram accounts',
    name: 'Handle',
  },
  fb: {
    title: 'Connect Facebook',
    id: 'Page ID',
    idHint: 'The Page’s About › Page transparency',
    name: 'Page name',
  },
}

/** The server's words as a sentence: a capital, and a full stop. */
const sentence = (s: string) => `${s[0]!.toUpperCase()}${s.slice(1)}${/[.!?]$/.test(s) ? '' : '.'}`

const FIELD =
  'h-11 w-full rounded-[12px] bg-surface px-3.5 text-[14px] text-ink outline-none placeholder:text-ink-5 focus-visible:shadow-[0_0_0_2px_var(--line-strong)]'

/**
 * Links the brand's Instagram account or Facebook Page for posting through Make: its id and the
 * name to show. Only the company's owners and admins may; the server says so to anyone else.
 */
export function MakeSheet({
  source,
  current,
  onClose,
}: {
  source: MakeKey
  current: MakeAccount | null
  onClose: () => void
}) {
  const { brand } = useBrand()
  const copy = COPY[source]
  const [accountId, setAccountId] = React.useState(current?.accountId ?? '')
  const [name, setName] = React.useState(current?.name ?? '')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const first = React.useRef<HTMLInputElement>(null)
  const close = React.useEffectEvent(onClose)
  const ready = /^[0-9]{5,30}$/.test(accountId.trim()) && name.trim() !== ''

  React.useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const opener = document.activeElement as HTMLElement | null
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      await linkMake(brand.id, source, accountId.trim(), name.trim())
      onClose()
    } catch (err) {
      setError(sentence(err instanceof Error && err.message ? err.message : 'That did not work.'))
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 max-md:items-end max-md:p-0">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="bb-fade absolute inset-0 bg-ink/30"
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        onSubmit={submit}
        className="bb-rise max-md:bb-sheet-up relative flex w-[380px] flex-col gap-6 rounded-[22px] bg-page p-7 shadow-sheet max-md:w-full max-md:rounded-b-none max-md:px-5 max-md:pt-6 max-md:pb-[calc(20px+env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-[13px] bg-surface text-ink">
            <SourceMark source={source} size={18} />
          </span>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[19px] font-medium tracking-[-0.02em]">{copy.title}</h2>
            <p className="text-[13px] text-ink-4">{brand.name}</p>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="make-account-id" className="text-[12.5px] font-medium text-ink-2">
              {copy.id}
            </label>
            <input
              id="make-account-id"
              ref={first}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value.replace(/\s/g, ''))}
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              placeholder="17841400000000000"
              className={`${FIELD} font-mono tracking-tight`}
            />
            <span className="text-[12px] text-ink-4">{copy.idHint}</span>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium text-ink-2">{copy.name}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoComplete="off"
              placeholder={source === 'ig' ? brand.handle : brand.name}
              className={FIELD}
            />
          </label>
          {error && (
            <p role="alert" className="text-[13px] text-fail-ink">
              {error}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-1 max-md:flex-col-reverse max-md:items-stretch max-md:gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full px-4 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink max-md:h-12 max-md:text-[14px]"
          >
            Cancel
          </button>
          <button
            type="submit"
            aria-disabled={!ready || busy}
            className={`bb-press flex h-10 items-center justify-center gap-2 rounded-full px-5 text-[13px] font-medium max-md:h-12 max-md:text-[14px] ${ready ? 'bg-ink text-page hover:opacity-85' : 'cursor-not-allowed bg-surface text-ink-5'}`}
          >
            {busy && (
              <span className="size-3 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white" />
            )}
            {busy ? 'Connecting…' : current ? 'Save' : 'Connect'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
