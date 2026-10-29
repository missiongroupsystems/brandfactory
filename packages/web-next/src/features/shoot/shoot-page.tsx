'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import { Fold } from '@/components/controls'
import { CheckIcon, CloseIcon, PlusIcon } from '@/components/icons'
import { Media } from '@/components/media'
import { cameFromApp, previousPath } from '@/components/path-trail'
import { Sheet } from '@/components/sheet'
import { Combobox } from '@/components/suggest'
import { usePhone } from '@/components/use-phone'
import type { Day } from '@/data/demo'
import { coverOf, type IdeaCard } from '@/data/ideas'
import { OUTLETS, ROLES, type Reply, type Shoot } from '@/data/shoots'
import { PAST_CREW, PAST_PLACES } from '@/data/suggestions'
import { dayLabel } from '@/features/ideate/calendar-slot'
import { DayPicker, type DayInfo } from '@/features/ideate/day-picker'
import { FormatIcon } from '@/features/ideate/idea-parts'
import { ConnectSheet } from '@/features/connections/connect-sheet'
import { useConnected } from '@/features/connections/connections-store'
import { editIdea, useIdeas } from '@/features/ideate/ideas-store'
import { useBrand } from '@/features/schedule/posts-store'
import { Comments } from '@/features/share/comments'
import { demoOf } from '@/lib/remote'
import { ShareButton } from '@/features/share/share-button'

import { moveStart, pastCrew, pastPlaces, replySummary, setEnd, SHOOT_TIMES } from './model'
import {
  addCrew,
  addIdeaToShoot,
  editShoot,
  removeIdeaFromShoot,
  removeCrew,
  sendInvites,
  setIdeaOrder,
  shootOfIdea,
  useInvited,
  useReplies,
  useShoots,
} from './shoots-store'
import { shotCount, ShotList } from './shot-list'

/**
 * A shoot's own page (`/shoot/<id>`): the call sheet, one column in the order someone on the day
 * asks for it. The head says when and where; Who comes lists the crew and sends the Lark
 * invites; the storyboard says what to shoot, built from each idea's shots, and what the
 * crew said on the share link sits beside it. Share gives the crew a link to the same sheet
 * without a login.
 *
 * The page belongs to the brand in the header. A shoot of another brand, or one a reload lost,
 * is not shown.
 */
export function ShootPage({ id }: { id: string }) {
  const { brand } = useBrand()
  const shoot = useShoots(brand.id).find((s) => s.id === id)
  return (
    <div className="flex min-h-svh flex-col">
      {/* A shoot is planned from Ideas: that tab stays lit. */}
      <AppHeader section="/ideate" />
      <main className="mx-auto w-full max-w-[1440px] px-10 pb-24 max-md:px-4 max-md:pt-2 max-md:pb-[calc(96px+env(safe-area-inset-bottom))]">
        {shoot ? (
          <CallSheet key={id} shoot={shoot} />
        ) : (
          <>
            <BackLink />
            <p className="pt-6 text-[14px] text-ink-3">
              This shoot is not here: it belongs to another brand, or a reload started the demo
              over.
            </p>
          </>
        )}
      </main>
    </div>
  )
}

/**
 * Back to where the shoot was opened from, named for it: Ideas or Schedule. Opened from outside
 * the app, Back would leave it: then the link goes to Ideas, the tab the page lights.
 */
function BackLink() {
  const router = useRouter()
  const pathname = usePathname()
  // Read on the client only, so the server's page and the first client render agree.
  const from = React.useSyncExternalStore(
    () => () => undefined,
    () => previousPath(pathname),
    () => null,
  )
  const label = from?.startsWith('/ideate') ? 'Ideas' : from === '/' ? 'Schedule' : 'Back'
  return (
    <Link
      href="/ideate"
      onClick={(e) => {
        if (!cameFromApp()) return
        e.preventDefault()
        router.back()
      }}
      className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-ink"
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path
          d="M9.5 6h-7M5.5 3l-3 3 3 3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </Link>
  )
}

/** A section's name across the top of it, with its count beside it in a quieter word. */
function Heading({ label, count }: { label: string; count?: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <h2 className="text-[16px] font-medium tracking-[-0.01em]">{label}</h2>
      {count && <span className="text-[13px] text-ink-4">{count}</span>}
    </span>
  )
}

const initials = (name: string) =>
  name
    .replace(/^Chef /, '')
    .split(' ')
    .map((w) => w.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase()

/** The sheet's one column; the feedback beside the shot list sits in the margin to its right. */
const COLUMN = 'max-w-[680px]'

function CallSheet({ shoot }: { shoot: Shoot }) {
  const { brand } = useBrand()
  const { ideas } = useIdeas(brand.id)
  const invited = useInvited(shoot.id)
  const replies = useReplies(shoot.id)
  const asked = shoot.crew.map((c) => c.name).filter((n) => invited.includes(n))
  const waiting = shoot.crew.length - asked.length
  // A shoot just planned from Ideate opens with its details out: it still needs a name and a day.
  const [editing, setEditing] = React.useState(shoot.title === 'New shoot')
  const cards = shoot.ideaIds.flatMap((id) => ideas.find((i) => i.id === id) ?? [])
  const shots = shotCount(cards)
  const edit = (fields: Parameters<typeof editShoot>[2]) => editShoot(brand.id, shoot.id, fields)
  // Without the brand's Lark calendar the invites have nowhere to go: they ask to connect first,
  // then go out. `then` is what runs once it is connected.
  const lark = useConnected(brand.id, 'lark')
  const [linking, setLinking] = React.useState<{ then?: () => void } | null>(null)
  // A new order of an idea's shots, from a drag or the keyboard, kept on the idea itself.
  const reorder = (ideaId: string, ids: string[]) =>
    editIdea(brand.id, ideaId, (c) => ({
      shots: ids.flatMap((id) => c.shots.filter((s) => s.id === id)),
    }))

  const invite = () => {
    const send = () => sendInvites(brand.id, shoot.id)
    if (lark) send()
    else setLinking({ then: send })
  }

  return (
    <article className="flex flex-col gap-10 max-md:gap-7">
      <div className="flex items-center justify-between gap-3">
        <BackLink />
        <ShareButton kind="shoot" id={shoot.id} compact />
      </div>

      <header className={`${COLUMN} flex flex-col gap-3`}>
        <h1 className="font-display text-[34px] leading-[1.08] tracking-[-0.03em] max-md:text-[28px]">
          {shoot.title}
        </h1>
        {/* The details are their own control: a tap on the line opens them to change. */}
        <button
          type="button"
          aria-label="Edit details"
          aria-expanded={editing}
          onClick={() => setEditing((e) => !e)}
          className="-mx-2 flex items-center gap-1.5 self-start rounded-[8px] px-2 py-0.5 text-left text-[14px] leading-[1.5] text-ink-2 transition-colors hover:bg-surface hover:text-ink"
        >
          <span>
            {dayLabel(shoot.date)} ·{' '}
            <span className="tabular-nums">
              {shoot.start}–{shoot.end}
            </span>
            {/* A shoot with no place yet says only its day and hours. */}
            {shoot.place && ` · ${shoot.place}`}
          </span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
            className={`shrink-0 text-ink-4 transition-transform ${editing ? 'rotate-180' : ''}`}
          >
            <path
              d="M3 4.5l3 3 3-3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <Fold open={editing}>{editing && <Details shoot={shoot} edit={edit} />}</Fold>
        {/* The one thing to do: send the invites. Sent, that stands as a line, with the answers. */}
        {shoot.crew.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2">
            {waiting > 0 ? (
              <button
                type="button"
                onClick={invite}
                className="bb-press flex h-10 items-center rounded-full bg-ink px-5 text-[14px] font-medium text-page transition-opacity hover:opacity-85"
              >
                {asked.length > 0 ? `Invite ${waiting} more` : 'Send Lark invites'}
              </button>
            ) : (
              <span className="flex items-center gap-1.5 text-[13px] text-ink-2">
                <CheckIcon size={10} strokeWidth={2.2} />
                Invites sent
              </span>
            )}
            {asked.length > 0 && (
              <span className="text-[13px] text-ink-3 tabular-nums">
                {replySummary(asked, replies)}
              </span>
            )}
            {/* Linked is the normal state and says nothing; only a missing link asks for one. */}
            {!lark && (
              <button
                type="button"
                onClick={() => setLinking({})}
                className="text-[13px] text-ink-3 underline-offset-2 transition-colors hover:text-ink hover:underline"
              >
                Connect Lark calendar first
              </button>
            )}
          </div>
        )}
      </header>

      {linking && (
        <ConnectSheet
          source="lark"
          onClose={() => setLinking(null)}
          onConnected={() => {
            setLinking(null)
            linking.then?.()
          }}
        />
      )}

      {/* Who comes, with what the crew said on the link folded in the margin beside it. */}
      <div className="grid max-w-[1044px] grid-cols-[minmax(0,680px)_300px] items-start gap-x-16 max-lg:grid-cols-1 max-lg:gap-y-8 max-md:gap-y-6">
        <Crew shoot={shoot} />
        <aside className="max-lg:order-first">
          <Comments
            kind="shoot"
            id={shoot.id}
            replyAs={brand.name}
            change={{ href: '#shots', label: 'Storyboard' }}
            fold
          />
        </aside>
      </div>

      {/* The heart of the sheet takes the whole width: each idea's shots as a filmstrip. */}
      <section id="shots" aria-label="Storyboard" className="flex scroll-mt-6 flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <Heading label="Storyboard" count={`${shots} ${shots === 1 ? 'shot' : 'shots'}`} />
          <AddIdea shoot={shoot} ideas={ideas} />
        </div>
        {cards.length === 0 ? (
          <p className="text-[14px] text-ink-4">No ideas on this shoot yet.</p>
        ) : (
          <ShotList
            brandId={brand.id}
            ideas={cards}
            ideaHref={(i) => `/ideate/${i}`}
            onReorder={reorder}
            onReorderIdeas={(ids) => setIdeaOrder(brand.id, shoot.id, ids)}
            onRemoveIdea={(ideaId) => removeIdeaFromShoot(brand.id, shoot.id, ideaId)}
          />
        )}
      </section>
    </article>
  )
}

const SELECT =
  'h-8 cursor-pointer appearance-none rounded-full bg-surface px-3 text-[13px] font-medium tabular-nums outline-none transition-colors hover:bg-paper focus-visible:shadow-[0_0_0_2px_var(--ink)]'
const INPUT =
  'h-8 w-full rounded-full bg-surface px-3.5 text-[13px] outline-none placeholder:text-ink-5 focus-visible:shadow-[0_0_0_2px_var(--ink)]'

/**
 * The details the team changes: the day, the hours, the name and the address. A shoot added on
 * the calendar asks for the same (`new-shoot.tsx`).
 */
export function Details({
  shoot,
  edit,
}: {
  shoot: Shoot
  edit: (fields: Parameters<typeof editShoot>[2]) => void
}) {
  const { brand } = useBrand()
  const shoots = useShoots(brand.id)
  const others = shoots.filter((s) => s.id !== shoot.id)
  const places = pastPlaces(
    demoOf(OUTLETS, brand.id) ?? [],
    shoots,
    demoOf(PAST_PLACES, brand.id) ?? [],
  ).map((p) => ({
    value: p.place,
    // An outlet's row leads with where it is, without the brand's name that most of them start with.
    ...(p.outlet &&
      p.place.startsWith(`${brand.name}, `) && { name: p.place.slice(brand.name.length + 2) }),
    meta: p.outlet ? 'Outlet' : p.shoots ? shootsMeta(p.shoots) : 'Past shoot',
  }))
  const infoOf = React.useCallback(
    (d: Day): DayInfo => {
      const here = others.filter((s) => s.date === d.date)
      return {
        disabled: !!d.past,
        dot: here.length > 0,
        note: here.map((s) => `Shoot · ${s.title}`).join(', '),
      }
    },
    [others],
  )
  return (
    <div className="grid max-w-[620px] grid-cols-[72px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 pt-3 text-[13px]">
      <span className="text-ink-4">Day</span>
      <span className="flex">
        <DayPicker
          label="Shoot day"
          value={shoot.date}
          onChange={(date) => edit({ date })}
          infoOf={infoOf}
        />
      </span>
      <span className="text-ink-4">Hours</span>
      <span className="flex items-center gap-2">
        <select
          aria-label="Start"
          value={shoot.start}
          onChange={(e) => edit(moveStart(shoot, e.target.value))}
          className={SELECT}
        >
          {SHOOT_TIMES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <span className="text-ink-4">to</span>
        <select
          aria-label="End"
          value={shoot.end}
          onChange={(e) => edit(setEnd(shoot, e.target.value))}
          className={SELECT}
        >
          {[...new Set([...SHOOT_TIMES, shoot.end])].sort().map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </span>
      <span className="text-ink-4">Name</span>
      <input
        value={shoot.title}
        onChange={(e) => edit({ title: e.target.value })}
        aria-label="Name"
        placeholder="Pasta day"
        className={INPUT}
      />
      <span className="text-ink-4">Address</span>
      <Combobox
        value={shoot.place}
        onChange={(place) => edit({ place })}
        options={places}
        onPick={(place) => edit({ place })}
        aria-label="Address"
        className={INPUT}
      />
    </div>
  )
}

const shootsMeta = (n: number) => `${n} ${n === 1 ? 'shoot' : 'shoots'}`

/**
 * What a person's line says, from the invite and their answer to it. Before any invite goes out
 * the line says nothing: the button above says the invites are still to send.
 */
const STATUS: Record<Reply | 'waiting' | 'none', { text: string; className: string }> = {
  going: { text: 'Going', className: 'text-(--live)' },
  cant: { text: "Can't make it", className: 'text-fail-ink' },
  waiting: { text: 'No reply yet', className: 'text-ink-4' },
  none: { text: '', className: '' },
}

/** The role select's last choice: the team types the role. */
const OTHER = 'other'

/**
 * Who comes: each person with their role and their answer to the Lark invite, then "+ Add",
 * which opens one row for one more person, in a listed role or one the team types, and closes
 * once they are on the sheet.
 */
function Crew({ shoot }: { shoot: Shoot }) {
  const { brand } = useBrand()
  const invited = useInvited(shoot.id)
  const replies = useReplies(shoot.id)
  const [name, setName] = React.useState('')
  const [role, setRole] = React.useState<string>(ROLES[0])
  const [typed, setTyped] = React.useState('')
  // The add row is out until the team asks for it; a sheet with nobody on it opens with it out.
  const [adding, setAdding] = React.useState(shoot.crew.length === 0)
  const typedField = React.useRef<HTMLInputElement>(null)
  const chosen = role === OTHER ? typed.trim() : role
  React.useEffect(() => {
    if (role === OTHER) typedField.current?.focus()
  }, [role])
  // Someone from an earlier shoot comes back in the role they had there.
  const known = pastCrew(useShoots(brand.id), demoOf(PAST_CREW, brand.id) ?? []).filter(
    (c) => !shoot.crew.some((on) => on.name === c.name),
  )
  const options = known.map((c) => ({
    value: c.name,
    name: c.name,
    detail: c.role,
    meta: c.shoots ? shootsMeta(c.shoots) : 'Past shoot',
    initials: initials(c.name),
  }))
  function add(person = { name: name.trim(), role: chosen }) {
    if (!person.name || !person.role) return
    addCrew(brand.id, shoot.id, person)
    setName('')
    setAdding(false)
  }
  return (
    <section aria-label="Who comes" className={`${COLUMN} flex flex-col gap-3`}>
      <div className="flex items-center justify-between gap-3">
        <Heading label="Who comes" count={String(shoot.crew.length)} />
        {/* One control for the list: it opens the row to add someone and shows each Remove. */}
        {(shoot.crew.length > 0 || !adding) && (
          <button
            type="button"
            aria-label={adding ? 'Done' : 'Add someone'}
            aria-expanded={adding}
            onClick={() => setAdding((a) => !a)}
            className="flex items-center gap-1.5 text-[13px] font-medium text-ink-3 transition-colors hover:text-ink"
          >
            {!adding && <PlusIcon size={10} />}
            {adding ? 'Done' : 'Add'}
          </button>
        )}
      </div>
      <ul className="flex flex-col">
        {shoot.crew.map((c, i) => {
          const status = STATUS[invited.includes(c.name) ? (replies[c.name] ?? 'waiting') : 'none']
          return (
            <li
              key={`${c.name}-${i}`}
              className="group/crew grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-3 border-t border-(--cal-line) py-2.5"
            >
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-full text-[12px] font-semibold"
                style={{ background: 'var(--avatar)', color: 'var(--avatar-ink)' }}
              >
                {initials(c.name)}
              </span>
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-[14px] font-medium">{c.name}</span>
                <span className="truncate text-[13px] text-ink-4">{c.role}</span>
              </span>
              <span className="flex items-center gap-2">
                {status.text && (
                  <span className={`text-[13px] ${status.className}`}>{status.text}</span>
                )}
                {/* On hover, or while the list is open to change; a finger opens it with Add. */}
                <button
                  type="button"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => removeCrew(brand.id, shoot.id, i)}
                  className={`flex size-6 items-center justify-center rounded-full text-ink-4 transition-opacity hover:text-ink focus-visible:opacity-100 ${adding ? 'opacity-100' : 'opacity-0 group-hover/crew:opacity-100 [@media(hover:none)]:hidden'}`}
                >
                  <CloseIcon />
                </button>
              </span>
            </li>
          )
        })}
      </ul>
      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
          /* One line: the name, the role, the button. On a phone a typed role takes a line of its own. */
          className="bb-rise grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 pt-1 md:flex"
        >
          <Combobox
            // eslint-disable-next-line jsx-a11y/no-autofocus -- the row opens on a tap on Add
            autoFocus={shoot.crew.length > 0}
            value={name}
            onChange={setName}
            options={options}
            create={(typed) => typed.trim()}
            onPick={(picked) =>
              add({ name: picked, role: known.find((c) => c.name === picked)?.role ?? chosen })
            }
            aria-label="Name of the person"
            placeholder="Add someone"
            className={`${INPUT} min-w-0 md:min-w-[200px] md:flex-1`}
          />
          <select
            aria-label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={`${SELECT} max-md:max-w-[128px] max-md:truncate max-md:font-normal max-md:text-ink-2`}
          >
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
            <option value={OTHER}>Other…</option>
          </select>
          {role === OTHER && (
            <input
              ref={typedField}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label="Their role"
              placeholder="Food stylist"
              className="h-8 rounded-full bg-surface px-3.5 text-[13px] outline-none placeholder:text-ink-5 focus-visible:shadow-[0_0_0_2px_var(--ink)] max-md:order-last max-md:col-span-3 md:w-[136px]"
            />
          )}
          <button
            type="submit"
            aria-label="Add"
            disabled={!name.trim() || !chosen}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-page transition-opacity hover:opacity-85 disabled:opacity-25"
          >
            <PlusIcon size={11} />
          </button>
        </form>
      )}
    </section>
  )
}

const FORMAT_LABEL = { reel: 'Reel', carousel: 'Carousel', story: 'Story' } as const

/**
 * Add an idea: the brand's ideas not on this shoot, in a popover (a sheet on a phone). Picking
 * one puts it on this shoot, and its day and hours become the idea's. An idea already on another
 * shoot asks first.
 */
function AddIdea({ shoot, ideas }: { shoot: Shoot; ideas: IdeaCard[] }) {
  const { brand } = useBrand()
  const shoots = useShoots(brand.id)
  const phone = usePhone()
  const [open, setOpen] = React.useState(false)
  const [moving, setMoving] = React.useState<IdeaCard | null>(null)
  const field = React.useRef<HTMLButtonElement>(null)
  const pop = React.useRef<HTMLDivElement>(null)
  const choices = ideas.filter((i) => i.status !== 'suggested' && !shoot.ideaIds.includes(i.id))
  const elsewhere = (id: string) => {
    const other = shootOfIdea(shoots, id)
    return other && other.id !== shoot.id ? other : undefined
  }

  React.useEffect(() => {
    if (!open || phone) return
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (!pop.current?.contains(t) && !field.current?.contains(t)) close()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open, phone])

  function close() {
    setOpen(false)
    setMoving(null)
  }
  function take(card: IdeaCard) {
    addIdeaToShoot(brand.id, shoot.id, card.id)
    close()
  }
  const pick = (card: IdeaCard) => (elsewhere(card.id) ? setMoving(card) : take(card))

  const body = moving ? (
    <div className="flex flex-col gap-4 p-1">
      <p className="flex flex-col gap-1 text-[14px] leading-[1.5]">
        <span className="font-medium">{moving.hook}</span>
        <span className="text-ink-3">
          On {elsewhere(moving.id)!.title}, {dayLabel(elsewhere(moving.id)!.date)}. Move it to this
          shoot?
        </span>
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setMoving(null)}
          className="bb-press flex h-9 items-center rounded-full bg-surface px-4 text-[13px] font-medium text-ink-2 hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => take(moving)}
          className="bb-press flex h-9 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-page hover:opacity-85"
        >
          Move
        </button>
      </div>
    </div>
  ) : choices.length === 0 ? (
    <p className="p-3 text-[13px] text-ink-4">Every idea is on a shoot.</p>
  ) : (
    <ul className="flex flex-col">
      {choices.map((card) => {
        const other = elsewhere(card.id)
        const src = coverOf(brand.id, card)
        return (
          <li key={card.id}>
            <button
              type="button"
              onClick={() => pick(card)}
              className="grid w-full grid-cols-[40px_minmax(0,1fr)] items-center gap-x-3 rounded-[12px] px-2 py-2 text-left transition-colors hover:bg-surface"
            >
              <span className="relative h-[50px] w-10 overflow-hidden rounded-[7px] bg-tile">
                {src && <Media src={src} sizes="40px" />}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[14px]">{card.hook}</span>
                <span className="flex items-center gap-1.5 text-[13px] text-ink-4">
                  <FormatIcon format={card.format} size={10} />
                  {FORMAT_LABEL[card.format]}
                  {other && (
                    <span className="truncate">
                      · On {other.title}, {dayLabel(other.date)}
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )

  return (
    <span className="relative flex">
      <button
        ref={field}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex items-center gap-1.5 text-[13px] font-medium text-ink-3 transition-colors hover:text-ink"
      >
        <PlusIcon size={10} />
        Add an idea
      </button>
      {open &&
        (phone ? (
          <Sheet title="Add an idea" onClose={close}>
            {body}
          </Sheet>
        ) : (
          <div
            ref={pop}
            role="dialog"
            aria-label="Add an idea"
            className="bb-menu absolute top-full right-0 z-30 mt-2 w-[360px] rounded-[18px] bg-page p-2 shadow-sheet"
          >
            {body}
          </div>
        ))}
    </span>
  )
}
