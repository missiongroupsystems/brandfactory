'use client'

import * as React from 'react'

import { CloseIcon, PlusIcon } from '@/components/icons'
import { Media } from '@/components/media'
import { PlatformLogo } from '@/components/platform-logos'
import type { Stage } from '@/data/demo'

import type { Story } from './stories'
import { StageGlyph } from './week-grid'

const STAGE_LABEL: Record<Stage, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  posted: 'Posted',
  failed: 'Not posted',
}

/**
 * A day's stories on the calendar: a small fanned deck of their first frames, in the 9:16 shape a
 * story has, and the count. Pressing it opens the day's stories in the side panel.
 */
export function StoryDeck({
  stories,
  onOpen,
  size = 'sm',
}: {
  stories: Story[]
  onOpen: () => void
  size?: 'sm' | 'md'
}) {
  if (stories.length === 0) return null
  const frames = stories.slice(0, 3)
  const w = size === 'md' ? 18 : 14
  const h = (w * 16) / 9
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${stories.length} ${stories.length > 1 ? 'stories' : 'story'}: open them`}
      className="group/deck -ml-1.5 flex items-center gap-2.5 rounded-full py-1 pr-3 pl-1.5 transition-colors hover:bg-surface"
    >
      <span
        className="relative block shrink-0"
        style={{ width: w + (frames.length - 1) * 5, height: h }}
      >
        {frames
          .map((s, i) => (
            <span
              key={s.id}
              className="absolute top-0 block overflow-hidden rounded-[3px] bg-tile shadow-[0_0_0_1.5px_var(--page)] transition-transform duration-200 group-hover/deck:-translate-y-px"
              style={{
                left: i * 5,
                width: w,
                height: h,
                zIndex: 3 - i,
                transform: `rotate(${(i - 1) * 4}deg)`,
              }}
            >
              {s.image && <Media src={s.image} sizes="32px" />}
            </span>
          ))
          .reverse()}
      </span>
      <span className="font-mono text-[10.5px] tracking-[0.04em] text-ink-3 group-hover/deck:text-ink">
        {stories.length} {stories.length > 1 ? 'stories' : 'story'}
      </span>
    </button>
  )
}

/**
 * The day's stories, one row each in time order: the frame, the time, what it shows and where it
 * is. A planned story opens in the composer; one already out is shown. Escape or the close button
 * shuts it; the calendar stays usable beside it.
 */
export function StoryPanel({
  label,
  stories,
  past,
  onClose,
  onAdd,
  onOpenPost,
}: {
  /** As printed: "Fri 9 Oct". */
  label: string
  stories: Story[]
  past: boolean
  onClose: () => void
  onAdd: () => void
  onOpenPost: (id: string) => void
}) {
  const panel = React.useRef<HTMLElement>(null)

  React.useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    panel.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [onClose])

  const posted = stories.filter((s) => s.stage === 'posted').length
  const planned = stories.length - posted

  return (
    <aside
      ref={panel}
      tabIndex={-1}
      aria-label={`Stories, ${label}`}
      className="bb-sheet fixed top-[164px] right-4 bottom-4 z-40 max-md:top-auto max-md:max-h-[80svh] flex w-[min(400px,calc(100%-32px))] flex-col overflow-hidden rounded-2xl bg-page shadow-sheet outline-none"
    >
      <header className="flex items-start justify-between gap-3 px-6 pt-5 pb-4">
        <span className="flex flex-col gap-1">
          <span className="flex items-baseline gap-2.5">
            <span className="font-display text-[24px] leading-none tracking-[-0.02em]">
              Stories
            </span>
            <span className="font-mono text-[10.5px] tracking-[0.08em] text-ink-4 uppercase">
              {label}
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
            <PlatformLogo platform="ig" size={11} />
            {stories.length} on Instagram
            {stories.length > 0 && (
              <>
                {' · '}
                {[posted && `${posted} posted`, planned && `${planned} planned`]
                  .filter(Boolean)
                  .join(', ')}
              </>
            )}
          </span>
        </span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface hover:text-ink"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4 pb-5">
        {!past && (
          <button
            type="button"
            onClick={onAdd}
            className="mx-2 mb-2 flex h-11 items-center justify-center gap-2 rounded-[12px] border border-dashed border-(--cal-ghost) text-[13px] font-medium text-ink-3 transition-colors hover:border-(--line-strong) hover:text-ink"
          >
            <PlusIcon size={11} />
            Add a story
          </button>
        )}
        {stories.length === 0 ? (
          <p className="px-2 py-6 text-center text-[13px] text-ink-4">
            No stories on this day yet.
          </p>
        ) : (
          <ol className="flex flex-col">
            {stories.map((s) => {
              const body = (
                <>
                  <span className="relative block h-[64px] w-[36px] shrink-0 overflow-hidden rounded-[6px] bg-tile">
                    {s.image && <Media src={s.image} sizes="36px" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-mono text-[10.5px] text-ink-4 tabular-nums">
                      {s.time}
                    </span>
                    <span className="truncate text-[14px]">{s.title}</span>
                  </span>
                  <span
                    className={`flex shrink-0 items-center gap-1.5 text-[12px] ${s.stage === 'failed' ? 'text-fail-ink' : 'text-ink-3'}`}
                  >
                    <span style={{ color: `var(--stage-${s.stage})` }}>
                      <StageGlyph stage={s.stage} />
                    </span>
                    {STAGE_LABEL[s.stage]}
                  </span>
                </>
              )
              return (
                <li key={s.id}>
                  {s.postId ? (
                    <button
                      type="button"
                      onClick={() => onOpenPost(s.postId!)}
                      className="flex w-full items-center gap-3.5 rounded-[12px] px-2 py-2 text-left transition-colors hover:bg-surface-2"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex items-center gap-3.5 px-2 py-2">{body}</div>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </aside>
  )
}
