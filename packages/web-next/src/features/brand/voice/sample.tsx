'use client'

import * as React from 'react'

import type { Voice } from '../kit-parts'
import { diffWords, type Piece, written } from './preview'

/**
 * One draft as two voices write it. The old one is quiet, its lost words struck; the new one is
 * in ink, its new words marked. `stagger` lets the marks land one after another.
 */
export function SampleDiff({
  draft,
  before,
  after,
  labels,
  stagger = false,
  hideBefore = false,
}: {
  draft: string
  before: Voice
  after: Voice
  /** A short name for each side, as "v4" and "v5". */
  labels?: [string, string]
  stagger?: boolean
  /** The old line folds away, once the new voice is the voice. */
  hideBefore?: boolean
}) {
  const diff = React.useMemo(
    () => diffWords(written(draft, before), written(draft, after)),
    [draft, before, after],
  )
  const same = diff.after.every((p) => !p.changed)
  const label = (text: string) => (
    <span className="w-7 shrink-0 pt-[3px] font-mono text-[10.5px] text-ink-5">{text}</span>
  )
  return (
    <div className="flex flex-col">
      <div
        className="bb-fold"
        style={{
          gridTemplateRows: hideBefore || same ? '0fr' : '1fr',
          opacity: hideBefore ? 0 : 1,
        }}
      >
        <div>
          <p className="flex gap-3 pb-2.5 text-[14px] leading-[1.55] text-ink-4">
            {labels && label(labels[0])}
            <span>
              <Pieces pieces={diff.before} kind="lost" />
            </span>
          </p>
        </div>
      </div>
      <p className="flex gap-3 text-[15.5px] leading-[1.55] text-ink">
        {labels && label(same ? '' : labels[1])}
        <span>
          <Pieces pieces={diff.after} kind="won" stagger={stagger} />
        </span>
      </p>
    </div>
  )
}

function Pieces({
  pieces,
  kind,
  stagger = false,
}: {
  pieces: Piece[]
  kind: 'lost' | 'won'
  stagger?: boolean
}) {
  let n = 0
  return pieces.map((p, i) => {
    if (!p.changed) return <React.Fragment key={i}>{p.text}</React.Fragment>
    const delay = stagger ? `${200 + n++ * 90}ms` : undefined
    return kind === 'lost' ? (
      <s key={i} className="decoration-ink-4">
        {p.text}
      </s>
    ) : (
      <mark
        key={`${i}-${p.text}`}
        className="bb-mark rounded-[4px] bg-transparent text-ink"
        style={delay ? { animationDelay: delay } : undefined}
      >
        {p.text}
      </mark>
    )
  })
}
