'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

import { CheckIcon, ChevronIcon, CloseIcon, PlusIcon } from '@/components/icons'
import { usePlace } from '@/components/suggest'

import { addLocation, removeLocation, tidy, useLocations } from './locations-store'

/** How long a removed row takes to fold away; the store drops it after. */
const FOLD_MS = 200

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

const reduced = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const ITEM =
  'flex min-h-9 w-full items-center gap-2 rounded-[8px] pl-2 text-left text-[13.5px] outline-none transition-colors hover:bg-surface focus-visible:bg-surface max-md:min-h-11 max-md:text-[15px]'

/**
 * A post's Location: one of the brand's saved locations, picked from a menu. The menu adds one
 * (saved for the whole brand, and picked) and removes one after a second press in its own row,
 * never in a browser dialog. A location the post has that the brand no longer saves stays the
 * value, ticked at the top. A press on the ticked row clears the post's location.
 */
export function LocationPicker({
  brandId,
  value,
  onChange,
}: {
  brandId: string
  value: string
  onChange: (location: string) => void
}) {
  const saved = useLocations(brandId)
  const [open, setOpen] = React.useState(false)
  const [adding, setAdding] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const [asking, setAsking] = React.useState<string | null>(null)
  const [leaving, setLeaving] = React.useState<string | null>(null)
  const trigger = React.useRef<HTMLButtonElement>(null)
  const menu = React.useRef<HTMLDivElement>(null)
  const place = usePlace(trigger, open)
  const own = value !== '' && !saved.some((l) => same(l, value))
  const rows = own ? [value, ...saved] : saved

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

  // The new location's field takes the focus as it opens.
  const field = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (adding) field.current?.focus()
  }, [adding])

  function pick(label: string) {
    onChange(same(label, value) ? '' : label)
    close()
  }
  function save() {
    if (tidy(draft) === '') return
    onChange(addLocation(brandId, draft))
    close()
  }
  function remove(label: string) {
    setLeaving(label)
    const done = () => {
      // The brand forgets it; a post that has it keeps it, shown as its own unsaved row.
      removeLocation(brandId, label)
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
        aria-label={value ? `Location: ${value}` : 'Location'}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className="flex h-9 w-full items-center gap-2 rounded-[10px] bg-surface-2 px-3 text-left text-[14px] transition-colors outline-none hover:bg-surface focus-visible:bg-surface aria-expanded:bg-surface max-md:h-11"
      >
        <span className={`min-w-0 flex-1 truncate ${value ? 'text-ink' : 'text-ink-5'}`}>
          {value || 'None'}
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
            aria-label="Location"
            tabIndex={-1}
            onKeyDown={onKey}
            style={place}
            className="bb-menu fixed z-[60] flex flex-col overflow-y-auto overscroll-contain rounded-[14px] bg-page p-1.5 shadow-[0_0_0_1px_var(--line),var(--shadow-pop)]"
          >
            {rows.map((label) => {
              const ticked = same(label, value)
              const savedRow = !(own && label === value)
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
                          role="menuitemradio"
                          aria-checked={ticked}
                          data-nav
                          data-label={label}
                          onClick={() => pick(label)}
                          className={`${ITEM} ${savedRow ? 'pr-9' : 'pr-2.5'}`}
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
                  maxLength={120}
                  placeholder="Location name"
                  aria-label="New location"
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
                Add location
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
