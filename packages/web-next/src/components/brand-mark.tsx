'use client'

import { BrandLogo } from '@/features/brand/brand-logo'
import { useBrand } from '@/features/schedule/posts-store'

/**
 * A brand's logo as a coin: the same size in every row, cropped a touch inside its edge (a
 * profile picture often carries its own white rim), with one fine ring over it so a light logo
 * still has an edge on the white menu. With `label`, it names the brand to a screen reader.
 */
export function BrandMark({
  brandId,
  size = 28,
  label,
}: {
  brandId: string
  size?: number
  label?: string
}) {
  const brand = useBrand().brands.find((b) => b.id === brandId)
  if (!brand) return null
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      title={label}
      className="relative block shrink-0 overflow-hidden rounded-full"
      style={{ background: `var(${brand.colour})`, width: size, height: size }}
    >
      <BrandLogo brandId={brand.id} sizes={`${size * 2}px`} className="scale-[1.08] object-cover" />
      <span className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_rgba(18,18,18,0.1)]" />
    </span>
  )
}
