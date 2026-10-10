'use client'

import Link from 'next/link'

import { useBrand } from '@/features/schedule/posts-store'

/** A quiet link beside an AI button: it writes in the brand's voice, set on the Brand page. */
export function VoiceNote({ className = '' }: { className?: string }) {
  const { brand } = useBrand()
  return (
    <Link
      href="/brand"
      className={`text-[12px] whitespace-nowrap text-ink-4 underline-offset-2 transition-colors hover:text-ink hover:underline ${className}`}
    >
      In {brand.name}’s voice
    </Link>
  )
}
