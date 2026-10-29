'use client'

import * as React from 'react'

import { ArrowUpRightIcon } from '@/components/icons'
import { PlatformLogo } from '@/components/platform-logos'
import type { Post } from '@/data/demo'
import {
  asOf,
  averageOn,
  bodyOf,
  k,
  openOn,
  PLATFORMS,
  readingOn,
  versusAverage,
  type Platform,
  type ReadingOn,
} from '@/features/posted/model'
import { usePostedItems } from '@/features/posted/posted-store'
import { todayDate } from '@/lib/dates'

import { CHANNELS, FORMAT_LABEL, type ChannelKey, type Shot } from './model'
import { TypeBadge } from './preview-media'
import { ShotView } from './shot'

/*
 * A posted post, imported or sent: the cover first, large and sticky, its slides under it; beside
 * it the title and the caption, then one card for the account on show (its counts as last read,
 * set against the account's average, and the way to the post there). With no counts the cover
 * is smaller and the card says so quietly, centred. A post on more than one account switches
 * between them, by name. Nothing on it can be changed.
 */

/** What a posted post carries, already read out of the post and its kept draft. */
export interface PostedView {
  post: Post
  media: Shot[]
  /** The accounts it went out on, in its own order. */
  went: ChannelKey[]
  /** The account to open on: the Posted tab it came from. */
  asked?: ChannelKey
  /** The day it went out, in words. */
  on: string
  /** The time it went out, "12:40", or "". */
  at: string
  caption: string
  collabs: string[]
  tagged: string[]
  location: string
  labels: string[]
}

const NAME = Object.fromEntries(CHANNELS.map((c) => [c.key, c.name])) as Record<ChannelKey, string>
const CARD =
  'rounded-[18px] bg-page p-6 shadow-[0_0_0_1px_var(--line)] max-md:rounded-none max-md:p-0 max-md:shadow-none'
const NUM = 'font-display font-semibold tracking-[-0.03em] tabular-nums'

/**
 * The cover as the post shows it: a reel's tall frame, a post's 4:5 one; a carousel's other
 * slides as a strip under it.
 */
function Cover({
  v,
  strip = false,
  className = '',
}: {
  v: PostedView
  strip?: boolean
  className?: string
}) {
  const first = v.media[0]
  if (!first) return null
  const ratio = v.post.format === 'reel' ? 'aspect-[9/16]' : 'aspect-[4/5]'
  const rest = strip ? v.media.slice(1) : []
  return (
    <div className={`flex w-full flex-col gap-2.5 ${className}`}>
      <span className={`relative block ${ratio} overflow-hidden rounded-[16px] bg-tile`}>
        <ShotView shot={first} sizes="400px" />
        <TypeBadge format={v.post.format} slides={v.media.length} />
        {v.media.length > 1 && (
          <span className="absolute top-2 left-2 rounded-full bg-black/50 px-2 py-[2px] text-[12px] font-medium text-page tabular-nums">
            1/{v.media.length}
          </span>
        )}
      </span>
      {rest.length > 0 && (
        <span className="flex flex-wrap gap-1.5">
          {rest.map((shot, i) => (
            <span
              key={shot.src + i}
              className="relative block aspect-[4/5] w-[52px] overflow-hidden rounded-[8px] bg-tile"
            >
              <ShotView shot={shot} sizes="104px" />
            </span>
          ))}
        </span>
      )}
    </div>
  )
}

/**
 * The caption, as it went out: line breaks kept, hashtags quietened. A long one is folded after
 * `lines` lines, with "More" only when there is more; a short one is just the text.
 */
function Caption({ text, lines }: { text: string; lines: number }) {
  const [open, setOpen] = React.useState(false)
  const [folds, setFolds] = React.useState(false)
  const ref = React.useRef<HTMLParagraphElement>(null)
  // "More" shows only when the fold hides something, measured whenever the text's box changes.
  React.useEffect(() => {
    const el = ref.current
    if (!el || open) return
    const look = new ResizeObserver(() => setFolds(el.scrollHeight > el.clientHeight + 1))
    look.observe(el)
    return () => look.disconnect()
  }, [text, lines, open])
  if (text.trim() === '') return null
  // Folded, blank lines close up so the fold does not end on an empty line; open, they are back.
  // A hashtag starts the text or follows a space: a URL's "#menu" is not one.
  const parts = (open ? text : text.replace(/\n{2,}/g, '\n')).split(/((?<=^|\s)#[\p{L}\p{N}_]+)/u)
  return (
    <div className="flex flex-col items-start gap-2">
      <p
        ref={ref}
        className="w-full text-[14px] leading-[1.55] break-words whitespace-pre-wrap text-ink"
        // Cut by height, not line-clamp: "More" says there is more, with no "…" after a full stop.
        style={open ? undefined : { maxHeight: `${lines * 1.55}em`, overflow: 'hidden' }}
      >
        {parts.map((p, i) =>
          i % 2 === 1 ? (
            <span key={i} className="text-ink-4">
              {p}
            </span>
          ) : (
            p
          ),
        )}
      </p>
      {(folds || open) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-[13px] font-medium text-ink-3 transition-colors hover:text-ink"
        >
          {open ? 'Less' : 'More'}
        </button>
      )}
    </div>
  )
}

/** The small facts kept with the post: who, where, which labels. Empty ones are left out. */
function factsOf(v: PostedView): Array<{ label: string; value: string }> {
  return [
    { label: 'Collaborators', value: v.collabs.join(', ') },
    { label: 'Tagged', value: v.tagged.join(', ') },
    { label: 'Location', value: v.location },
    { label: 'Labels', value: v.labels.join(', ') },
  ].filter((f) => f.value)
}

function FactRows({ v }: { v: PostedView }) {
  const facts = factsOf(v)
  if (facts.length === 0) return null
  return (
    <dl className="flex flex-col">
      {facts.map((f) => (
        <div
          key={f.label}
          className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-t border-(--cal-line) py-2.5 first:border-t-0 first:pt-0 last:pb-0"
        >
          <dt className="text-[13px] text-ink-4">{f.label}</dt>
          <dd className="min-w-0 text-[13px] break-words">{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The accounts it went out on, by mark and name: the one on show filled. */
function Switch({
  went,
  on,
  setOn,
}: {
  went: ChannelKey[]
  on: ChannelKey
  setOn: (c: ChannelKey) => void
}) {
  return (
    <div role="radiogroup" aria-label="Account" className="flex gap-1.5">
      {went.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === on}
          onClick={() => setOn(c)}
          className={`bb-press flex h-9 items-center gap-2 rounded-full pr-3.5 pl-3 text-[13px] font-medium ${c === on ? 'bg-ink text-page' : 'bg-surface text-ink-3 hover:text-ink'}`}
        >
          <PlatformLogo platform={c} size={14} />
          {NAME[c]}
        </button>
      ))}
    </div>
  )
}

/**
 * A post with no counts: one line that says why. The ghost of a chart with no figures read as
 * broken, and "No numbers yet" alone left the person to guess when they come.
 */
const NO_NUMBERS = (
  <p className="text-[13px] text-ink-3">Numbers arrive about a day after posting.</p>
)

/** "Open on Instagram ↗": a pill, so the way to the post is easy to find. */
function OpenPill({ href, on }: { href: string; on: ChannelKey }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="bb-press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface px-4 text-[13px] font-medium text-ink hover:bg-paper"
    >
      Open on {NAME[on]}
      <ArrowUpRightIcon size={10} />
    </a>
  )
}

/**
 * The account on show: the switch when the post went to more than one, the way to it there, and
 * its counts with when they were read and how the first compares with the account's average. An
 * account with no reading shows no counts: its name, one quiet line and the link, centred.
 */
function OnAccount({
  v,
  on,
  setOn,
  read,
}: {
  v: PostedView
  on: ChannelKey
  setOn: (c: ChannelKey) => void
  read: ReadingOn
}) {
  const many = v.went.length > 1
  const today = todayDate()
  const items = usePostedItems(today)
  const first = read.counts[0]
  const average =
    first && items && (PLATFORMS as ChannelKey[]).includes(on)
      ? averageOn(items, on as Platform, first.key, v.post.id, today)
      : undefined
  if (read.counts.length === 0)
    return (
      <section
        aria-label={NAME[on]}
        className={`flex flex-col items-center gap-4 py-10 text-center ${CARD} max-md:py-8`}
      >
        {many ? (
          <Switch went={v.went} on={on} setOn={setOn} />
        ) : (
          <span className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
            <PlatformLogo platform={on} size={14} />
            {NAME[on]}
          </span>
        )}
        {NO_NUMBERS}
        {read.permalink && <OpenPill href={read.permalink} on={on} />}
      </section>
    )
  return (
    <section aria-label={NAME[on]} className={`flex flex-col gap-6 ${CARD}`}>
      {(many || read.permalink) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {many && <Switch went={v.went} on={on} setOn={setOn} />}
          {read.permalink && <OpenPill href={read.permalink} on={on} />}
        </div>
      )}
      <div key={on} className="bb-swap flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-x-9 gap-y-4 max-md:gap-x-7">
          {read.counts.map((c) => (
            <span key={c.key} className="flex flex-col gap-1.5">
              <span className={`${NUM} text-[28px] leading-none max-md:text-[24px]`}>
                {k(c.value)}
              </span>
              <span className="text-[13px] text-ink-3">{c.label.toLowerCase()}</span>
            </span>
          ))}
        </div>
        {(average || read.measuredAt) && (
          <p className="flex flex-wrap gap-x-2 text-[13px] text-ink-3">
            {first && average && (
              <span className="text-ink-2">{versusAverage(first.value, average, first.label)}</span>
            )}
            {first && average && read.measuredAt && <span aria-hidden="true">·</span>}
            {read.measuredAt && <span>as of {asOf(read.measuredAt)}</span>}
          </p>
        )}
      </div>
    </section>
  )
}

// ── The page ─────────────────────────────────────────────────────────────────────────────────

export function PostedPost({ v }: { v: PostedView }) {
  const [picked, setOn] = React.useState<ChannelKey | undefined>()
  const on = picked ?? openOn(v.post, v.went, v.asked)
  const read: ReadingOn = on ? readingOn(v.post, on, v.went) : { counts: [] }
  const when = v.at ? `${v.on}, ${v.at}` : v.on
  const body = bodyOf(v.caption, v.post.hook)
  // A post that came across with no picture has no cover column and no room kept for one; one
  // with no numbers yet on any account keeps a smaller cover, so the page is not one big picture
  // and a line. Read over every account, so switching between them never moves the cover.
  const bare = v.media.length === 0
  const quiet = v.went.every((c) => readingOn(v.post, c, v.went).counts.length === 0)
  return (
    <div
      className={`grid items-start gap-14 max-lg:grid-cols-1 max-lg:gap-6 ${bare ? '' : quiet ? 'grid-cols-[140px_minmax(0,1fr)]' : 'grid-cols-[300px_minmax(0,1fr)]'}`}
    >
      {!bare && (
        <aside className="sticky top-6 max-lg:hidden">
          <Cover v={v} strip />
        </aside>
      )}
      <div className="flex max-w-[680px] min-w-0 flex-col gap-8 max-md:gap-6">
        {/* Under the desktop width the cover is small and sits with the title, like an album. */}
        <header
          className={`grid grid-cols-1 gap-3 ${bare ? '' : 'max-lg:grid-cols-[96px_minmax(0,1fr)] max-lg:items-end max-lg:gap-x-5'}`}
        >
          <Cover v={v} className="lg:hidden" />
          <div className="flex min-w-0 flex-col gap-2.5">
            <span className="flex items-center gap-2 text-[13px] text-ink-3">
              {/* One account needs no switch: its mark says where it went. */}
              {v.went.length === 1 && (
                <span role="img" aria-label={NAME[v.went[0]!]} className="flex">
                  <PlatformLogo platform={v.went[0]!} size={13} />
                </span>
              )}
              {/* A post is the usual case: only a reel or a story is named. */}
              {v.post.format === 'carousel' ? when : `${FORMAT_LABEL[v.post.format]} · ${when}`}
            </span>
            <h1 className="font-display text-[28px] leading-[1.12] tracking-[-0.03em] max-md:text-[22px]">
              {v.post.hook}
            </h1>
          </div>
        </header>
        {(body || factsOf(v).length > 0) && (
          <div className="-mt-2 flex flex-col gap-5">
            <Caption text={body} lines={3} />
            <FactRows v={v} />
          </div>
        )}
        {on ? <OnAccount v={v} on={on} setOn={setOn} read={read} /> : NO_NUMBERS}
      </div>
    </div>
  )
}
