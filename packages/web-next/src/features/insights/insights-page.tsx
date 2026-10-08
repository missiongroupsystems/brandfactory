'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import { Fold, Segmented } from '@/components/controls'
import { SparkIcon } from '@/components/icons'
import { PlatformLogo } from '@/components/platform-logos'
import {
  INSIGHTS_BY_BRAND,
  type BrandInsights,
  type Creator,
  type Kpi,
  type PostStat,
  type Story,
  type StoryChart,
} from '@/data/insights'
import { addIdea, useIdeas } from '@/features/ideate/ideas-store'
import { useBrand } from '@/features/schedule/posts-store'

const EYEBROW = 'font-mono text-[10.5px] tracking-[0.08em] text-ink-4 uppercase'
const HAIR = 'border-(--cal-line)'
const CARD = 'rounded-[18px] bg-surface-2'
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAYPARTS = [
  { name: 'Morning', hours: '8–11am' },
  { name: 'Lunch', hours: '11am–2pm' },
  { name: 'Afternoon', hours: '2–5pm' },
  { name: 'Evening', hours: '5–8pm' },
  { name: 'Late', hours: '8–11pm' },
]

/** What each headline number counts, said after it: "49.1k accounts reached". */
const UNIT: Record<string, string> = {
  Reach: 'accounts reached',
  'Engagement rate': 'of people who saw a post reacted',
  'New followers': 'new followers',
  Saves: 'saves',
  Shares: 'shares',
  'Bookings from social': 'bookings from social',
}

/** The Monday of each of the twelve weeks behind a number: "This week" is the week of 5 Oct. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(2026, 9, 5 - (11 - i) * 7)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
})
const weekName = (i: number) => (i === WEEKS.length - 1 ? 'This week' : `Week of ${WEEKS[i]}`)

/** 18420 → 18.4k; 480 → 480. */
function k(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n)
}

/** A 0–1 value as one step of the green ramp, light to deep. */
function ramp(v: number): string {
  const step = v >= 0.85 ? 5 : v >= 0.65 ? 4 : v >= 0.45 ? 3 : v >= 0.25 ? 2 : 1
  return `var(--insight-${step})`
}

/** A round step for a chart's guide lines: 1, 2 or 5 times a power of ten. */
function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw))
  const f = raw / p
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p
}

/** "THURSDAY AND FRIDAY" → "Thursday and Friday"; "16 SEP" → "16 Sep". */
function plain(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .map((w) => (w === 'and' ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

type Tab = 'overview' | 'posts' | 'creators'

/**
 * The insights page, one calm column in three views, switched the way Ideate switches its two.
 * Overview: the month in a sentence, one number at a time over its twelve weeks, what worked
 * (each opens to its chart and its idea) and the best time to post. Posts and Creators: each
 * post and each creator, ranked. Every chart shows its numbers on hover.
 */
export function InsightsPage() {
  const { brand } = useBrand()
  const data = INSIGHTS_BY_BRAND[brand.id]
  const [tab, setTab] = React.useState<Tab>('overview')

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main
        key={brand.id}
        className="bb-swap mx-auto flex w-full max-w-[760px] flex-col px-4 pb-24"
      >
        <div className="flex flex-col gap-5 pt-6 pb-8 max-md:pt-2">
          <div className="flex flex-col gap-3">
            <span className={EYEBROW}>
              {brand.name} · {data.period} · Instagram + TikTok
            </span>
            <h1 className="font-display tracking-[-0.035em] text-[56px] leading-none max-md:text-[34px]">
              Insights
            </h1>
          </div>
          <div className="w-[330px] max-sm:w-full">
            <Segmented
              label="View"
              pill
              value={tab}
              onChange={setTab}
              options={[
                { value: 'overview', label: 'Overview' },
                { value: 'posts', label: 'Posts' },
                { value: 'creators', label: 'Creators' },
              ]}
            />
          </div>
        </div>

        <div key={tab} className="bb-swap">
          {tab === 'overview' && <Overview data={data} />}
          {tab === 'posts' && <Posts posts={data.posts} period={data.period} />}
          {tab === 'creators' && <Creators creators={data.creators} />}
        </div>
      </main>
    </div>
  )
}

// ── Hover ────────────────────────────────────────────────────────────────────────────────────

interface TipState {
  /** Position inside the chart's box: pixels, or a CSS length such as "40%". */
  x: number | string
  y: number
  title: string
  lines: string[]
  /** A mark at an edge of a fold, which clips: the tip lines up with that edge instead. */
  edge?: 'start' | 'end'
  /** A mark on a fold's top row: the tip sits under it, with y at the mark's bottom. */
  below?: boolean
}

/** The number behind a mark, shown above it on hover. Never covers the pointer. */
function Tip({ tip }: { tip: TipState | null }) {
  if (!tip) return null
  const x =
    tip.edge === 'start'
      ? '-translate-x-4'
      : tip.edge === 'end'
        ? '-translate-x-[calc(100%-16px)]'
        : '-translate-x-1/2'
  const y = tip.below ? 'translate-y-2.5' : '-translate-y-[calc(100%+10px)]'
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute z-10 flex ${x} ${y} flex-col gap-0.5 rounded-[10px] bg-ink px-3 py-2 whitespace-nowrap text-page shadow-pop`}
      style={{ left: tip.x, top: tip.y }}
    >
      <span className="text-[12px] font-medium">{tip.title}</span>
      {tip.lines.map((l) => (
        <span key={l} className="font-mono text-[10.5px] text-page/70 tabular-nums">
          {l}
        </span>
      ))}
    </span>
  )
}

/** Where a hovered element sits inside its chart's box: the top centre of the element. */
function anchor(e: React.SyntheticEvent<Element>, box: HTMLElement | null) {
  const r = e.currentTarget.getBoundingClientRect()
  const b = box?.getBoundingClientRect()
  return { x: r.left + r.width / 2 - (b?.left ?? 0), y: r.top - (b?.top ?? 0) }
}

// ── Overview ─────────────────────────────────────────────────────────────────────────────────

function Overview({ data }: { data: BrandInsights }) {
  const stories = data.stories.filter((s) => s.chart.kind !== 'days')
  const time = data.stories.find((s) => s.chart.kind === 'days')
  return (
    <div className="flex flex-col gap-11">
      <p className="text-[15px] leading-[1.6] text-ink-2">
        <span className="mr-1.5 inline-flex items-center gap-1.5 font-medium text-ink">
          <span className="text-(--insight-5)">
            <SparkIcon size={10} />
          </span>
          Summary
        </span>
        {data.line}
      </p>

      <NumberCard kpis={data.kpis} />

      <section aria-label="What worked" className="flex flex-col gap-3">
        <Heading title="What worked" note="Open one to see why" />
        <div className={`${CARD} overflow-hidden`}>
          {stories.map((s, i) => (
            <Finding key={s.id} story={s} first={i === 0} />
          ))}
        </div>
      </section>

      {time && time.chart.kind === 'days' && (
        <section aria-label="Best time to post" className="flex flex-col gap-3">
          <Heading title="Best time to post" />
          <BestTime story={time} days={time.chart} hours={data.hours} />
        </section>
      )}
    </div>
  )
}

function Heading({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="font-display text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
      {note && <span className="text-[12.5px] text-ink-4">{note}</span>}
    </div>
  )
}

/** One headline number at a time, picked above it, with its last twelve weeks as bars. */
function NumberCard({ kpis }: { kpis: Kpi[] }) {
  const [at, setAt] = React.useState('0')
  const kpi = kpis[Number(at)]!
  const up = kpi.delta >= 0
  return (
    <section aria-label="The month in numbers" className={`${CARD} flex flex-col p-6 max-md:p-5`}>
      <div className="max-md:hidden">
        <Segmented
          label="Number"
          value={at}
          onChange={setAt}
          options={kpis.map((q, i) => ({ value: String(i), label: q.label }))}
        />
      </div>
      {/* The labels do not fit one line on a phone: there they wrap as pills, all in sight. */}
      <div role="radiogroup" aria-label="Number" className="flex flex-wrap gap-1.5 md:hidden">
        {kpis.map((q, i) => (
          <button
            key={q.label}
            type="button"
            role="radio"
            aria-checked={at === String(i)}
            onClick={() => setAt(String(i))}
            className={`h-8 rounded-full px-3 text-[12.5px] font-medium transition-colors ${at === String(i) ? 'bg-ink text-page' : 'bg-surface text-ink-3'}`}
          >
            {q.label}
          </button>
        ))}
      </div>
      <span className="mt-6 flex items-baseline gap-2.5">
        <span className="font-display text-[40px] leading-none font-semibold tracking-[-0.03em] whitespace-nowrap tabular-nums">
          {kpi.value}
        </span>
        <span className="text-[14px] text-ink-3">{UNIT[kpi.label] ?? kpi.label.toLowerCase()}</span>
      </span>
      <p className="mt-2 text-[13.5px] text-ink-3">
        <span className={`font-medium ${up ? 'text-(--insight-6)' : 'text-(--fail-ink)'}`}>
          {up ? 'Up' : 'Down'} {Math.abs(kpi.delta)}%
        </span>{' '}
        on the 30 days before. Each bar is one week.
      </p>
      <div className="mt-7">
        <WeekBars key={kpi.label} kpi={kpi} />
      </div>
    </section>
  )
}

/** Twelve weekly bars from zero, this week in green, the guide values in a gutter on the right. */
function WeekBars({ kpi }: { kpi: Kpi }) {
  const [at, setAt] = React.useState<number | null>(null)
  const { points } = kpi
  const n = points.length
  const h = 160
  const step = niceStep(Math.max(...points) / 2.5)
  const max = Math.ceil((Math.max(...points) * 1.02) / step) * step
  const ticks = Array.from({ length: Math.round(max / step) }, (_, i) => (i + 1) * step)
  const fmt = (v: number) => (kpi.value.endsWith('%') ? `${v.toFixed(1)}%` : k(v))
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_40px] gap-x-2.5 gap-y-2">
      <div className="relative" style={{ height: h }} onMouseLeave={() => setAt(null)}>
        {ticks.map((v) => (
          <span
            key={v}
            className="absolute inset-x-0 border-t border-dashed border-(--line)"
            style={{ bottom: `${(v / max) * 100}%` }}
          />
        ))}
        <span className="absolute inset-x-0 bottom-0 border-t border-(--line)" />
        <div className="absolute inset-0 flex items-end">
          {points.map((p, i) => {
            const last = i === n - 1
            const colour =
              at === i || (last && at === null)
                ? 'bg-(--insight-5)'
                : last
                  ? 'bg-(--insight-3)'
                  : 'bg-(--track)'
            return (
              <span
                key={i}
                role="img"
                aria-label={`${weekName(i)}: ${fmt(p)}`}
                onMouseEnter={() => setAt(i)}
                onPointerDown={() => setAt(i)}
                className="flex h-full flex-1 items-end justify-center"
              >
                <span
                  className={`bb-grow block w-[56%] max-w-[30px] rounded-t-[4px] rounded-b-[2px] transition-colors duration-150 ${colour}`}
                  style={{ height: `${(p / max) * 100}%`, animationDelay: `${i * 25}ms` }}
                />
              </span>
            )
          })}
        </div>
        {at !== null && (
          <Tip
            tip={{
              x: `${((at + 0.5) / n) * 100}%`,
              y: h - (points[at]! / max) * h,
              edge: at <= 1 ? 'start' : at >= n - 2 ? 'end' : undefined,
              title: weekName(at),
              lines: [`${kpi.label}: ${fmt(points[at]!)}`],
            }}
          />
        )}
      </div>
      <span className="relative font-mono text-[10.5px] text-ink-4 tabular-nums">
        {ticks.map((v) => (
          <span
            key={v}
            className="absolute translate-y-1/2"
            style={{ bottom: `${(v / max) * 100}%` }}
          >
            {fmt(v)}
          </span>
        ))}
      </span>
      <span className="relative h-4 font-mono text-[10.5px] text-ink-4 tabular-nums">
        {[0, 4, 8, n - 1].map((i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${((i + 0.5) / n) * 100}%` }}
          >
            {i === n - 1 ? 'This week' : WEEKS[i]}
          </span>
        ))}
      </span>
    </div>
  )
}

/** The question a story's chart answers, in plain words, so nobody has to guess what it shows. */
function chartTitle(chart: StoryChart): string {
  if (chart.kind === 'compare') return chart.unit.charAt(0).toUpperCase() + chart.unit.slice(1)
  if (chart.kind === 'trend') return 'Follower growth since 12 weeks ago'
  return 'When your audience is online'
}

/** A finding as one row: its figure and its sentence. Open, it shows its chart and its idea. */
function Finding({ story, first }: { story: Story; first: boolean }) {
  const { brand } = useBrand()
  const { ideas } = useIdeas(brand.id)
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [idea, setIdea] = React.useState(false)

  /** The idea lands on the ideas page with its brief open, ready to plan. */
  function plan() {
    if (!story.idea) return
    const existing = ideas.find((i) => i.hook === story.idea!.hook)
    const id =
      existing?.id ??
      addIdea(brand.id, story.idea, { kind: 'insight', line: story.text.replace(/\.$/, '') })
    router.push(`/ideate#${id}`)
  }

  return (
    <div className={first ? '' : `border-t ${HAIR}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid w-full grid-cols-[56px_minmax(0,1fr)_16px] items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-(--cal-hover) max-md:px-5"
      >
        <span className="text-[14px] font-semibold text-(--insight-6) tabular-nums">
          {story.figure}
        </span>
        <span className="text-[14px]">{story.text}</span>
        <span
          className="justify-self-end text-ink-5 transition-transform duration-200"
          style={{ transform: open ? 'rotate(90deg)' : undefined }}
        >
          <ChevronRight />
        </span>
      </button>
      <Fold open={open}>
        <div className="flex flex-col gap-5 pr-6 pb-6 pl-[92px] max-md:pl-5">
          <div className="flex flex-col gap-3">
            <span className="text-[12.5px] text-ink-3">{chartTitle(story.chart)}</span>
            {story.chart.kind === 'compare' && <CompareBars chart={story.chart} />}
            {story.chart.kind === 'trend' && <Growth chart={story.chart} />}
          </div>
          {story.idea &&
            (idea ? (
              <div className="bb-rise flex flex-col gap-3">
                <div className="flex flex-col gap-1.5 rounded-[12px] bg-page p-4">
                  <span className="flex items-center gap-1.5 text-[12px] font-medium text-(--insight-6)">
                    <SparkIcon size={9} />
                    Idea · {plain(story.idea.format)} · {story.idea.pillar}
                  </span>
                  <span className="font-display text-[16px] leading-[1.25] font-medium tracking-[-0.015em]">
                    “{story.idea.hook}”
                  </span>
                  <span className="text-[13px] leading-[1.5] text-ink-2">{story.idea.angle}</span>
                </div>
                <span className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={plan}
                    className="bb-press flex h-9 items-center gap-2 rounded-full bg-ink px-4 text-[13px] font-medium text-page hover:opacity-85"
                  >
                    Plan it
                    <ArrowIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIdea(false)}
                    className="h-9 px-2 text-[13px] text-ink-3 transition-colors hover:text-ink"
                  >
                    Undo
                  </button>
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIdea(true)}
                className="bb-press flex h-9 w-fit items-center gap-2 rounded-full bg-page px-4 text-[13px] font-medium shadow-soft transition-colors hover:bg-surface"
              >
                <span className="text-(--insight-5)">
                  <SparkIcon size={10} />
                </span>
                Turn into idea
              </button>
            ))}
        </div>
      </Fold>
    </div>
  )
}

/** The best hours as one figure, the week as seven bars, and the full grid one click away. */
function BestTime({
  story,
  days,
  hours,
}: {
  story: Story
  days: Extract<StoryChart, { kind: 'days' }>
  hours: number[]
}) {
  const [open, setOpen] = React.useState(false)
  const [at, setAt] = React.useState<number | null>(null)
  const h = 88
  return (
    <div className={`${CARD} flex flex-col p-6 max-md:p-5`}>
      <span className="flex items-baseline gap-2.5">
        <span className="font-display text-[40px] leading-none font-semibold tracking-[-0.03em] whitespace-nowrap tabular-nums">
          {story.figure}
        </span>
        <span className="text-[14px] text-ink-3">{plain(story.label)}</span>
      </span>
      <p className="mt-2 text-[13.5px] text-ink-3">{story.text}</p>
      <div className="mt-6 flex flex-col gap-2">
        <div className="relative" style={{ height: h }} onMouseLeave={() => setAt(null)}>
          <span className="absolute inset-x-0 bottom-0 border-t border-(--line)" />
          <div className="absolute inset-0 flex items-end">
            {days.values.map((v, i) => (
              <span
                key={i}
                role="img"
                aria-label={`${DAYS_LONG[i]}: ${Math.round(v * 100)}% of the busiest day`}
                onMouseEnter={() => setAt(i)}
                onPointerDown={() => setAt(i)}
                className="flex h-full flex-1 items-end justify-center"
              >
                <span
                  className={`bb-grow block w-[40%] max-w-[30px] rounded-t-[4px] rounded-b-[2px] ${days.best.includes(i) ? 'bg-(--insight-5)' : 'bg-(--track)'}`}
                  style={{ height: `${v * 100}%`, animationDelay: `${i * 30}ms` }}
                />
              </span>
            ))}
          </div>
          {at !== null && (
            <Tip
              tip={{
                x: `${((at + 0.5) / 7) * 100}%`,
                y: h - days.values[at]! * h,
                edge: at === 0 ? 'start' : at === 6 ? 'end' : undefined,
                title: DAYS_LONG[at]!,
                lines: [
                  days.values[at] === 1
                    ? 'The busiest day'
                    : `${Math.round(days.values[at]! * 100)}% of the busiest day`,
                ],
              }}
            />
          )}
        </div>
        <span className="flex font-mono text-[10.5px] text-ink-4">
          {DAYS.map((d, i) => (
            <span
              key={d}
              className={`flex-1 text-center ${days.best.includes(i) ? 'text-ink' : ''}`}
            >
              {d}
            </span>
          ))}
        </span>
      </div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="mt-5 flex w-fit items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-ink"
      >
        By time of day
        <span
          className="transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        >
          <ChevronDown />
        </span>
      </button>
      <Fold open={open}>
        <div className="pt-5">
          <Heat days={days.values} hours={hours} />
        </div>
      </Fold>
    </div>
  )
}

/** Days across, parts of the day down, deeper green where more of the audience is online. */
function Heat({ days, hours }: { days: number[]; hours: number[] }) {
  const box = React.useRef<HTMLDivElement>(null)
  const [tip, setTip] = React.useState<TipState | null>(null)
  const cells = hours.map((h) => days.map((d) => d * h))
  const peak = Math.max(...cells.flat())
  return (
    <div ref={box} className="relative" onMouseLeave={() => setTip(null)}>
      <div className="grid grid-cols-[76px_repeat(7,minmax(0,1fr))] items-center gap-1">
        <span />
        {DAYS.map((d) => (
          <span key={d} className="pb-0.5 text-center font-mono text-[10.5px] text-ink-4">
            {d}
          </span>
        ))}
        {cells.map((row, r) => (
          <React.Fragment key={DAYPARTS[r]!.name}>
            <span className="text-[12px] text-ink-3">{DAYPARTS[r]!.name}</span>
            {row.map((v, d) => {
              const share = v / peak
              const show = (e: React.MouseEvent<HTMLSpanElement>) =>
                setTip({
                  ...anchor(e, box.current),
                  ...(r === 0 && {
                    y:
                      e.currentTarget.getBoundingClientRect().bottom -
                      box.current!.getBoundingClientRect().top,
                    below: true,
                  }),
                  edge: d >= 5 ? 'end' : undefined,
                  title: `${DAYS[d]} · ${DAYPARTS[r]!.name}, ${DAYPARTS[r]!.hours}`,
                  lines: [
                    share === 1
                      ? 'The busiest slot'
                      : `${Math.round(share * 100)}% of the busiest slot`,
                  ],
                })
              return (
                <span
                  key={d}
                  role="img"
                  aria-label={`${DAYS[d]} ${DAYPARTS[r]!.name.toLowerCase()}: ${Math.round(share * 100)}% of the busiest slot`}
                  onMouseEnter={show}
                  onPointerDown={show}
                  className={`bb-fade h-[26px] rounded-[5px] transition-shadow hover:shadow-[0_0_0_1.5px_var(--surface-2),0_0_0_3px_var(--ink)] ${share === 1 ? 'shadow-[0_0_0_1.5px_var(--surface-2),0_0_0_3px_var(--insight-6)]' : ''}`}
                  style={{
                    background: share < 0.12 ? 'var(--surface)' : ramp(share),
                    animationDelay: `${(r * 7 + d) * 6}ms`,
                  }}
                />
              )
            })}
          </React.Fragment>
        ))}
      </div>
      <Tip tip={tip} />
    </div>
  )
}

// ── Posts ────────────────────────────────────────────────────────────────────────────────────

type PostSort = 'reach' | 'engagement'

/** Every post this month, ranked by reach or by engagement, with the average as a divider. */
function Posts({ posts, period }: { posts: PostStat[]; period: string }) {
  const [sort, setSort] = React.useState<PostSort>('reach')
  const ranked = [...posts].sort((a, b) => b[sort] - a[sort])
  const avg = posts.reduce((n, p) => n + p[sort], 0) / posts.length
  const below = ranked.findIndex((p) => p[sort] < avg)
  return (
    <section aria-label="Posts" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-ink-3">
          {posts.length} posts · {plain(period)}
        </span>
        <div className="w-[260px]">
          <Segmented
            label="Rank by"
            pill
            value={sort}
            onChange={setSort}
            options={[
              { value: 'reach', label: 'Most reach' },
              { value: 'engagement', label: 'Most engaging' },
            ]}
          />
        </div>
      </div>
      <ol className={`${CARD} px-6 py-1 max-md:px-4`}>
        {ranked.map((p, i) => (
          <React.Fragment key={p.hook}>
            {i === below && (
              <li
                aria-hidden="true"
                className="flex items-center gap-3 py-2 text-[12px] text-(--insight-6) before:flex-1 before:border-t before:border-dashed before:border-(--insight-3) after:flex-1 after:border-t after:border-dashed after:border-(--insight-3)"
              >
                Average{' '}
                {sort === 'reach' ? `reach ${k(Math.round(avg))}` : `engagement ${avg.toFixed(1)}%`}
              </li>
            )}
            <li
              className={`bb-rise grid grid-cols-[18px_40px_minmax(0,1fr)_auto] items-center gap-3.5 py-3 ${i > 0 && i !== below ? `border-t ${HAIR}` : ''}`}
              style={{ animationDelay: `${i * 35}ms` }}
            >
              <span className="font-mono text-[11px] text-ink-5 tabular-nums">{i + 1}</span>
              <span className="relative block h-[50px] w-10 overflow-hidden rounded-[6px] bg-tile">
                <Image src={p.image} alt="" fill sizes="80px" className="object-cover" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[14px] font-medium max-md:line-clamp-2 max-md:whitespace-normal">
                  {p.hook}
                </span>
                <span className="text-[12px] text-ink-4">
                  {plain(p.format)} · {p.pillar} · {plain(p.date)}
                </span>
                {/* On a phone the second figures move under the name, so the name has room. */}
                <span className="text-[12px] text-ink-4 tabular-nums md:hidden">
                  {sort === 'reach'
                    ? `${p.engagement}% engaged · ${p.saves} saves`
                    : `${k(p.reach)} reach · ${p.saves} saves`}
                </span>
              </span>
              <span className="flex flex-col items-end gap-0.5 tabular-nums">
                <span className="text-[14px] font-medium">
                  {sort === 'reach' ? k(p.reach) : `${p.engagement}%`}
                </span>
                <span className="text-[12px] whitespace-nowrap text-ink-4 max-md:hidden">
                  {sort === 'reach'
                    ? `${p.engagement}% engaged · ${p.saves} saves`
                    : `${k(p.reach)} reach · ${p.saves} saves`}
                </span>
              </span>
            </li>
          </React.Fragment>
        ))}
      </ol>
    </section>
  )
}

// ── Creators ─────────────────────────────────────────────────────────────────────────────────

/** Who posted about the brand, ranked by views; a row opens to that creator's best post. */
function Creators({ creators }: { creators: Creator[] }) {
  const { brand } = useBrand()
  const [open, setOpen] = React.useState<string | null>(null)
  const ranked = [...creators].sort((a, b) => b.views - a.views)
  const views = creators.reduce((n, c) => n + c.views, 0)
  const posts = creators.reduce((n, c) => n + c.posts, 0)
  // Weighted by views, so one small post does not set the average.
  const engagement = creators.reduce((n, c) => n + c.engagement * c.views, 0) / views
  const engaged = [...creators].sort((a, b) => b.engagement - a.engagement)[0]!

  return (
    <section aria-label="Creators" className="flex flex-col gap-4">
      <p className="text-[15px] leading-[1.6] text-ink-2">
        {creators.length} creators posted {posts} times about {brand.name}, for{' '}
        <span className="font-medium text-ink">{k(views)} views</span> at {engagement.toFixed(1)}%
        engagement. <span className="font-medium text-ink">{ranked[0]!.name}</span> drew the most
        views; <span className="font-medium text-ink">{engaged.name}</span>’s audience engaged the
        most.
      </p>
      <ol className={`${CARD} px-6 py-1 max-md:px-4`}>
        {ranked.map((c, i) => {
          const on = open === c.handle
          return (
            <li
              key={c.handle}
              className={`bb-rise ${i > 0 ? `border-t ${HAIR}` : ''}`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <button
                type="button"
                aria-expanded={on}
                onClick={() => setOpen(on ? null : c.handle)}
                className="grid w-full grid-cols-[36px_minmax(0,1fr)_auto_12px] items-center gap-3.5 py-3 text-left"
              >
                <Avatar name={c.name} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[14px] font-medium">{c.name}</span>
                  <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-4">
                    <PlatformLogo platform={c.platform} size={10} />
                    <span className="truncate">
                      {c.handle} · {k(c.followers)} followers
                    </span>
                  </span>
                  <span className="text-[12px] text-ink-4 tabular-nums md:hidden">
                    {c.engagement}% engaged · {c.posts} {c.posts > 1 ? 'posts' : 'post'}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-0.5 tabular-nums">
                  <span className="text-[14px] font-medium">{k(c.views)} views</span>
                  <span className="text-[12px] whitespace-nowrap text-ink-4 max-md:hidden">
                    {c.engagement}% engaged · {c.posts} {c.posts > 1 ? 'posts' : 'post'}
                  </span>
                </span>
                <span
                  className="text-ink-5 transition-transform duration-200"
                  style={{ transform: on ? 'rotate(180deg)' : undefined }}
                >
                  <ChevronDown />
                </span>
              </button>
              <Fold open={on}>
                <div className="flex items-center gap-3.5 pb-4 pl-[50px]">
                  <span className="relative block h-[65px] w-[52px] shrink-0 overflow-hidden rounded-[8px] bg-tile">
                    <Image src={c.top.image} alt="" fill sizes="104px" className="object-cover" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-[12px] text-ink-4">Their best post</span>
                    <span className="font-display text-[15px] leading-[1.25] font-medium tracking-[-0.01em]">
                      “{c.top.hook}”
                    </span>
                    <span className="text-[12px] text-ink-4 tabular-nums">
                      {k(c.top.views)} views · {Math.round((c.top.views / c.views) * 100)}% of their
                      views for {brand.name}
                    </span>
                  </span>
                </div>
              </Fold>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-(--insight-1) text-[12px] font-semibold text-(--insight-6)">
      {initials}
    </span>
  )
}

function ChevronRight() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M3.5 2L6.5 5L3.5 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChevronDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M2 3.5L5 6.5L8 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2.5 6h7M6.5 3l3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── Finding charts ───────────────────────────────────────────────────────────────────────────

/** The winner in green, the rest in grey, every bar labelled with its own number. */
function CompareBars({ chart }: { chart: Extract<StoryChart, { kind: 'compare' }> }) {
  const max = Math.max(...chart.rows.map((r) => r.value))
  const best = chart.rows.findIndex((r) => r.value === max)
  return (
    <div className="flex flex-col gap-2.5">
      {chart.rows.map((r, i) => (
        <div key={r.label} className="flex flex-col gap-1">
          <span className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className={i === best ? 'font-medium text-ink' : 'text-ink-2'}>{r.label}</span>
            <span className="font-mono text-[12px] text-ink-2 tabular-nums">
              {k(r.value)}
              {chart.suffix ?? ''}
            </span>
          </span>
          <span className="h-2.5 overflow-hidden rounded-full bg-(--track)/50">
            <span
              className="bb-fill block h-full rounded-full"
              style={{
                width: `${(r.value / max) * 100}%`,
                background: i === best ? 'var(--insight-5)' : 'var(--ink-5)',
                opacity: i === best ? 1 : 0.45,
                animationDelay: `${200 + i * 90}ms`,
              }}
            />
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Followers for both apps on one axis, as growth since the first week. Raw counts would put a
 * 2k account flat under an 18k one whatever it did; growth compares the two fairly.
 */
function Growth({ chart }: { chart: Extract<StoryChart, { kind: 'trend' }> }) {
  const box = React.useRef<HTMLDivElement>(null)
  const [at, setAt] = React.useState<number | null>(null)
  const series = chart.series.map((s, i) => ({
    ...s,
    colour: i === 0 ? 'var(--insight-5)' : 'var(--ink-4)',
    growth: s.points.map((p) => ((p - s.points[0]!) / s.points[0]!) * 100),
  }))
  const n = series[0]!.points.length
  const top = Math.max(5, Math.ceil(Math.max(...series.flatMap((s) => s.growth)) / 5) * 5)
  const h = 132
  const x = (i: number) => (i / (n - 1)) * 100
  const y = (g: number) => 6 + (1 - g / top) * (h - 12)
  const pick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = box.current!.getBoundingClientRect()
    setAt(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))))
  }
  // The hovered week's points; near the top of the fold, which clips, the tip drops below them.
  const ys = at === null ? [] : series.map((s) => y(s.growth[at]!))
  const low = ys.length > 0 && Math.min(...ys) < 80
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[34px_minmax(0,1fr)] gap-2">
        <span className="relative font-mono text-[10px] text-ink-4 tabular-nums">
          {[top, top / 2, 0].map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: y(t) }}>
              +{t}%
            </span>
          ))}
        </span>
        <div
          ref={box}
          className="relative"
          style={{ height: h }}
          onMouseLeave={() => setAt(null)}
          onMouseMove={pick}
          onPointerDown={pick}
        >
          <svg
            viewBox={`0 0 100 ${h}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            className="absolute inset-0 block h-full w-full overflow-visible"
          >
            {[top, top / 2, 0].map((t) => (
              <line
                key={t}
                x1="0"
                x2="100"
                y1={y(t)}
                y2={y(t)}
                stroke="var(--cal-line)"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {[...series].reverse().map((s) => (
              <path
                key={s.label}
                d={s.growth.map((g, i) => `${i ? 'L' : 'M'}${x(i)} ${y(g)}`).join(' ')}
                fill="none"
                stroke={s.colour}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className="bb-trace"
              />
            ))}
          </svg>
          {at !== null && (
            <>
              <span
                className="pointer-events-none absolute inset-y-0 w-px bg-(--line-strong)"
                style={{ left: `${x(at)}%` }}
              />
              {series.map((s) => (
                <span
                  key={s.label}
                  className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_2px_var(--page)]"
                  style={{ left: `${x(at)}%`, top: y(s.growth[at]!), background: s.colour }}
                />
              ))}
              <Tip
                tip={{
                  x: `${x(at)}%`,
                  edge: at >= n - 3 ? 'end' : at <= 1 ? 'start' : undefined,
                  below: low,
                  y: low ? Math.max(...ys) + 8 : Math.min(...ys),
                  title: at === n - 1 ? 'This week' : `${n - 1 - at} weeks ago`,
                  lines: series.map(
                    (s) =>
                      `${s.label}: ${k(Math.round(s.points[at]! * 1000))} (+${s.growth[at]!.toFixed(1)}%)`,
                  ),
                }}
              />
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pl-[42px]">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <span className="h-0.5 w-3 rounded-full" style={{ background: s.colour }} />
            {s.label}
            <span className="font-mono text-[11px] text-ink-4 tabular-nums">
              {k(s.followers)} · {s.delta >= 0 ? '+' : ''}
              {s.delta}% this month
            </span>
          </span>
        ))}
      </div>
      {chart.note && (
        <span className="pl-[42px] text-[12.5px] text-(--insight-6)">{chart.note}</span>
      )}
    </div>
  )
}
