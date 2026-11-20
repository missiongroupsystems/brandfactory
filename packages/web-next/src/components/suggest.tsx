'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

import { PlusIcon } from './icons'
import { PlatformLogo, type PlatformLogoKey } from './platform-logos'
import { preloadPictures, ProfilePicture } from './profile-picture'

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
  /** A profile picture, shown in place of the initials when there is one. */
  picture?: string
  /** The platform of the handle, as its logo beside it. */
  platform?: PlatformLogoKey
  /** The brand a person is linked to: a small round logo of it ends the row. */
  linkedTo?: string
  /** Ranks before the match: a lower tier comes first whatever it matched (people's fields). */
  tier?: number
  /**
   * The handle (no "@") whose name the team may give or fix from the row: a pencil shows on hover
   * and turns the first line into a field, which `onRename` saves.
   */
  rename?: string
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
 * the brand's own, recent and frequent first, and breaks every tie. A row's `tier` comes before
 * all of that, and the value typed in full before the tiers. Nothing typed keeps the order whole.
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
  return (
    options
      .map((o, i) => ({ o, i, s: score(o) }))
      .filter((x) => x.s < 2)
      // The value typed in full comes first, whatever its tier: Enter then takes what was typed.
      .sort(
        (a, b) =>
          Number(fold(b.o.value) === q) - Number(fold(a.o.value) === q) ||
          (a.o.tier ?? 0) - (b.o.tier ?? 0) ||
          a.s - b.s ||
          a.i - b.i,
      )
      .slice(0, limit)
      .map((x) => x.o)
  )
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

/** The tallest a list grows; a longer one scrolls inside. */
const MAX_LIST = 320
/** A row with a name and a handle, and the list's own padding, for the height a list asks. */
const ROW_PX = 50
const LIST_PAD = 12
/** Room for four rows and a half under the field is room enough: the list opens down, capped. */
const ENOUGH = 240
/** The least room a list is shown in: one row. */
const MIN_LIST = 40

interface Box {
  top: number
  bottom: number
  left: number
  right: number
}

/**
 * Where a list of `want` px goes beside a field, inside `area` (the screen, or the part of a
 * dialog it must stay in). It opens down when it fits there, or when four rows and a half do. When it does not and the page can
 * scroll (`room`, px), the page scrolls just enough (`scroll`) for it to fit down, so it never
 * covers what is above the field. It turns up only when neither makes room and there is more
 * room above. Either way its height is capped to the room on its side, and a long list scrolls.
 */
export function placeList({
  field,
  area,
  screen,
  want,
  room = 0,
  edge = 14,
}: {
  field: Box
  area: Box
  /** The page's width, for the 16px edge. */
  screen: number
  want: number
  /** How far the page could scroll down to make room under the field; 0 inside a dialog. */
  room?: number
  /** The space kept to the edge of the area. */
  edge?: number
}): { place: React.CSSProperties; up: boolean; scroll: number } {
  const need = Math.min(MAX_LIST, want)
  const enough = Math.min(need, ENOUGH)
  // A wide field still gets a list that reads at a glance: the meta stays near the name.
  const left0 = Math.max(16, area.left)
  const right0 = Math.min(screen - 16, area.right)
  const width = Math.min(Math.max(field.right - field.left, 280), 400, Math.max(0, right0 - left0))
  const left = Math.min(Math.max(field.left, left0), right0 - width)
  const GAP = 6
  const below = area.bottom - field.bottom - edge - GAP
  const above = field.top - area.top - edge - GAP
  // A scroll may not take the field out of sight, under the page's sticky header.
  const scroll =
    below < enough ? Math.max(0, Math.min(room, need - below, field.top - area.top - 96)) : 0
  const down = below + scroll >= enough || above <= below
  const shift = down ? scroll : 0
  return {
    up: !down,
    scroll: shift,
    place: {
      left,
      width,
      maxHeight: Math.max(0, Math.min(need, down ? below + shift : above)),
      ...(down
        ? { top: field.bottom - shift + GAP }
        : { bottom: window.innerHeight - field.top + GAP }),
    },
  }
}

/**
 * Where the list goes: under the field, as wide as it, inside the screen with a 16px edge. Inside
 * a dialog or a sheet it stays inside that box, or inside the closest `[data-suggest-bounds]`, so
 * it never spills over the dimmed page or covers the dialog's buttons. On a phone the keyboard
 * takes the bottom of the screen (the visual viewport ends above it): the list stops there.
 * `rows` is how many rows it shows, for the height it asks (`placeList`). With `scroll`, the page
 * may scroll once, as the list opens, to make room for it under the field; without, it never moves.
 * A list with no room for one row is not shown.
 */
export function usePlace(
  anchor: React.RefObject<HTMLElement | null>,
  open: boolean,
  {
    rows = Math.floor(MAX_LIST / ROW_PX),
    scroll = false,
  }: { rows?: number; scroll?: boolean } = {},
) {
  const [place, setPlace] = React.useState<React.CSSProperties | null>(null)
  const want = rows * ROW_PX + LIST_PAD
  // The page scrolls to make room once, when the list opens; not again while it stays open.
  const opened = React.useRef(false)
  React.useLayoutEffect(() => {
    if (!open) {
      opened.current = false
      return
    }
    let first = !opened.current
    opened.current = true
    function measure() {
      const el = anchor.current
      const box = el?.getBoundingClientRect()
      if (!el || !box) return
      const view = window.visualViewport
      const top = view?.offsetTop ?? 0
      const bottom = top + (view?.height ?? window.innerHeight)
      // Without the scroll bar; a page not laid out yet reads 0, so the window's width then.
      const screen = document.documentElement.clientWidth || window.innerWidth
      // The part it is bound to, and the dialog around it (which may scroll its content).
      const frames = [el.closest('[data-suggest-bounds]'), el.closest('[role="dialog"]')]
        .filter((f): f is Element => f !== null)
        .map((f) => f.getBoundingClientRect())
      const frame = frames.length > 0
      const area = {
        top: Math.max(top, ...frames.map((f) => f.top)),
        bottom: Math.min(bottom, ...frames.map((f) => f.bottom)),
        left: Math.max(0, ...frames.map((f) => f.left)),
        right: Math.min(screen, ...frames.map((f) => f.right)),
      }
      // Only the page itself scrolls for it, and only with a mouse or a trackpad: not inside a
      // dialog, nor on a touch screen, where the keyboard is about to take the bottom.
      const fine = window.matchMedia?.('(pointer: fine)').matches ?? false
      const page = document.scrollingElement ?? document.documentElement
      const room =
        scroll && first && !frame && fine
          ? page.scrollHeight - window.scrollY - window.innerHeight
          : 0
      first = false
      const at = placeList({ field: box, area, screen, want, room, edge: frame ? 8 : 14 })
      if (at.scroll > 0) window.scrollBy({ top: at.scroll, behavior: 'instant' })
      // Too little room for one row: an open list no one could see is no list.
      setPlace((at.place.maxHeight as number) < MIN_LIST ? null : at.place)
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
  }, [anchor, open, want, scroll])
  return open ? place : null
}

function List({
  id,
  rows,
  active,
  place,
  onPick,
  onHover,
  onRename,
  onBack,
  frame,
  mark,
}: {
  id: string
  rows: Row[]
  active: number
  place: React.CSSProperties
  onPick: (row: Row) => void
  onHover: (index: number) => void
  /** Saves a name given in a row; the field takes the focus back. */
  onRename?: (handle: string, name: string | null) => void
  /** The small logo that ends the row of someone linked to a brand (`Suggestion.linkedTo`). */
  mark?: (brandId: string) => React.ReactNode
  /** Gives the focus back to the field once a name is written or left. */
  onBack?: () => void
  /** The list's own box, for the field to tell a press inside it from one away. */
  frame?: React.RefObject<HTMLDivElement | null>
}) {
  const own = React.useRef<HTMLDivElement>(null)
  const list = frame ?? own
  // The row whose name is being written, by its handle.
  const [naming, setNaming] = React.useState<string | null>(null)
  // The active row stays in sight when the arrows move past the edge of a short list.
  React.useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[id="${id}-${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [id, active, list])
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
      // A name being written keeps its own field.
      onMouseDown={(e) => {
        if (!(e.target as HTMLElement).closest('input')) e.preventDefault()
      }}
      onClick={(e) => {
        const i = rowAt(e)
        const row = rows[i]
        if (!row || (!('typed' in row) && row.rename && row.rename === naming)) return
        onPick(row)
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
          // The platform's logo goes beside the handle: on the second line, or on the first when
          // the row is a handle alone.
          const logo =
            !typed && row.platform ? (
              <PlatformLogo platform={row.platform} size={10} className="text-ink-4" />
            ) : null
          return (
            <div
              key={`${typed ? 'typed' : 'option'}-${row.value}`}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              data-row={i}
              className={`group/row flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 max-md:min-h-12 ${i === active ? 'bg-surface' : ''}`}
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
                  <ProfilePicture
                    src={row.picture}
                    size={28}
                    placeholder
                    // A hairline over the picture, so a pale one keeps its round edge.
                    className="rounded-full after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:shadow-[inset_0_0_0_1px_var(--line)]"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold"
                      style={{ background: 'var(--avatar)', color: 'var(--avatar-ink)' }}
                    >
                      {row.initials}
                    </span>
                  </ProfilePicture>
                )
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                {!typed && row.rename && row.rename === naming ? (
                  <NameField
                    handle={row.rename}
                    start={row.name && row.name !== row.rename ? row.name : ''}
                    onDone={(next, back) => {
                      setNaming(null)
                      if (next !== undefined) onRename?.(row.rename!, next)
                      // Enter or Escape goes back to the field; a name left for elsewhere does not.
                      if (back) onBack?.()
                    }}
                  />
                ) : (
                  <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-medium max-md:text-[15px]">
                    {!detail && logo}
                    <span className="truncate">{name}</span>
                  </span>
                )}
                {detail && (
                  <span className="flex min-w-0 items-center gap-1 text-[12px] text-ink-4 max-md:text-[13px]">
                    {logo}
                    <span className="truncate">{detail}</span>
                  </span>
                )}
              </span>
              {!typed && row.rename && onRename && row.rename !== naming && (
                <button
                  type="button"
                  aria-label={`Name @${row.rename}`}
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation()
                    setNaming(row.rename!)
                  }}
                  className="flex size-6 shrink-0 items-center justify-center rounded-full text-ink-4 opacity-0 transition-opacity group-hover/row:opacity-100 hover:bg-page hover:text-ink pointer-coarse:opacity-100"
                >
                  <PencilGlyph />
                </button>
              )}
              {!typed && row.linkedTo && mark?.(row.linkedTo)}
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

function PencilGlyph() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M10.5 2.5l3 3L6 13H3v-3l7.5-7.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * A name for a handle, written in its row: Enter saves (an empty field takes the name away),
 * Escape or leaving the field keeps what was there.
 */
function NameField({
  handle,
  start,
  onDone,
}: {
  handle: string
  start: string
  /**
   * The name to save (null for none), or undefined when nothing changes; `back` when a key ended
   * it (Enter, Escape), so the focus goes back to the field.
   */
  onDone: (name: string | null | undefined, back: boolean) => void
}) {
  const [value, setValue] = React.useState(start)
  const field = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    field.current?.focus()
    field.current?.select()
  }, [])
  return (
    <input
      ref={field}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          const next = value.trim()
          onDone(next === start ? undefined : next || null, true)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onDone(undefined, true)
        }
      }}
      onBlur={() => onDone(undefined, false)}
      aria-label={`Name for @${handle}`}
      placeholder={handle}
      maxLength={200}
      // As wide as what it holds (at least the handle's width), never wider than the row.
      size={Math.min(Math.max(value.length, handle.length, 8) + 1, 40)}
      className="-my-px -ml-1 h-[20px] max-w-full min-w-0 self-start rounded-[6px] bg-page px-1 text-[13.5px] font-medium shadow-[0_0_0_1px_var(--line-strong)] outline-none placeholder:font-normal placeholder:text-ink-5 max-md:text-[15px]"
    />
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
  idle,
  limit,
  onRename,
  mark,
  scroll,
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
  /** What the list shows before anything is typed, when it is not the first of `options`. */
  idle?: Suggestion[]
  /** How many rows the list shows. */
  limit?: number
  /** Saves a name the team gave a row's handle (`Suggestion.rename`). */
  onRename?: (handle: string, name: string | null) => void
  /** The small logo of the brand a row's person is linked to (`Suggestion.linkedTo`). */
  mark?: (brandId: string) => React.ReactNode
  /** The page may scroll as the list opens, so it opens under the field (`usePlace`). */
  scroll?: boolean
} & Pick<
  React.InputHTMLAttributes<HTMLInputElement>,
  'aria-label' | 'placeholder' | 'className' | 'autoFocus'
>) {
  const id = React.useId()
  const own = React.useRef<HTMLInputElement>(null)
  const frame = React.useRef<HTMLDivElement>(null)
  const [open, setOpen] = React.useState(false)
  // A field that holds a value (a location) shows every suggestion until it is typed in.
  const [touched, setTouched] = React.useState(false)
  const query = touched ? value : ''
  const shown = !query.trim() && idle ? idle.slice(0, limit ?? LIMIT) : rank(options, query, limit)
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
  const place = usePlace(anchor ?? own, open && rows.length > 0, { rows: rows.length, scroll })
  // The pictures of the rows the list opens with start loading as soon as they are known (the
  // roster has loaded), so the list shows them at once instead of filling in.
  const first = (idle ?? options)
    .slice(0, limit ?? LIMIT)
    .map((o) => o.picture ?? '')
    .join(' ')
  React.useEffect(() => preloadPictures(first.split(' ')), [first])

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
        onFocus={(e) => {
          setOpen(true)
          // Back from a name written in the list: what was typed still stands.
          if (frame.current?.contains(e.relatedTarget as Node | null)) return
          setTouched(false)
        }}
        // A press in the list (a name being written) is not leaving the field.
        onBlur={(e) => {
          if (frame.current?.contains(e.relatedTarget as Node | null)) return
          close()
        }}
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
          frame={frame}
          onRename={onRename}
          mark={mark}
          onBack={() => own.current?.focus()}
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
  const place = usePlace(ref, rows.length > 0, { rows: rows.length })

  React.useLayoutEffect(() => {
    if (caret.current === null) return
    ref.current?.setSelectionRange(caret.current, caret.current)
    caret.current = null
  }, [value])

  const read = (el: HTMLTextAreaElement) => {
    // A pick is landing: the field still holds the old text, so its selection says nothing yet.
    if (caret.current !== null) return
    setWord(el.selectionStart === el.selectionEnd ? wordAt(el.value, el.selectionStart) : null)
  }

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
