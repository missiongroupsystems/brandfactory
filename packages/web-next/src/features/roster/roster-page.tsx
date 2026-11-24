'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

import { AppHeader } from '@/components/app-header'
import { BrandMark } from '@/components/brand-mark'
import { ArrowUpRightIcon, ChevronIcon, CloseIcon } from '@/components/icons'
import { usePhone } from '@/components/use-phone'
import { PlatformLogo } from '@/components/platform-logos'
import { ProfilePicture } from '@/components/profile-picture'
import type { RosterAccount, RosterPerson, RosterStatus } from '@/data/roster'
import { useSavedIg } from '@/features/publish/collaborators-store'
import { useBrand } from '@/features/schedule/posts-store'
import { remote } from '@/lib/remote'

import {
  filterHandles,
  filterRoster,
  followersOf,
  LOGO,
  mainOf,
  PLATFORM_NAME,
  pictureOf,
  profileUrl,
  savedHandles,
  type SavedHandle,
  STATUS_NAME,
  shownStatus,
  type StatusFilter,
} from './model'
import { initialsOf } from './people'
import {
  editPerson,
  nameHandle,
  useOrgOf,
  useProfiles,
  useRoster,
  useNotes,
  useRosterLoaded,
} from './roster-store'

/**
 * Creators: the company's influencer roster, every brand's people in one list. At a glance each
 * person's picture, name, main handle and platforms, followers and the brands they work with; a
 * search and two quiet filters (brand, status); a person opens in a side panel with all their
 * accounts, their status, the brands they are linked to and the team's notes.
 *
 * Beside the people, the Instagram accounts the brands saved as collaborators that no one on the
 * roster holds: each named in place (a press on it opens a field; Enter saves, Escape leaves), the
 * name the post page then shows for it.
 *
 * The people show as a grid of cards, and as a list of rows on a phone.
 */

type Entry = { kind: 'person'; p: RosterPerson } | { kind: 'handle'; h: SavedHandle }
const entryName = (e: Entry) => (e.kind === 'person' ? e.p.name : (e.h.name ?? e.h.handle))
/** The followers a card shows: the person's main account's, or the saved handle's. */
const entryFollowers = (e: Entry) =>
  e.kind === 'person' ? (mainOf(e.p)?.followers ?? null) : e.h.followers
const handleKey = (h: SavedHandle) => `${h.orgId}:${h.handle}`
const entryKey = (e: Entry) => (e.kind === 'person' ? e.p.id : handleKey(e.h))

/** The statuses to filter by and to set: a prospect counts as active (`shownStatus`). */
const STATUSES: RosterStatus[] = ['active', 'past']

const noop = () => () => {}
const yes = () => true
const no = () => false

/** How long the panel takes to slide out (bb-sheet-out). */
const PANEL_OUT_MS = 240

export function RosterPage() {
  const people = useRoster()
  const loaded = useRosterLoaded()
  const { brands } = useBrand()
  const [query, setQuery] = React.useState('')
  const [brand, setBrand] = React.useState<string>('all')
  const [status, setStatus] = React.useState<StatusFilter>('all')
  const [sort, setSort] = React.useState<'name' | 'followers'>('name')
  const [open, setOpen] = React.useState<string | null>(null)
  // A phone lists the people in rows; a wider screen shows them as cards.
  const phone = usePhone()
  // The server cannot tell a phone: the people show once the browser has said which it is.
  const client = React.useSyncExternalStore(noop, yes, no)
  // The panel slides out before it goes: closing marks it leaving, then takes it away.
  const [leaving, setLeaving] = React.useState(false)
  const leave = React.useRef<number | undefined>(undefined)
  const openPerson = (id: string) => {
    window.clearTimeout(leave.current)
    setLeaving(false)
    setOpen(id)
  }
  const closePerson = () => {
    // A second close while the panel leaves starts no second timer.
    window.clearTimeout(leave.current)
    setLeaving(true)
    leave.current = window.setTimeout(() => {
      setOpen(null)
      setLeaving(false)
    }, PANEL_OUT_MS)
  }
  React.useEffect(() => () => window.clearTimeout(leave.current), [])
  const orgOf = useOrgOf()
  const profiles = useProfiles()
  const saved = useSavedIg(brands.map((b) => b.id))
  const handles = savedHandles(saved, orgOf, people, profiles)
  const filters = { query, brand, status }
  const shown: Entry[] = [
    ...filterRoster(people, filters).map((p) => ({ kind: 'person' as const, p })),
    ...filterHandles(handles, filters).map((h) => ({ kind: 'handle' as const, h })),
  ].sort(
    (a, b) =>
      // By followers, most first (none known goes last); by name otherwise, and between equals.
      (sort === 'followers' ? (entryFollowers(b) ?? -1) - (entryFollowers(a) ?? -1) : 0) ||
      entryName(a).localeCompare(entryName(b)),
  )
  // The entry the panel shows, from everyone (a filter that hides it leaves the panel open).
  const person = people.find((p) => p.id === open)
  const handle = handles.find((h) => handleKey(h) === open)
  const entry: Entry | null = person
    ? { kind: 'person', p: person }
    : handle
      ? { kind: 'handle', h: handle }
      : null
  const filtered = query.trim() !== '' || brand !== 'all' || status !== 'all'

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[1120px] flex-col px-10 pb-24 max-md:px-4">
        <div className="flex items-end justify-between gap-6 pt-8 pb-7 max-lg:flex-col max-lg:items-start max-md:items-stretch max-md:gap-5 max-md:pt-4">
          <h1 className="font-display text-[40px] leading-none tracking-[-0.035em] max-md:text-[30px]">
            Creators
            <span className="ml-3 align-middle font-sans text-[15px] tracking-normal text-ink-4 tabular-nums">
              {loaded ? people.length + handles.length : ''}
            </span>
          </h1>
          {/* On a phone: the search on its own line, the three lists side by side under it. */}
          <div className="flex items-center gap-2 max-md:grid max-md:grid-cols-3">
            <label className="relative max-md:col-span-3">
              <span className="sr-only">Search creators</span>
              <SearchGlyph />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="h-9 w-[220px] rounded-full bg-surface-2 pr-8 pl-9 text-[13.5px] outline-none placeholder:text-ink-5 focus:bg-surface max-md:w-full [&::-webkit-search-cancel-button]:hidden"
              />
              {query !== '' && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery('')}
                  className="bb-pop absolute top-1/2 right-2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <CloseIcon size={8} />
                </button>
              )}
            </label>
            <Select
              label="Brand"
              value={brand}
              onChange={setBrand}
              options={[
                { value: 'all', label: 'All brands' },
                ...brands.map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
            <Select
              label="Status"
              value={status}
              onChange={(v) => setStatus(v as StatusFilter)}
              options={[
                { value: 'all', label: 'Any status' },
                ...STATUSES.map((s) => ({ value: s, label: STATUS_NAME[s] })),
              ]}
            />
            <Select
              label="Sort"
              value={sort}
              onChange={(v) => setSort(v === 'followers' ? 'followers' : 'name')}
              options={[
                { value: 'name', label: 'By name' },
                { value: 'followers', label: 'By followers' },
              ]}
            />
          </div>
        </div>

        {!client ? null : !loaded ? (
          <p className="py-16 text-center text-[14px] text-ink-4">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="py-16 text-center text-[14px] text-ink-4">
            {filtered ? 'No one matches.' : 'No creators yet.'}
          </p>
        ) : phone ? (
          <Rows entries={shown} onOpen={openPerson} />
        ) : (
          <Grid entries={shown} onOpen={openPerson} />
        )}
      </main>
      {entry && <Panel entry={entry} leaving={leaving} onClose={closePerson} />}
    </div>
  )
}

// ── Parts ───────────────────────────────────────────────────────────────────────────────────

function SearchGlyph() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-4"
    >
      <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="relative flex min-w-0 items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-0 cursor-pointer appearance-none truncate rounded-full bg-surface-2 pr-8 pl-3.5 text-[13.5px] text-ink-2 outline-none hover:bg-surface focus:bg-surface max-md:w-full max-md:pr-6 max-md:pl-3"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 text-ink-4 max-md:right-2.5">
        <ChevronIcon open={false} size={9} />
      </span>
    </label>
  )
}

/** A person's picture, or their initials on the app's avatar colour. */
function Avatar({ person, size }: { person: RosterPerson; size: number }) {
  const picture = pictureOf(person)
  return (
    <ProfilePicture
      src={picture ?? undefined}
      size={size}
      className="rounded-full shadow-[inset_0_0_0_1px_var(--line)]"
    >
      <span
        aria-hidden="true"
        className="flex shrink-0 items-center justify-center rounded-full font-semibold"
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * 0.36),
          background: 'var(--avatar)',
          color: 'var(--avatar-ink)',
        }}
      >
        {initialsOf(person.name)}
      </span>
    </ProfilePicture>
  )
}

/** A saved handle's picture, or the initials of its name (else of its handle). */
function HandleAvatar({ h, size }: { h: SavedHandle; size: number }) {
  return (
    <ProfilePicture
      src={h.picture ?? undefined}
      size={size}
      className="rounded-full shadow-[inset_0_0_0_1px_var(--line)]"
    >
      <span
        aria-hidden="true"
        className="flex shrink-0 items-center justify-center rounded-full font-semibold"
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * 0.36),
          background: 'var(--avatar)',
          color: 'var(--avatar-ink)',
        }}
      >
        {initialsOf(h.name ?? h.handle)}
      </span>
    </ProfilePicture>
  )
}

/** Line two of a saved handle: its platform and handle, or the platform alone until it is named. */
function HandleLine({ h }: { h: SavedHandle }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-4">
      <span className="truncate">{h.name ? `@${h.handle}` : 'Instagram'}</span>
      <PlatformLogo platform="ig" size={11} />
    </span>
  )
}

function Logo({ platform, size = 12 }: { platform: RosterAccount['platform']; size?: number }) {
  const key = LOGO[platform]
  return key ? (
    <PlatformLogo platform={key} size={size} />
  ) : (
    <span className="font-mono text-[9.5px] leading-none font-medium tracking-tight">XHS</span>
  )
}

/** The main handle, with the logo of each platform the person is on. */
function Handle({ person }: { person: RosterPerson }) {
  const main = mainOf(person)
  if (!main) return null
  const platforms = [...new Set(person.accounts.map((a) => a.platform))]
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-4">
      <span className="truncate">@{main.handle}</span>
      <span className="flex shrink-0 items-center gap-1">
        {platforms.map((p) => (
          <span key={p} title={PLATFORM_NAME[p]} className="flex">
            <Logo platform={p} size={11} />
          </span>
        ))}
      </span>
    </span>
  )
}

/** How many brand coins show before the row scrolls sideways. */
const BRANDS_SHOWN = 4
const BRAND_GAP = 4

/** The width the brand coins take: the same on every row, so the columns line up. */
const brandsWidth = (size: number) => BRANDS_SHOWN * size + (BRANDS_SHOWN - 1) * BRAND_GAP

/**
 * The brands a person works with, as coins side by side. Past four, the row scrolls sideways
 * (a thin, quiet bar) and fades at the edge where more wait. `end` puts a short row at the right.
 */
function Brands({ ids, size = 18, end = false }: { ids: string[]; size?: number; end?: boolean }) {
  const { brands } = useBrand()
  // In the switcher's order, so the same brand sits in the same place on every row.
  const named = brands.filter((b) => ids.includes(b.id))
  const row = React.useRef<HTMLSpanElement>(null)
  const [fade, setFade] = React.useState({ left: false, right: false })
  const measure = React.useCallback(() => {
    const el = row.current
    if (!el) return
    const left = el.scrollLeft > 1
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setFade((f) => (f.left === left && f.right === right ? f : { left, right }))
  }, [])
  React.useLayoutEffect(measure, [measure, named.length])
  const mask =
    fade.left || fade.right
      ? `linear-gradient(to right, ${fade.left ? 'transparent, black 14px' : 'black'}, ${fade.right ? 'black calc(100% - 14px), transparent' : 'black'})`
      : undefined
  return (
    <span
      ref={row}
      onScroll={measure}
      role={named.length > 0 ? 'img' : undefined}
      aria-label={named.map((b) => b.name).join(', ') || undefined}
      className="flex shrink-0 items-center overflow-x-auto overscroll-x-contain [scrollbar-color:var(--line-strong)_transparent] [scrollbar-width:thin]"
      style={{ width: brandsWidth(size), gap: BRAND_GAP, maskImage: mask, WebkitMaskImage: mask }}
    >
      {named.map((b, i) => (
        <span
          key={b.id}
          className={`flex shrink-0 ${end && i === 0 ? 'ms-auto' : ''}`}
          title={b.name}
        >
          <BrandMark brandId={b.id} size={size} />
        </span>
      ))}
    </span>
  )
}

// ── The grid of cards ───────────────────────────────────────────────────────────────────────

const CARD =
  'flex h-full w-full flex-col items-center gap-3 rounded-[18px] bg-page px-4 pt-6 pb-4 text-center shadow-[0_0_0_1px_var(--line)] outline-none transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_var(--line-strong),var(--shadow-soft)] focus-visible:-translate-y-0.5 focus-visible:shadow-[0_0_0_1px_var(--line-strong),var(--shadow-soft)] active:translate-y-0 active:scale-[0.98] active:duration-150'

function CardHandle({ h, onOpen }: { h: SavedHandle; onOpen: (key: string) => void }) {
  return (
    <button type="button" onClick={() => onOpen(handleKey(h))} className={CARD}>
      <HandleAvatar h={h} size={64} />
      <span className="flex w-full min-w-0 flex-col items-center gap-0.5">
        <span className={`w-full truncate text-[15px] font-medium ${h.name ? '' : 'text-ink-2'}`}>
          {h.name ?? h.handle}
        </span>
        <span className="flex max-w-full justify-center">
          <HandleLine h={h} />
        </span>
      </span>
      <span className="mt-auto flex w-full items-center justify-between pt-1">
        <CardFollowers n={h.followers} />
        <Brands ids={h.brands} size={20} end />
      </span>
    </button>
  )
}

/** A card's followers, in words: the number stays in its place, a dash while none is known. */
function CardFollowers({ n }: { n: number | null | undefined }) {
  return (
    <span className="whitespace-nowrap text-[13px] text-ink-3 tabular-nums">
      {n == null ? (
        <span className="text-ink-5">–</span>
      ) : (
        <>
          <span className="font-medium text-ink">{followersOf(n)}</span> followers
        </>
      )}
    </span>
  )
}

function Grid({ entries, onOpen }: { entries: Entry[]; onOpen: (id: string) => void }) {
  return (
    <ul className="grid grid-cols-4 gap-3 max-lg:grid-cols-3">
      {entries.map((e, i) => (
        // A card that comes into the grid rises in; the first screen's cards follow each other.
        <li
          key={entryKey(e)}
          className="bb-card-in"
          style={{ animationDelay: `${Math.min(i, 12) * 24}ms` }}
        >
          {e.kind === 'handle' ? (
            <CardHandle h={e.h} onOpen={onOpen} />
          ) : (
            <CardPerson p={e.p} onOpen={onOpen} />
          )}
        </li>
      ))}
    </ul>
  )
}

function CardPerson({ p, onOpen }: { p: RosterPerson; onOpen: (id: string) => void }) {
  return (
    <button type="button" onClick={() => onOpen(p.id)} className={CARD}>
      <Avatar person={p} size={64} />
      <span className="flex w-full min-w-0 flex-col items-center gap-0.5">
        <span className="w-full truncate text-[15px] font-medium">{p.name}</span>
        <span className="flex max-w-full justify-center">
          <Handle person={p} />
        </span>
      </span>
      <span className="mt-auto flex w-full items-center justify-between pt-1">
        <CardFollowers n={mainOf(p)?.followers} />
        <Brands ids={p.brands} size={20} end />
      </span>
    </button>
  )
}

// ── The rows, on a phone ────────────────────────────────────────────────────────────────────

const ROW =
  'grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-[12px] px-2 py-3 text-left outline-none transition-[background-color,transform] duration-200 active:scale-[0.985] active:bg-surface-2'

function RowEnd({ n, ids }: { n: number | null | undefined; ids: string[] }) {
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="text-[14px] text-ink-2 tabular-nums">
        {n == null ? <span className="text-ink-5">–</span> : followersOf(n)}
      </span>
      <Brands ids={ids} size={18} end />
    </span>
  )
}

function Rows({ entries, onOpen }: { entries: Entry[]; onOpen: (id: string) => void }) {
  return (
    <ul className="-mx-2 flex flex-col">
      {entries.map((e, i) => (
        <li
          key={entryKey(e)}
          className="bb-card-in border-t border-line first:border-t-0"
          style={{ animationDelay: `${Math.min(i, 12) * 24}ms` }}
        >
          {e.kind === 'handle' ? (
            <RowHandle h={e.h} onOpen={onOpen} />
          ) : (
            <RowPerson p={e.p} onOpen={onOpen} />
          )}
        </li>
      ))}
    </ul>
  )
}

function RowPerson({ p, onOpen }: { p: RosterPerson; onOpen: (id: string) => void }) {
  return (
    <button type="button" onClick={() => onOpen(p.id)} className={ROW}>
      <Avatar person={p} size={40} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[15px] font-medium">{p.name}</span>
        <Handle person={p} />
      </span>
      <RowEnd n={mainOf(p)?.followers} ids={p.brands} />
    </button>
  )
}

function RowHandle({ h, onOpen }: { h: SavedHandle; onOpen: (key: string) => void }) {
  return (
    <button type="button" onClick={() => onOpen(handleKey(h))} className={ROW}>
      <HandleAvatar h={h} size={40} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={`truncate text-[15px] font-medium ${h.name ? '' : 'text-ink-2'}`}>
          {h.name ?? h.handle}
        </span>
        <HandleLine h={h} />
      </span>
      <RowEnd n={h.followers} ids={h.brands} />
    </button>
  )
}

// ── The person ──────────────────────────────────────────────────────────────────────────────

const LABEL = 'text-[12px] font-medium text-ink-4'

function Panel({
  entry,
  leaving,
  onClose,
}: {
  entry: Entry
  leaving: boolean
  onClose: () => void
}) {
  const close = React.useEffectEvent(onClose)
  const panel = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // A field being typed in saves on blur: it blurs before the panel goes.
      const field = document.activeElement
      if (field instanceof HTMLElement && panel.current?.contains(field)) field.blur()
      close()
    }
    window.addEventListener('keydown', onKey)
    const opener = document.activeElement as HTMLElement | null
    panel.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className={`${leaving ? 'bb-fade-out' : 'bb-fade'} absolute inset-0 bg-ink/10`}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={entryName(entry)}
        tabIndex={-1}
        className={`${leaving ? 'bb-sheet-out max-md:bb-push-out' : 'bb-sheet max-md:bb-push'} relative flex h-full w-[440px] max-w-full flex-col overflow-y-auto bg-page shadow-sheet outline-none`}
      >
        <div className="flex justify-end px-4 pt-4">
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-surface hover:text-ink"
          >
            <CloseIcon size={10} />
          </button>
        </div>
        {entry.kind === 'person' ? (
          <PersonBody key={entry.p.id} person={entry.p} />
        ) : (
          <HandleBody key={handleKey(entry.h)} h={entry.h} />
        )}
      </div>
    </div>,
    document.body,
  )
}

function PersonBody({ person }: { person: RosterPerson }) {
  const { brands } = useBrand()
  const orgOf = useOrgOf()
  // Only the person's own company's brands can be linked.
  const theirs = brands.filter((b) => !remote || orgOf(b.id) === person.orgId)
  return (
    <div className="flex flex-col gap-8 px-8 pb-10">
      <div className="flex flex-col items-start gap-4">
        <Avatar person={person} size={72} />
        <NameField person={person} />
      </div>

      <section className="flex flex-col gap-2.5">
        <span className={LABEL}>Status</span>
        <div role="radiogroup" aria-label="Status" className="flex gap-1.5">
          {STATUSES.map((s) => {
            const on = shownStatus(person.status) === s
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => !on && editPerson(person.id, { status: s })}
                className={`h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors ${on ? 'bg-ink text-page' : 'bg-surface-2 text-ink-3 hover:text-ink'}`}
              >
                {STATUS_NAME[s]}
              </button>
            )
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <span className={LABEL}>Accounts</span>
        {person.accounts.map((a) => (
          <AccountLink
            key={`${a.platform}:${a.handle}`}
            platform={a.platform}
            handle={a.handle}
            followers={a.followers}
            href={profileUrl(a)}
          />
        ))}
      </section>

      <section className="flex flex-col gap-1">
        <span className={`${LABEL} pb-1.5`}>Brands</span>
        {/* A person is linked to a brand by the brand's posts that name them. */}
        {theirs.filter((b) => person.brands.includes(b.id)).length === 0 ? (
          <span className="text-[13.5px] text-ink-4">
            Linked when a brand’s post tags them or collaborates with them.
          </span>
        ) : (
          theirs
            .filter((b) => person.brands.includes(b.id))
            .map((b) => (
              <div key={b.id} className="flex items-center gap-3 py-1.5">
                <BrandMark brandId={b.id} size={22} />
                <span className="flex-1 text-[14px] text-ink">{b.name}</span>
              </div>
            ))
        )}
      </section>

      <section className="flex flex-col gap-2.5">
        <span className={LABEL}>Notes</span>
        <NotesField person={person} />
      </section>
    </div>
  )
}

/**
 * One of a creator's accounts, as a link to it on its platform: the platform's mark, the handle,
 * the platform and followers under it, and an arrow that leans out on hover.
 */
function AccountLink({
  platform,
  handle,
  followers,
  href,
}: {
  platform: RosterAccount['platform']
  handle: string
  followers: number | null
  href: string
}) {
  const where = PLATFORM_NAME[platform]
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`@${handle} on ${where}`}
      className="group flex items-center gap-3 rounded-[14px] bg-surface-2 px-3 py-2.5 transition-[background-color,transform] duration-200 outline-none hover:bg-surface focus-visible:bg-surface active:scale-[0.985]"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-page text-ink shadow-[0_0_0_1px_var(--line)]">
        <Logo platform={platform} size={16} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-medium text-ink">@{handle}</span>
        <span className="text-[12.5px] text-ink-4 tabular-nums">
          {where}
          {followers != null && ` · ${followersOf(followers)} followers`}
        </span>
      </span>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-4 transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink">
        <ArrowUpRightIcon size={11} />
      </span>
    </a>
  )
}

/** A saved collaborator no one on the roster holds: its name for the company, its account. */
function HandleBody({ h }: { h: SavedHandle }) {
  const { brands } = useBrand()
  const named = brands.filter((b) => h.brands.includes(b.id))
  return (
    <div className="flex flex-col gap-8 px-8 pb-10">
      <div className="flex flex-col items-start gap-1.5">
        <HandleAvatar h={h} size={72} />
        <span className="h-2.5" />
        <HandleNameField h={h} />
        <span className="text-[13.5px] text-ink-4">Not on the roster</span>
      </div>

      <section className="flex flex-col gap-2">
        <span className={LABEL}>Accounts</span>
        <AccountLink
          platform="instagram"
          handle={h.handle}
          followers={h.followers}
          href={`https://www.instagram.com/${encodeURIComponent(h.handle)}/`}
        />
      </section>

      <section className="flex flex-col gap-1">
        <span className={`${LABEL} pb-1.5`}>Brands</span>
        {named.map((b) => (
          <div key={b.id} className="flex items-center gap-3 py-1.5">
            <BrandMark brandId={b.id} size={22} />
            <span className="flex-1 text-[14px] text-ink">{b.name}</span>
          </div>
        ))}
      </section>
    </div>
  )
}

/**
 * A saved handle's name for the company, edited in place; saved when the field is left. An empty
 * field takes the name away, and the handle shows instead.
 */
function HandleNameField({ h }: { h: SavedHandle }) {
  const [name, setName] = React.useState(h.name ?? '')
  const save = () => {
    const next = name.trim()
    if (next !== (h.name ?? '')) nameHandle(h.orgId, h.handle, next || null)
    setName(next)
  }
  return (
    <input
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      aria-label="Name"
      placeholder={h.handle}
      maxLength={200}
      className="-mx-1 w-full rounded-[8px] bg-transparent px-1 font-display text-[28px] leading-tight tracking-[-0.03em] outline-none placeholder:text-ink-4 hover:bg-surface-2 focus:bg-surface-2"
    />
  )
}

/** The name, edited in place; saved when the field is left with a name that changed. */
function NameField({ person }: { person: RosterPerson }) {
  const [name, setName] = React.useState(person.name)
  const save = () => {
    const next = name.trim()
    if (next && next !== person.name) editPerson(person.id, { name: next })
    else setName(person.name)
  }
  return (
    <input
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      aria-label="Name"
      maxLength={120}
      className="-mx-1 w-full rounded-[8px] bg-transparent px-1 font-display text-[28px] leading-tight tracking-[-0.03em] outline-none hover:bg-surface-2 focus:bg-surface-2"
    />
  )
}

/** The team's notes on the person, never published; saved when the field is left. */
function NotesField({ person }: { person: RosterPerson }) {
  const { notes, failed, retry } = useNotes(person)
  if (failed)
    return (
      <p className="text-[13.5px] text-ink-4">
        Couldn’t load the notes.{' '}
        <button type="button" onClick={retry} className="text-ink underline underline-offset-2">
          Try again
        </button>
      </p>
    )
  if (notes === null)
    return <div aria-hidden="true" className="h-[88px] rounded-[12px] bg-surface-2" />
  return <NotesInput person={person} saved={notes} />
}

function NotesInput({ person, saved }: { person: RosterPerson; saved: string }) {
  const [notes, setNotes] = React.useState(saved)
  const was = React.useRef(saved)
  const field = React.useRef<HTMLTextAreaElement>(null)
  // The field grows with what it holds.
  React.useLayoutEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [notes])
  return (
    <textarea
      ref={field}
      value={notes}
      onChange={(e) => setNotes(e.target.value)}
      onBlur={() => {
        if (notes === was.current) return
        was.current = notes
        editPerson(person.id, { notes })
      }}
      aria-label="Notes"
      placeholder="Rates, replies, who to ask…"
      rows={3}
      maxLength={20000}
      className="min-h-[88px] resize-none rounded-[12px] bg-surface-2 px-3.5 py-3 text-[14px] leading-[1.5] whitespace-pre-wrap outline-none placeholder:text-ink-5 focus:bg-surface"
    />
  )
}
