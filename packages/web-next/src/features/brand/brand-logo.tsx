'use client'

import Image from 'next/image'

import type { BrandId } from '@/data/brands'

import { useBrandKit } from './brand-store'

/**
 * The brand's logo as the kit holds it now, filling its positioned parent. A logo the team
 * uploaded is a `blob:` URL already in the browser, so it skips the image optimiser.
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
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      unoptimized={src.startsWith('blob:')}
      className={className}
    />
  )
}
