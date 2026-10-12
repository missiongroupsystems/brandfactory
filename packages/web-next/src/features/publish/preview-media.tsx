'use client'

import * as React from 'react'

import { CarouselIcon, ReelIcon } from '@/components/icons'
import { posterOf } from '@/components/media'
import type { Format } from '@/data/demo'
import { useBrand } from '@/features/schedule/posts-store'

import type { Shot } from './model'
import { ShotView } from './shot'

/**
 * What fills the media area of a phone mock: a reel's video with its tap-to-pause, mute and
 * progress line; a carousel's swipe strip with its arrows, counter and dots; or, with no media
 * yet, the empty state. `phone-mocks.tsx` draws each app's chrome around these.
 */

// ── Motion ───────────────────────────────────────────────────────────────────────────────────

const REDUCE = '(prefers-reduced-motion: reduce)'
const onReduce = (cb: () => void) => {
  const mq = window.matchMedia(REDUCE)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** True when the system asks for less motion: the preview then waits for a tap before it plays. */
export function useReducedMotion(): boolean {
  return React.useSyncExternalStore(
    onReduce,
    () => window.matchMedia(REDUCE).matches,
    () => false,
  )
}

/** Tells the shots added since the mock opened from the ones it opened with: each settles in once. */
export function useFresh(shots: Shot[]): (shot: Shot) => boolean {
  const [opened] = React.useState(() => new Set(shots.map((s) => s.src)))
  return (shot) => !opened.has(shot.src)
}

// ── Reel ─────────────────────────────────────────────────────────────────────────────────────

export interface Player {
  playing: boolean
  muted: boolean
  /** 0–1 through the clip. */
  progress: number
  autoplay: boolean
  toggle: () => void
  toggleMute: () => void
  /** The clip's position, 0–1, from its time updates. */
  onProgress: (at: number) => void
  /** The browser refused to play: the clip rests and a tap starts it. */
  onRefused: () => void
  /** The glyph a tap flashes mid-frame, keyed so each tap replays it. */
  flash: { kind: 'play' | 'pause'; key: number } | null
  endFlash: () => void
}

/**
 * The reel preview's player state: muted autoplay (a tap first, under reduced motion), a tap to
 * pause and play, and the sound switch. `ReelVideo` keeps the element in step. `src` is `null`
 * when the screen has no video to play.
 */
export function useReelPlayer(src: string | null): Player | null {
  const autoplay = !useReducedMotion()
  // Untouched, the clip plays when motion is welcome; a tap decides from then on.
  const [wants, setWants] = React.useState<boolean | null>(null)
  const [muted, setMuted] = React.useState(true)
  const [progress, setProgress] = React.useState(0)
  const [flash, setFlash] = React.useState<Player['flash']>(null)
  const onRefused = React.useCallback(() => setWants(false), [])
  const playing = wants ?? autoplay
  if (!src) return null
  return {
    playing,
    muted,
    progress,
    autoplay,
    toggle: () => {
      setWants(!playing)
      setFlash({ kind: playing ? 'pause' : 'play', key: Date.now() })
    },
    toggleMute: () => setMuted((m) => !m),
    onProgress: setProgress,
    onRefused,
    flash,
    endFlash: () => setFlash(null),
  }
}

/** The clip itself, muted and looping, with its poster up first; it follows the player's state. */
export function ReelVideo({ shot, player, fresh }: { shot: Shot; player: Player; fresh: boolean }) {
  const ref = React.useRef<HTMLVideoElement>(null)
  const { playing, muted, onRefused } = player
  // The server's HTML carries no `muted`, so a browser may refuse the first autoplay; played by
  // hand once it is muted for real, the clip goes.
  React.useEffect(() => {
    const v = ref.current
    if (!v) return
    v.muted = muted
    if (playing) void v.play().catch(onRefused)
    else v.pause()
  }, [playing, muted, onRefused])
  return (
    <video
      ref={ref}
      src={shot.src}
      poster={posterOf(shot.src)}
      autoPlay={player.autoplay}
      muted
      loop
      playsInline
      onTimeUpdate={(e) => {
        const v = e.currentTarget
        player.onProgress(v.duration > 0 ? v.currentTime / v.duration : 0)
      }}
      className={`absolute inset-0 size-full object-cover ${fresh ? 'bb-land' : ''}`}
    />
  )
}

const PLAY = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
  </svg>
)
const PAUSE = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="5" width="4.2" height="14" rx="1.2" />
    <rect x="13.8" y="5" width="4.2" height="14" rx="1.2" />
  </svg>
)
const SPEAKER = 'M4 9.5h3.2L12 5.5v13l-4.8-4H4Z'
const MUTED = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d={SPEAKER} fill="currentColor" />
    <path d="m16 9.5 5 5m0-5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)
const SOUND = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d={SPEAKER} fill="currentColor" />
    <path
      d="M15.5 9a4.2 4.2 0 0 1 0 6M18.3 6.5a8 8 0 0 1 0 11"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
)

/**
 * Over the whole frame: the tap that pauses and plays, the glyph it flashes, the sound switch in
 * the top corner (on hover, always on a touch screen) and the progress line along the bottom.
 * `inset` lifts the tap and the line above an app's own bottom bar.
 */
export function ReelControls({ player, inset = 0 }: { player: Player; inset?: number }) {
  const glyph =
    'flex size-[38px] items-center justify-center rounded-full bg-(--pc-glyph-shadow) text-(--pc-white) backdrop-blur-[2px]'
  return (
    <>
      <button
        type="button"
        aria-label={player.playing ? 'Pause' : 'Play'}
        onClick={player.toggle}
        className="absolute inset-x-0 top-0 cursor-default rounded-[22px] focus-visible:shadow-[inset_0_0_0_1.5px_var(--pc-white)] focus-visible:outline-none"
        style={{ bottom: inset }}
      />
      <span
        className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center"
        style={{ bottom: inset }}
      >
        {player.flash ? (
          <span
            key={player.flash.key}
            onAnimationEnd={player.endFlash}
            className={`bb-glyph ${glyph}`}
          >
            {player.flash.kind === 'play' ? PLAY : PAUSE}
          </span>
        ) : (
          !player.playing && <span className={`bb-pop ${glyph}`}>{PLAY}</span>
        )}
      </span>
      <button
        type="button"
        aria-label={player.muted ? 'Unmute' : 'Mute'}
        onClick={player.toggleMute}
        className="absolute top-[9px] right-[9px] flex size-[20px] items-center justify-center rounded-full bg-(--pc-glyph-shadow) text-(--pc-white) opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover/phone:opacity-100 focus-visible:opacity-100 focus-visible:outline-none [@media(hover:none)]:opacity-100"
      >
        <span className="relative size-[11px]">
          <span
            className={`absolute inset-0 transition-opacity duration-200 ${player.muted ? 'opacity-100' : 'opacity-0'}`}
          >
            {MUTED}
          </span>
          <span
            className={`absolute inset-0 transition-opacity duration-200 ${player.muted ? 'opacity-0' : 'opacity-100'}`}
          >
            {SOUND}
          </span>
        </span>
      </button>
      <span
        className="pointer-events-none absolute inset-x-0 h-[2px] bg-(--pc-faint)"
        style={{ bottom: inset }}
      >
        <span
          className="block h-full bg-(--pc-white) transition-[width] duration-300 ease-linear"
          style={{ width: `${player.progress * 100}%` }}
        />
      </span>
    </>
  )
}

// ── Carousel ─────────────────────────────────────────────────────────────────────────────────

export interface Slides {
  index: number
  count: number
  set: (i: number) => void
}

/**
 * Which slide the strip rests on: a swipe settles it by its snap, an arrow or a key scrolls it
 * there (`Carousel` does the scrolling). The dots and the counter follow `index`.
 */
export function useSlides(count: number): Slides {
  const [at, set] = React.useState(0)
  return { index: Math.min(at, Math.max(0, count - 1)), count, set }
}

const CHEVRON = (dir: -1 | 1) => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d={dir < 0 ? 'm14.5 6-6 6 6 6' : 'm9.5 6 6 6-6 6'}
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/**
 * The slides, one in view, with the arrows a pointer reveals and the "n/N" pill. The arrows
 * also take the arrow keys, so a keyboard moves the strip from either one.
 */
export function Carousel({
  shots,
  slides,
  fresh,
}: {
  shots: Shot[]
  slides: Slides
  fresh: (shot: Shot) => boolean
}) {
  const { index, count, set } = slides
  const strip = React.useRef<HTMLSpanElement>(null)
  // Where a smooth scroll is headed: scroll events on the way there must not move the dots.
  const target = React.useRef<number | null>(null)
  const go = React.useCallback(
    (i: number) => {
      const to = Math.max(0, Math.min(count - 1, i))
      set(to)
      const el = strip.current
      if (!el) return
      target.current = to
      el.scrollTo({ left: to * el.clientWidth })
      // A swipe that cuts the scroll short never reaches the target: the guard lifts anyway.
      window.setTimeout(() => {
        if (target.current === to) target.current = null
      }, 500)
    },
    [count, set],
  )
  // A slide just added slides into view, once: a later removal must not move the strip.
  const last = shots.length - 1
  const added = last >= 0 && fresh(shots[last]!) ? shots[last]!.src : null
  const shown = React.useRef(new Set<string>())
  React.useEffect(() => {
    if (added === null || shown.current.has(added)) return
    shown.current.add(added)
    go(last)
  }, [added, last, go])
  const keys = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    go(index + (e.key === 'ArrowRight' ? 1 : -1))
  }
  const arrow = (dir: -1 | 1) => {
    const end = dir < 0 ? index === 0 : index === count - 1
    return (
      <button
        type="button"
        aria-label={dir < 0 ? 'Previous slide' : 'Next slide'}
        aria-disabled={end}
        onClick={() => go(index + dir)}
        onKeyDown={keys}
        className={`absolute top-1/2 flex size-[20px] -translate-y-1/2 items-center justify-center rounded-full bg-(--pc-white) text-(--pc-black) opacity-0 shadow-[0_1px_4px_var(--pc-glyph-shadow)] transition-opacity duration-200 focus-visible:outline-none [@media(hover:none)]:hidden ${dir < 0 ? 'left-[6px]' : 'right-[6px]'} ${end ? 'cursor-default group-hover/slides:opacity-30 focus-visible:opacity-30' : 'group-hover/slides:opacity-100 focus-visible:opacity-100'}`}
      >
        {CHEVRON(dir)}
      </button>
    )
  }
  return (
    <span className="group/slides absolute inset-0">
      <span
        ref={strip}
        role="group"
        aria-roledescription="carousel"
        aria-label={`Slide ${index + 1} of ${count}`}
        onScroll={(e) => {
          const el = e.currentTarget
          if (el.clientWidth === 0) return
          const pos = el.scrollLeft / el.clientWidth
          const near = Math.round(pos)
          // Only once the snap has settled, so a swipe in flight does not flick the dots, and
          // not on a slide a smooth scroll is passing through.
          if (Math.abs(pos - near) >= 0.02) return
          if (target.current !== null && near !== target.current) return
          target.current = null
          set(near)
        }}
        className="flex size-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
      >
        {shots.map((shot, i) => (
          <span
            key={shot.src + i}
            className={`relative block size-full shrink-0 snap-center ${fresh(shot) ? 'bb-land' : ''}`}
          >
            <ShotView shot={shot} sizes="480px" />
          </span>
        ))}
      </span>
      {count > 1 && (
        <>
          {arrow(-1)}
          {arrow(1)}
          <span className="pointer-events-none absolute top-[8px] right-[8px] flex rounded-full bg-(--pc-scrim-bottom) px-[6px] py-[2px] text-[7px] leading-none font-medium text-(--pc-white) tabular-nums">
            <span key={index} className="animate-[bb-swap_220ms_cubic-bezier(0.2,0.8,0.2,1)_both]">
              {index + 1}
            </span>
            /{count}
          </span>
        </>
      )}
    </span>
  )
}

/** The slide dots under a carousel; the live one takes the `on` colour and, if `wide`, stretches. */
export function Dots({
  slides,
  on,
  off,
  wide = false,
}: {
  slides: Slides
  on: string
  off: string
  wide?: boolean
}) {
  return (
    <span data-dots="" className="flex items-center gap-[3px]">
      {Array.from({ length: slides.count }, (_, i) => {
        const live = i === slides.index
        return (
          <span
            key={i}
            data-active={live || undefined}
            className={`h-[3.5px] rounded-full transition-[width,background-color,opacity] duration-200 ease-out ${live ? on : off} ${live && wide ? 'w-[8px]' : 'w-[3.5px]'}`}
          />
        )
      })}
    </span>
  )
}

// ── Empty ────────────────────────────────────────────────────────────────────────────────────

const PLUS_GLYPH = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

/**
 * The media area before anything is added: a calm surface with the brand's tint glowing behind
 * the middle, a frosted plus and one line, with a quieter hint under it. In the composer it is a button that opens the picker. `light` is for the
 * apps that show a photo on a white feed.
 */
export function Placeholder({ light, onAdd }: { light: boolean; onAdd?: () => void }) {
  const { brand } = useBrand()
  const tint = `var(${brand.colour})`
  const background = light
    ? `linear-gradient(180deg, color-mix(in oklab, ${tint} 7%, #f5f3ef), #ebe8e3)`
    : `radial-gradient(70% 45% at 50% 46%, color-mix(in oklab, ${tint} 18%, #1c1a18), #0e0d0c 100%)`
  const inner = (
    <>
      <span
        className={`flex size-[34px] items-center justify-center rounded-full ${light ? 'bg-black/[0.05] text-black/55 shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.12)]' : 'bg-white/[0.08] text-white/80 shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.18)] backdrop-blur-sm'}`}
      >
        {PLUS_GLYPH}
      </span>
      <span className="flex flex-col items-center gap-[3px]">
        <span
          className={`text-[9px] leading-none font-medium ${light ? 'text-black/65' : 'text-white/75'}`}
        >
          Add a photo or video
        </span>
        <span className={`text-[7.5px] leading-none ${light ? 'text-black/35' : 'text-white/35'}`}>
          or drop it here
        </span>
      </span>
    </>
  )
  const cls = 'absolute inset-0 flex flex-col items-center justify-center gap-[10px]'
  return onAdd ? (
    <button
      type="button"
      aria-label="Add a photo or video"
      onClick={onAdd}
      className={`${cls} cursor-pointer focus-visible:shadow-[inset_0_0_0_1.5px_currentColor] focus-visible:outline-none`}
      style={{ background }}
    >
      {inner}
    </button>
  ) : (
    <span className={cls} style={{ background }}>
      {inner}
    </span>
  )
}

// ── Tile ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Instagram's corner mark on a grid tile: the reel glyph on a reel, the stacked squares on a
 * post with more than one slide, nothing on a single photo. The same glyphs as the calendar tile.
 */
export function TypeBadge({ format, slides }: { format: Format; slides: number }) {
  if (format === 'story' || (format === 'carousel' && slides < 2)) return null
  return (
    <span
      role="img"
      aria-label={format === 'reel' ? 'Reel' : 'Carousel'}
      className="absolute top-[5px] right-[5px] text-page drop-shadow-[0_1px_2px_var(--tile-glyph-shadow)]"
    >
      {format === 'reel' ? <ReelIcon size={11} /> : <CarouselIcon size={11} />}
    </span>
  )
}
