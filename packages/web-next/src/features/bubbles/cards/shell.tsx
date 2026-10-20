'use client'

import Image from 'next/image'
import Link from 'next/link'
import * as React from 'react'

import { isVideo, Media } from '@/components/media'
import { useReducedMotion } from '@/features/publish/preview-media'

/**
 * What every card shares: the frame with its verb, the row the cards sit in, a thumbnail that
 * fades in as it loads, and a value that slides from what it was to what it is now.
 */

export const EYEBROW = 'font-mono text-[10.5px] tracking-[0.08em] text-ink-4 uppercase'

/** The one-line title of a thing on a card: an idea's hook, a shoot's name. */
export const TITLE = 'font-display text-[15px] leading-[1.2] tracking-[-0.01em] text-ink'

export const META = 'flex min-w-0 items-center gap-1.5 text-[12px] text-ink-4'

/**
 * The cards of one turn. On a wide screen they wrap; on a phone they sit in one row that scrolls
 * sideways, bleeding to the screen's edge, with the next card's edge in view.
 */
export function Row({ children }: { children: React.ReactNode }) {
  return (
    <ol
      aria-label="What changed"
      className="flex items-stretch gap-3 max-md:-mx-4 max-md:items-start max-md:snap-x max-md:snap-mandatory max-md:overflow-x-auto max-md:scroll-px-4 max-md:px-4 max-md:[scrollbar-width:none] md:flex-wrap"
    >
      {children}
    </ol>
  )
}

/**
 * One card: the verb above, then the thing. It rises in, a little after the card before it; a
 * removed thing is faded and opens nothing. With a page to open, the whole card is the link.
 */
export function Card({
  verb,
  href,
  removed = false,
  index,
  label,
  wide = false,
  children,
}: {
  verb: string
  href?: string
  removed?: boolean
  /** Its place in the row: the stagger. */
  index: number
  /** What the card is, for a screen reader: "Idea: Watch the dough." */
  label: string
  /** The card takes the whole row: a grid of moodboard tiles needs the width. */
  wide?: boolean
  children: React.ReactNode
}) {
  const frame = `flex w-full flex-col gap-2.5 rounded-[16px] border border-line bg-page p-3 text-left ${href && !removed ? 'bb-press transition-colors hover:bg-surface-2' : ''}`
  const body = (
    <>
      <span className={EYEBROW}>{verb}</span>
      {children}
    </>
  )
  return (
    <li
      className={`bb-rise flex shrink-0 snap-start ${wide ? 'w-full' : 'w-[calc(50%-6px)] max-md:w-[calc(100vw-64px)]'} ${removed ? 'opacity-50' : ''}`}
      style={{ animationDelay: `${Math.min(index, 6) * 70}ms` }}
    >
      {href && !removed ? (
        <Link href={href} aria-label={label} className={frame}>
          {body}
        </Link>
      ) : (
        <div role="group" aria-label={label} className={frame}>
          {body}
        </div>
      )}
    </li>
  )
}

/**
 * A photo or a video's poster in a rounded box, drawn in once it has loaded. With no source, the
 * box is the tile's grey with the `fallback` icon in its middle: what kind of thing it is.
 */
export function Thumb({
  src,
  className = 'size-[60px]',
  faded = false,
  fallback,
  children,
}: {
  src?: string
  /** The box's size and shape; 4:5 is the app's idea tile. */
  className?: string
  /** The picture stands in for one not made yet: faded, as the calendar draws it. */
  faded?: boolean
  /** Drawn in the middle while there is no picture: the thing's kind, as a small icon. */
  fallback?: React.ReactNode
  children?: React.ReactNode
}) {
  const [loaded, setLoaded] = React.useState(false)
  const still = useReducedMotion()
  const show = loaded || still || !src || isVideo(src)
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-tile text-ink-5 ${className}`}
    >
      {!src && fallback}
      {src && (
        <span
          className={`absolute inset-0 transition-opacity duration-300 ease-out ${show ? 'opacity-100' : 'opacity-0'} ${faded ? 'opacity-40 grayscale-[0.4]' : ''}`}
        >
          {isVideo(src) || src.startsWith('blob:') ? (
            <Media src={src} sizes="120px" />
          ) : (
            <Image
              src={src}
              alt=""
              fill
              sizes="120px"
              unoptimized={/^https?:/.test(src)}
              onLoad={() => setLoaded(true)}
              className="object-cover"
            />
          )}
        </span>
      )}
      {children}
    </span>
  )
}

/**
 * A value that was `from` when the move was called and is `to` now: the card shows `from` for a
 * beat, then `to` slides in, so a moved day or a new stage is seen to change. With no `from`, or
 * with less motion asked for, `to` shows at once.
 */
export function useSettled<T>(
  from: T | undefined,
  to: T,
  delay = 480,
): { value: T; moved: boolean } {
  const still = useReducedMotion()
  const differs = from !== undefined && from !== to && !still
  /** The beat has passed: `to` shows. */
  const [settled, setSettled] = React.useState(false)
  React.useEffect(() => {
    if (!differs) return
    const timer = setTimeout(() => setSettled(true), delay)
    return () => clearTimeout(timer)
  }, [differs, delay])
  return { value: differs && !settled ? from : to, moved: differs && settled }
}

/** A word that slid in from under, when it just changed. */
export function Slide({ moved, children }: { moved: boolean; children: React.ReactNode }) {
  return (
    <span
      key={String(moved)}
      className={`inline-flex min-w-0 ${moved ? 'bb-step' : ''}`}
      style={{ '--y': '8px' } as React.CSSProperties}
    >
      {children}
    </span>
  )
}

/** "Jules (videographer)" → "J": the first letter of each word that starts with one. */
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .map((w) => w.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase()

/** A person as their initials, in the shoot page's avatar colours. */
export function Initials({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-page"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: 'var(--avatar)',
        color: 'var(--avatar-ink)',
      }}
    >
      {initialsOf(name)}
    </span>
  )
}

/** A few faces or thumbnails, overlapping, as a group reads at a glance. */
export function Stack({ children }: { children: React.ReactNode }) {
  return <span className="flex items-center -space-x-1.5">{children}</span>
}
