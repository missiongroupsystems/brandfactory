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
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAYPARTS = [
  { name: 'Morning', hours: '8–11am' },
  { name: 'Lunch', hours: '11am–2pm' },
  { name: 'Afternoon', hours: '2–5pm' },
  { name: 'Evening', hours: '5–8pm' },
  { name: 'Late', hours: '8–11pm' },
]

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

type Tab = 'overview' | 'posts' | 'creators'

/**
 * The insights page. The month's four numbers sit on top, always. Under them, three tabs:
 * Overview (what worked, and when the audience is online), Posts (each post's numbers) and
 * Creators (what each creator who posted about the brand earned). Every chart has a title that
 * says what it measures, and every mark shows its number on hover.
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
        className="bb-swap mx-auto flex w-full max-w-[1440px] flex-col px-10 pb-24 max-md:px-4"
      >
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 pt-6 pb-8 max-md:pt-2">
          <div className="flex flex-col gap-3">
            <span className={EYEBROW}>
              {brand.name} · {data.period} · Instagram + TikTok
            </span>
            <h1 className="font-serif text-[56px] leading-none tracking-[-0.015em] max-md:text-[44px]">
              Insights
            </h1>
          </div>
          <div className="w-[330px] max-sm:w-full">
            <Segmented
              label="Section"
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

        <KpiStrip kpis={data.kpis} />

        <div key={tab} className="bb-swap pt-12">
          {tab === 'overview' && <Overview data={data} />}
          {tab === 'posts' && <Posts posts={data.posts} />}
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
}

/** The number behind a mark, shown above it on hover. Never covers the pointer. */
function Tip({ tip }: { tip: TipState | null }) {
  if (!tip) return null
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-[calc(100%+10px)] flex-col gap-0.5 rounded-[10px] bg-ink px-3 py-2 whitespace-nowrap text-page shadow-pop"
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

// ── The four numbers ─────────────────────────────────────────────────────────────────────────

function KpiStrip({ kpis }: { kpis: Kpi[] }) {
  return (
    <section
      aria-label="This month in numbers"
      className={`grid grid-cols-4 border-y ${HAIR} max-lg:grid-cols-2`}
    >
      {kpis.map((kpi, i) => (
        <div
          key={kpi.label}
          className={`bb-rise flex flex-col gap-3 py-6 pr-6 ${i > 0 ? `border-l ${HAIR} pl-6` : ''} max-lg:[&:nth-child(3)]:border-l-0 max-lg:[&:nth-child(3)]:pl-0 max-lg:[&:nth-child(n+3)]:border-t max-lg:[&:nth-child(n+3)]:border-(--cal-line) max-sm:pr-3 max-sm:pl-3 max-sm:first:pl-0 max-sm:[&:nth-child(3)]:pl-0`}
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <span className="text-[13px] text-ink-3">{kpi.label}</span>
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[34px] leading-none font-semibold tracking-[-0.02em] tabular-nums max-sm:text-[26px]">
              {kpi.value}
            </span>
            <Delta value={kpi.delta} />
          </span>
          <Spark kpi={kpi} />
        </div>
      ))}
    </section>
  )
}

function Delta({ value }: { value: number }) {
  const up = value >= 0
  return (
    <span
      title="Against the 30 days before"
      className={`text-[12.5px] font-medium tabular-nums ${up ? 'text-(--insight-6)' : 'text-(--fail-ink)'}`}
    >
      {up ? '↑' : '↓'} {Math.abs(value)}%
      <span className="ml-1.5 font-normal text-ink-4">vs last month</span>
    </span>
  )
}

/** Twelve weeks behind a headline number. Hover shows each week's value. */
function Spark({ kpi }: { kpi: Kpi }) {
  const box = React.useRef<HTMLDivElement>(null)
  const [at, setAt] = React.useState<number | null>(null)
  const { points } = kpi
  const h = 40
  const min = Math.min(...points)
  const max = Math.max(...points)
  const y = (p: number) => 3 + (1 - (p - min) / Math.max(max - min, 0.001)) * (h - 6)
  const x = (i: number) => (i / (points.length - 1)) * 100
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(p)}`).join(' ')
  const fmt = (p: number) => (kpi.value.endsWith('%') ? `${p.toFixed(1)}%` : k(p))
  return (
    <div
      ref={box}
      className="relative h-10"
      onMouseLeave={() => setAt(null)}
      onMouseMove={(e) => {
        const r = box.current!.getBoundingClientRect()
        setAt(Math.round(((e.clientX - r.left) / r.width) * (points.length - 1)))
      }}
    >
      <svg
        viewBox={`0 0 100 ${h}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        className="block h-full w-full overflow-visible"
      >
        <path
          d={line}
          fill="none"
          stroke="var(--insight-5)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="bb-trace"
        />
      </svg>
      {at !== null && (
        <>
          <span
            className="pointer-events-none absolute inset-y-0 w-px bg-(--line-strong)"
            style={{ left: `${x(at)}%` }}
          />
          <span
            className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--insight-5) shadow-[0_0_0_2px_var(--page)]"
            style={{ left: `${x(at)}%`, top: y(points[at]!) }}
          />
          <Tip
            tip={{
              x: `${x(at)}%`,
              y: y(points[at]!),
              title: at === points.length - 1 ? 'This week' : `${points.length - 1 - at} weeks ago`,
              lines: [`${kpi.label}: ${fmt(points[at]!)}`],
            }}
          />
        </>
      )}
    </div>
  )
}

// ── Overview ─────────────────────────────────────────────────────────────────────────────────

function Overview({ data }: { data: BrandInsights }) {
  const stories = data.stories.filter((s) => s.chart.kind !== 'days')
  const time = data.stories.find((s) => s.chart.kind === 'days')
  return (
    <div className="flex flex-col gap-14">
      <section aria-label="What worked" className="flex flex-col gap-5">
        <SectionTitle title="What worked" note="Three things to do more of" />
        <div className="grid grid-cols-3 gap-5 max-xl:grid-cols-2 max-lg:grid-cols-1">
          {stories.map((s, i) => (
            <StoryCard key={s.id} story={s} index={i} />
          ))}
        </div>
      </section>
      {time && time.chart.kind === 'days' && (
        <section aria-label="When to post" className="flex flex-col gap-5">
          <SectionTitle title="When to post" note="When your audience is on the apps" />
          <BestTime story={time} days={time.chart.values} hours={data.hours} />
        </section>
      )}
    </div>
  )
}

function SectionTitle({ title, note }: { title: string; note: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 border-b ${HAIR} pb-3`}>
      <h2 className="font-serif text-[28px] leading-none">{title}</h2>
      <span className={`${EYEBROW} max-sm:hidden`}>{note}</span>
    </div>
  )
}

/** The question a story's chart answers, in plain words, so nobody has to guess what it shows. */
function chartTitle(chart: StoryChart): string {
  if (chart.kind === 'compare') return chart.unit.charAt(0).toUpperCase() + chart.unit.slice(1)
  if (chart.kind === 'trend') return 'Follower growth since 12 weeks ago'
  return 'When your audience is online'
}

function StoryCard({ story, index }: { story: Story; index: number }) {
  const { brand } = useBrand()
  const { ideas } = useIdeas(brand.id)
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const idea = story.idea

  /** The idea lands on the shoot brief, open, ready to plan. */
  function openInIdeas() {
    if (!idea) return
    const existing = ideas.find((i) => i.hook === idea.hook)
    const id =
      existing?.id ??
      addIdea(brand.id, idea, { kind: 'insight', line: story.text.replace(/\.$/, '') })
    router.push(`/ideate/brief#${id}`)
  }

  return (
    <article
      aria-label={story.text}
      className="bb-rise flex min-w-0 flex-col gap-6 rounded-[18px] bg-surface-2 p-6 max-md:p-5"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex flex-col gap-2">
        <span className="text-[34px] leading-none font-semibold tracking-[-0.02em] text-(--insight-6) tabular-nums">
          {story.figure}
        </span>
        <p className="font-serif text-[22px] leading-[1.15]">{story.text}</p>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-[12.5px] font-medium text-ink-3">{chartTitle(story.chart)}</span>
        {story.chart.kind === 'compare' && <CompareBars chart={story.chart} />}
        {story.chart.kind === 'trend' && <Growth chart={story.chart} />}
      </div>

      {idea && (
        <div className="mt-auto flex flex-col">
          <Fold open={open}>
            <div className="mb-3 flex flex-col gap-2 rounded-[12px] bg-page p-4">
              <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.08em] text-(--insight-6) uppercase">
                <SparkIcon size={9} />
                Idea · {idea.format} · {idea.pillar}
              </span>
              <span className="font-serif text-[19px] leading-[1.15] italic">“{idea.hook}”</span>
              <span className="text-[13px] leading-[1.45] text-ink-2">{idea.angle}</span>
            </div>
          </Fold>
          <span className="flex items-center gap-3">
            {open ? (
              <>
                <button
                  type="button"
                  onClick={openInIdeas}
                  className="bb-press flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[13.5px] font-medium text-page hover:opacity-85"
                >
                  Plan it
                  <ArrowIcon />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-[13px] text-ink-3 transition-colors hover:text-ink"
                >
                  Undo
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="bb-press flex h-10 items-center gap-2 rounded-full bg-page px-4 text-[13.5px] font-medium text-ink shadow-soft transition-colors hover:bg-surface"
              >
                <span className="text-(--insight-5)">
                  <SparkIcon size={10} />
                </span>
                Turn into idea
              </button>
            )}
          </span>
        </div>
      )}
    </article>
  )
}

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
          onMouseMove={(e) => {
            const r = box.current!.getBoundingClientRect()
            setAt(
              Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))),
            )
          }}
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
                  y: Math.min(...series.map((s) => y(s.growth[at]!))),
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

/** Days across, parts of the day down, deeper green where more of the audience is online. */
function BestTime({ story, days, hours }: { story: Story; days: number[]; hours: number[] }) {
  const box = React.useRef<HTMLDivElement>(null)
  const [tip, setTip] = React.useState<TipState | null>(null)
  const cells = hours.map((h) => days.map((d) => d * h))
  const peak = Math.max(...cells.flat())
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-center gap-12 rounded-[18px] bg-surface-2 p-8 max-lg:grid-cols-1 max-lg:gap-8 max-md:p-5">
      <div className="flex flex-col gap-2">
        <span className="text-[44px] leading-none font-semibold tracking-[-0.02em] text-(--insight-6) tabular-nums">
          {story.figure}
        </span>
        <span className={EYEBROW}>{story.label}</span>
        <p className="mt-2 max-w-[28ch] font-serif text-[24px] leading-[1.15]">{story.text}</p>
      </div>
      <div ref={box} className="relative flex flex-col gap-3" onMouseLeave={() => setTip(null)}>
        <div className="grid grid-cols-[88px_repeat(7,minmax(0,1fr))] gap-1.5 max-sm:grid-cols-[64px_repeat(7,minmax(0,1fr))] max-sm:gap-1">
          <span />
          {DAYS.map((d) => (
            <span
              key={d}
              className="text-center font-mono text-[10px] tracking-[0.06em] text-ink-4 uppercase"
            >
              {d}
            </span>
          ))}
          {cells.map((row, r) => (
            <React.Fragment key={DAYPARTS[r]!.name}>
              <span className="flex flex-col justify-center leading-tight">
                <span className="text-[12.5px] text-ink-2">{DAYPARTS[r]!.name}</span>
                <span className="font-mono text-[9.5px] text-ink-5 max-sm:hidden">
                  {DAYPARTS[r]!.hours}
                </span>
              </span>
              {row.map((v, d) => {
                const share = v / peak
                const best = share === 1
                return (
                  <span
                    key={d}
                    role="img"
                    aria-label={`${DAYS[d]} ${DAYPARTS[r]!.name.toLowerCase()}: ${Math.round(share * 100)}% of the busiest hour`}
                    onMouseEnter={(e) =>
                      setTip({
                        ...anchor(e, box.current),
                        title: `${DAYS[d]} · ${DAYPARTS[r]!.name}, ${DAYPARTS[r]!.hours}`,
                        lines: [
                          best
                            ? 'The busiest slot'
                            : `${Math.round(share * 100)}% of the busiest slot`,
                        ],
                      })
                    }
                    className={`bb-pop h-10 rounded-[8px] max-sm:h-8 ${best ? 'shadow-[0_0_0_2px_var(--surface-2),0_0_0_3.5px_var(--insight-6)]' : ''}`}
                    style={{
                      background: share < 0.12 ? 'var(--surface)' : ramp(share),
                      animationDelay: `${(r * 7 + d) * 8}ms`,
                    }}
                  />
                )
              })}
            </React.Fragment>
          ))}
        </div>
        <span className="flex items-center justify-end gap-2 font-mono text-[10px] text-ink-4">
          Fewer
          {[1, 2, 3, 4, 5].map((s) => (
            <span
              key={s}
              className="h-2.5 w-5 rounded-[3px]"
              style={{ background: `var(--insight-${s})` }}
            />
          ))}
          More people online
        </span>
        <Tip tip={tip} />
      </div>
    </div>
  )
}

// ── Posts ────────────────────────────────────────────────────────────────────────────────────

type PostSort = 'reach' | 'engagement'

/** Every post this month as a row, ranked by reach or by engagement. */
function Posts({ posts }: { posts: PostStat[] }) {
  const [sort, setSort] = React.useState<PostSort>('reach')
  const ranked = [...posts].sort((a, b) => b[sort] - a[sort])
  const maxReach = Math.max(...posts.map((p) => p.reach))
  const avg = Math.round(posts.reduce((n, p) => n + p.reach, 0) / posts.length)
  const maxEng = Math.max(...posts.map((p) => p.engagement))
  return (
    <section aria-label="Posts" className="flex flex-col gap-5">
      <div className={`flex flex-wrap items-end justify-between gap-4 border-b ${HAIR} pb-3`}>
        <h2 className="font-serif text-[28px] leading-none">{posts.length} posts this month</h2>
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
      <span className="flex items-center gap-4 text-[12px] text-ink-3 md:hidden">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full bg-(--insight-5)" /> Reach
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full bg-(--insight-3)" /> Engagement
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-px bg-ink-3" /> Average reach
        </span>
      </span>
      <div className="grid grid-cols-[28px_minmax(0,2.2fr)_minmax(0,2fr)_minmax(0,1.2fr)_64px] items-center gap-x-6 px-2 max-md:hidden">
        <span />
        <span className={EYEBROW}>Post</span>
        <span className={`${EYEBROW} flex items-center gap-2`}>
          Reach
          <span className="flex items-center gap-1 normal-case tracking-normal text-ink-5">
            <span className="h-3 w-px bg-ink-3" /> average {k(avg)}
          </span>
        </span>
        <span className={EYEBROW}>Engagement</span>
        <span className={`${EYEBROW} text-right`}>Saves</span>
      </div>
      <ol className="flex flex-col">
        {ranked.map((p, i) => (
          <li
            key={p.hook}
            className={`bb-rise grid grid-cols-[28px_minmax(0,2.2fr)_minmax(0,2fr)_minmax(0,1.2fr)_64px] items-center gap-x-6 px-2 py-2.5 transition-colors hover:bg-surface-2 max-md:grid-cols-[22px_minmax(0,1fr)] max-md:gap-x-3 max-md:gap-y-2 ${i > 0 ? `border-t ${HAIR}` : ''}`}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className="font-mono text-[12px] text-ink-4 tabular-nums">{i + 1}</span>
            <span className="flex min-w-0 items-center gap-3.5">
              <span className="relative block h-[60px] w-12 shrink-0 overflow-hidden rounded-[8px] bg-tile">
                <Image src={p.image} alt="" fill sizes="48px" className="object-cover" />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="truncate font-serif text-[17px] leading-[1.15] italic">
                  “{p.hook}”
                </span>
                <span className="font-mono text-[10px] tracking-[0.06em] text-ink-4 uppercase">
                  {p.format} · {p.pillar} · {p.date}
                </span>
              </span>
            </span>
            <span className="flex items-center gap-3 max-md:col-start-2">
              <span className="relative h-2.5 flex-1 rounded-full bg-(--track)/50">
                <span
                  className="bb-fill absolute inset-y-0 left-0 rounded-full bg-(--insight-5)"
                  style={{
                    width: `${(p.reach / maxReach) * 100}%`,
                    animationDelay: `${150 + i * 40}ms`,
                  }}
                />
                <span
                  aria-hidden="true"
                  className="absolute -inset-y-1 w-px bg-ink-3"
                  style={{ left: `${(avg / maxReach) * 100}%` }}
                />
              </span>
              <span className="w-11 text-right font-mono text-[12px] text-ink tabular-nums">
                {k(p.reach)}
              </span>
            </span>
            <span className="flex items-center gap-3 max-md:col-start-2">
              <span className="relative h-2.5 flex-1 rounded-full bg-(--track)/50">
                <span
                  className="bb-fill absolute inset-y-0 left-0 rounded-full bg-(--insight-3)"
                  style={{
                    width: `${(p.engagement / maxEng) * 100}%`,
                    animationDelay: `${150 + i * 40}ms`,
                  }}
                />
              </span>
              <span className="w-11 text-right font-mono text-[12px] text-ink tabular-nums">
                {p.engagement}%
              </span>
            </span>
            <span className="text-right font-mono text-[12px] text-ink-2 tabular-nums max-md:col-start-2 max-md:text-left">
              <span className="md:hidden text-ink-4">Saves </span>
              {p.saves}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ── Creators ─────────────────────────────────────────────────────────────────────────────────

function Creators({ creators }: { creators: Creator[] }) {
  const { brand } = useBrand()
  const ranked = [...creators].sort((a, b) => b.views - a.views)
  const views = creators.reduce((n, c) => n + c.views, 0)
  const posts = creators.reduce((n, c) => n + c.posts, 0)
  // Weighted by views, so one small post does not set the average.
  const engagement = creators.reduce((n, c) => n + c.engagement * c.views, 0) / views
  const engaged = [...creators].sort((a, b) => b.engagement - a.engagement)[0]!
  const [open, setOpen] = React.useState<string | null>(null)
  const maxViews = ranked[0]!.views

  return (
    <div className="flex flex-col gap-14">
      <section aria-label="Creators this month" className="flex flex-col gap-5">
        <SectionTitle title="Creators" note={`Who posted about ${brand.name}`} />
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-5 max-lg:grid-cols-1">
          <div className="flex flex-col justify-between gap-8 rounded-[18px] bg-surface-2 p-7 max-md:p-5">
            <p className="max-w-[30ch] font-serif text-[24px] leading-[1.15]">
              {ranked[0]!.name} drew the most views. {engaged.name}’s audience engaged the most.
            </p>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Creators', value: String(creators.length), sub: `${posts} posts` },
                { label: 'Views', value: k(views), sub: 'from their posts' },
                { label: 'Engagement', value: `${engagement.toFixed(1)}%`, sub: 'average' },
              ].map((s) => (
                <span key={s.label} className="flex flex-col gap-1">
                  <span className="text-[12.5px] text-ink-3">{s.label}</span>
                  <span className="text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
                    {s.value}
                  </span>
                  <span className="text-[12px] text-ink-4">{s.sub}</span>
                </span>
              ))}
            </div>
          </div>
          <Scatter creators={creators} />
        </div>
      </section>

      <section aria-label="Each creator" className="flex flex-col gap-3">
        <div className="grid grid-cols-[minmax(0,2fr)_72px_minmax(0,2fr)_minmax(0,1fr)_28px] items-center gap-x-6 px-2 max-md:hidden">
          <span className={EYEBROW}>Creator</span>
          <span className={`${EYEBROW} text-right`}>Posts</span>
          <span className={EYEBROW}>Views</span>
          <span className={EYEBROW}>Engagement</span>
          <span />
        </div>
        <ol className="flex flex-col">
          {ranked.map((c, i) => {
            const on = open === c.handle
            return (
              <li
                key={c.handle}
                className={`bb-rise ${i > 0 ? `border-t ${HAIR}` : ''}`}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <button
                  type="button"
                  aria-expanded={on}
                  onClick={() => setOpen(on ? null : c.handle)}
                  className="grid w-full grid-cols-[minmax(0,2fr)_72px_minmax(0,2fr)_minmax(0,1fr)_28px] items-center gap-x-6 rounded-[12px] px-2 py-3 text-left transition-colors hover:bg-surface-2 max-md:grid-cols-[minmax(0,1fr)_28px] max-md:gap-y-2"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar name={c.name} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[14px] font-medium">{c.name}</span>
                      <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-ink-4">
                        <PlatformLogo platform={c.platform} size={10} />
                        {c.handle} · {k(c.followers)} followers
                      </span>
                    </span>
                  </span>
                  <span className="text-right font-mono text-[12px] text-ink-2 tabular-nums max-md:hidden">
                    {c.posts}
                  </span>
                  <span className="flex items-center gap-3 max-md:col-start-1">
                    <span className="relative h-2.5 flex-1 rounded-full bg-(--track)/50">
                      <span
                        className="bb-fill absolute inset-y-0 left-0 rounded-full bg-(--insight-5)"
                        style={{
                          width: `${(c.views / maxViews) * 100}%`,
                          animationDelay: `${150 + i * 50}ms`,
                        }}
                      />
                    </span>
                    <span className="w-11 text-right font-mono text-[12px] text-ink tabular-nums">
                      {k(c.views)}
                    </span>
                  </span>
                  <span className="font-mono text-[12px] text-ink tabular-nums max-md:col-start-1">
                    {c.engagement}%
                    <span className="ml-2 text-ink-4">
                      {k(Math.round((c.views * c.engagement) / 100))} interactions
                    </span>
                  </span>
                  <span
                    className="justify-self-end text-ink-4 transition-transform duration-200 max-md:col-start-2 max-md:row-start-1"
                    style={{ transform: on ? 'rotate(180deg)' : undefined }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                      <path
                        d="M2 3.5L5 6.5L8 3.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </button>
                <Fold open={on}>
                  <div className="flex items-center gap-4 px-2 pt-1 pb-4 pl-[54px] max-md:pl-2">
                    <span className="relative block h-[96px] w-[76px] shrink-0 overflow-hidden rounded-[10px] bg-tile">
                      <Image src={c.top.image} alt="" fill sizes="76px" className="object-cover" />
                    </span>
                    <span className="flex min-w-0 flex-col gap-1.5">
                      <span className={EYEBROW}>Their best post</span>
                      <span className="font-serif text-[19px] leading-[1.15] italic">
                        “{c.top.hook}”
                      </span>
                      <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                        {k(c.top.views)} views · {Math.round((c.top.views / c.views) * 100)}% of
                        their views for {brand.name}
                      </span>
                    </span>
                  </div>
                </Fold>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-(--insight-1) text-[13px] font-semibold text-(--insight-6)">
      {initials}
    </span>
  )
}

/** Each creator by reach across and engagement up: top right is big and engaged. */
function Scatter({ creators }: { creators: Creator[] }) {
  const box = React.useRef<HTMLDivElement>(null)
  const [tip, setTip] = React.useState<TipState | null>(null)
  const xMax = Math.ceil(Math.max(...creators.map((c) => c.views)) / 10000) * 10000
  const yMax = Math.ceil(Math.max(...creators.map((c) => c.engagement)) / 4) * 4
  const ticksX = [0, xMax / 2, xMax]
  const ticksY = [0, yMax / 2, yMax]
  return (
    <div className="flex flex-col gap-3 rounded-[18px] bg-surface-2 p-7 max-md:p-5">
      <span className="text-[12.5px] font-medium text-ink-3">
        Views against engagement, per creator
      </span>
      <div className="grid grid-cols-[36px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_20px] gap-x-2">
        <span className="relative font-mono text-[10px] text-ink-4 tabular-nums">
          {ticksY.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${(1 - t / yMax) * 100}%` }}
            >
              {t}%
            </span>
          ))}
        </span>
        <div ref={box} className="relative h-[220px]" onMouseLeave={() => setTip(null)}>
          {ticksY.map((t) => (
            <span
              key={t}
              className="absolute inset-x-0 h-px bg-(--cal-line)"
              style={{ top: `${(1 - t / yMax) * 100}%` }}
            />
          ))}
          {creators.map((c, i) => {
            const left = (c.views / xMax) * 100
            const top = (1 - c.engagement / yMax) * 100
            return (
              <span
                key={c.handle}
                className="absolute"
                style={{ left: `${left}%`, top: `${top}%` }}
              >
                <span
                  role="img"
                  aria-label={`${c.name}: ${k(c.views)} views, ${c.engagement}% engagement`}
                  onMouseEnter={(e) =>
                    setTip({
                      ...anchor(e, box.current),
                      title: c.name,
                      lines: [
                        `${k(c.views)} views`,
                        `${c.engagement}% engagement`,
                        `${c.posts} posts`,
                      ],
                    })
                  }
                  className="bb-pop absolute block size-3 -translate-x-1/2 -translate-y-1/2 cursor-default rounded-full bg-(--insight-5) shadow-[0_0_0_2px_var(--surface-2)] outline-none before:absolute before:-inset-2 before:content-[''] focus-visible:shadow-[0_0_0_2px_var(--ink)]"
                  style={{ animationDelay: `${200 + i * 70}ms` }}
                />
                <span
                  className={`absolute top-0 -translate-y-1/2 text-[11.5px] whitespace-nowrap text-ink-2 ${left > 70 ? 'right-3' : 'left-3'}`}
                >
                  {c.name.split(' ')[0]}
                </span>
              </span>
            )
          })}
          <Tip tip={tip} />
        </div>
        <span />
        <span className="relative font-mono text-[10px] text-ink-4 tabular-nums">
          {ticksX.map((t, i) => (
            <span
              key={t}
              className={`absolute top-1.5 whitespace-nowrap ${i === 0 ? '' : i === ticksX.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
              style={{ left: `${(t / xMax) * 100}%` }}
            >
              {i === ticksX.length - 1 ? `${k(t)} views` : k(t)}
            </span>
          ))}
        </span>
      </div>
    </div>
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
