'use client'

import Link from 'next/link'
import * as React from 'react'

import { CarouselIcon, CheckIcon, EyeIcon, HeartIcon, PlayIcon, SortIcon } from '@/components/icons'
import { LoadingDots } from '@/components/loading-dots'
import { Media } from '@/components/media'
import { PlatformLogo } from '@/components/platform-logos'
import { useMenu } from '@/components/use-menu'
import { BrandLogo } from '@/features/brand/brand-logo'
import { useConnections } from '@/features/connections/connections-store'
import { useMakeAccount } from '@/features/connections/make'
import { NotAvailable, reasonOf } from '@/features/connections/not-available'
import { useTikTokAccount } from '@/features/connections/tiktok'
import { useBrand } from '@/features/schedule/posts-store'
import { todayDate } from '@/lib/dates'
import { remote, timezoneOf } from '@/lib/remote'

import {
  asOf,
  canRank,
  figuresOf,
  gridOf,
  headlineOf,
  k,
  kindOf,
  ledgerOf,
  nowIn,
  PLATFORM_NAME,
  platformOf,
  profileName,
  railOf,
  ringsOf,
  shortDay,
  storyKind,
  summaryOf,
  tileCountsOf,
  tileLabel,
  whenOf,
  windowLine,
  type CountKey,
  type Moment,
  type Order,
  type Platform,
  type PostedItem,
} from './model'
import { usePostedItems } from './posted-store'

const NUM = 'font-display font-semibold tracking-[-0.03em] tabular-nums'
/** A small frosted chip over a cover: white type that reads on a light photo as on a dark one. */
const ON_COVER = 'rounded-full bg-black/30 text-page backdrop-blur-md'

/**
 * The feed, a view of Insights: what went out, one platform at a time, as the account looks. The
 * platforms as pills, then the brand's profile with its last 30 days, its stories as rings and
 * its posts as a grid of covers. A cover shows one count; hover shows them all. A cover opens its
 * poster. The platform on show is kept in the address (`onPick`), so a post's way back lands on it.
 */
export function Feed({ on, onPick }: { on?: Platform; onPick?: (p: Platform) => void }) {
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
  const linked = (p: Platform) => links[p] !== 'off'
  const rail = railOf(items ?? [], linked)
  const [picked, setPicked] = React.useState<Platform | undefined>(on)
  const platform = platformOf(rail, items ?? [], picked)
  const ledger = ledgerOf(items ?? [], platform)
  const pick = (p: Platform) => {
    setPicked(p)
    onPick?.(p)
  }

  return (
    <section aria-label="Feed" className="flex min-w-0 flex-col">
      <div
        role="radiogroup"
        aria-label="Platform"
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-5"
      >
        {rail.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={p === platform}
            onClick={() => pick(p)}
            className={`bb-press flex h-9 shrink-0 items-center gap-2 rounded-full pr-3.5 pl-3 text-[13px] font-medium ${p === platform ? 'bg-ink text-page' : linked(p) ? 'bg-surface text-ink-3' : 'bg-surface text-ink-4'}`}
          >
            <PlatformLogo platform={p} size={13} />
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
          <Profile ledger={ledger} platform={platform} now={now} />
        )}
      </div>
    </section>
  )
}

function Empty({ platform, linked }: { platform: Platform; linked: boolean }) {
  const name = PLATFORM_NAME[platform]
  return (
    <div className="flex max-w-[420px] flex-col items-start gap-3.5 pt-16 max-md:gap-3 max-md:pt-12">
      {!linked && <NotAvailable label="Not connected" reason={reasonOf(name)} align="left" />}
      <h2 className="font-display text-[26px] leading-[1.15] tracking-[-0.025em] max-md:text-[24px]">
        Nothing on {name} yet.
      </h2>
      <span className="text-[15px] leading-normal text-ink-3 max-md:text-[14.5px]">
        {linked
          ? 'Posts show here once they go out.'
          : `Posts show here once the brand’s ${name} account is connected.`}
      </span>
      <Link
        href={linked ? '/post/new' : '/brand/connections'}
        className="bb-press mt-2 inline-flex h-9 items-center rounded-full bg-ink px-4 text-[13.5px] font-medium text-page max-md:h-10"
      >
        {linked ? 'New post' : `Connect ${name}`}
      </Link>
    </div>
  )
}

function Profile({
  ledger,
  platform,
  now,
}: {
  ledger: PostedItem[]
  platform: Platform
  now: Moment
}) {
  const { brand } = useBrand()
  const accounts = {
    ig: useMakeAccount(brand.id, 'ig')?.name,
    fb: useMakeAccount(brand.id, 'fb')?.name,
    tt: useTikTokAccount(brand.id)?.name,
  }
  const [order, setOrder] = React.useState<Order>('newest')
  const sum = summaryOf(ledger, platform, now.day)
  const figures = figuresOf(sum, platform)
  const grid = gridOf(ledger, platform, order)
  const ranks = canRank(gridOf(ledger, platform, 'newest'), platform)
  const rings = ringsOf(ledger, now)
  return (
    <>
      <header className="flex items-center gap-8 pb-10 max-md:gap-5 max-md:pb-6">
        <span
          aria-hidden="true"
          className="relative size-[88px] shrink-0 overflow-hidden rounded-full max-md:size-16"
          style={{ background: `var(${brand.colour})` }}
        >
          <BrandLogo brandId={brand.id} sizes="176px" className="object-cover" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-3 max-md:gap-2">
          {/* The sort sits by the name, so the figures below keep the column's whole width. */}
          <div className="flex items-center gap-3">
            <h2 className="min-w-0 flex-1 truncate font-display text-[26px] leading-none tracking-[-0.025em] max-md:text-[21px]">
              {profileName(platform, accounts, brand)}
            </h2>
            {ranks && <SortMenu order={order} onChange={setOrder} />}
          </div>
          <p
            title={windowLine(sum)}
            className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[14px] text-ink-3 max-md:gap-x-4 max-md:text-[13px]"
          >
            {figures.map((f) => (
              <span key={f.label}>
                <b className={`${NUM} mr-1 text-[17px] text-ink max-md:text-[15px]`}>
                  {k(f.value)}
                </b>
                {f.label}
              </span>
            ))}
            {sum.measuredAt && (
              <span className="text-[12px] text-ink-3">as of {asOf(sum.measuredAt)}</span>
            )}
          </p>
        </div>
      </header>

      {rings.length > 0 && (
        <ul
          aria-label="Stories"
          className="-mx-1.5 -mt-1.5 flex gap-5 overflow-x-auto px-1.5 pt-1.5 pb-9 max-md:gap-4 max-md:pb-6"
        >
          {rings.map(({ item, left }) => (
            <Ring key={item.post.id} item={item} left={left} today={now.day} />
          ))}
        </ul>
      )}

      <ol aria-label="Posts" className="grid grid-cols-3 gap-2 max-md:-mx-4 max-md:gap-0.5">
        {grid.map((item) => (
          <li key={item.post.id}>
            <Tile item={item} platform={platform} today={now.day} />
          </li>
        ))}
      </ol>
    </>
  )
}

const ORDERS: Array<[Order, string]> = [
  ['newest', 'Newest'],
  ['top', 'Most engaging'],
]

/** One sort icon; its menu names the two orders, a tick on the one in use. */
function SortMenu({ order, onChange }: { order: Order; onChange: (o: Order) => void }) {
  const [open, setOpen] = React.useState(false)
  const root = React.useRef<HTMLDivElement>(null)
  useMenu(
    open,
    React.useCallback(() => setOpen(false), []),
    root,
  )
  return (
    <div ref={root} className="relative -my-[5px] shrink-0">
      <button
        type="button"
        aria-label="Sort"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex size-9 items-center justify-center rounded-full transition-colors hover:bg-surface hover:text-ink ${open ? 'bg-surface text-ink' : 'text-ink-3'}`}
      >
        <SortIcon />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Sort"
          className="bb-menu absolute top-11 right-0 z-30 flex w-[176px] origin-top-right flex-col rounded-[12px] bg-page p-1 shadow-[0_0_0_1px_var(--line),var(--shadow-pop)]"
        >
          {ORDERS.map(([o, label]) => (
            <button
              key={o}
              type="button"
              role="menuitemradio"
              aria-checked={order === o}
              onClick={() => {
                onChange(o)
                setOpen(false)
              }}
              className="flex h-9 items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[13px] text-ink transition-colors outline-none hover:bg-surface focus-visible:bg-surface"
            >
              <span className="flex-1">{label}</span>
              <span
                className={`text-ink-2 transition-opacity ${order === o ? 'opacity-100' : 'opacity-0'}`}
              >
                <CheckIcon size={13} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** The counts a tile names by a glyph: views, reach and likes. The rest keep their word. */
const GLYPH: Partial<Record<CountKey, React.ReactNode>> = {
  views: <PlayIcon />,
  reach: <EyeIcon />,
  likes: <HeartIcon />,
}

/**
 * A story as a ring: green while it is up, grey once gone. Under it the day; the hours left show
 * on hover or focus, and always on a touch screen, which has no hover.
 */
function Ring({ item, left, today }: { item: PostedItem; left: number | null; today: string }) {
  const live = left !== null
  const day = shortDay(item, today)
  return (
    <li
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focus shows the hours left, as hover does
      tabIndex={0}
      aria-label={`${storyKind(item.post)} · ${day} · ${live ? `Live, ${left} h left` : 'Gone'}`}
      className="group flex rounded-[10px] w-[68px] shrink-0 flex-col items-center gap-2 max-md:w-[60px]"
    >
      <span
        className={`block size-[68px] rounded-full border-[1.5px] p-[3px] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] group-hover:scale-[1.04] group-focus-visible:scale-[1.04] max-md:size-[60px] ${live ? 'border-live' : 'border-track'}`}
      >
        <span
          className={`relative block size-full overflow-hidden rounded-full bg-tile ${live ? '' : 'opacity-60'}`}
        >
          {item.post.images[0] && <Media src={item.post.images[0]} sizes="136px" />}
        </span>
      </span>
      <span className="grid text-[11.5px] leading-none whitespace-nowrap tabular-nums">
        <span
          className={`col-start-1 row-start-1 text-center transition-opacity duration-200 ${live ? 'text-ink group-hover:opacity-0 group-focus-visible:opacity-0 [@media(hover:none)]:opacity-0' : 'text-ink-3'}`}
        >
          {day}
        </span>
        {live && (
          <span className="col-start-1 row-start-1 text-center text-live opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
            {left} h left
          </span>
        )}
      </span>
    </li>
  )
}

/**
 * A post's cover at 4:5, as the platform's grid crops it. A small mark top right says a reel's
 * length or a carousel; one count sits bottom left. Hover or focus lays the post over it: what it
 * was, when, and every count it has.
 */
function Tile({ item, platform, today }: { item: PostedItem; platform: Platform; today: string }) {
  const { post } = item
  const counts = tileCountsOf(item, platform)
  const head = headlineOf(item, platform)
  const collab = item.collabs.length > 0 ? ` · with ${item.collabs.join(', ')}` : ''
  // A reel's length, or a carousel's mark; a single photo, or a reel with no length, has none.
  const mark =
    post.format === 'reel' ? (
      post.duration
    ) : post.images.length > 1 ? (
      <CarouselIcon size={12} />
    ) : null
  return (
    <Link
      href={`/post/${post.id}?posted=${platform}`}
      aria-label={tileLabel(item, platform, today)}
      className="group relative block aspect-[4/5] overflow-hidden rounded-[10px] bg-tile transition-transform duration-200 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.985] max-md:rounded-none"
    >
      <Cover src={post.images[0]} />
      {mark && (
        <span
          className={`pointer-events-none absolute top-2 right-2 flex h-[22px] min-w-[22px] items-center justify-center px-1.5 font-mono text-[10.5px] tabular-nums max-md:top-1 max-md:right-1 max-md:h-5 max-md:min-w-5 max-md:text-[9.5px] ${ON_COVER}`}
        >
          {mark}
        </span>
      )}
      {head && (
        <span
          className={`pointer-events-none absolute bottom-2 left-2 flex h-6 items-center gap-1.5 px-2.5 text-[12px] font-semibold tabular-nums transition-opacity duration-200 group-hover:opacity-0 group-focus-visible:opacity-0 max-md:bottom-1 max-md:left-1 max-md:h-5 max-md:gap-1 max-md:px-2 max-md:text-[10.5px] ${ON_COVER}`}
        >
          {GLYPH[head.key] ?? null}
          {k(head.value)}
          <span className={GLYPH[head.key] ? 'sr-only' : 'font-normal'}>
            {head.label.toLowerCase()}
          </span>
        </span>
      )}
      {/* The post laid over its cover, on hover or focus; a phone opens the poster instead. */}
      <span className="pointer-events-none absolute inset-0 flex flex-col justify-end gap-3 bg-black/55 p-4 text-page opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 max-md:hidden">
        <span className="flex flex-col gap-1">
          <span className="truncate text-[12px] text-(--pc-dim)">
            {kindOf(post, platform)} · {whenOf(item, today)}
            {collab}
          </span>
          <span className="line-clamp-2 font-display text-[16px] leading-[1.25]">{post.hook}</span>
        </span>
        {counts.length > 0 && (
          <span className="flex flex-wrap gap-x-4 gap-y-2">
            {counts.map((c) => (
              <span key={c.key} className="flex flex-col gap-[3px]">
                <span className={`${NUM} text-[16px] leading-none`}>{k(c.value)}</span>
                <span className="text-[11px] text-(--pc-dim)">{c.label.toLowerCase()}</span>
              </span>
            ))}
          </span>
        )}
      </span>
    </Link>
  )
}

/** The cover fades in once it has loaded, and eases in a little on hover. */
function Cover({ src }: { src?: string }) {
  const box = React.useRef<HTMLSpanElement>(null)
  const [loaded, setLoaded] = React.useState(false)
  React.useEffect(() => {
    const el = box.current?.querySelector('img, video')
    if (!el) return
    const done = () => setLoaded(true)
    if (el instanceof HTMLImageElement ? el.complete : (el as HTMLVideoElement).readyState >= 2)
      return done()
    el.addEventListener('load', done)
    el.addEventListener('loadeddata', done)
    return () => {
      el.removeEventListener('load', done)
      el.removeEventListener('loadeddata', done)
    }
  }, [src])
  return (
    <span
      ref={box}
      className={`absolute inset-0 transition-[opacity,transform] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] group-hover:scale-[1.03] ${loaded ? 'opacity-100' : 'opacity-0'}`}
    >
      {src && <Media src={src} sizes="(max-width: 767px) 33vw, 300px" />}
    </span>
  )
}
