'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import { Segmented } from '@/components/controls'
import { PlusIcon } from '@/components/icons'
import { DEFAULT_LAYERS } from '@/data/demo'
import { dayLabel } from '@/features/ideate/calendar-slot'

import { Agenda } from './agenda'
import { setCalendarPlace, TODAY_PLACE, useCalendarPlace, type CalendarMode } from './calendar-view'
import { itemsOf } from './calendar-items'
import { DayView } from './day-view'
import { FailedPill } from './failed-menu'
import { LayersMenu } from './layers-menu'
import { DEMO_MONTH, dateOf, monthView, weekCount } from './month'
import { storyTaken } from './move-post'
import { useBrand } from './posts-store'
import { StageMenu } from './stage-menu'
import { storiesOf } from './stories'
import { StoryPanel } from './story-panel'
import { WeekGrid } from './week-grid'

const SHORT_MONTH = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * The schedule: one page, three views. Month counts each day's posts by platform; Week and Day show
 * the posts themselves. The arrows step by the view shown. A post opens on its own page, and so
 * does a new one.
 */
export function SchedulePage() {
  const router = useRouter()
  const { brand, weeks, month, posts, library, byId } = useBrand()
  // The day whose stories are open in the side panel.
  const [storyDay, setStoryDay] = React.useState<string | null>(null)
  const failed = posts.filter((p) => p.stage === 'failed')
  const place = useCalendarPlace()
  const { view, offset, week, day, stages } = place
  const [layers, setLayers] = React.useState(DEFAULT_LAYERS)

  const shown = React.useMemo(() => {
    if (offset === 0) return { ...month, weeks }
    const d = new Date(DEMO_MONTH.year, DEMO_MONTH.month + offset, 1)
    return monthView(brand.id, d.getFullYear(), d.getMonth())
  }, [offset, month, weeks, brand.id])
  const shownWeek = shown.weeks[Math.min(week, shown.weeks.length - 1)]!
  const shownDay = shownWeek.days[day]!

  /** One step back or forward in the current view, crossing into the next month when it runs out. */
  function step(by: -1 | 1) {
    if (view === 'month') return setCalendarPlace({ offset: offset + by, week: 0 })
    if (view === 'week') return moveWeek(by)
    const next = day + by
    if (next < 0) return moveWeek(-1, 6)
    if (next > 6) return moveWeek(1, 0)
    setCalendarPlace({ day: next })
  }

  function moveWeek(by: -1 | 1, toDay = day) {
    const next = week + by
    if (next < 0) {
      setCalendarPlace({ offset: offset - 1, week: weekCount(offset - 1) - 1, day: toDay })
    } else if (next >= weekCount(offset)) {
      setCalendarPlace({ offset: offset + 1, week: 0, day: toDay })
    } else {
      setCalendarPlace({ week: next, day: toDay })
    }
  }

  const start = dateOf(offset, week, 0)
  const end = dateOf(offset, week, 6)
  const current = dateOf(offset, week, day)
  const title =
    view === 'month'
      ? shown.title
      : view === 'week'
        ? `${start.getDate()}${start.getMonth() === end.getMonth() ? '' : ` ${SHORT_MONTH[start.getMonth()]}`} – ${end.getDate()} ${SHORT_MONTH[end.getMonth()]}`
        : `${WEEKDAY[current.getDay()]} ${current.getDate()} ${SHORT_MONTH[current.getMonth()]}`
  // Dates only: the month's range without its week numbers, and the year beside a single day.
  const sub =
    view === 'month'
      ? shown.range.replace(/ · WK.*$/, '')
      : view === 'week'
        ? ''
        : String(current.getFullYear())
  const atToday =
    offset === TODAY_PLACE.offset &&
    (view === 'month' || week === TODAY_PLACE.week) &&
    (view !== 'day' || day === TODAY_PLACE.day)
  const unit = view === 'month' ? 'month' : view === 'week' ? 'week' : 'day'

  const openPost = (id: string) => router.push(`/post/${id}`)
  // A slot's day and hour carry into the composer; its day picker holds the demo's October only.
  const newPost = (dayN?: string, time?: string, format?: 'story') => {
    const q = new URLSearchParams()
    if (dayN && offset === 0) q.set('day', dayN)
    if (time && offset === 0) q.set('time', time)
    if (format) q.set('format', format)
    router.push(q.size ? `/post/new?${q}` : '/post/new')
  }
  const closeStories = React.useCallback(() => setStoryDay(null), [])
  /** A day can take one new story: the first from this one on whose story row is free. */
  const freeStoryDay = (from: string) => {
    const days = shown.weeks.flatMap((w) => w.days)
    const start = days.findIndex((d) => d.n === from)
    return days
      .slice(Math.max(start, 0))
      .find((d) => !d.past && !d.today && !storyTaken(shown.weeks, d.n))?.n
  }
  // The open story panel: the day's stories as the stage filter allows, from the weeks on screen.
  const openDay = storyDay
    ? shown.weeks.flatMap((w) => w.days).find((d) => d.n === storyDay)
    : undefined
  const storyPanel = openDay ? (
    <StoryPanel
      label={dayLabel(shown.weeks, openDay.n) ?? openDay.n}
      stories={storiesOf(openDay.n, itemsOf(openDay, byId, stages), brand.id, library, byId)}
      past={Boolean(openDay.past)}
      onClose={closeStories}
      onAdd={() => newPost(freeStoryDay(openDay.n), undefined, 'story')}
      onOpenPost={openPost}
    />
  ) : null
  const dayEvents = shownWeek.events.filter(
    (e) => e.col - 1 <= day && day < e.col - 1 + e.span && layers[e.layer],
  )

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      {/* A phone gets its own layout of the same three views, under a strip of the week. */}
      <div className="md:hidden">
        <Agenda
          weeks={shown.weeks}
          week={week}
          day={day}
          view={view}
          // "12–18 Oct": the dash without its spaces, so the week fits a small phone's header.
          title={view === 'week' ? title.replace(' – ', '–') : shown.title}
          layers={layers}
          stages={stages}
          onView={(v) => setCalendarPlace({ view: v })}
          dayView={
            <DayView
              day={shownDay}
              events={dayEvents}
              stages={stages}
              onOpenPost={openPost}
              onNewPost={newPost}
              onOpenStories={() => setStoryDay(shownDay.n)}
            />
          }
          onSelect={(w, d) => setCalendarPlace({ week: w, day: d })}
          onStepWeek={(by) => moveWeek(by)}
          onStepMonth={(by) => setCalendarPlace({ offset: offset + by, week: 0 })}
          atToday={
            offset === TODAY_PLACE.offset && week === TODAY_PLACE.week && day === TODAY_PLACE.day
          }
          onToday={() => setCalendarPlace(TODAY_PLACE)}
          onOpenPost={openPost}
          onNewPost={newPost}
          onOpenStories={setStoryDay}
          controls={
            <>
              <FailedPill
                posts={failed}
                stages={stages}
                onChange={(s) => setCalendarPlace({ stages: s })}
                short
              />
              <LayersMenu value={layers} onChange={setLayers} />
              <StageMenu value={stages} onChange={(s) => setCalendarPlace({ stages: s })} />
            </>
          }
        />
      </div>
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-end justify-between gap-x-6 gap-y-4 px-10 pt-6 pb-7 max-md:hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {/* Arrows first, so they stay put while the title changes width. */}
          <span className="-ml-2 flex items-center">
            <StepArrow label={`Previous ${unit}`} onClick={() => step(-1)} flip />
            <StepArrow label={`Next ${unit}`} onClick={() => step(1)} />
          </span>
          <h1 className="font-display text-[38px] leading-none tracking-[-0.035em]">{title}</h1>
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-4">{sub}</span>
          {!atToday && (
            <button
              type="button"
              onClick={() => setCalendarPlace(TODAY_PLACE)}
              className="bb-pop flex h-7 items-center rounded-full bg-surface px-3 text-[12px] font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink"
            >
              Today
            </button>
          )}
        </div>
        <div className="relative flex flex-wrap items-center gap-2">
          <FailedPill
            posts={failed}
            stages={stages}
            onChange={(s) => setCalendarPlace({ stages: s })}
          />
          <div className="w-[216px] max-md:order-last max-md:w-full">
            <Segmented<CalendarMode>
              label="View"
              pill
              value={view}
              onChange={(v) => setCalendarPlace({ view: v })}
              options={[
                { value: 'month', label: 'Month' },
                { value: 'week', label: 'Week' },
                { value: 'day', label: 'Day' },
              ]}
            />
          </div>
          <LayersMenu value={layers} onChange={setLayers} />
          <StageMenu value={stages} onChange={(s) => setCalendarPlace({ stages: s })} />
          <button
            type="button"
            onClick={() => newPost()}
            className="bb-press flex h-9 items-center gap-1.5 rounded-full bg-ink pr-4 pl-3.5 text-[13px] font-medium whitespace-nowrap text-page hover:opacity-85 max-md:ml-auto max-[360px]:w-9 max-[360px]:justify-center max-[360px]:px-0"
          >
            <PlusIcon size={12} />
            <span className="max-sm:hidden">Schedule new post</span>
            <span className="sm:hidden max-[360px]:sr-only">New post</span>
          </button>
        </div>
      </div>
      {/* Keyed by what is shown, so each step settles in with a short rise. */}
      <div
        // Keyed by the filter too, so filtering (the Failed pill) replays the rise.
        key={`${brand.id}-${view}-${offset}-${view === 'month' ? '' : week}-${view === 'day' ? day : ''}-${Object.values(stages).join('')}`}
        className="bb-swap max-md:hidden"
      >
        {view === 'day' ? (
          <DayView
            day={shownDay}
            events={dayEvents}
            stages={stages}
            onOpenPost={openPost}
            onNewPost={newPost}
            onOpenStories={() => setStoryDay(shownDay.n)}
          />
        ) : (
          <WeekGrid
            weeks={view === 'month' ? shown.weeks : [shownWeek]}
            layers={layers}
            stages={stages}
            mode={view === 'month' ? 'month' : 'week'}
            onOpenPost={openPost}
            onNewPost={newPost}
            onOpenStories={setStoryDay}
            onOpenDay={(w, d) =>
              setCalendarPlace({ view: 'day', week: view === 'month' ? w : week, day: d })
            }
          />
        )}
      </div>
      {storyPanel}
    </div>
  )
}

function StepArrow({
  label,
  onClick,
  flip = false,
}: {
  label: string
  onClick: () => void
  flip?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface hover:text-ink"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
        style={flip ? { transform: 'scaleX(-1)' } : undefined}
      >
        <path
          d="M4.5 2.5L8 6L4.5 9.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
