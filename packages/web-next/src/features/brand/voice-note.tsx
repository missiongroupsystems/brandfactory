'use client'

import Link from 'next/link'

import { useBrand } from '@/features/schedule/posts-store'

import { useBrandKit } from './brand-store'

/**
 * A quiet link beside an AI button: it writes in the brand's voice, set on the Brand page. A
 * hover shows that voice as the kit holds it now, so an edit there shows here at once. `plain`
 * drops the link where leaving the page would lose typed work (an inbox reply).
 */
export function VoiceNote({
  className = '',
  plain = false,
}: {
  className?: string
  plain?: boolean
}) {
  const { brand } = useBrand()
  const { summary } = useBrandKit(brand.id).voice
  if (plain) {
    return (
      <span title={summary} className={`text-[12px] whitespace-nowrap text-ink-4 ${className}`}>
        In {brand.name}’s voice
      </span>
    )
  }
  return (
    <Link
      href="/brand"
      title={summary}
      className={`text-[12px] whitespace-nowrap text-ink-4 underline-offset-2 transition-colors hover:text-ink hover:underline ${className}`}
    >
      In {brand.name}’s voice
    </Link>
  )
}
