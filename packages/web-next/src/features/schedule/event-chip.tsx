import Link from 'next/link'
import type * as React from 'react'

import type { CalendarEvent } from '@/data/demo'

/**
 * A calendar event in its layer's colours. A shoot's event is a link to its call sheet; every
 * other event is a label.
 */
export function EventChip({
  event,
  className,
  style,
  children,
}: {
  event: CalendarEvent
  className: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  const colours = {
    background: `var(--layer-${event.layer})`,
    color: `var(--layer-${event.layer}-ink)`,
    ...style,
  }
  if (!event.shootId) {
    return (
      <span title={event.text} className={className} style={colours}>
        {children}
      </span>
    )
  }
  return (
    <Link
      href={`/shoot/${event.shootId}`}
      title={event.text}
      aria-label={event.text}
      className={`${className} transition-[filter] hover:brightness-95`}
      style={colours}
    >
      {children}
    </Link>
  )
}
