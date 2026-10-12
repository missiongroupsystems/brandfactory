'use client'

import Link from 'next/link'
import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import { Fold } from '@/components/controls'
import { CheckIcon, CloseIcon, PlusIcon } from '@/components/icons'
import { Combobox } from '@/components/suggest'
import type { Day } from '@/data/demo'
import { HOME, ROLES, type Reply, type Shoot } from '@/data/shoots'
import { PAST_CREW, PAST_PLACES } from '@/data/suggestions'
import { dayLabel } from '@/features/ideate/calendar-slot'
import { DayPicker, type DayInfo } from '@/features/ideate/day-picker'
import { EYEBROW } from '@/features/ideate/idea-parts'
import { ConnectSheet } from '@/features/connections/connect-sheet'
import { useConnected } from '@/features/connections/connections-store'
import { useIdeas } from '@/features/ideate/ideas-store'
import { useBrand } from '@/features/schedule/posts-store'
import { Comments } from '@/features/share/comments'
import { ShareButton } from '@/features/share/share-button'

import { moveStart, pastCrew, pastPlaces, replySummary, setEnd, SHOOT_TIMES } from './model'
import {
  addCrew,
  editShoot,
  removeCrew,
  sendInvites,
  useInvited,
  useReplies,
  useShoots,
} from './shoots-store'
import { shotCount, ShotList } from './shot-list'

/**
 * A shoot's own page (`/shoot/<id>`): the call sheet. Everything someone needs on the day, in
 * the order they ask for it: when and where, who comes, and what to shoot, built from each
 * idea's storyboard. The team edits the details and sends the Lark invites here; Share gives the
 * crew a link to the same sheet without a login.
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

function CallSheet({ shoot }: { shoot: Shoot }) {
  const { brand, weeks } = useBrand()
  const { ideas } = useIdeas(brand.id)
  const invited = useInvited(shoot.id)
  // A shoot just planned from Ideate opens with its details out: it still needs a name and a day.
  const [editing, setEditing] = React.useState(shoot.title === 'New shoot')
  const cards = shoot.ideaIds.flatMap((id) => ideas.find((i) => i.id === id) ?? [])
  const shots = shotCount(cards)
  const waiting = shoot.crew.filter((c) => !invited.includes(c.name)).length
  const edit = (fields: Parameters<typeof editShoot>[2]) => editShoot(brand.id, shoot.id, fields)
  // Without the brand's Lark calendar the invites have nowhere to go: they ask to connect first,
  // then go out. `then` is what runs once it is connected.
  const lark = useConnected(brand.id, 'lark')
  const [linking, setLinking] = React.useState<{ then?: () => void } | null>(null)
  const invite = () => sendInvites(brand.id, shoot.id)

  return (
    <article className="flex flex-col gap-10 max-md:gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink />
        <span className="flex items-center gap-2">
          <ShareButton kind="shoot" id={shoot.id} />
          <button
            type="button"
            disabled={waiting === 0}
            onClick={() => (lark ? invite() : setLinking({ then: invite }))}
            className="bb-press flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-medium text-page transition-opacity hover:opacity-85 disabled:bg-surface disabled:text-ink-3 disabled:hover:opacity-100"
          >
            {waiting === 0 && <CheckIcon size={10} strokeWidth={2.2} />}
            {waiting === 0
              ? 'Invites sent'
              : invited.length > 0
                ? `Invite ${waiting} more`
                : 'Send Lark invites'}
          </button>
        </span>
      </div>

      {/* The sheet's head: three facts across, as a call sheet prints them. */}
      <header className="flex flex-col gap-5">
        <dl className="grid grid-cols-3 overflow-hidden rounded-[20px] bg-surface max-md:grid-cols-1">
          <Fact label="When">
            <span>{dayLabel(weeks, shoot.dayN)}</span>
            <span className="text-ink-3 tabular-nums">
              {shoot.start}–{shoot.end}
            </span>
          </Fact>
          <Fact label="Where" divided>
            <span>{shoot.title}</span>
            <span className="truncate font-sans text-[14px] tracking-normal text-ink-3">
              {shoot.place}
            </span>
          </Fact>
          <Fact label="Who" divided>
            <span>
              {shoot.crew.length} {shoot.crew.length === 1 ? 'person' : 'people'}
            </span>
            <span className="flex items-center pt-1">
              {shoot.crew.slice(0, 6).map((c, i) => (
                <span
                  key={`${c.name}-${i}`}
                  title={`${c.name}, ${c.role}`}
                  className="-mr-1.5 flex size-7 items-center justify-center rounded-full font-sans text-[10.5px] font-semibold tracking-normal shadow-[0_0_0_2px_var(--surface)]"
                  style={{ background: 'var(--avatar)', color: 'var(--avatar-ink)' }}
                >
                  {initials(c.name)}
                </span>
              ))}
            </span>
          </Fact>
        </dl>
        <div className="flex flex-col gap-3">
          {/* One quiet line under the facts: edit them, and where the Lark calendar stands. */}
          <div className="flex items-center justify-between gap-3 text-[13px]">
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
        </div>
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

      <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-16 max-lg:grid-cols-1 max-md:gap-12">
        <section aria-label="Shot list" className="flex flex-col gap-6">
          <span className={EYEBROW}>
            Shot list · {shots} {shots === 1 ? 'shot' : 'shots'}
          </span>
          {cards.length === 0 ? (
            <p className="text-[14px] text-ink-4">
              No ideas yet.{' '}
              <Link
                href="/ideate?view=ideas"
                className="text-ink underline-offset-2 hover:underline"
              >
                Pick them on Ideate
              </Link>
            </p>
          ) : (
            <ShotList brandId={brand.id} ideas={cards} ideaHref={(i) => `/ideate/${i}`} />
          )}
          <div className="pt-4">
            <Comments kind="shoot" id={shoot.id} />
          </div>
        </section>
        <Crew shoot={shoot} invited={invited} />
      </div>
    </article>
  )
}

function Fact({
  label,
  divided = false,
  children,
}: {
  label: string
  divided?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-2 px-6 py-5 max-md:px-5 max-md:py-4 ${divided ? 'border-l border-(--cal-line) max-md:border-t max-md:border-l-0' : ''}`}
    >
      <dt className={EYEBROW}>{label}</dt>
      <dd className="flex min-w-0 flex-col gap-0.5 font-display text-[30px] leading-[1.1] tracking-[-0.025em] max-md:text-[24px]">
        {children}
      </dd>
    </div>
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
    <div className="grid max-w-[620px] grid-cols-[72px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 pt-1 text-[13px]">
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

/**
 * Who comes: each person with their role and their answer to the Lark invite, the answers
 * counted in one line, then one more person.
 */
function Crew({ shoot, invited }: { shoot: Shoot; invited: string[] }) {
  const { brand } = useBrand()
  const replies = useReplies(shoot.id)
  const asked = shoot.crew.map((c) => c.name).filter((n) => invited.includes(n))
  const [name, setName] = React.useState('')
  const [role, setRole] = React.useState<string>(ROLES[0])
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
  function add(person = { name: name.trim(), role }) {
    if (!person.name) return
    addCrew(brand.id, shoot.id, person)
    setName('')
  }
  return (
    <section aria-label="Who comes" className="flex flex-col gap-4 lg:sticky lg:top-6">
      <span className="flex items-baseline justify-between gap-3">
        <span className={EYEBROW}>Who comes</span>
        {asked.length > 0 && (
          <span className="text-[12px] text-ink-3 tabular-nums">
            {replySummary(asked, replies)}
          </span>
        )}
      </span>
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
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[14px] font-medium">{c.name}</span>
                <span className="text-[12px] text-ink-4">{c.role}</span>
              </span>
              <span className="flex items-center gap-2">
                {status.text && (
                  <span className={`text-[12px] ${status.className}`}>{status.text}</span>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => removeCrew(brand.id, shoot.id, i)}
                  className="flex size-6 items-center justify-center rounded-full text-ink-4 opacity-0 transition-opacity group-hover/crew:opacity-100 hover:text-ink focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
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
        className="flex items-center gap-2"
      >
        <Combobox
          value={name}
          onChange={setName}
          options={options}
          create={(typed) => typed.trim()}
          onPick={(picked) =>
            add({ name: picked, role: known.find((c) => c.name === picked)?.role ?? role })
          }
          aria-label="Name of the person"
          placeholder="Add someone"
          className={`${INPUT} min-w-0 flex-1`}
        />
        <select
          aria-label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={SELECT}
        >
          {ROLES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <button
          type="submit"
          aria-label="Add"
          disabled={!name.trim()}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-page transition-opacity hover:opacity-85 disabled:opacity-25"
        >
          <PlusIcon size={11} />
        </button>
      </form>
    </section>
  )
}
