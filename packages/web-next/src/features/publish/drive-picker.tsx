'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

import { CheckIcon, ChevronIcon, CloseIcon } from '@/components/icons'
import { isVideo, Media } from '@/components/media'
import { DRIVE, folderAt, searchDrive, type DriveFolder, type DriveHit } from '@/data/publish'
import { useBrand } from '@/features/schedule/posts-store'
import { demoOf } from '@/lib/remote'

/** How long the picker takes to leave, so the parent unmounts it after the animation. */
export const LEAVE = 240

const EYEBROW = 'font-mono text-[10.5px] tracking-[0.08em] text-ink-4 uppercase'
const QUIET =
  'h-10 rounded-full px-4 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink'
const ROUND_BUTTON =
  'flex size-8 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface hover:text-ink'

/**
 * The brand's Google Drive on one surface: every folder in a column on the left (a chip row on a
 * phone), the chosen folder's files on the right, and a search over all of them. A tile ticks in
 * order, numbered for a carousel; Add puts the ticked files in the post, as an upload does. The
 * demo has no Drive behind it; the folders are `data/publish.ts`.
 */
export function DrivePicker({
  phone,
  room,
  onClose,
  onPick,
}: {
  phone: boolean
  /** How many more the format takes. */
  room: number
  onClose: () => void
  onPick: (srcs: string[]) => void
}) {
  const { brand } = useBrand()
  // A brand outside the demo's data has no Drive yet: an empty one, open at its top.
  const drive = demoOf(DRIVE, brand.id) ?? {
    root: { name: brand.name, folders: [], files: [] },
    start: [],
  }
  const [path, setPath] = React.useState(drive.start)
  const [query, setQuery] = React.useState('')
  const [picked, setPicked] = React.useState<string[]>([])
  const [leaving, setLeaving] = React.useState(false)
  const box = React.useRef<HTMLDivElement>(null)
  const timer = React.useRef<number | null>(null)
  // The tile a shift-click ranges from: the last one clicked.
  const anchor = React.useRef<number | null>(null)

  const searching = query.trim() !== ''
  const folder = folderAt(drive.root, path)
  const hits: DriveHit[] = searching
    ? searchDrive(drive.root, query)
    : folder.files.map((file) => ({ file, path }))
  // A carousel that has all it takes: the rest of the tiles rest until one is unticked.
  const full = room > 1 && picked.length >= room

  /** Leaves with the animation, then does what the close means. */
  function leave(then: () => void) {
    if (leaving) return
    setLeaving(true)
    timer.current = window.setTimeout(then, LEAVE)
  }
  const close = React.useEffectEvent(() => leave(onClose))
  React.useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    // Focus goes into the picker, and back to the control that opened it when it closes.
    const opener = document.activeElement as HTMLElement | null
    box.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'Tab' && box.current) trap(e, box.current)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
      if (timer.current !== null) window.clearTimeout(timer.current)
      opener?.focus()
    }
  }, [])

  // A folder change or a search changes which tiles are shown, so a range cannot cross one.
  function go(next: string[]) {
    setPath(next)
    search('')
  }
  function search(q: string) {
    setQuery(q)
    anchor.current = null
  }

  function toggle(i: number, shift: boolean) {
    const src = hits[i]!.file.src
    const from = anchor.current
    setPicked((p) => {
      if (shift && from !== null && room > 1) {
        const [a, b] = from < i ? [from, i] : [i, from]
        const range = hits
          .slice(a, b + 1)
          .map((h) => h.file.src)
          .filter((s) => !p.includes(s))
        return [...p, ...range].slice(0, room)
      }
      if (p.includes(src)) return p.filter((s) => s !== src)
      if (room === 1) return [src]
      return p.length < room ? [...p, src] : p
    })
    anchor.current = i
  }

  const field = (
    <label className="relative flex h-9 items-center max-md:h-10">
      <span className="pointer-events-none absolute left-3 text-ink-4">
        <SearchGlyph />
      </span>
      <input
        type="search"
        value={query}
        onChange={(e) => search(e.target.value)}
        onKeyDown={(e) => {
          // Escape clears a search first; empty, it closes the picker.
          if (e.key === 'Escape' && query !== '') {
            e.stopPropagation()
            search('')
          }
        }}
        placeholder="Search"
        aria-label="Search files"
        className="h-full w-full rounded-full bg-surface-2 pr-8 pl-9 text-[13px] outline-none placeholder:text-ink-5 focus:bg-surface [&::-webkit-search-cancel-button]:appearance-none max-md:text-[15px]"
      />
      {query !== '' && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => search('')}
          className="absolute right-1 flex size-7 items-center justify-center rounded-full text-ink-3 transition-colors hover:text-ink"
        >
          <CloseIcon />
        </button>
      )}
    </label>
  )

  const crumbs = searching ? [] : [drive.root.name, ...path]
  const where = (
    <div className="flex h-10 shrink-0 items-center gap-1.5 px-5 text-[12.5px] max-md:h-9 max-md:px-4">
      {searching ? (
        <span className="text-ink-3">
          {hits.length === 0 ? 'Nothing matches' : `${hits.length} ${plural(hits.length, 'file')}`}
        </span>
      ) : (
        crumbs.map((name, i) => {
          const last = i === crumbs.length - 1
          return (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-ink-5">›</span>}
              <span className={last ? 'font-medium text-ink' : 'text-ink-3'}>{name}</span>
            </React.Fragment>
          )
        })
      )}
      {!searching && hits.length > 0 && (
        <span className="ml-auto text-ink-4">{`${hits.length} ${plural(hits.length, 'file')}`}</span>
      )}
    </div>
  )

  const pane = (
    <div
      key={searching ? `search:${query.trim().toLowerCase()}` : path.join('/')}
      className="bb-swap flex min-h-0 flex-1 flex-col"
    >
      {where}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 max-md:px-4">
        {/* A folder of folders lists them; a tap goes in. */}
        {!searching && folder.folders.length > 0 && (
          <div className="mb-3 flex flex-col">
            {folder.folders.map((f) => (
              <button
                key={f.name}
                type="button"
                onClick={() => go([...path, f.name])}
                className="flex h-11 items-center gap-3 border-b border-(--cal-line) text-left text-[13.5px] text-ink-2 transition-colors last:border-b-0 hover:text-ink max-md:h-12 max-md:text-[14.5px]"
              >
                <span className="text-ink-4">
                  <FolderGlyph />
                </span>
                <span className="flex-1">{f.name}</span>
                <span aria-hidden="true" className="text-[12px] text-ink-4">
                  {count(f) || ''}
                </span>
                <span className="-rotate-90 text-ink-4">
                  <ChevronIcon size={10} />
                </span>
              </button>
            ))}
          </div>
        )}
        {hits.length > 0 ? (
          <Tiles
            hits={hits}
            picked={picked}
            room={room}
            full={full}
            cols={phone ? 3 : 4}
            showPath={searching}
            onToggle={toggle}
          />
        ) : (
          folder.folders.length === 0 && (
            <p className="py-10 text-center text-[13px] text-ink-4">{searching ? '' : 'Empty'}</p>
          )
        )}
      </div>
    </div>
  )

  const n = picked.length
  const add = (
    <button
      type="button"
      aria-disabled={n === 0}
      onClick={() => n > 0 && leave(() => onPick(picked))}
      className={`h-10 shrink-0 rounded-full px-5 text-[13px] font-medium max-md:h-11 max-md:text-[14px] ${n > 0 ? 'bb-press bg-ink text-page' : 'cursor-not-allowed bg-surface text-ink-4'}`}
    >
      {n > 0 ? `Add ${n}` : 'Select photos'}
    </button>
  )
  const status = n > 0 && (
    <div className="flex min-w-0 items-center gap-3 text-[13px]">
      <span className="text-ink-2 tabular-nums">
        {full ? `${n} of ${room} selected` : `${n} selected`}
      </span>
      <button
        type="button"
        onClick={() => {
          setPicked([])
          anchor.current = null
        }}
        className="text-ink-4 transition-colors hover:text-ink"
      >
        Clear
      </button>
    </div>
  )

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 max-md:items-end max-md:p-0">
      <button
        type="button"
        aria-label="Close"
        onClick={() => close()}
        className={`absolute inset-0 bg-ink/30 ${leaving ? 'bb-fade-out' : 'bb-fade'}`}
      />
      <div
        ref={box}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Google Drive"
        inert={leaving}
        className={`${leaving ? 'bb-leave max-md:bb-sheet-down' : 'bb-rise max-md:bb-sheet-up'} relative flex h-[min(620px,calc(100svh-48px))] w-[860px] max-w-full flex-col overflow-hidden rounded-[18px] bg-page shadow-sheet outline-none max-md:h-[calc(100svh-12px)] max-md:w-full max-md:rounded-[22px] max-md:rounded-b-none max-md:pb-[env(safe-area-inset-bottom)]`}
      >
        {phone ? (
          <>
            <span aria-hidden="true" className="mx-auto mt-2 h-1 w-9 rounded-full bg-track" />
            <div className="flex h-12 items-center justify-between pr-2 pl-4">
              <span className="flex items-center gap-2 text-[16px] font-medium">
                <DriveGlyph size={14} />
                Google Drive
              </span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => close()}
                className="flex size-10 items-center justify-center rounded-full text-ink-3 transition-colors hover:text-ink"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="px-4 pt-1 pb-3">{field}</div>
            <Chips root={drive.root} path={path} searching={searching} onGo={go} />
          </>
        ) : (
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-(--cal-line) pr-3 pl-5">
            <span className="flex items-center gap-2 text-[14px] font-medium">
              <DriveGlyph size={14} />
              Google Drive
            </span>
            <div className="ml-auto w-[260px]">{field}</div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => close()}
              className={ROUND_BUTTON}
            >
              <CloseIcon />
            </button>
          </div>
        )}
        <div className="flex min-h-0 flex-1">
          {!phone && <Tree root={drive.root} path={path} searching={searching} onGo={go} />}
          {pane}
        </div>
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-t border-(--cal-line) px-5 max-md:h-[68px] max-md:px-4">
          <div className="min-w-0 flex-1">{status}</div>
          <div className="flex items-center gap-1">
            {!phone && (
              <button type="button" onClick={() => close()} className={QUIET}>
                Cancel
              </button>
            )}
            {add}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Tab stays inside the picker: from its last control it goes to the first, and back. */
function trap(e: KeyboardEvent, box: HTMLElement) {
  const nodes = [...box.querySelectorAll<HTMLElement>('button, input, [tabindex="0"]')]
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  if (!first || !last) return
  const at = document.activeElement
  if (e.shiftKey && (at === first || at === box)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && at === last) {
    e.preventDefault()
    first.focus()
  }
}

/** The files in a folder and its folders. */
function count(folder: DriveFolder): number {
  return folder.files.length + folder.folders.reduce((n, f) => n + count(f), 0)
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`
}

// ── Folders ──────────────────────────────────────────────────────────────────────────────────

/** A desktop's folder column: every folder at once, a folder of folders open under its row. */
function Tree({
  root,
  path,
  searching,
  onGo,
}: {
  root: DriveFolder
  path: string[]
  searching: boolean
  onGo: (path: string[]) => void
}) {
  const [closed, setClosed] = React.useState<string[]>([])
  const row = (folder: DriveFolder, at: string[], depth: number): React.ReactNode => {
    const key = at.join('/')
    const here = !searching && key === path.join('/')
    const parent = folder.folders.length > 0
    const open = parent && !closed.includes(key)
    return (
      <React.Fragment key={key}>
        <div className="relative flex items-center">
          <button
            type="button"
            aria-current={here ? 'true' : undefined}
            onClick={() => onGo(at)}
            style={{ paddingLeft: 10 + depth * 14 }}
            className={`flex h-8 min-w-0 flex-1 items-center gap-2 rounded-[8px] pr-2 text-left text-[13px] transition-colors ${here ? 'bg-surface font-medium text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}
          >
            <span className={here ? 'text-ink' : 'text-ink-4'}>
              <FolderGlyph size={14} />
            </span>
            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
            {!parent && folder.files.length > 0 && (
              <span aria-hidden="true" className="font-mono text-[10.5px] text-ink-4 tabular-nums">
                {folder.files.length}
              </span>
            )}
          </button>
          {parent && (
            <button
              type="button"
              aria-label={`${open ? 'Collapse' : 'Expand'} ${folder.name}`}
              aria-expanded={open}
              onClick={() => setClosed((c) => (open ? [...c, key] : c.filter((k) => k !== key)))}
              className="absolute right-1 flex size-6 items-center justify-center rounded-full text-ink-4 transition-colors hover:text-ink"
            >
              <ChevronIcon size={9} open={open} />
            </button>
          )}
        </div>
        {open && folder.folders.map((f) => row(f, [...at, f.name], depth + 1))}
      </React.Fragment>
    )
  }
  return (
    <nav
      aria-label="Folders"
      className="flex w-[200px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-(--cal-line) px-2 pt-4 pb-3"
    >
      <span className={`${EYEBROW} mb-2 px-2.5`}>{root.name}</span>
      {root.folders.map((f) => row(f, [f.name], 0))}
    </nav>
  )
}

/** A phone's folder row: every folder that holds files, as a chip, scrolling sideways. */
function Chips({
  root,
  path,
  searching,
  onGo,
}: {
  root: DriveFolder
  path: string[]
  searching: boolean
  onGo: (path: string[]) => void
}) {
  const leaves = root.folders.flatMap((f) =>
    f.folders.length > 0 ? f.folders.map((m) => [f.name, m.name]) : [[f.name]],
  )
  return (
    <nav
      aria-label="Folders"
      className="flex shrink-0 gap-1.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none]"
    >
      {leaves.map((at) => {
        const here = !searching && at.join('/') === path.join('/')
        return (
          <button
            key={at.join('/')}
            type="button"
            aria-current={here ? 'true' : undefined}
            onClick={() => onGo(at)}
            className={`h-8 shrink-0 rounded-full px-3 text-[12.5px] font-medium whitespace-nowrap transition-colors ${here ? 'bg-ink text-page' : 'bg-surface text-ink-2'}`}
          >
            {at[at.length - 1]}
          </button>
        )
      })}
    </nav>
  )
}

// ── Tiles ────────────────────────────────────────────────────────────────────────────────────

/**
 * The files as a grid of tiles. One tile is in the Tab order; the arrow keys move between them,
 * Space or Enter ticks one. A video shows its poster and its length, and never plays here.
 */
function Tiles({
  hits,
  picked,
  room,
  full,
  cols,
  showPath,
  onToggle,
}: {
  hits: DriveHit[]
  picked: string[]
  room: number
  full: boolean
  cols: number
  /** Search results say which folder each file is in. */
  showPath: boolean
  onToggle: (index: number, shift: boolean) => void
}) {
  const [cursor, setCursor] = React.useState(0)
  const grid = React.useRef<HTMLDivElement>(null)

  function focus(i: number) {
    const next = Math.max(0, Math.min(hits.length - 1, i))
    setCursor(next)
    grid.current?.querySelectorAll<HTMLElement>('[role="checkbox"]')[next]?.focus()
  }
  function onKey(e: React.KeyboardEvent, i: number, resting: boolean) {
    const step: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: cols,
      ArrowUp: -cols,
    }
    if (e.key in step) {
      e.preventDefault()
      focus(i + step[e.key]!)
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      focus(e.key === 'Home' ? 0 : hits.length - 1)
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      if (!resting) onToggle(i, e.shiftKey)
    }
  }

  return (
    <div
      ref={grid}
      className="grid gap-x-2.5 gap-y-3 select-none"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {hits.map(({ file, path }, i) => {
        const order = picked.indexOf(file.src)
        const on = order >= 0
        const resting = full && !on
        return (
          <div
            key={file.src}
            role="checkbox"
            aria-checked={on}
            aria-disabled={resting || undefined}
            aria-label={file.name}
            tabIndex={i === cursor ? 0 : -1}
            onFocus={() => setCursor(i)}
            onClick={(e) => !resting && onToggle(i, e.shiftKey)}
            onKeyDown={(e) => onKey(e, i, resting)}
            className="group flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-[12px] text-left outline-offset-4"
          >
            <span
              className={`relative block aspect-square w-full overflow-hidden rounded-[10px] bg-tile transition-[box-shadow,opacity] duration-200 ${on ? 'shadow-[0_0_0_2px_var(--page),0_0_0_4px_var(--ink)]' : ''} ${resting ? 'opacity-40' : ''}`}
            >
              <Media src={file.src} sizes="200px" />
              {on ? (
                <span className="bb-pop absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-ink font-mono text-[10.5px] text-page tabular-nums">
                  {room === 1 ? <CheckIcon size={8} strokeWidth={2.4} /> : order + 1}
                </span>
              ) : (
                <span className="absolute top-1.5 right-1.5 size-5 rounded-full bg-black/20 opacity-0 shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.9)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100" />
              )}
              {isVideo(file.src) && file.duration && (
                <span className="absolute right-1.5 bottom-1.5 rounded-full bg-black/50 px-1.5 font-mono text-[10px] text-page tabular-nums">
                  {file.duration}
                </span>
              )}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[11.5px] text-ink-3">{file.name}</span>
              {showPath && (
                <span className="truncate text-[11px] text-ink-4">{path.join(' › ')}</span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Glyphs ───────────────────────────────────────────────────────────────────────────────────

/** Drive's mark as a plain outline, in the text colour: the word says whose it is. */
export function DriveGlyph({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8.2 3h7.6l6.2 10.8-3.8 6.7H5.8L2 13.8 8.2 3Zm0 0 7.6 13.2M15.8 3 8.4 16.2M2 13.8h20"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function FolderGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-12Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SearchGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="4.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.4 9.4L12.6 12.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
