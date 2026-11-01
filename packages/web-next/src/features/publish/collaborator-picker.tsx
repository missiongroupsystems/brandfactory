'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

import { CheckIcon, ChevronIcon, CloseIcon, PlusIcon } from '@/components/icons'
import { usePlace } from '@/components/suggest'

import {
  addCollaborator,
  removeCollaborator,
  useCollaborators,
  type CollabPlatform,
} from './collaborators-store'
import { handleOf } from './model'

/** How long a removed row takes to fold away; the store drops it after. */
const FOLD_MS = 200

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

const reduced = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const ITEM =
  'flex min-h-9 w-full items-center gap-2 rounded-[8px] pl-2 text-left text-[13.5px] outline-none transition-colors hover:bg-surface focus-visible:bg-surface max-md:min-h-11 max-md:text-[15px]'

/**
 * A post's Collaborators: up to `max` of the accounts the brand works with on `platform`, ticked
 * in a menu that stays open while they are picked. The menu adds an account (saved for the whole
 * brand, and ticked when there is room) and removes one after a second press in its own row,
 * never in a browser dialog. An account the post has that the brand no longer saves stays ticked
 * at the top.
 */
export function CollaboratorPicker({
  brandId,
  platform,
  value,
  onChange,
  max,
}: {
  brandId: string
  platform: CollabPlatform
  value: string[]
  onChange: (handles: string[]) => void
  max: number
}) {
  const saved = useCollaborators(brandId, platform)
  const [open, setOpen] = React.useState(false)
  const [adding, setAdding] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const [asking, setAsking] = React.useState<string | null>(null)
  const [leaving, setLeaving] = React.useState<string | null>(null)
  const trigger = React.useRef<HTMLButtonElement>(null)
  const menu = React.useRef<HTMLDivElement>(null)
  const place = usePlace(trigger, open)
  const has = (h: string) => value.some((v) => same(v, h))
  const own = value.filter((v) => !saved.some((l) => same(l, v)))
  const rows = [...own, ...saved]
  const full = value.length >= max

  function close(refocus = true) {
    setOpen(false)
    setAdding(false)
    setDraft('')
    setAsking(null)
    if (refocus) trigger.current?.focus()
  }
  const navs = () => [...(menu.current?.querySelectorAll<HTMLElement>('[data-nav]') ?? [])]

  // Shown (placed after it opens): the focus goes to the ticked row, else the first. A press
  // outside closes it.
  const shown = place !== null
  React.useEffect(() => {
    if (!shown) return
    const items = navs()
    ;(items.find((i) => i.getAttribute('aria-checked') === 'true') ?? items[0])?.focus()
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !trigger.current?.contains(t)) close(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [shown])

  // The question takes the focus to its answer; the row it leaves takes it back.
  const confirm = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (asking) confirm.current?.focus()
  }, [asking])

  // The new account's field takes the focus as it opens.
  const field = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (adding) field.current?.focus()
  }, [adding])

  function pick(label: string) {
    if (has(label)) {
      onChange(value.filter((v) => !same(v, label)))
      // A row the brand does not save goes once unticked: the focus takes the row after it.
      if (own.includes(label)) {
        const at = navs().findIndex((i) => i.dataset.label === label)
        requestAnimationFrame(() => {
          const items = navs()
          items[Math.min(at, items.length - 1)]?.focus()
        })
      }
    } else if (!full) onChange([...value, label])
  }
  function save() {
    const handle = handleOf(draft)
    if (handle === '') return
    addCollaborator(brandId, platform, handle)
    if (!has(handle) && !full) onChange([...value, handle])
    setAdding(false)
    setDraft('')
    requestAnimationFrame(() => navs().at(-1)?.focus())
  }
  function remove(label: string) {
    setLeaving(label)
    const done = () => {
      // The brand forgets it; a post that has it keeps it, shown as its own unsaved row.
      removeCollaborator(brandId, platform, label)
      setLeaving(null)
      setAsking(null)
      navs()[0]?.focus()
    }
    if (reduced()) done()
    else window.setTimeout(done, FOLD_MS)
  }
  function stopAsking() {
    const label = asking
    setAsking(null)
    requestAnimationFrame(() =>
      navs()
        .find((i) => i.dataset.label === label)
        ?.focus(),
    )
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      // The menu, or the question in it, closes; the sheet around it stays open.
      e.preventDefault()
      e.stopPropagation()
      if (asking) stopAsking()
      else close()
    } else if (e.key === 'Tab') {
      // The menu lives outside the composer's card: Tab closes it and the focus goes back to the
      // field, so it never leaves the card.
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = navs()
      if (items.length === 0) return
      e.preventDefault()
      const at = items.indexOf(document.activeElement as HTMLElement)
      const step = e.key === 'ArrowDown' ? 1 : -1
      const from = at < 0 && step < 0 ? items.length : at
      items[(from + step + items.length) % items.length]!.focus()
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={value.length > 0 ? `Collaborators: ${value.join(', ')}` : 'Collaborators'}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className="flex h-9 w-full items-center gap-2 rounded-[10px] bg-surface-2 px-3 text-left text-[14px] transition-colors outline-none hover:bg-surface focus-visible:bg-surface aria-expanded:bg-surface max-md:h-11"
      >
        <span className={`min-w-0 flex-1 truncate ${value.length > 0 ? 'text-ink' : 'text-ink-5'}`}>
          {value.length > 0 ? value.join(', ') : `None, up to ${max}`}
        </span>
        <span className="text-ink-4">
          <ChevronIcon open={open} size={10} />
        </span>
      </button>
      {place &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label="Collaborators"
            tabIndex={-1}
            onKeyDown={onKey}
            style={place}
            className="bb-menu fixed z-[60] flex flex-col overflow-y-auto overscroll-contain rounded-[14px] bg-page p-1.5 shadow-[0_0_0_1px_var(--line),var(--shadow-pop)]"
          >
            {rows.map((label) => {
              const ticked = has(label)
              const savedRow = !own.includes(label)
              return (
                <div
                  key={label}
                  className="grid shrink-0 transition-[grid-template-rows,opacity] duration-200 ease-out [&>*]:min-h-0 [&>*]:overflow-hidden"
                  style={{
                    gridTemplateRows: leaving === label ? '0fr' : '1fr',
                    opacity: leaving === label ? 0 : 1,
                  }}
                >
                  <div>
                    {asking === label ? (
                      <div className="flex min-h-9 items-center gap-2 rounded-[8px] bg-surface pr-1 pl-2 max-md:min-h-11">
                        <span aria-hidden="true" className="w-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-3 max-md:text-[15px]">
                          {label}
                        </span>
                        <span className="bb-menu flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={stopAsking}
                            className="h-7 rounded-full px-2.5 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-ink max-md:h-9 max-md:text-[13.5px]"
                          >
                            Cancel
                          </button>
                          <button
                            ref={confirm}
                            type="button"
                            disabled={leaving !== null}
                            onClick={() => remove(label)}
                            className="bb-press h-7 rounded-full bg-fail px-3 text-[12.5px] font-medium text-page max-md:h-9 max-md:text-[13.5px]"
                          >
                            Remove
                          </button>
                        </span>
                      </div>
                    ) : (
                      <div className="group/row relative">
                        <button
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={ticked}
                          aria-disabled={!ticked && full}
                          data-nav
                          data-label={label}
                          onClick={() => pick(label)}
                          className={`${ITEM} ${savedRow ? 'pr-9' : 'pr-2.5'} aria-disabled:text-ink-4`}
                        >
                          <span className="flex w-3.5 shrink-0 justify-center text-ink">
                            {ticked && <CheckIcon size={11} />}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{label}</span>
                        </button>
                        {savedRow && (
                          <button
                            type="button"
                            aria-label={`Remove ${label}`}
                            onClick={() => setAsking(label)}
                            className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-4 opacity-0 transition-[opacity,color,background-color] duration-150 group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:bg-page hover:text-ink focus-visible:opacity-100 pointer-coarse:opacity-100 max-md:size-9"
                          >
                            <CloseIcon size={9} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {rows.length > 0 && <span aria-hidden="true" className="mx-2 my-1 h-px bg-line" />}
            {adding ? (
              <label className="bb-menu flex shrink-0 items-center gap-2 rounded-[8px] bg-surface pl-2 text-ink-3">
                <span aria-hidden="true" className="flex w-3.5 shrink-0 justify-center">
                  <PlusIcon size={10} />
                </span>
                <input
                  ref={field}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      save()
                    } else if (e.key === 'Escape') {
                      // Out of the field, back to the row it came from; the menu stays.
                      e.preventDefault()
                      e.stopPropagation()
                      setAdding(false)
                      setDraft('')
                      requestAnimationFrame(() => navs().at(-1)?.focus())
                    }
                  }}
                  maxLength={31}
                  placeholder="@account"
                  aria-label="New collaborator"
                  className="h-9 min-w-0 flex-1 bg-transparent pr-2.5 text-[13.5px] text-ink outline-none placeholder:text-ink-5 max-md:h-11 max-md:text-[15px]"
                />
              </label>
            ) : (
              <button
                type="button"
                role="menuitem"
                data-nav
                onClick={() => setAdding(true)}
                className={`${ITEM} shrink-0 pr-2.5 text-ink-3 hover:text-ink focus-visible:text-ink`}
              >
                <span className="flex w-3.5 shrink-0 justify-center">
                  <PlusIcon size={10} />
                </span>
                Add account
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
