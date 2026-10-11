'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

import { PlusIcon } from './icons'

/**
 * Suggestions under a field: what the brand typed before, offered again as the user types. One
 * list serves two fields: `Combobox`, an input whose list opens on focus, and `useMention`, which
 * opens it inside a caption when an "@" or a "#" starts a word. Both follow the ARIA combobox
 * pattern: the focus stays in the field, the arrows move the active row (`aria-activedescendant`),
 * Enter or Tab picks it and Escape closes the list.
 */

export interface Suggestion {
  /** What a pick puts in the field: "@chefantonio", "TMP_Wine". */
  value: string
  /** What the row leads with, when it is not the value: a person's name. */
  name?: string
  /** A second line under the name: the handle, a role. */
  detail?: string
  /** A quiet note at the end of the row: "Collab · 12 Sep". */
  meta?: string
  /** Initials on a round avatar, for a person. */
  initials?: string
}

/** The value typed in full, offered when no suggestion is it: "Use @newhandle". */
interface Typed {
  value: string
  typed: true
}
type Row = Suggestion | Typed

const LIMIT = 6

const fold = (text: string) => text.toLowerCase().replace(/^[@#]/, '')

/**
 * The suggestions that match what was typed, best first: a value or a name that starts with it
 * (or a word of the name that does), then one that only contains it. The order of `options` is
 * the brand's own, recent and frequent first, and breaks every tie. Nothing typed keeps it whole.
 */
export function rank(options: Suggestion[], typed: string, limit = LIMIT): Suggestion[] {
  const q = fold(typed.trim())
  if (!q) return options.slice(0, limit)
  // "chef antonio" is typed as a name; a handle spells it without the space.
  const tight = q.replace(/[^a-z0-9._]/g, '')
  const score = (o: Suggestion) => {
    const value = fold(o.value)
    const name = (o.name ?? '').toLowerCase()
    if (value.startsWith(q) || (tight && value.startsWith(tight))) return 0
    if (name.startsWith(q) || name.split(/\s+/).some((w) => w.startsWith(q))) return 0
    if (value.includes(q) || (tight && value.includes(tight)) || name.includes(q)) return 1
    return 2
  }
  return options
    .map((o, i) => ({ o, i, s: score(o) }))
    .filter((x) => x.s < 2)
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.o)
}

/**
 * Which row is active. Typing makes the best match active, so Enter takes it; with nothing typed
 * no row is, and Enter or Tab leaves the field as it is.
 */
function useActive(rows: Row[], query: string, first: boolean) {
  const [nav, setNav] = React.useState({ query, index: -1 })
  const fresh = first && rows.length > 0 ? 0 : -1
  const index = nav.query === query ? Math.min(nav.index, rows.length - 1) : fresh
  const move = (by: number) => {
    if (rows.length === 0) return
    const from = index < 0 && by < 0 ? rows.length : index
    setNav({ query, index: (from + by + rows.length) % rows.length })
  }
  return { index, move, set: (i: number) => setNav({ query, index: i }) }
}

/**
 * Where the list goes: under the field, as wide as it, inside the screen with a 16px edge. On a
 * phone the keyboard takes the bottom of the screen (the visual viewport ends above it): the list
 * stops there, and turns above the field when there is more room on that side.
 */
function usePlace(anchor: React.RefObject<HTMLElement | null>, open: boolean) {
  const [place, setPlace] = React.useState<React.CSSProperties | null>(null)
  React.useLayoutEffect(() => {
    if (!open) return
    function measure() {
      const box = anchor.current?.getBoundingClientRect()
      if (!box) return
      const view = window.visualViewport
      const top = view?.offsetTop ?? 0
      const bottom = top + (view?.height ?? window.innerHeight)
      const screen = document.documentElement.clientWidth
      // A wide field still gets a list that reads at a glance: the meta stays near the name.
      const width = Math.min(Math.max(box.width, 280), 400, screen - 32)
      const left = Math.min(Math.max(box.left, 16), screen - 16 - width)
      const below = bottom - box.bottom - 14
      const above = box.top - top - 14
      const up = below < 180 && above > below
      setPlace({
        left,
        width,
        maxHeight: Math.min(320, up ? above : below),
        ...(up ? { bottom: window.innerHeight - box.top + 6 } : { top: box.bottom + 6 }),
      })
    }
    measure()
    const view = window.visualViewport
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    view?.addEventListener('resize', measure)
    view?.addEventListener('scroll', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
      view?.removeEventListener('resize', measure)
      view?.removeEventListener('scroll', measure)
    }
  }, [anchor, open])
  return open ? place : null
}

function List({
  id,
  rows,
  active,
  place,
  onPick,
  onHover,
}: {
  id: string
  rows: Row[]
  active: number
  place: React.CSSProperties
  onPick: (row: Row) => void
  onHover: (index: number) => void
}) {
  const list = React.useRef<HTMLDivElement>(null)
  // The active row stays in sight when the arrows move past the edge of a short list.
  React.useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[id="${id}-${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [id, active])
  // The row under the pointer. The keys stay with the field, so the rows take no handlers of
  // their own: the frame reads which row a press or a move is on.
  const rowAt = (e: React.MouseEvent) =>
    Number((e.target as HTMLElement).closest('[role="option"]')?.getAttribute('data-row') ?? -1)
  // Under the body, above a sheet or a dialog, so no frame that clips its content cuts it off.
  return createPortal(
    <div
      ref={list}
      role="presentation"
      // A press on the list must not take the focus from the field: the field would close it.
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        const i = rowAt(e)
        if (i >= 0) onPick(rows[i]!)
      }}
      onMouseMove={(e) => {
        const i = rowAt(e)
        if (i >= 0 && i !== active) onHover(i)
      }}
      style={place}
      className="bb-menu fixed z-[60] flex flex-col overflow-y-auto overscroll-contain rounded-[14px] bg-page p-1.5 shadow-[0_0_0_1px_var(--line),var(--shadow-pop)]"
    >
      <div role="listbox" id={id} aria-label="Suggestions" className="flex flex-col">
        {rows.map((row, i) => {
          const typed = 'typed' in row
          const name = typed ? (
            <>
              <span className="font-normal text-ink-3">Use </span>
              {row.value}
            </>
          ) : (
            (row.name ?? row.value)
          )
          const detail = typed ? undefined : row.detail
          return (
            <div
              key={`${typed ? 'typed' : 'option'}-${row.value}`}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              data-row={i}
              className={`flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 max-md:min-h-12 ${i === active ? 'bg-surface' : ''}`}
            >
              {typed ? (
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--line-strong)] text-ink-3"
                >
                  <PlusIcon size={10} />
                </span>
              ) : (
                row.initials && (
                  <span
                    aria-hidden="true"
                    className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold"
                    style={{ background: 'var(--avatar)', color: 'var(--avatar-ink)' }}
                  >
                    {row.initials}
                  </span>
                )
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13.5px] font-medium max-md:text-[15px]">
                  {name}
                </span>
                {detail && (
                  <span className="truncate text-[12px] text-ink-4 max-md:text-[13px]">
                    {detail}
                  </span>
                )}
              </span>
              {!typed && row.meta && (
                <span className="shrink-0 text-[11.5px] text-ink-4 tabular-nums max-md:text-[12.5px]">
                  {row.meta}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}

/**
 * An input with the brand's suggestions under it. The list opens on focus with the most recent
 * ones, narrows as the user types, and ends with what was typed when nothing offered is it.
 * A pick goes to `onPick`; the caller adds it as a chip or sets it as the value.
 */
export function Combobox({
  value,
  onChange,
  options,
  onPick,
  create,
  anchor,
  ...input
}: {
  value: string
  onChange: (text: string) => void
  /** The brand's own, best first; leave out what the field holds already. */
  options: Suggestion[]
  onPick: (value: string, option?: Suggestion) => void
  /** The typed text as the field keeps it ("@Chef Antonio" → "@chefantonio"); empty for none. */
  create?: (typed: string) => string
  /** The box the list lines up with, when it is wider than the input (a row of chips). */
  anchor?: React.RefObject<HTMLElement | null>
} & Pick<
  React.InputHTMLAttributes<HTMLInputElement>,
  'aria-label' | 'placeholder' | 'className' | 'autoFocus'
>) {
  const id = React.useId()
  const own = React.useRef<HTMLInputElement>(null)
  const [open, setOpen] = React.useState(false)
  // A field that holds a value (a location) shows every suggestion until it is typed in.
  const [touched, setTouched] = React.useState(false)
  const query = touched ? value : ''
  const shown = rank(options, query)
  const made = create && query.trim() ? create(query) : ''
  const rows: Row[] =
    made && !options.some((o) => o.value === made)
      ? [...shown, { value: made, typed: true }]
      : shown
  // Where free text is the answer (a place), typing only makes a row active when it is exactly
  // what was typed, so Enter or Tab keeps the typed text instead of swapping in a near match.
  const typed = query.trim().toLowerCase()
  const exact = rows[0] !== undefined && rows[0].value.toLowerCase() === typed
  const active = useActive(rows, query, typed !== '' && (create !== undefined || exact))
  const place = usePlace(anchor ?? own, open && rows.length > 0)

  // The list opens again with no row active, as it did the first time.
  function close() {
    setOpen(false)
    active.set(-1)
  }
  function pick(row: Row) {
    onPick(row.value, 'typed' in row ? undefined : row)
    setTouched(false)
    close()
  }

  return (
    <>
      <input
        {...input}
        ref={own}
        value={value}
        role="combobox"
        aria-expanded={place !== null}
        aria-controls={place ? id : undefined}
        aria-autocomplete="list"
        aria-activedescendant={place && active.index >= 0 ? `${id}-${active.index}` : undefined}
        onFocus={() => {
          setOpen(true)
          setTouched(false)
        }}
        onBlur={close}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value)
          setTouched(true)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          // The Enter that confirms an IME word is not a pick.
          if (e.nativeEvent.isComposing) return
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            if (!open) setOpen(true)
            else active.move(e.key === 'ArrowDown' ? 1 : -1)
          } else if ((e.key === 'Enter' || e.key === 'Tab') && place && active.index >= 0) {
            // Enter stays in the field for the next one; Tab picks and moves on.
            if (e.key === 'Enter') e.preventDefault()
            pick(rows[active.index]!)
          } else if (e.key === 'Enter') {
            // Nothing to pick: Enter must not send a form the field sits in.
            e.preventDefault()
          } else if (e.key === 'Escape' && place) {
            // The list closes; the sheet or dialog around it stays open.
            e.preventDefault()
            e.stopPropagation()
            close()
          }
        }}
      />
      {place && (
        <List
          id={id}
          rows={rows}
          active={active.index}
          place={place}
          onPick={pick}
          onHover={active.set}
        />
      )}
    </>
  )
}

/** The word being typed at the caret, when it starts with "@" or "#". */
function wordAt(text: string, caret: number) {
  const m = /(?:^|\s)([@#])([\p{L}\p{N}._]*)$/u.exec(text.slice(0, caret))
  return m ? { sigil: m[1] as '@' | '#', query: m[2]!, start: caret - m[2]!.length - 1 } : null
}

/**
 * Suggestions inside a caption: an "@" offers the brand's people, a "#" its hashtags, and a pick
 * takes the place of the word typed so far. The caller spreads `field` on its textarea and puts
 * `list` beside it.
 */
export function useMention({
  value,
  onChange,
  people,
  hashtags,
}: {
  value: string
  onChange: (text: string) => void
  people: Suggestion[]
  hashtags: Suggestion[]
}) {
  const id = React.useId()
  const ref = React.useRef<HTMLTextAreaElement>(null)
  const [word, setWord] = React.useState<ReturnType<typeof wordAt>>(null)
  // Where the caret goes once a pick is in the text.
  const caret = React.useRef<number | null>(null)
  const rows = word ? rank(word.sigil === '@' ? people : hashtags, word.query) : []
  // Keyed by where the word starts too: a new word starts on its best match.
  const active = useActive(rows, word ? `${word.start}${word.sigil}${word.query}` : '', true)
  const place = usePlace(ref, rows.length > 0)

  React.useLayoutEffect(() => {
    if (caret.current === null) return
    ref.current?.setSelectionRange(caret.current, caret.current)
    caret.current = null
  }, [value])

  const read = (el: HTMLTextAreaElement) =>
    setWord(el.selectionStart === el.selectionEnd ? wordAt(el.value, el.selectionStart) : null)

  function pick(row: Row) {
    if (!word) return
    // The caret can sit inside the word: the pick replaces all of it, not just the part before.
    const after = word.start + 1 + word.query.length
    const end = after + (/^[\p{L}\p{N}._]*/u.exec(value.slice(after))?.[0].length ?? 0)
    const rest = value.slice(end)
    const put = `${row.value}${rest.startsWith(' ') ? '' : ' '}`
    const at = word.start + put.length + (rest.startsWith(' ') ? 1 : 0)
    const next = value.slice(0, word.start) + put + rest
    // The same text (the whole handle was typed) re-renders nothing, so place the caret now.
    if (next === value) ref.current?.setSelectionRange(at, at)
    else {
      caret.current = at
      onChange(next)
    }
    setWord(null)
  }

  const open = place !== null
  const field = {
    ref,
    value,
    'aria-autocomplete': 'list' as const,
    'aria-controls': open ? id : undefined,
    'aria-activedescendant': open && active.index >= 0 ? `${id}-${active.index}` : undefined,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value)
      read(e.target)
    },
    onSelect: (e: React.SyntheticEvent<HTMLTextAreaElement>) => read(e.currentTarget),
    onBlur: () => setWord(null),
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!open || e.nativeEvent.isComposing) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        active.move(e.key === 'ArrowDown' ? 1 : -1)
      } else if ((e.key === 'Enter' || e.key === 'Tab') && active.index >= 0) {
        e.preventDefault()
        pick(rows[active.index]!)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setWord(null)
      }
    },
  }
  const list = place && (
    <List
      id={id}
      rows={rows}
      active={active.index}
      place={place}
      onPick={pick}
      onHover={active.set}
    />
  )
  return { field, list }
}
