'use client'

import Image from 'next/image'
import * as React from 'react'

import { remote } from '@/lib/remote'

/**
 * An account's profile picture, or its initials when there is none. A platform returns one only
 * for some accounts (an Instagram business or creator, a Facebook Page, the brand's own account);
 * a personal account, a TikTok creator or a failed load falls back to the initials, so a row never
 * shows a broken image. The parent sizes and rounds it; the fallback is passed in as drawn today.
 *
 * With `placeholder`, the initials also hold the place while the picture loads, and the picture
 * fades in over them: a list that just opened never shows an empty circle.
 */
export function ProfilePicture({
  src,
  size,
  className = '',
  placeholder = false,
  children,
}: {
  src?: string
  size: number
  className?: string
  /** Shows the initials until the picture has loaded, not only when there is none. */
  placeholder?: boolean
  /** The initials, drawn as the place already draws them. */
  children: React.ReactNode
}) {
  const [failed, setFailed] = React.useState<string | null>(null)
  const [loaded, setLoaded] = React.useState<string | null>(null)
  if (!src || failed === src) return children
  const image = (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      // An upload the team just made is already in the browser: nothing to optimise.
      unoptimized={src.startsWith('blob:')}
      // Small, and often in a list that just opened: load at once rather than wait to be seen.
      loading="eager"
      onError={() => setFailed(src)}
      onLoad={placeholder ? () => setLoaded(src) : undefined}
      className={
        placeholder
          ? `absolute inset-0 size-full rounded-[inherit] object-cover transition-opacity duration-200 ${loaded === src ? 'opacity-100' : 'opacity-0'}`
          : `shrink-0 object-cover ${className}`
      }
      style={placeholder ? undefined : { width: size, height: size }}
    />
  )
  if (!placeholder) return image
  return (
    <span
      className={`relative flex shrink-0 overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      {loaded !== src && children}
      {image}
    </span>
  )
}

const asked = new Set<string>()

/**
 * Starts the download of pictures a list will show, before it opens, so they are in the browser's
 * cache when it does. Only where the browser loads a picture's own address: on the core (images
 * load as they are, `next.config.ts`); in the demo the optimiser asks for a sized copy instead.
 */
export function preloadPictures(srcs: Array<string | undefined>) {
  if (!remote || typeof window === 'undefined') return
  for (const src of srcs) {
    if (!src || asked.has(src)) continue
    asked.add(src)
    const img = new window.Image()
    img.decoding = 'async'
    img.src = src
  }
}
