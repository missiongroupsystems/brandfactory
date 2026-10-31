'use client'

import Link from 'next/link'
import * as React from 'react'

import {
  CarouselIcon,
  CheckIcon,
  ChevronIcon,
  EyeIcon,
  HeartIcon,
  PlayIcon,
  SortIcon,
} from '@/components/icons'
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

/** Now in the brand's own zone, read again each minute so a story's hours left stay true. */
function useNow() {
  const { brand } = useBrand()
  const [at, setAt] = React.useState(() => new Date())
  React.useEffect(() => {
    const t = window.setInterval(() => setAt(new Date()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  return nowIn(at, timezoneOf(brand.id), remote ? undefined : todayDate())
}

/**
 * The feed, the heart of the Feed page: what went out, one platform at a time, as the account
 * looks. The brand's profile with its last 30 days, the platforms as a stack of logos beside its
 * name, its stories as rings and its posts as a grid of covers. A cover shows one count; hover
 * shows them all. A cover opens its poster. The platform on show is kept in the address
 * (`onPick`), so a post's way back lands on it.
 */
export function Feed({ on, onPick }: { on?: Platform; onPick?: (p: Platform) => void }) {
  const { brand } = useBrand()
  const [picked, setPicked] = React.useState<Platform | undefined>(on)
  // The address may change the platform (a link to this page from this page): follow it.
  const [seen, setSeen] = React.useState(on)
  if (on !== seen) {
    setSeen(on)
    setPicked(on)
  }
  const now = useNow()
  const items = usePostedItems(now.day)
  const links = useConnections(brand.id)
  const linked = (p: Platform) => links[p] !== 'off'
  const rail = railOf(items ?? [], linked)
  const platform = platformOf(rail, items ?? [], picked)
  const ledger = ledgerOf(items ?? [], platform)
  const count = (p: Platform) =>
    ledgerOf(items ?? [], p).filter((i) => i.post.format !== 'story').length
  const pick = (p: Platform) => {
    setPicked(p)
    onPick?.(p)
  }

  return (
    <section aria-label="Feed" className="flex min-w-0 flex-col">
      {!items ? (
        <LoadingDots label="Loading posts" className="py-40" />
      ) : (
        <Profile
          ledger={ledger}
          platform={platform}
          now={now}
          rail={rail}
          linked={linked}
          count={count}
          onPick={pick}
        />
      )}
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

/**
 * The profile's header stays while the platform changes under it: the name, the switcher and
 * the figures update in place (each figure counts from the old platform's to the new one's), and
 * only the stories and the grid swap. On a desktop the platforms are a stack of logos beside the
 * name; on a phone one chip beside it opens a menu of them, which fits the width.
 */
function Profile({
  ledger,
  platform,
  now,
  rail,
  linked,
  count,
  onPick,
}: {
  ledger: PostedItem[]
  platform: Platform
  now: Moment
  rail: Platform[]
  linked: (p: Platform) => boolean
  count: (p: Platform) => number
  onPick: (p: Platform) => void
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
  // A phone keeps the figures to one line: the ones it leaves out are hidden there by CSS, so
  // the server's first paint is already right on either width.
  const onPhone = new Set(figuresOf(sum, platform, true).map((f) => f.label))
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
            <span className="flex min-w-0 flex-1 items-center gap-4 max-md:gap-2">
              <h2 className="min-w-0 truncate font-display text-[26px] leading-none tracking-[-0.025em] max-md:text-[21px]">
                {profileName(platform, accounts, brand)}
              </h2>
              {/* By CSS, not a JS check: a phone's first paint shows the menu, never the stack. */}
              <span className="flex md:hidden">
                <PlatformMenu platform={platform} rail={rail} count={count} onPick={onPick} />
              </span>
              <span className="flex max-md:hidden">
                <PlatformStack platform={platform} rail={rail} linked={linked} onPick={onPick} />
              </span>
            </span>
            {ranks && <SortMenu order={order} onChange={setOrder} />}
          </div>
          <p
            title={windowLine(sum)}
            className="flex items-baseline gap-x-6 text-[14px] whitespace-nowrap text-ink-3 max-md:gap-x-3.5 max-md:text-[13px]"
          >
            {figures.map((f) => (
              <span key={f.label} className={onPhone.has(f.label) ? undefined : 'max-md:hidden'}>
                <b className={`${NUM} mr-1 text-[17px] text-ink max-md:text-[15px]`}>
                  <Count value={f.value} />
                </b>
                {f.label}
              </span>
            ))}
          </p>
        </div>
      </header>

      <div key={platform} className="bb-swap flex flex-col">
        {ledger.length === 0 ? (
          <Empty platform={platform} linked={linked(platform)} />
        ) : (
          <>
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

            {/* The covers settle in one after the other, the first rows first. */}
            <ol aria-label="Posts" className="grid grid-cols-3 gap-2 max-md:-mx-4 max-md:gap-0.5">
              {grid.map((item, i) => (
                <li
                  key={item.post.id}
                  className="bb-rise"
                  style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                >
                  <Tile item={item} platform={platform} today={now.day} />
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </>
  )
}

/**
 * The platforms as a stack of small round logos beside the name, the one on show in ink and in
 * front. Hover spreads the stack and lifts the logo under the pointer; a click switches the
 * profile under it, and the ink moves to the new one.
 */
function PlatformStack({
  platform,
  rail,
  linked,
  onPick,
}: {
  platform: Platform
  rail: Platform[]
  linked: (p: Platform) => boolean
  onPick: (p: Platform) => void
}) {
  const at = rail.indexOf(platform)
  // A radio group is one Tab stop: the arrows move the pick, and the focus with it.
  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    // Alt and the others keep the browser's own shortcuts (Alt+Left is Back).
    if (!step || e.altKey || e.metaKey || e.ctrlKey) return
    e.preventDefault()
    const next = rail[(at + step + rail.length) % rail.length]!
    onPick(next)
    e.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-platform="${next}"]`)?.focus()
  }
  return (
    <div
      role="radiogroup"
      aria-label="Platform"
      className="group/stack flex shrink-0 items-center pl-1"
    >
      {rail.map((p, i) => {
        const on = p === platform
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={PLATFORM_NAME[p]}
            title={PLATFORM_NAME[p]}
            tabIndex={on ? 0 : -1}
            data-platform={p}
            onKeyDown={onKey}
            onClick={() => onPick(p)}
            className={`bb-press relative flex size-8 items-center justify-center rounded-full ring-2 ring-page transition-[margin,transform,background-color,color] duration-[260ms] ease-[cubic-bezier(.2,.8,.2,1)] group-hover/stack:ml-1 ${i > 0 ? '-ml-2.5' : ''} ${on ? 'z-10 bg-ink text-page' : `scale-[0.92] bg-surface hover:scale-[1.08] hover:text-ink ${linked(p) ? 'text-ink-3' : 'text-ink-4'}`}`}
            style={{ zIndex: on ? 10 : rail.length - Math.abs(i - at) }}
          >
            <PlatformLogo platform={p} size={13} />
          </button>
        )
      })}
    </div>
  )
}

/** The stack's disc: the platform's logo in a 32px circle, ink when it is the one on show. */
function Disc({ platform, on }: { platform: Platform; on: boolean }) {
  return (
    <span
      className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${on ? 'bg-ink text-page' : 'bg-surface text-ink-3'}`}
    >
      <PlatformLogo platform={platform} size={13} />
    </span>
  )
}

/**
 * The phone's switcher, so the header is not crowded with three logos: one disc, the platform
 * on show, with a chevron. Its menu lists the platforms as the same discs with their names and
 * post counts; it takes the keys (`useMenu`) and opens with `bb-menu`. A hit area around the
 * button makes the tap target 44px.
 */
function PlatformMenu({
  platform,
  rail,
  count,
  onPick,
}: {
  platform: Platform
  rail: Platform[]
  count: (p: Platform) => number
  onPick: (p: Platform) => void
}) {
  const [open, setOpen] = React.useState(false)
  const root = React.useRef<HTMLDivElement>(null)
  useMenu(
    open,
    React.useCallback(() => setOpen(false), []),
    root,
  )
  return (
    <div ref={root} className="relative -my-1.5 shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${PLATFORM_NAME[platform]}. Switch platform`}
        onClick={() => setOpen((o) => !o)}
        className={`bb-press relative flex h-8 items-center gap-1.5 rounded-full pr-2 pl-[5px] text-ink-4 after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-[''] ${open ? 'bg-paper' : 'bg-surface'}`}
      >
        {/* A light chip around a small ink disc and the chevron, read as one control. */}
        <span className="flex size-[22px] items-center justify-center rounded-full bg-ink text-page">
          <PlatformLogo platform={platform} size={11} />
        </span>
        <ChevronIcon open={open} size={10} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Platform"
          className="bb-menu absolute top-full right-0 z-30 flex w-[220px] origin-top-right flex-col rounded-[12px] bg-page p-1 shadow-[0_0_0_1px_var(--line),var(--shadow-pop)]"
        >
          {rail.map((p) => (
            <button
              key={p}
              type="button"
              role="menuitemradio"
              aria-checked={p === platform}
              onClick={() => {
                onPick(p)
                setOpen(false)
              }}
              className="flex h-11 items-center gap-3 rounded-[8px] px-1.5 text-left text-[13px] text-ink transition-colors outline-none hover:bg-surface focus-visible:bg-surface"
            >
              <Disc platform={p} on={p === platform} />
              <span className="flex-1">{PLATFORM_NAME[p]}</span>
              <span className="pr-1 font-mono text-[11px] text-ink-4 tabular-nums">
                {count(p) || ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * A figure that counts from its last value to its new one when it changes (a platform switch),
 * in half a second, easing out. The first value shows at once, and so does every value when the
 * system asks for less motion.
 */
function Count({ value }: { value: number }) {
  const [shown, setShown] = React.useState(value)
  // What is on screen now: a switch during a count starts from there, not from the last target.
  const at = React.useRef(value)
  React.useEffect(() => {
    const from = at.current
    if (from === value) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const t0 = performance.now()
    let frame = 0
    const step = (t: number) => {
      const p = still ? 1 : Math.min(1, (t - t0) / 480)
      const eased = 1 - (1 - p) ** 3
      at.current = Math.round(from + (value - from) * eased)
      setShown(at.current)
      if (p < 1) frame = window.requestAnimationFrame(step)
    }
    frame = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(frame)
  }, [value])
  return <>{k(shown)}</>
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
      className="group relative block aspect-[4/5] overflow-hidden rounded-[10px] bg-tile transition-transform duration-200 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.985] max-md:rounded-none md:hover:-translate-y-0.5"
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
