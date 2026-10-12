'use client'

import Link from 'next/link'
import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import { Fold } from '@/components/controls'
import { CheckIcon, CloseIcon, PlusIcon } from '@/components/icons'
import { Media } from '@/components/media'
import { Sheet } from '@/components/sheet'
import { Combobox } from '@/components/suggest'
import { usePhone } from '@/components/use-phone'
import type { Day } from '@/data/demo'
import { coverOf, type IdeaCard } from '@/data/ideas'
import { HOME, ROLES, type Reply, type Shoot } from '@/data/shoots'
import { PAST_CREW, PAST_PLACES } from '@/data/suggestions'
import { dayLabel } from '@/features/ideate/calendar-slot'
import { DayPicker, type DayInfo } from '@/features/ideate/day-picker'
import { EYEBROW, FormatIcon } from '@/features/ideate/idea-parts'
import { ConnectSheet } from '@/features/connections/connect-sheet'
import { useConnected } from '@/features/connections/connections-store'
import { editIdea, useIdeas } from '@/features/ideate/ideas-store'
import { useBrand } from '@/features/schedule/posts-store'
import { Comments } from '@/features/share/comments'
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
 * invites; the shot list says what to shoot, built from each idea's storyboard, and what the
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
      <AppHeader />
      <main className="mx-auto w-full max-w-[1440px] px-10 pb-24 max-md:px-4 max-md:pt-2 max-md:pb-[calc(96px+env(safe-area-inset-bottom))]">
        {shoot ? (
          <CallSheet key={id} shoot={shoot} />
        ) : (
          <>
            <BackLink />
            <p className="pt-6 text-[15px] text-ink-3">
              This shoot is not here: it belongs to another brand, or a reload started the demo
              over.
            </p>
          </>
        )}
      </main>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.08em] text-ink-4 uppercase transition-colors hover:text-ink"
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
      Calendar
    </Link>
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
  const { brand, weeks } = useBrand()
  const { ideas } = useIdeas(brand.id)
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

  return (
    <article className="flex flex-col gap-12 max-md:gap-7">
      <div className="flex items-center justify-between gap-3">
        <BackLink />
        <ShareButton kind="shoot" id={shoot.id} />
      </div>

      <header className={`${COLUMN} flex flex-col gap-4 max-md:gap-3`}>
        <span className={EYEBROW}>Shoot · {dayLabel(weeks, shoot.dayN)}</span>
        <h1 className="font-display text-[44px] leading-[1.05] tracking-[-0.035em] max-md:text-[32px]">
          {shoot.title}
        </h1>
        <p className="text-[16px] leading-[1.5] text-ink-2">
          <span className="tabular-nums">
            {shoot.start}–{shoot.end}
          </span>{' '}
          · {shoot.place}
        </p>
        {/* One quiet line under the facts: edit them, and where the Lark calendar stands. */}
        <div className="flex items-center gap-4 pt-1 text-[13px]">
          <button
            type="button"
            aria-expanded={editing}
            onClick={() => setEditing((e) => !e)}
            className="font-medium text-ink-3 transition-colors hover:text-ink"
          >
            {editing ? 'Done' : 'Edit details'}
          </button>
          {lark ? (
            <span className="flex items-center gap-1.5 text-[12px] text-ink-4">
              <span className="size-1.5 rounded-full bg-(--live)" />
              Synced with Lark
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setLinking({})}
              className="flex items-center gap-1.5 text-[12px] text-ink-3 underline-offset-2 transition-colors hover:text-ink hover:underline"
            >
              <span className="size-1.5 rounded-full shadow-[inset_0_0_0_1px_var(--ink-4)]" />
              Connect Lark calendar
            </button>
          )}
        </div>
        <Fold open={editing}>
          <Details shoot={shoot} edit={edit} />
        </Fold>
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

      {/* Who comes, with what the crew said on the link as a note in the margin beside it. */}
      <div className="grid max-w-[1044px] grid-cols-[minmax(0,680px)_300px] items-start gap-x-16 max-lg:grid-cols-1 max-lg:gap-y-10 max-md:gap-y-7">
        <Crew
          shoot={shoot}
          invite={() => {
            const send = () => sendInvites(brand.id, shoot.id)
            if (lark) send()
            else setLinking({ then: send })
          }}
        />
        <aside>
          <Comments
            kind="shoot"
            id={shoot.id}
            replyAs={brand.name}
            change={{ href: '#shots', label: 'Shot list' }}
          />
        </aside>
      </div>

      {/* The heart of the sheet takes the whole width: each idea's shots as a filmstrip. */}
      <section id="shots" aria-label="Shot list" className="flex scroll-mt-6 flex-col gap-8">
        <div className="flex items-center justify-between gap-3">
          <span className={EYEBROW}>
            Shot list · {shots} {shots === 1 ? 'shot' : 'shots'}
          </span>
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
  'h-8 cursor-pointer appearance-none rounded-full bg-surface px-3 text-[12.5px] font-medium tabular-nums outline-none transition-colors hover:bg-paper focus-visible:shadow-[0_0_0_2px_var(--ink)]'
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
  const places = pastPlaces(HOME[brand.id], shoots, PAST_PLACES[brand.id]).map((p) => ({
    value: p.place,
    meta: p.place === HOME[brand.id] ? 'Home' : p.shoots ? shootsMeta(p.shoots) : 'Past shoot',
  }))
  const infoOf = React.useCallback(
    (d: Day): DayInfo => {
      const here = others.filter((s) => s.dayN === d.n)
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
          value={shoot.dayN}
          onChange={(dayN) => edit({ dayN })}
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
 * Who comes: each person with their role and their answer to the Lark invite, the answers
 * counted in the header beside the invite button, then one more person, in a listed role or one
 * the team types.
 */
function Crew({ shoot, invite }: { shoot: Shoot; invite: () => void }) {
  const { brand } = useBrand()
  const invited = useInvited(shoot.id)
  const replies = useReplies(shoot.id)
  const asked = shoot.crew.map((c) => c.name).filter((n) => invited.includes(n))
  const waiting = shoot.crew.length - asked.length
  const [name, setName] = React.useState('')
  const [role, setRole] = React.useState<string>(ROLES[0])
  const [typed, setTyped] = React.useState('')
  const [editingCrew, setEditingCrew] = React.useState(false)
  const typedField = React.useRef<HTMLInputElement>(null)
  const chosen = role === OTHER ? typed.trim() : role
  React.useEffect(() => {
    if (role === OTHER) typedField.current?.focus()
  }, [role])
  // Someone from an earlier shoot comes back in the role they had there.
  const known = pastCrew(useShoots(brand.id), PAST_CREW[brand.id]).filter(
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
  }
  return (
    <section aria-label="Who comes" className={`${COLUMN} flex flex-col gap-4`}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className={EYEBROW}>Who comes · {shoot.crew.length}</span>
          {/* A finger has no hover: Edit shows the remove marks, Done hides them again. */}
          <button
            type="button"
            aria-pressed={editingCrew}
            onClick={() => setEditingCrew((e) => !e)}
            className="text-[12px] font-medium text-ink-3 transition-colors hover:text-ink [@media(hover:hover)]:hidden"
          >
            {editingCrew ? 'Done' : 'Edit'}
          </button>
          {asked.length > 0 && (
            <span className="text-[12px] text-ink-3 tabular-nums">
              {replySummary(asked, replies)}
            </span>
          )}
        </span>
        <button
          type="button"
          disabled={waiting === 0}
          onClick={invite}
          className="bb-press flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-medium text-page transition-opacity hover:opacity-85 disabled:bg-surface disabled:text-ink-3 disabled:hover:opacity-100"
        >
          {waiting === 0 && <CheckIcon size={10} strokeWidth={2.2} />}
          {waiting === 0
            ? 'Invites sent'
            : asked.length > 0
              ? `Invite ${waiting} more`
              : 'Send Lark invites'}
        </button>
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
                className="flex size-8 items-center justify-center rounded-full text-[11px] font-semibold"
                style={{ background: 'var(--avatar)', color: 'var(--avatar-ink)' }}
              >
                {initials(c.name)}
              </span>
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-[14px] font-medium">{c.name}</span>
                <span className="truncate text-[12.5px] text-ink-4">{c.role}</span>
              </span>
              <span className="flex items-center gap-2">
                {status.text && (
                  <span className={`text-[12px] ${status.className}`}>{status.text}</span>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => removeCrew(brand.id, shoot.id, i)}
                  className={`flex size-6 items-center justify-center rounded-full text-ink-4 transition-opacity hover:text-ink ${editingCrew ? 'opacity-100' : 'pointer-events-none opacity-0 group-hover/crew:pointer-events-auto group-hover/crew:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100'}`}
                >
                  <CloseIcon />
                </button>
              </span>
            </li>
          )
        })}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        /* One line: the name, the role, the button. On a phone a typed role takes a line of its own. */
        className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 md:flex"
      >
        <Combobox
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
  const { brand, weeks } = useBrand()
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
          On {elsewhere(moving.id)!.title}, {dayLabel(weeks, elsewhere(moving.id)!.dayN)}. Move it
          to this shoot?
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
                <span className="flex items-center gap-1.5 text-[12px] text-ink-4">
                  <FormatIcon format={card.format} size={10} />
                  {FORMAT_LABEL[card.format]}
                  {other && (
                    <span className="truncate">
                      · On {other.title}, {dayLabel(weeks, other.dayN)}
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
