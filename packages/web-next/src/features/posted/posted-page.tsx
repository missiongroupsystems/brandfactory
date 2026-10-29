'use client'

import Link from 'next/link'
import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import { LoadingDots } from '@/components/loading-dots'
import { Media } from '@/components/media'
import { PlatformLogo } from '@/components/platform-logos'
import { useConnections } from '@/features/connections/connections-store'
import { NotAvailable, reasonOf } from '@/features/connections/not-available'
import { useMakeAccount } from '@/features/connections/make'
import { useBrand } from '@/features/schedule/posts-store'
import { todayDate } from '@/lib/dates'
import { remote, timezoneOf } from '@/lib/remote'

import {
  asOf,
  canRank,
  countsOn,
  figuresOf,
  firstLine,
  hoursLeft,
  k,
  kindOf,
  ledgerOf,
  monthsOf,
  nowIn,
  PLATFORM_NAME,
  platformOf,
  railOf,
  rankedOf,
  storyKind,
  summaryOf,
  whenOf,
  windowLine,
  type Moment,
  type Platform,
  type PostedItem,
} from './model'
import { usePostedItems } from './posted-store'

const EYEBROW = 'font-mono text-[10.5px] tracking-[0.08em] text-ink-4 uppercase'
const NUM = 'font-display font-semibold tracking-[-0.03em] tabular-nums'

type Order = 'newest' | 'top'

/**
 * What went out, one platform at a time: the accounts rail picks the platform, which is the
 * title; under it the last 30 days in one line, then a ledger of posts and stories, newest first,
 * each with its counts as last read. A post opens its poster. Not a grid of covers: the numbers
 * beside what went out are the page's reason to exist.
 */
export function PostedPage({ on }: { on?: Platform }) {
  const { brand } = useBrand()
  // Now in the brand's own zone, read again each minute so a story's hours left stay true.
  const [at, setAt] = React.useState(() => new Date())
  React.useEffect(() => {
    const t = window.setInterval(() => setAt(new Date()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  const now = nowIn(at, timezoneOf(brand.id), remote ? undefined : todayDate())
  const items = usePostedItems(now.day)
  const links = useConnections(brand.id)
  const named = {
    ig: useMakeAccount(brand.id, 'ig')?.name,
    fb: useMakeAccount(brand.id, 'fb')?.name,
    tt: undefined,
  }
  const linked = (p: Platform) => links[p] !== 'off'
  const rail = railOf(items ?? [], linked)
  const [picked, setPicked] = React.useState<Platform | undefined>(on)
  const platform = platformOf(rail, items ?? [], picked)
  const ledger = ledgerOf(items ?? [], platform)

  const subtitle = (p: Platform) => {
    const n = ledgerOf(items ?? [], p).filter((i) => i.post.format !== 'story').length
    if (!linked(p) && n === 0) return 'Not connected'
    return named[p] ?? (n === 0 ? 'Nothing yet' : `${n} ${n === 1 ? 'post' : 'posts'}`)
  }

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main
        key={brand.id}
        className="bb-swap mx-auto grid w-full max-w-[1040px] grid-cols-[220px_minmax(0,1fr)] items-start gap-[72px] pt-6 pb-24 max-lg:grid-cols-[180px_minmax(0,1fr)] max-lg:gap-10 max-lg:px-6 max-md:grid-cols-1 max-md:gap-0 max-md:px-4 max-md:pt-2"
      >
        <aside className="sticky top-6 flex flex-col gap-2.5 pt-[76px] max-md:hidden">
          <span className={`${EYEBROW} px-2.5 pb-1`}>Accounts</span>
          <div role="radiogroup" aria-label="Account" className="flex flex-col gap-2.5">
            {rail.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={p === platform}
                onClick={() => setPicked(p)}
                className={`grid grid-cols-[20px_minmax(0,1fr)] items-center gap-3 rounded-[12px] px-2.5 py-[9px] text-left transition-colors ${p === platform ? 'bg-surface' : 'hover:bg-surface-2'} ${linked(p) || p === platform ? 'text-ink' : 'text-ink-3'}`}
              >
                <PlatformLogo platform={p} size={18} />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium">{PLATFORM_NAME[p]}</span>
                  <span className="block truncate text-[12.5px] text-ink-3">{subtitle(p)}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col">
          <div className="flex flex-col gap-3.5 pb-7 max-md:gap-2.5 max-md:pb-4">
            <span className={EYEBROW}>Posted · {brand.name}</span>
            <h1 className="font-display text-[56px] leading-none tracking-[-0.035em] max-md:text-[34px]">
              {PLATFORM_NAME[platform]}
            </h1>
          </div>
          {/* On a phone the rail is a row of chips under the title. */}
          <div
            role="radiogroup"
            aria-label="Account"
            className="flex gap-1.5 overflow-x-auto pb-[18px] md:hidden"
          >
            {rail.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={p === platform}
                onClick={() => setPicked(p)}
                className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full pr-3 pl-2.5 text-[12.5px] font-medium transition-colors ${p === platform ? 'bg-ink text-page' : linked(p) ? 'bg-surface text-ink-3' : 'bg-surface text-ink-4'}`}
              >
                <PlatformLogo platform={p} size={12} />
                {PLATFORM_NAME[p]}
              </button>
            ))}
          </div>

          <div key={platform} className="bb-swap flex flex-col">
            {!items ? (
              <LoadingDots label="Loading posts" className="py-40" />
            ) : ledger.length === 0 ? (
              <Empty platform={platform} linked={linked(platform)} />
            ) : (
              <Ledger ledger={ledger} platform={platform} now={now} />
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

function Empty({ platform, linked }: { platform: Platform; linked: boolean }) {
  const name = PLATFORM_NAME[platform]
  return (
    <div className="flex max-w-[420px] flex-col items-start gap-3.5 pt-24 max-md:gap-3 max-md:pt-16">
      {!linked && <NotAvailable label="Not connected" reason={reasonOf(name)} align="left" />}
      <span className="font-display text-[26px] leading-[1.15] tracking-[-0.025em] max-md:text-[24px]">
        Nothing on {name} yet.
      </span>
      <span className="text-[15px] leading-normal text-ink-3 max-md:text-[14.5px]">
        {linked
          ? 'Posts show here once they go out.'
          : `Posts show here once the brand’s ${name} account is connected.`}
      </span>
      <Link
        href={linked ? '/post/new' : '/brand/connections'}
        className="mt-2 inline-flex h-9 items-center rounded-full bg-ink px-4 text-[13.5px] font-medium text-page max-md:h-10"
      >
        {linked ? 'New post' : `Connect ${name}`}
      </Link>
    </div>
  )
}

function Ledger({
  ledger,
  platform,
  now,
}: {
  ledger: PostedItem[]
  platform: Platform
  now: Moment
}) {
  const [order, setOrder] = React.useState<Order>('newest')
  const ranks = canRank(ledger, platform)
  const today = now.day
  const sum = summaryOf(ledger, platform, today)
  const figures = figuresOf(sum, platform)
  const top = rankedOf(ledger, platform)
  // Ranked, what has no numbers yet waits apart, in time order, under its own quiet heading.
  const groups =
    ranks && order === 'top'
      ? [
          { key: 'top', title: 'Most engaging', items: top.ranked },
          ...(top.unread.length > 0
            ? [{ key: 'unread', title: 'No numbers yet', items: top.unread }]
            : []),
        ]
      : monthsOf(ledger, today)
  return (
    <>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3 pb-1 max-md:gap-x-[22px]">
        {figures.map((f) => (
          <span key={f.label} className="flex flex-col gap-1 max-md:gap-[3px]">
            <span className={`${NUM} text-[24px] leading-none max-md:text-[20px]`}>
              {k(f.value)}
            </span>
            <span className="text-[12.5px] text-ink-3 max-md:text-[12px]">{f.label}</span>
          </span>
        ))}
        <span className="pb-px text-[12.5px] text-ink-3 max-md:w-full max-md:text-[12px]">
          {windowLine(sum)}
        </span>
      </div>
      {groups.map((g, gi) => (
        <section key={g.key} aria-label={g.title} className="flex flex-col">
          <div className="sticky top-0 z-[1] flex items-center justify-between gap-3 bg-page pt-[18px] pb-2.5 max-md:pt-3.5 max-md:pb-1.5">
            <span className={EYEBROW}>{g.title}</span>
            {gi === 0 && ranks && (
              <div role="radiogroup" aria-label="Order" className="flex gap-3">
                {(['newest', 'top'] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={order === o}
                    onClick={() => setOrder(o)}
                    className={`text-[12.5px] transition-colors ${order === o ? 'font-medium text-ink' : 'text-ink-4 hover:text-ink'}`}
                  >
                    {o === 'newest' ? 'Newest' : 'Top'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ol className="flex flex-col">
            {g.items.map((item, i) => (
              <li key={item.post.id} className={i > 0 ? 'border-t border-(--cal-line)' : ''}>
                <Row item={item} platform={platform} today={today} now={now} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  )
}

/** One post or story: its cover, what it was, and its counts on the right (under it on a phone). */
function Row({
  item,
  platform,
  today,
  now,
}: {
  item: PostedItem
  platform: Platform
  today: string
  now: Moment
}) {
  const { post } = item
  const story = post.format === 'story'
  const left = story ? hoursLeft(item, now) : null
  const counts = countsOn(item, platform)
  const line = firstLine(item)
  const kind = story ? storyKind(post) : kindOf(post, platform)
  const collab = item.collabs.length > 0 ? ` · Collab · ${item.collabs.join(', ')}` : ''
  const meta = `${kind} · ${whenOf(item, today)}${collab}`
  const live = left !== null && (
    <span className="inline-block size-1.5 shrink-0 rounded-full bg-(--live)" aria-hidden="true" />
  )
  const state = story && (left !== null ? `Live · ${left} h left` : 'Gone after 24 h')
  const row = (
    <>
      <Cover item={item} gone={story && left === null} />
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5 text-[13px] text-ink-3 max-md:text-[12px]">
          {live && <span className="flex md:hidden">{live}</span>}
          <span className="truncate">
            {meta}
            {story && (
              <span className="md:hidden"> · {left !== null ? `${left} h left` : 'Gone'}</span>
            )}
          </span>
        </span>
        <span className="mt-1 mb-[3px] truncate font-display text-[17px] leading-[1.2] font-medium tracking-[-0.01em] max-md:mt-[3px] max-md:mb-1 max-md:text-[15.5px]">
          {post.hook}
        </span>
        {(state || line) && (
          <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] text-ink-3 max-md:hidden">
            {live}
            <span className="truncate">{state || line}</span>
          </span>
        )}
        {counts.length > 0 && (
          <span className="truncate text-[12.5px] text-ink-3 tabular-nums md:hidden">
            {counts.slice(0, 3).map((c, i) => (
              <React.Fragment key={c.key}>
                {i > 0 && ' · '}
                <b className="font-semibold text-ink">{k(c.value)}</b> {c.label.toLowerCase()}
              </React.Fragment>
            ))}
          </span>
        )}
      </span>
      {counts.length > 0 && (
        <span className="flex flex-col items-end max-md:hidden">
          <span className="flex items-end gap-[26px]">
            {counts.slice(0, 4).map((c) => (
              <span key={c.key} className="flex min-w-[52px] flex-col items-end gap-[3px]">
                <span className={`${NUM} text-[16px] leading-none`}>{k(c.value)}</span>
                <span className="text-[11.5px] text-ink-3">{c.label.toLowerCase()}</span>
              </span>
            ))}
          </span>
          {post.measuredAt && (
            <span className="mt-1.5 text-[11.5px] text-ink-3">as of {asOf(post.measuredAt)}</span>
          )}
        </span>
      )}
    </>
  )
  const box = `grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-[22px] rounded-[14px] px-3 py-3.5 -mx-3 max-md:mx-0 max-md:grid-cols-[56px_minmax(0,1fr)] max-md:gap-3.5 max-md:rounded-none max-md:px-0 max-md:py-3`
  // A story stays in the ledger, but nothing opens it yet: its frames are what there is.
  if (story) return <div className={box}>{row}</div>
  return (
    <Link
      href={`/post/${post.id}?posted=${platform}`}
      className={`${box} transition-colors hover:bg-surface-2 max-md:hover:bg-transparent`}
    >
      {row}
    </Link>
  )
}

/** A post's 4:5 cover with its length or its slide count; a story's 9:16 frames, up to three. */
function Cover({ item, gone }: { item: PostedItem; gone: boolean }) {
  const { post } = item
  if (post.format === 'story') {
    return (
      <span className={`flex gap-1 max-md:gap-[3px] ${gone ? 'opacity-75' : ''}`}>
        {post.images.slice(0, 3).map((src, i) => (
          <span
            key={src + i}
            className="relative block h-[78px] w-11 overflow-hidden rounded-[6px] bg-tile max-md:h-[46px] max-md:w-[26px] max-md:rounded-[4px]"
          >
            <Media src={src} sizes="88px" />
          </span>
        ))}
      </span>
    )
  }
  const badge =
    post.format === 'reel' ? post.duration : post.images.length > 1 ? `1/${post.images.length}` : ''
  return (
    <span className="relative block h-[110px] w-[88px] overflow-hidden rounded-[10px] bg-tile max-md:h-[70px] max-md:w-14 max-md:rounded-[8px]">
      {post.images[0] && <Media src={post.images[0]} sizes="176px" />}
      {badge && (
        <span className="absolute right-1.5 bottom-1.5 rounded-full bg-black/50 px-[5px] py-[2px] font-mono text-[10px] text-page tabular-nums max-md:hidden">
          {badge}
        </span>
      )}
    </span>
  )
}
