'use client'

import * as React from 'react'

import { Segmented } from '@/components/controls'
import { PlatformLogo } from '@/components/platform-logos'
import type { Format, Post } from '@/data/demo'
import { NotAvailable, reasonOf } from '@/features/connections/not-available'
import { useBrand } from '@/features/schedule/posts-store'

import type { ChannelKey, Shot } from './model'
import { TypeBadge } from './preview-media'
import { ShotView } from './shot'

/*
 * Three designs for a posted post, switched locally with `?design=1|2|3` (design 0 is the page
 * as it is). Not for shipping as is: the one the owner picks replaces `PostedPost`.
 *
 *  1 Poster     the cover first, large and sticky; the numbers, the caption and the analytics
 *               beside it.
 *  2 Scorecard  the headline number first, in a centred column like Insights; the cover small.
 *  3 Record     the caption as the body of a document, the cover set into it; the facts in a
 *               rail on the right, like Linear.
 */

/** What a posted post carries, already read out of the post and its kept draft. */
export interface PostedView {
  post: Post
  media: Shot[]
  /** The accounts it went out on, in its own order. */
  went: ChannelKey[]
  /** The day it went out, in words. */
  on: string
  /** The time it went out, "12:40", or "". */
  at: string
  caption: string
  collabs: string[]
  tagged: string[]
  location: string
  labels: string[]
  /** Only the cover came across: a video cannot play. */
  video: boolean
  permalink?: string
}

/** The design the URL asks for, read once the page is in the browser. */
export function useDesignSwitch(): number {
  return React.useSyncExternalStore(
    () => () => {},
    () => Number(new URLSearchParams(window.location.search).get('design')) || 0,
    () => 0,
  )
}

// ── Shared pieces ────────────────────────────────────────────────────────────────────────────

const NAME: Record<string, string> = {
  ig: 'Instagram',
  tt: 'TikTok',
  yt: 'YouTube',
  li: 'LinkedIn',
  fb: 'Facebook',
}
const FORMAT: Record<Format, string> = { carousel: 'Post', reel: 'Reel', story: 'Story' }
const EYEBROW = 'font-mono text-[10.5px] tracking-[0.08em] text-ink-4 uppercase'
const CARD =
  'rounded-[18px] bg-page p-6 shadow-[0_0_0_1px_var(--line)] max-md:rounded-none max-md:p-0 max-md:shadow-none'
const HEADING = 'font-display text-[15px] font-semibold tracking-[-0.01em]'
const NUM = 'font-display font-semibold tracking-[-0.03em] tabular-nums'

/** 18420 → 18.4k; 480 → 480. */
function k(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n)
}

type CountKey = keyof NonNullable<Post['metrics']>
const COUNT_ORDER: Array<[CountKey, string]> = [
  ['views', 'Views'],
  ['likes', 'Likes'],
  ['comments', 'Comments'],
  ['shares', 'Shares'],
  ['saves', 'Saves'],
]

/** The real counts the post has, biggest story first: views, then likes, comments, shares, saves. */
function countsOf(post: Post): Array<{ key: CountKey; label: string; value: number }> {
  const m = post.metrics ?? {}
  return COUNT_ORDER.flatMap(([key, label]) =>
    typeof m[key] === 'number' ? [{ key, label, value: m[key] }] : [],
  )
}

/** "Mon 19 Oct, 12:40" with no dangling comma when the time is unknown. */
function whenOf(v: PostedView): string {
  return v.at ? `${v.on}, ${v.at}` : v.on
}

function Arrow() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M2.5 7.5l5-5M3.5 2.5h4v4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** "Open on TikTok ↗", only when the post has an address. */
function OpenLink({ v, className = '' }: { v: PostedView; className?: string }) {
  const first = v.went[0]
  if (!v.permalink || !first) return null
  return (
    <a
      href={v.permalink}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1 text-[13px] text-ink-3 transition-colors hover:text-ink ${className}`}
    >
      Open on {NAME[first]}
      <Arrow />
    </a>
  )
}

/** The account chips it went out on. */
function Chips({ v, size = 'md' }: { v: PostedView; size?: 'sm' | 'md' }) {
  const h = size === 'sm' ? 'h-7 pr-3 pl-2.5 text-[12.5px]' : 'h-8 pr-3.5 pl-3 text-[13px]'
  return (
    <span className="flex flex-wrap gap-1.5">
      {v.went.map((c) => (
        <span
          key={c}
          className={`flex items-center gap-1.5 rounded-full bg-surface font-medium text-ink-2 ${h}`}
        >
          <PlatformLogo platform={c} size={12} />
          {NAME[c]}
        </span>
      ))}
    </span>
  )
}

/**
 * The cover as the post shows it: a reel's tall frame, a post's 4:5 one. A video says it is the
 * cover only; a carousel shows how many slides there are and the rest as a strip.
 */
function Cover({
  v,
  width,
  strip = false,
  pill = true,
  className = '',
}: {
  v: PostedView
  /** The frame's width, as a class ("w-[300px]" or "w-full"). */
  width: string
  /** A carousel's other slides under the first. */
  strip?: boolean
  /** "Cover only" over the frame; off when the frame is too small and the page says it elsewhere. */
  pill?: boolean
  className?: string
}) {
  const first = v.media[0]
  if (!first) return null
  const ratio = v.post.format === 'reel' ? 'aspect-[9/16]' : 'aspect-[4/5]'
  const rest = strip ? v.media.slice(1) : []
  return (
    <div className={`flex flex-col gap-2.5 ${width} ${className}`}>
      <span className="relative block">
        <span className={`relative block ${ratio} overflow-hidden rounded-[16px] bg-tile`}>
          <ShotView shot={first} sizes="400px" />
          <TypeBadge format={v.post.format} slides={v.media.length} />
          {v.media.length > 1 && (
            <span className="absolute top-2 left-2 rounded-full bg-black/50 px-2 py-[2px] font-mono text-[10.5px] text-page tabular-nums">
              1/{v.media.length}
            </span>
          )}
        </span>
        {v.video && pill && (
          <span className="absolute bottom-2.5 left-2.5 flex">
            <NotAvailable
              label="Cover only"
              reason={`Video plays once ${NAME[v.went[0] ?? 'ig']} is connected.`}
              align="left"
            />
          </span>
        )}
      </span>
      {rest.length > 0 && (
        <span className="flex gap-1.5">
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
function Caption({
  text,
  lines,
  size = 'md',
  className = '',
}: {
  text: string
  lines: number
  size?: 'md' | 'lg'
  className?: string
}) {
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
  const parts = (open ? text : text.replace(/\n{2,}/g, '\n')).split(/(#[\p{L}\p{N}_]+)/u)
  const type = size === 'lg' ? 'text-[16px] leading-[1.6]' : 'text-[14.5px] leading-[1.55] text-ink'
  return (
    <div className={`flex flex-col items-start gap-2 ${className}`}>
      <p
        ref={ref}
        className={`w-full break-words whitespace-pre-wrap ${type}`}
        style={
          open
            ? undefined
            : {
                display: '-webkit-box',
                WebkitLineClamp: lines,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }
        }
      >
        {parts.map((p, i) =>
          p.startsWith('#') ? (
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
function factsOf(v: PostedView): Array<{ label: string; value: React.ReactNode }> {
  return [
    { label: 'Collaborators', value: v.collabs.join(', ') },
    { label: 'Tagged', value: v.tagged.join(', ') },
    { label: 'Location', value: v.location },
    { label: 'Labels', value: v.labels.join(', ') },
  ].filter((f) => f.value)
}

function FactRows({ v, className = '' }: { v: PostedView; className?: string }) {
  const facts = factsOf(v)
  if (facts.length === 0) return null
  return (
    <dl className={`flex flex-col ${className}`}>
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

// ── Analytics: not connected, with a preview of what arrives ─────────────────────────────────

type Series = { key: string; label: string; unit: string; about: string; shape: number[] }

/** The first two weeks after it went out, as shapes with no numbers: a preview, not a reading. */
const SERIES: Record<string, Series> = {
  reach: {
    key: 'reach',
    label: 'Reach',
    unit: 'people',
    about: 'How many people saw it, each day of its first two weeks.',
    shape: [1, 0.82, 0.55, 0.4, 0.3, 0.26, 0.22, 0.3, 0.2, 0.16, 0.14, 0.12, 0.11, 0.1],
  },
  watch: {
    key: 'watch',
    label: 'Watch time',
    unit: 'minutes',
    about: 'How long people watched, in all, and how far through they got.',
    shape: [0.9, 0.95, 0.7, 0.5, 0.42, 0.38, 0.35, 0.4, 0.3, 0.26, 0.24, 0.2, 0.18, 0.17],
  },
  visits: {
    key: 'visits',
    label: 'Profile visits',
    unit: 'visits',
    about: 'How many people went on to the profile from this post.',
    shape: [0.7, 1, 0.5, 0.3, 0.2, 0.35, 0.15, 0.1, 0.25, 0.1, 0.08, 0.12, 0.06, 0.05],
  },
  followers: {
    key: 'followers',
    label: 'New followers',
    unit: 'followers',
    about: 'Who followed after seeing it.',
    shape: [0.6, 1, 0.5, 0.3, 0.2, 0.35, 0.15, 0.1, 0.25, 0.1, 0.08, 0.12, 0.06, 0.05],
  },
  spend: {
    key: 'spend',
    label: 'Spend',
    unit: 'per view',
    about: 'What a boost cost by day, and what each view and follower cost.',
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
 * What analytics will show for this post, once the account's analytics are connected: the
 * number card and two small rows from Insights, drawn with no figures. The pill says why it is
 * empty; the switch lets a person see each number that will appear.
 */
function Analytics({ v, bare = false }: { v: PostedView; bare?: boolean }) {
  const { brand } = useBrand()
  const first = v.went[0] ?? 'ig'
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
            [first === 'tt' ? 'For You' : 'Explore', 1],
            ['Following', 0.5],
            ['Profile', 0.22],
            ['Search', 0.12],
          ],
        }
  return (
    <section aria-label="Analytics" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className={HEADING}>Analytics</h2>
        <NotAvailable reason={reasonOf(`${NAME[first]} analytics`)} />
      </div>
      <div
        className={`flex flex-col ${bare ? 'max-md:border-t max-md:border-(--cal-line) max-md:pt-6' : CARD}`}
      >
        <div className="flex items-start justify-between gap-4 max-md:flex-col-reverse max-md:gap-3">
          <div className="min-w-0 flex-1 max-md:w-full">
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
          </div>
          <span className={`${EYEBROW} shrink-0 pt-2`}>Preview</span>
        </div>
        <span className="mt-6 flex items-center gap-2.5">
          <span aria-hidden="true" className="block h-9 w-[88px] rounded-[9px] bg-tile" />
          <span className="text-[14px] text-ink-3">{s.unit}</span>
        </span>
        <p className="mt-2 text-[13.5px] text-ink-3">{s.about}</p>
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

// ── Option 1: Poster ─────────────────────────────────────────────────────────────────────────

/** The numbers in a row: the first one large, the rest beside it. */
function CountRow({ post }: { post: Post }) {
  const counts = countsOf(post)
  if (counts.length === 0) return null
  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-4 max-md:gap-x-6">
      {counts.map((c, i) => (
        <span
          key={c.key}
          className={`flex flex-col gap-1 ${i === 0 && counts.length > 3 ? 'max-md:w-full' : ''}`}
        >
          <span
            className={`${NUM} leading-none ${i === 0 ? 'text-[34px]' : 'text-[22px] max-md:text-[19px]'}`}
          >
            {k(c.value)}
          </span>
          <span className="text-[12.5px] text-ink-4">{c.label}</span>
        </span>
      ))}
    </div>
  )
}

export function PostedPoster({ v }: { v: PostedView }) {
  return (
    <div className="grid grid-cols-[300px_minmax(0,1fr)] items-start gap-12 max-lg:grid-cols-1 max-lg:gap-8">
      <aside className="sticky top-6 flex flex-col gap-3 max-lg:hidden">
        <Cover v={v} width="w-full" strip />
      </aside>
      <div className="flex min-w-0 flex-col gap-8 max-md:gap-7">
        {/* Under the desktop width the cover is small and sits with the title, like an album. */}
        <header className="grid grid-cols-1 gap-3 max-lg:grid-cols-[112px_minmax(0,1fr)] max-lg:items-end max-lg:gap-x-5">
          <Cover v={v} width="w-full" pill={false} className="lg:hidden" />
          <div className="flex min-w-0 flex-col gap-3">
            <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
              <Chips v={v} size="sm" />
              <span>
                {FORMAT[v.post.format]} · {whenOf(v)}
              </span>
            </span>
            <h1 className="font-display text-[36px] leading-[1.05] tracking-[-0.035em] max-md:text-[26px]">
              {v.post.hook}
            </h1>
            {v.video && (
              <span className="flex lg:hidden">
                <NotAvailable
                  label="Cover only"
                  reason={`Video plays once ${NAME[v.went[0] ?? 'ig']} is connected.`}
                  align="left"
                />
              </span>
            )}
          </div>
        </header>
        <CountRow post={v.post} />
        <Caption text={v.caption} lines={6} />
        {(factsOf(v).length > 0 || v.permalink) && (
          <div className="flex flex-col gap-4">
            <FactRows v={v} />
            <OpenLink v={v} className="self-start" />
          </div>
        )}
        <Analytics v={v} />
      </div>
    </div>
  )
}

// ── Option 2: Scorecard ──────────────────────────────────────────────────────────────────────

export function PostedScorecard({ v }: { v: PostedView }) {
  const counts = countsOf(v.post)
  const [lead, ...rest] = counts
  const tall = v.post.format === 'reel'
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-9 max-md:gap-7">
      <header className="flex flex-col gap-2.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
          <span className="flex items-center gap-1.5 font-medium text-ink-2">
            <PlatformLogo platform={v.went[0] ?? 'ig'} size={12} />
            {NAME[v.went[0] ?? 'ig']}
          </span>
          <span className="text-ink-5">·</span>
          <span>{FORMAT[v.post.format]}</span>
          <span className="text-ink-5">·</span>
          <span>{whenOf(v)}</span>
        </span>
        <h1 className="font-display text-[28px] leading-[1.1] tracking-[-0.03em] max-md:text-[24px]">
          {v.post.hook}
        </h1>
      </header>
      <section
        aria-label="How it did"
        className={`${CARD} grid grid-cols-[auto_minmax(0,1fr)] items-center gap-7 max-md:gap-5`}
      >
        <Cover v={v} width={tall ? 'w-[96px]' : 'w-[108px]'} pill={false} />
        <div className="flex min-w-0 flex-col gap-5">
          {lead ? (
            <span className="flex items-baseline gap-2.5">
              <span className={`${NUM} text-[44px] leading-none max-md:text-[36px]`}>
                {k(lead.value)}
              </span>
              <span className="text-[14px] text-ink-3">{lead.label.toLowerCase()}</span>
            </span>
          ) : (
            <span className="text-[14px] text-ink-4">No counts yet.</span>
          )}
          {rest.length > 0 && (
            <dl className="flex flex-wrap gap-x-6 gap-y-2">
              {rest.map((c) => (
                <div key={c.key} className="flex items-baseline gap-1.5">
                  <dd className={`${NUM} order-1 text-[16px] tracking-[-0.01em]`}>{k(c.value)}</dd>
                  <dt className="order-2 text-[12.5px] text-ink-4">{c.label.toLowerCase()}</dt>
                </div>
              ))}
            </dl>
          )}
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {v.video && (
              <NotAvailable
                label="Cover only"
                reason={`Video plays once ${NAME[v.went[0] ?? 'ig']} is connected.`}
                align="left"
              />
            )}
            <OpenLink v={v} />
          </span>
        </div>
      </section>
      <Caption text={v.caption} lines={5} />
      <FactRows v={v} />
      <Analytics v={v} />
    </div>
  )
}

// ── Option 3: Record ─────────────────────────────────────────────────────────────────────────

/** "22.1k views · 1.8k likes · 41 comments", one quiet line under the title. */
function CountLine({ post }: { post: Post }) {
  const counts = countsOf(post)
  if (counts.length === 0) return null
  return (
    <p className="flex flex-wrap gap-x-2 text-[15px] text-ink-3">
      {counts.map((c, i) => (
        <span key={c.key}>
          {i > 0 && <span className="mr-2 text-ink-5">·</span>}
          <span className="font-medium text-ink tabular-nums">{k(c.value)}</span>{' '}
          {c.label.toLowerCase()}
        </span>
      ))}
    </p>
  )
}

export function PostedRecord({ v }: { v: PostedView }) {
  const rail: Array<{ label: string; value: React.ReactNode }> = [
    { label: 'Posted', value: whenOf(v) },
    { label: 'On', value: <Chips v={v} size="sm" /> },
    { label: 'Format', value: FORMAT[v.post.format] },
    ...factsOf(v),
  ]
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_240px] items-start gap-x-16 gap-y-10 max-lg:grid-cols-1 max-lg:gap-y-8">
      <article className="flex min-w-0 flex-col gap-8 max-md:gap-6">
        <header className="flex flex-col gap-3">
          <h1 className="font-display text-[34px] leading-[1.05] tracking-[-0.035em] max-md:text-[28px]">
            {v.post.hook}
          </h1>
          <CountLine post={v.post} />
        </header>
        {/* The cover is set into the text, as a figure in a document; a phone stacks them. */}
        <div className="flow-root">
          <Cover
            v={v}
            width="w-[200px] max-md:w-[160px]"
            strip
            className="float-left mr-7 mb-3 max-md:float-none max-md:mb-5"
          />
          <Caption text={v.caption} lines={12} size="lg" />
        </div>
      </article>
      {/* The rail stays beside both the text and the analytics; a phone reads it before them. */}
      <div className="border-t border-(--cal-line) pt-8 max-lg:order-3 max-md:pt-6">
        <Analytics v={v} bare />
      </div>
      <aside className="sticky top-6 flex flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 max-lg:static max-lg:order-2 max-lg:border-t max-lg:border-(--cal-line) max-lg:pt-6">
        <dl className="flex flex-col gap-3.5">
          {rail.map((r) => (
            <div key={r.label} className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-3">
              <dt className="pt-[2px] text-[12.5px] text-ink-4">{r.label}</dt>
              <dd className="min-w-0 text-[13.5px] break-words">{r.value}</dd>
            </div>
          ))}
        </dl>
        <OpenLink v={v} className="self-start" />
      </aside>
    </div>
  )
}

/** The option the URL asks for, or none. */
export function PostedOption({ design, v }: { design: number; v: PostedView }) {
  if (design === 1) return <PostedPoster v={v} />
  if (design === 2) return <PostedScorecard v={v} />
  if (design === 3) return <PostedRecord v={v} />
  return null
}
