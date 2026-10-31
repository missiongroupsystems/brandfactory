'use client'

import * as React from 'react'

import { Segmented } from '@/components/controls'
import { ArrowUpRightIcon } from '@/components/icons'
import { PlatformLogo } from '@/components/platform-logos'
import type { Post } from '@/data/demo'
import { NotAvailable, reasonOf } from '@/features/connections/not-available'
import { asOf, bodyOf, k, openOn, readingOn, type ReadingOn } from '@/features/posted/model'
import { useBrand } from '@/features/schedule/posts-store'

import { CHANNELS, FORMAT_LABEL, type ChannelKey, type Shot } from './model'
import { TypeBadge } from './preview-media'
import { ShotView } from './shot'

/*
 * A posted post, imported or sent: the cover first, large and sticky, its slides under it; beside
 * it the title and the caption, then one card for the account on show (its counts as last read,
 * and the way to the post there), then what analytics will show, drawn with no figures. A post on
 * more than one account switches between them. Nothing on it can be changed.
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
const HEADING = 'font-display text-[15px] font-semibold tracking-[-0.01em]'
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
          <span className="absolute top-2 left-2 rounded-full bg-black/50 px-2 py-[2px] font-mono text-[10.5px] text-page tabular-nums">
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
        className="w-full text-[14.5px] leading-[1.55] break-words whitespace-pre-wrap text-ink"
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
          <dd className="min-w-0 text-[13.5px] break-words">{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The accounts it went out on, as their marks: the one on show filled. Named for a reader. */
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
          aria-label={NAME[c]}
          title={NAME[c]}
          onClick={() => setOn(c)}
          className={`bb-press flex size-9 items-center justify-center rounded-full ${c === on ? 'bg-ink text-page' : 'bg-surface text-ink-3 hover:text-ink'}`}
        >
          <PlatformLogo platform={c} size={15} />
        </button>
      ))}
    </div>
  )
}

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
 * its counts with when they were read. An account with no reading shows no counts.
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
  if (!many && read.counts.length === 0 && !read.permalink) return null
  return (
    <section aria-label={NAME[on]} className={`flex flex-col gap-6 ${CARD}`}>
      {(many || read.permalink) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {many && <Switch went={v.went} on={on} setOn={setOn} />}
          {read.permalink && <OpenPill href={read.permalink} on={on} />}
        </div>
      )}
      {read.counts.length > 0 && (
        <div key={on} className="bb-swap flex flex-wrap items-end gap-x-9 gap-y-4 max-md:gap-x-7">
          {read.counts.map((c) => (
            <span key={c.key} className="flex flex-col gap-1.5">
              <span className={`${NUM} text-[28px] leading-none max-md:text-[24px]`}>
                {k(c.value)}
              </span>
              <span className="text-[12.5px] text-ink-3">{c.label.toLowerCase()}</span>
            </span>
          ))}
          {read.measuredAt && (
            <span className="ml-auto pb-px text-[12px] text-ink-3 max-md:ml-0 max-md:w-full">
              as of {asOf(read.measuredAt)}
            </span>
          )}
        </div>
      )}
    </section>
  )
}

// ── Analytics: not connected, with a preview of what arrives ─────────────────────────────────

type Series = { key: string; label: string; shape: number[] }

/** The first two weeks after it went out, as shapes with no numbers: a preview, not a reading. */
const SERIES: Record<string, Series> = {
  reach: {
    key: 'reach',
    label: 'Reach',
    shape: [1, 0.82, 0.55, 0.4, 0.3, 0.26, 0.22, 0.3, 0.2, 0.16, 0.14, 0.12, 0.11, 0.1],
  },
  watch: {
    key: 'watch',
    label: 'Watch time',
    shape: [0.9, 0.95, 0.7, 0.5, 0.42, 0.38, 0.35, 0.4, 0.3, 0.26, 0.24, 0.2, 0.18, 0.17],
  },
  visits: {
    key: 'visits',
    label: 'Profile visits',
    shape: [0.7, 1, 0.5, 0.3, 0.2, 0.35, 0.15, 0.1, 0.25, 0.1, 0.08, 0.12, 0.06, 0.05],
  },
  followers: {
    key: 'followers',
    label: 'New followers',
    shape: [0.6, 1, 0.5, 0.3, 0.2, 0.35, 0.15, 0.1, 0.25, 0.1, 0.08, 0.12, 0.06, 0.05],
  },
  spend: {
    key: 'spend',
    label: 'Spend',
    shape: [0, 0, 0.7, 0.7, 0.7, 0.7, 0.7, 1, 1, 1, 0, 0, 0, 0],
  },
}

/** Fourteen days of bars with no figures: the shape of the chart that arrives, nothing read. */
function GhostBars({ shape }: { shape: number[] }) {
  const h = 128
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_28px] gap-x-2.5 gap-y-2">
      <div className="relative" style={{ height: h }}>
        {[1 / 3, 2 / 3].map((t) => (
          <span
            key={t}
            className="absolute inset-x-0 border-t border-dashed border-(--line)"
            style={{ bottom: `${t * 100}%` }}
          />
        ))}
        <span className="absolute inset-x-0 bottom-0 border-t border-(--line)" />
        <div className="absolute inset-0 flex items-end">
          {shape.map((p, i) => (
            <span key={i} className="flex h-full flex-1 items-end justify-center">
              <span
                className="bb-grow block w-[56%] max-w-[30px] rounded-t-[4px] rounded-b-[2px] bg-(--track)"
                style={{ height: `${Math.max(p * 92, 2)}%`, animationDelay: `${i * 22}ms` }}
              />
            </span>
          ))}
        </div>
      </div>
      <span className="relative">
        {[1 / 3, 2 / 3].map((t) => (
          <span
            key={t}
            className="absolute block h-2 w-5 translate-y-1/2 rounded-[3px] bg-tile"
            style={{ bottom: `${t * 100}%` }}
          />
        ))}
      </span>
      <span className="relative h-4 font-mono text-[10.5px] text-ink-4 tabular-nums">
        {[0, 6, 13].map((i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${((i + 0.5) / shape.length) * 100}%` }}
          >
            Day {i + 1}
          </span>
        ))}
      </span>
    </div>
  )
}

/** Rows with a bar each and no figures, as Insights draws "what worked". */
function GhostRows({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[13px] font-medium">{title}</span>
      <div className="flex flex-col gap-2.5">
        {rows.map(([label, w], i) => (
          <div key={label} className="flex flex-col gap-1">
            <span className="flex items-center justify-between gap-3 text-[13px]">
              <span className="text-ink-2">{label}</span>
              <span className="block h-2.5 w-7 rounded-[3px] bg-tile" />
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-(--track)/40">
              <span
                className="bb-fill block h-full rounded-full bg-(--track)"
                style={{ width: `${w * 100}%`, animationDelay: `${200 + i * 90}ms` }}
              />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * What analytics will show for this post on the account on show, once its analytics are
 * connected: the number card and two small rows from Insights, drawn with no figures. The pill
 * says why it is empty, on hover; the switch shows each number that will appear.
 */
function Analytics({ v, on }: { v: PostedView; on: ChannelKey | undefined }) {
  const { brand } = useBrand()
  const series = [
    SERIES.reach!,
    v.post.format === 'reel' ? SERIES.watch! : SERIES.visits!,
    SERIES.followers!,
    SERIES.spend!,
  ]
  const [at, setAt] = React.useState(series[0]!.key)
  const s = series.find((x) => x.key === at) ?? series[0]!
  const viewers: Array<[string, number]> = [
    ['Followers', 0.55],
    ['Not yet followers', 1],
    ['Followed after', 0.14],
  ]
  const second: { title: string; rows: Array<[string, number]> } =
    v.collabs.length > 0
      ? {
          title: 'Reach by account',
          rows: [[brand.name, 1], ...v.collabs.map((c): [string, number] => [c, 0.62])],
        }
      : {
          title: 'Found it through',
          rows: [
            [on === 'tt' ? 'For You' : 'Explore', 1],
            ['Following', 0.5],
            ['Profile', 0.22],
            ['Search', 0.12],
          ],
        }
  return (
    <section aria-label="Analytics" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className={HEADING}>Analytics</h2>
        <NotAvailable reason={reasonOf(on ? `${NAME[on]} analytics` : 'Analytics')} />
      </div>
      <div className={`flex flex-col ${CARD}`}>
        <div className="max-md:hidden">
          <Segmented
            label="Number"
            pill
            value={at}
            onChange={setAt}
            options={series.map((x) => ({ value: x.key, label: x.label }))}
          />
        </div>
        <div role="radiogroup" aria-label="Number" className="flex flex-wrap gap-1.5 md:hidden">
          {series.map((x) => (
            <button
              key={x.key}
              type="button"
              role="radio"
              aria-checked={at === x.key}
              onClick={() => setAt(x.key)}
              className={`h-8 rounded-full px-3 text-[12.5px] font-medium transition-colors ${at === x.key ? 'bg-ink text-page' : 'bg-surface text-ink-3'}`}
            >
              {x.label}
            </button>
          ))}
        </div>
        <div className="mt-7">
          <GhostBars key={s.key} shape={s.shape} />
        </div>
        <div className="mt-8 grid grid-cols-2 gap-8 max-sm:grid-cols-1">
          <GhostRows title="Who watched" rows={viewers} />
          <GhostRows title={second.title} rows={second.rows} />
        </div>
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
  // A post that came across with no picture has no cover column and no room kept for one.
  const bare = v.media.length === 0
  return (
    <div
      className={`grid items-start gap-14 max-lg:grid-cols-1 max-lg:gap-8 ${bare ? '' : 'grid-cols-[300px_minmax(0,1fr)]'}`}
    >
      {!bare && (
        <aside className="sticky top-[calc(var(--header)+24px)] max-lg:hidden">
          <Cover v={v} strip />
        </aside>
      )}
      <div className="flex max-w-[680px] min-w-0 flex-col gap-8 max-md:gap-7">
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
        {on && <OnAccount v={v} on={on} setOn={setOn} read={read} />}
        <Analytics key={on} v={v} on={on} />
      </div>
    </div>
  )
}
