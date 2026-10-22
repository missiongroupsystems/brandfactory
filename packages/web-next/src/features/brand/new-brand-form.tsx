'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

import { Segmented } from '@/components/controls'
import { ChevronIcon, CloseIcon, PlusIcon } from '@/components/icons'
import { PlatformLogo } from '@/components/platform-logos'
import type { BrandId } from '@/data/brands'
import { type Company, upload as uploadFile } from '@/lib/remote'

import { initialsOf } from './brand-logo'
import { editKit } from './brand-store'
import { ColourPicker } from './colour-picker'
import type { Colour } from './kit-parts'
import { coloursEdited } from './model'
import {
  CHANNELS,
  type Channel,
  DEFAULT_TIMEZONE,
  handleOf,
  idOf,
  inputOf,
  type NewBrand,
  problem,
  refusal,
} from './new-brand'
import { type Anchor, Popover, anchorOf } from './popover'

const FIELD =
  'h-11 w-full rounded-[10px] border border-line bg-page px-3 text-[15px] outline-none transition-colors focus:border-ink-3 max-md:text-[16px]'
const QUIET =
  'flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] text-ink-4 transition-colors hover:bg-surface hover:text-ink'
const PRIMARY =
  'bb-press h-11 rounded-full bg-ink px-5 text-[14px] font-medium text-page hover:opacity-85 disabled:opacity-50'

/** Every zone the browser knows, or a short list where it cannot say. */
function zones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return [DEFAULT_TIMEZONE, 'Asia/Kuala_Lumpur', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Hong_Kong']
  }
}

/** The logo's address on the server, then the kit; the page shows it the moment it is up. */
async function putLogo(brandId: string, file: File) {
  const src = await uploadFile(brandId, file)
  editKit(brandId as BrandId, (k) => ({ ...k, logo: { src, name: file.name } }))
}

/**
 * A new brand on one page. The brand draws itself at the top as the person types: its logo or
 * initials, its name, its handle and its channels. Below, the name, the handle and the channels;
 * the rest (a line, the colours, the timezone) waits folded until it is asked for. One press
 * makes the brand, then puts the logo and the colours on its kit.
 */
export function NewBrandForm({
  companies,
  onAdd,
  onClose,
}: {
  /** The companies the person may add a brand to; the first is the default. */
  companies: Company[]
  /** Adds the brand and opens it; answers its id, or rejects with the core's refusal. */
  onAdd: (input: NewBrand) => Promise<string>
  onClose: () => void
}) {
  const [org, setOrg] = React.useState(companies[0]?.id ?? '')
  const [name, setName] = React.useState('')
  const [handle, setHandle] = React.useState('')
  const [linked, setLinked] = React.useState<Channel[]>([])
  const [logo, setLogo] = React.useState<{ file: File; url: string } | null>(null)
  // The optional parts: null while folded away.
  const [line, setLine] = React.useState<string | null>(null)
  const [colours, setColours] = React.useState<Colour[] | null>(null)
  const [timezone, setTimezone] = React.useState<string | null>(null)
  const [picker, setPicker] = React.useState<{ i: number; anchor: Anchor } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [phase, setPhase] = React.useState<'idle' | 'adding' | 'logo'>('idle')
  // The brand is made but its logo is not up: the person tries again or goes on without it.
  const [logoLeft, setLogoLeft] = React.useState<{ id: string; name: string } | null>(null)

  const first = React.useRef<HTMLInputElement>(null)
  const file = React.useRef<HTMLInputElement>(null)
  const lineField = React.useRef<HTMLInputElement>(null)

  // Escape backs out of the colour picker first; the room closes on the next one.
  const escape = React.useEffectEvent(() => (picker ? setPicker(null) : onClose()))
  React.useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && escape()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [])
  // The picked image is in the browser only; it goes when the room does.
  React.useEffect(() => () => void (logo && URL.revokeObjectURL(logo.url)), [logo])

  const edit = (set: (value: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value)
    setError(null)
  }

  function toggle(channel: Channel) {
    setLinked((on) => (on.includes(channel) ? on.filter((c) => c !== channel) : [...on, channel]))
  }

  function pick(picked: File | undefined) {
    if (!picked?.type.startsWith('image/')) return
    setLogo((old) => {
      if (old) URL.revokeObjectURL(old.url)
      return { file: picked, url: URL.createObjectURL(picked) }
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (phase !== 'idle' || logoLeft) return
    const words = problem({ name, handle })
    if (words) {
      setError(words)
      return
    }
    setError(null)
    setPhase('adding')
    let id: string
    try {
      id = await onAdd(
        inputOf({ org, name, handle, line: line ?? '', linked, timezone: timezone ?? undefined }),
      )
    } catch (err) {
      setError(refusal(err))
      setPhase('idle')
      return
    }
    if (colours && colours.length > 0) {
      editKit(id as BrandId, (k) => ({ ...k, colours: coloursEdited(colours) }))
    }
    await finish(id)
  }

  async function finish(id: string) {
    if (logo) {
      setPhase('logo')
      try {
        await putLogo(id, logo.file)
      } catch {
        setLogoLeft({ id, name: name.trim() })
        setPhase('idle')
        return
      }
    }
    onClose()
  }

  const busy = phase !== 'idle'
  const shownName = name.trim()
  const shownHandle = handleOf(handle)
  const id = idOf(shownName)
  const current = picker && colours?.[picker.i]

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New brand"
      className="bb-room fixed inset-0 z-50 flex flex-col bg-page"
    >
      <header className="flex h-16 shrink-0 items-center justify-end px-6 max-md:h-14 max-md:px-4">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="-mr-2 flex size-9 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-surface hover:text-ink"
        >
          <CloseIcon />
        </button>
      </header>

      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[520px] flex-col px-6 pt-[9vh] pb-12 max-md:px-4 max-md:pt-2">
            <h2 className="font-display text-[40px] leading-[1.08] tracking-[-0.032em] max-md:text-[28px] max-md:leading-[1.12]">
              New brand
            </h2>

            {/* The brand as it will look: the logo well is the preview and the picker in one. */}
            <div
              className="bb-rise mt-9 flex items-center gap-5 max-md:mt-6 max-md:gap-4"
              style={{ animationDelay: '60ms' }}
            >
              <span className="relative shrink-0">
                <button
                  type="button"
                  aria-label={logo ? 'Change the logo' : 'Add a logo'}
                  onClick={() => file.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    pick(e.dataTransfer.files[0])
                  }}
                  className={`group relative flex size-20 items-center justify-center overflow-hidden rounded-full outline-offset-4 transition-[box-shadow,transform] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:scale-[1.03] ${logo ? 'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]' : shownName ? 'text-page' : 'text-ink-4 shadow-[inset_0_0_0_1.5px_var(--line-strong)] hover:text-ink hover:shadow-[inset_0_0_0_1.5px_var(--ink-3)]'}`}
                  style={!logo && shownName ? { background: 'var(--brand-other)' } : undefined}
                >
                  {logo ? (
                    <img src={logo.url} alt="" className="size-full object-cover" />
                  ) : shownName ? (
                    <span className="bb-pop font-display text-[28px] font-semibold tracking-[-0.02em]">
                      {initialsOf(shownName)}
                    </span>
                  ) : (
                    <PlusIcon size={18} />
                  )}
                  {!logo && shownName && (
                    <span className="absolute inset-0 flex items-end justify-center bg-linear-to-t from-black/45 to-transparent pb-1.5 font-mono text-[9.5px] tracking-[0.06em] text-white uppercase opacity-0 transition-opacity group-hover:opacity-100">
                      Logo
                    </span>
                  )}
                </button>
                {logo && (
                  <button
                    type="button"
                    aria-label="Remove the logo"
                    onClick={() => setLogo(null)}
                    className="absolute -top-0.5 -right-0.5 flex size-6 items-center justify-center rounded-full bg-page text-ink-3 shadow-pop transition-colors hover:text-ink"
                  >
                    <CloseIcon />
                  </button>
                )}
                <input
                  ref={file}
                  type="file"
                  accept="image/*"
                  hidden
                  aria-label="Logo file"
                  onChange={(e) => {
                    pick(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <span
                  className={`truncate font-display text-[26px] leading-[1.1] tracking-[-0.025em] max-md:text-[22px] ${shownName ? 'text-ink' : 'text-ink-5'}`}
                >
                  {shownName || 'Your brand'}
                </span>
                <span className="flex items-center gap-2 text-[14px] text-ink-3">
                  <span className={shownHandle ? '' : 'text-ink-5'}>
                    {shownHandle || '@handle'}
                  </span>
                  {linked.length > 0 && (
                    <span className="flex items-center gap-1.5 text-ink-4">
                      {linked.map((c) => (
                        <PlatformLogo key={c} platform={c} size={12} />
                      ))}
                    </span>
                  )}
                </span>
                <span
                  className={`truncate font-mono text-[11px] tracking-[0.02em] text-ink-5 transition-opacity ${id ? 'opacity-100' : 'opacity-0'}`}
                >
                  brandbase / {id || '…'}
                </span>
              </div>
            </div>

            <div
              className="bb-rise mt-9 flex flex-col gap-3 max-md:mt-7"
              style={{ animationDelay: '120ms' }}
            >
              {companies.length > 1 && (
                <Segmented
                  label="Company"
                  options={companies.map((c) => ({ value: c.id, label: c.name }))}
                  value={org}
                  onChange={setOrg}
                />
              )}
              <input
                ref={first}
                aria-label="Name"
                placeholder="Name"
                autoComplete="off"
                maxLength={80}
                value={name}
                onChange={edit(setName)}
                className={FIELD}
              />
              <input
                aria-label="Handle"
                placeholder="@handle"
                autoComplete="off"
                autoCapitalize="none"
                maxLength={40}
                value={handle}
                onChange={edit(setHandle)}
                className={FIELD}
              />
              <div role="group" aria-label="Channels" className="flex flex-wrap gap-2 pt-1">
                {CHANNELS.map((c) => {
                  const on = linked.includes(c.value)
                  return (
                    <button
                      key={c.value}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(c.value)}
                      className={`flex h-9 items-center gap-2 rounded-full pr-3.5 pl-3 text-[13px] font-medium transition-colors ${on ? 'bg-ink text-page' : 'bg-surface text-ink-2 hover:text-ink'}`}
                    >
                      <PlatformLogo platform={c.value} size={13} />
                      {c.label}
                    </button>
                  )
                })}
              </div>

              {/* The rest, folded: each opens in place and stays. */}
              {line !== null && (
                <input
                  ref={lineField}
                  aria-label="One line about the brand"
                  placeholder="One line about the brand"
                  autoComplete="off"
                  maxLength={120}
                  value={line}
                  onChange={edit(setLine)}
                  className={`bb-rise ${FIELD}`}
                />
              )}
              {colours !== null && (
                <div className="bb-rise flex flex-wrap items-center gap-2 pt-1">
                  {colours.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={`Edit ${c.name}, ${c.hex}`}
                      aria-expanded={picker?.i === i}
                      onClick={(e) => setPicker({ i, anchor: anchorOf(e.currentTarget) })}
                      className={`size-9 rounded-full transition-transform hover:-translate-y-0.5 ${picker?.i === i ? 'shadow-[inset_0_0_0_1px_var(--line),0_0_0_2px_var(--page),0_0_0_4px_var(--ink)]' : 'shadow-[inset_0_0_0_1px_var(--line)]'}`}
                      style={{ background: c.hex }}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={(e) => {
                      const next = [...colours, { name: 'New colour', hex: '#B9B2A8' }]
                      setColours(next)
                      setPicker({ i: next.length - 1, anchor: anchorOf(e.currentTarget) })
                    }}
                    className={QUIET}
                  >
                    <PlusIcon size={10} />
                    Add colour
                  </button>
                </div>
              )}
              {timezone !== null && (
                <span className="bb-rise relative inline-flex w-fit items-center pt-1">
                  <select
                    aria-label="Timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="h-9 max-w-[280px] appearance-none rounded-full bg-surface pr-8 pl-3.5 text-[13px] font-medium text-ink-2 outline-none transition-colors hover:text-ink focus-visible:shadow-[0_0_0_2px_var(--page),0_0_0_4px_var(--ink)]"
                  >
                    {zones().map((z) => (
                      <option key={z} value={z}>
                        {z.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3.5 text-ink-4">
                    <ChevronIcon size={8} />
                  </span>
                </span>
              )}
              {(line === null || colours === null || timezone === null) && (
                <div className="-ml-2.5 flex flex-wrap items-center gap-1 pt-1">
                  {line === null && (
                    <button
                      type="button"
                      onClick={() => {
                        setLine('')
                        setTimeout(() => lineField.current?.focus(), 0)
                      }}
                      className={QUIET}
                    >
                      <PlusIcon size={10} />
                      Add a line
                    </button>
                  )}
                  {colours === null && (
                    <button type="button" onClick={() => setColours([])} className={QUIET}>
                      <PlusIcon size={10} />
                      Colours
                    </button>
                  )}
                  {timezone === null && (
                    <button
                      type="button"
                      onClick={() => setTimezone(DEFAULT_TIMEZONE)}
                      className={QUIET}
                    >
                      {DEFAULT_TIMEZONE.replace(/_/g, ' ')}
                      <ChevronIcon size={8} />
                    </button>
                  )}
                </div>
              )}

              {error && (
                <p role="alert" className="text-[13px] text-fail">
                  {error}
                </p>
              )}
              {logoLeft && (
                <p role="alert" className="text-[13px] text-ink-2">
                  {logoLeft.name} is in. The logo did not upload.
                </p>
              )}
            </div>
          </div>
        </div>

        <footer className="relative shrink-0 before:pointer-events-none before:absolute before:inset-x-0 before:-top-10 before:h-10 before:bg-linear-to-t before:from-page before:to-transparent">
          <div className="mx-auto flex w-full max-w-[520px] items-center justify-end gap-2 px-6 pt-3 pb-8 max-md:px-4 max-md:pb-[calc(12px+env(safe-area-inset-bottom))]">
            {logoLeft ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-11 rounded-full px-4 text-[13.5px] text-ink-3 transition-colors hover:bg-surface hover:text-ink"
                >
                  Go on without it
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setLogoLeft(null)
                    void finish(logoLeft.id)
                  }}
                  className={PRIMARY}
                >
                  Try again
                </button>
              </>
            ) : (
              <button type="submit" disabled={busy || shownName === ''} className={PRIMARY}>
                {phase === 'adding'
                  ? 'Adding…'
                  : phase === 'logo'
                    ? 'Adding the logo…'
                    : 'Add brand'}
              </button>
            )}
          </div>
        </footer>
      </form>

      {picker && current && colours && (
        <Popover
          anchor={picker.anchor}
          label={current.name || 'Colour'}
          height={440}
          plain
          onClose={() => setPicker(null)}
        >
          <ColourPicker
            key={picker.i}
            colour={current}
            onDone={() => setPicker(null)}
            onChange={(c) => setColours(colours.map((d, j) => (j === picker.i ? c : d)))}
            onRemove={() => {
              setColours(colours.filter((_, j) => j !== picker.i))
              setPicker(null)
            }}
          />
        </Popover>
      )}
    </div>,
    document.body,
  )
}
