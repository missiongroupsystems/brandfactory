'use client'

import Image from 'next/image'

import type { BrandId } from '@/data/brands'
import { useBrand } from '@/features/schedule/posts-store'

import { useBrandKit } from './brand-store'

/** "CV" for Casa Vostra, "T" for Temper: the first letter of up to two words. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/**
 * The brand's logo as the kit holds it now, filling its positioned parent. A logo the team
 * uploaded is a `blob:` URL already in the browser, so it skips the image optimiser. A brand
 * with no logo yet shows its initials, in white on the parent's brand colour.
 */
export function BrandLogo({
  brandId,
  alt = '',
  sizes,
  className,
}: {
  brandId: BrandId
  alt?: string
  sizes: string
  className?: string
}) {
  const { src } = useBrandKit(brandId).logo
  const name = useBrand().brands.find((b) => b.id === brandId)?.name ?? ''
  if (src === null) {
    return (
      <svg
        viewBox="0 0 24 24"
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className="absolute inset-0 size-full font-display font-semibold"
      >
        <text
          x="12"
          y="12.5"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="9.5"
          fill="white"
          letterSpacing="-0.3"
        >
          {initialsOf(name)}
        </text>
      </svg>
    )
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      unoptimized={src.startsWith('blob:') || /^https?:/.test(src)}
      className={className}
    />
  )
}
