'use client'

import Image from 'next/image'
import * as React from 'react'

/**
 * An account's profile picture, or its initials when there is none. A platform returns one only
 * for some accounts (an Instagram business or creator, a Facebook Page, the brand's own account);
 * a personal account, a TikTok creator or a failed load falls back to the initials, so a row never
 * shows a broken image. The parent sizes and rounds it; the fallback is passed in as drawn today.
 */
export function ProfilePicture({
  src,
  size,
  className = '',
  children,
}: {
  src?: string
  size: number
  className?: string
  /** The initials, drawn as the place already draws them. */
  children: React.ReactNode
}) {
  const [failed, setFailed] = React.useState<string | null>(null)
  if (!src || failed === src) return children
  return (
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
      className={`shrink-0 object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
