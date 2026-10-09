import type * as React from 'react'

import type { StageKey } from './calendar-items'
import { useBrand } from './posts-store'

/**
 * A stage's mark in the filters: a filled dot for a post's stage, and for an idea the dashed
 * square the calendar draws plans with, so Idea never reads as one more shade of Draft.
 */
export function StageMark({
  stage,
  colour,
  className,
  style,
}: {
  stage: StageKey
  colour: string
  className: string
  style?: React.CSSProperties
}) {
  const { brand } = useBrand()
  if (stage === 'idea') {
    return (
      <span
        aria-hidden="true"
        className={`${className} rounded-[3px] border border-dashed transition-opacity`}
        style={{ ...style, borderColor: `var(${brand.colour})` }}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={`${className} rounded-full transition-opacity`}
      style={{ ...style, background: colour }}
    />
  )
}
