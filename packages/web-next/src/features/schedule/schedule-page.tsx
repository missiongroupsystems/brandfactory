'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import { Segmented } from '@/components/controls'
import { DEFAULT_LAYERS, type Format } from '@/data/demo'
import { dayLabel } from '@/features/ideate/calendar-slot'
import { FORMAT_PARAM } from '@/features/publish/publishers'
import { withShoots } from '@/features/shoot/model'
import { useShoots } from '@/features/shoot/shoots-store'
import { dayNumber, MONTH_SHORT, monthOf, todayDate, weekdayOf } from '@/lib/dates'

import { PhoneCalendar } from './phone-calendar'
import { setCalendarPlace, useCalendarPlace, type CalendarMode } from './calendar-view'
import { itemsOf } from './calendar-items'
import { DayView } from './day-view'
import { FailedPill } from './failed-menu'
import { MoreMenu } from './filter-menu'
import { NewMenu } from './new-menu'
import {
  dateOf,
  firstPostYear,
  monthAt,
  monthPlace,
  monthRows,
  monthTitle,
  monthView,
  todayPlace,
  weekCount,
  weeksOfMonth,
  withYear,
} from './month'
import { TitleMonthPicker, type MonthPick } from './month-picker'
import { storyTaken } from './move-post'
import { useBrand } from './posts-store'
import { storiesOf } from './stories'
import { StoryPanel } from './story-panel'
import { WeekGrid } from './week-grid'

const WEEKDAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/**
 * The schedule: one page, three views. Month counts each day's posts by platform; Week and Day show
 * the posts themselves. The arrows step by the view shown. A post opens on its own page, and so
 * does a new one.
 */
export function SchedulePage() {
  const router = useRouter()
  const { brand, weeks: plain, posts, library, byId } = useBrand()
  // This month's shoots are the ones the team planned, with their times; they open their sheet.
  const shoots = useShoots(brand.id)
  const weeks = React.useMemo(() => withShoots(plain, shoots), [plain, shoots])
  // The day whose stories are open in the side panel.
  const [storyDay, setStoryDay] = React.useState<string | null>(null)
  const failed = posts.filter((p) => p.stage === 'failed')
  const place = useCalendarPlace()
  const { view, offset, week, day, stages } = place
  const [layers, setLayers] = React.useState(DEFAULT_LAYERS)

  /** A month cut from the brand's weeks, or drawn on its own where the weeks do not reach. */
  const monthOfOffset = React.useCallback(
    (at: number) => {
      const { year, month } = monthAt(at)
      const own = weeksOfMonth(weeks, year, month)
      return own.length > 0
        ? { ...monthTitle(year, month), weeks: own }
        : monthView(brand.id, year, month)
    },
    [weeks, brand.id],
  )
  const shown = React.useMemo(() => monthOfOffset(offset), [monthOfOffset, offset])
  // The month grid starts on the 1st: it borrows the last week of the month before as its first row.
  const rows = React.useMemo(
    () => monthRows(offset, shown.weeks, monthOfOffset(offset - 1).weeks),
    [offset, shown.weeks, monthOfOffset],
  )
  /** A day in the borrowed first row opens in the day view of its own month. */
  const openLead = (d: number) =>
    setCalendarPlace({ view: 'day', offset: offset - 1, week: weekCount(offset - 1) - 1, day: d })
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
  const short = (date: string) => MONTH_SHORT[monthOf(date).month]
  // A month's year is its own (its first Monday's); a week's is its last day's, so a week from
  // December into January is next year's.
  const last = view === 'month' ? dateOf(offset, 0, 0) : end
  const title = withYear(
    view === 'month'
      ? shown.title
      : view === 'week'
        ? `${dayNumber(start)}${short(start) === short(end) ? '' : ` ${short(start)}`} – ${dayNumber(end)} ${short(end)}`
        : `${WEEKDAY[weekdayOf(current)]} ${dayNumber(current)} ${short(current)}`,
    view === 'day' ? current : last,
  )
  const here = todayPlace(view)
  const atToday =
    offset === here.offset &&
    (view === 'month' || week === here.week) &&
    (view !== 'day' || day === here.day)
  const unit = view === 'month' ? 'month' : view === 'week' ? 'week' : 'day'
  // The title picks a month of any year from the brand's first post to next year.
  const thisMonth = monthOf(todayDate())
  const pick: MonthPick = {
    shown: view === 'day' ? monthOf(current) : monthAt(offset),
    today: thisMonth,
    from: firstPostYear(weeks),
    to: thisMonth.year + 1,
    onPick: ({ year, month }) => setCalendarPlace(monthPlace(view, year, month)),
  }

  const openPost = (id: string) => router.push(`/post/${id}`)
  // A slot's day and hour carry into the composer, if its day picker holds that day.
  const newPost = (date?: string, time?: string, format?: Format) => {
    const q = new URLSearchParams()
    const known = date !== undefined && weeks.some((w) => w.days.some((d) => d.date === date))
    if (date && known) q.set('day', date)
    if (time && known) q.set('time', time)
    if (format) q.set('format', FORMAT_PARAM[format])
    router.push(q.size ? `/post/new?${q}` : '/post/new')
  }
  const closeStories = React.useCallback(() => setStoryDay(null), [])
  /** A day can take one new story: the first from this one on whose story row is free. */
  const freeStoryDay = (from: string) => {
    const days = shown.weeks.flatMap((w) => w.days)
    const start = days.findIndex((d) => d.date === from)
    return days
      .slice(Math.max(start, 0))
      .find((d) => !d.past && !d.today && !storyTaken(shown.weeks, d.date))?.date
  }
  // The open story panel: the day's stories as the stage filter allows, from the weeks on screen.
  const openDay = storyDay
    ? shown.weeks.flatMap((w) => w.days).find((d) => d.date === storyDay)
    : undefined
  const storyPanel = openDay ? (
    <StoryPanel
      label={dayLabel(openDay.date)}
      stories={storiesOf(openDay.date, itemsOf(openDay, byId, stages), brand.id, library, byId)}
      past={Boolean(openDay.past)}
      onClose={closeStories}
      onAdd={() => newPost(freeStoryDay(openDay.date), undefined, 'story')}
      onOpenPost={openPost}
    />
  ) : null
  // A shoot added from the day view takes the day shown, if it is ahead in the brand's weeks.
  const shootDay =
    !shownDay.past &&
    !shownDay.outside &&
    weeks.some((w) => w.days.some((d) => d.date === shownDay.date))
      ? shownDay.date
      : undefined
  const dayEvents = shownWeek.events.filter(
    (e) => e.col - 1 <= day && day < e.col - 1 + e.span && layers[e.layer],
  )

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      {/* A phone gets its own layout of the same three views: a grid of photos. */}
      <div className="md:hidden">
        <PhoneCalendar
          weeks={shown.weeks}
          month={rows}
          onOpenLead={openLead}
          week={week}
          day={day}
          view={view}
          // "12–18 Oct" and "Tue 6 Oct": short, so the title fits a small phone's header.
          title={
            view === 'week'
              ? title.replace(' – ', '–')
              : view === 'day'
                ? withYear(
                    `${WEEKDAY[weekdayOf(current)]!.slice(0, 3)} ${dayNumber(current)} ${short(current)}`,
                    current,
                  )
                : title
          }
          monthPick={pick}
          layers={layers}
          stages={stages}
          failed={failed}
          // The phone picks a day in every view: away from today's day, Today shows.
          atToday={atToday && day === here.day}
          onView={(v) => setCalendarPlace({ view: v })}
          onSelect={(w, d) => setCalendarPlace({ week: w, day: d })}
          onStep={step}
          onToday={() => setCalendarPlace(todayPlace(view))}
          onOpenPost={openPost}
          onNewPost={newPost}
          shootDay={shootDay}
          onOpenStories={setStoryDay}
          onStages={(s) => setCalendarPlace({ stages: s })}
          onLayers={setLayers}
        />
      </div>
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-end justify-between gap-x-6 gap-y-4 px-10 pt-6 pb-7 max-md:hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {/* Arrows first, so they stay put while the title changes width. */}
          <span className="-ml-2 flex items-center">
            <StepArrow label={`Previous ${unit}`} onClick={() => step(-1)} flip />
            <StepArrow label={`Next ${unit}`} onClick={() => step(1)} />
          </span>
          <TitleMonthPicker title={title} pick={pick} />
          {!atToday && (
            <button
              type="button"
              onClick={() => setCalendarPlace(todayPlace(view))}
              className="bb-pop flex h-7 items-center rounded-full bg-surface px-3 text-[12px] font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink"
            >
              Today
            </button>
          )}
          {/* What needs someone sits with the title, as a line of text, not among the controls. */}
          <FailedPill
            posts={failed}
            stages={stages}
            onChange={(s) => setCalendarPlace({ stages: s })}
          />
        </div>
        <div className="relative flex flex-wrap items-center gap-2">
          <div className="w-[216px]">
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
          <MoreMenu
            stages={stages}
            layers={layers}
            onStages={(s) => setCalendarPlace({ stages: s })}
            onLayers={setLayers}
            shootDay={view === 'day' ? shootDay : undefined}
          />
          <NewMenu onPost={(format) => newPost(undefined, undefined, format)} />
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
            onOpenStories={() => setStoryDay(shownDay.date)}
          />
        ) : (
          <WeekGrid
            weeks={
              view === 'month' ? [...(rows.lead ? [rows.lead] : []), ...rows.weeks] : [shownWeek]
            }
            layers={layers}
            stages={stages}
            mode={view === 'month' ? 'month' : 'week'}
            onOpenPost={openPost}
            onNewPost={newPost}
            onOpenStories={setStoryDay}
            onOpenDay={(w, d) => {
              if (view !== 'month') return setCalendarPlace({ view: 'day', week, day: d })
              if (rows.lead && w === 0) return openLead(d)
              setCalendarPlace({ view: 'day', week: rows.lead ? w - 1 : w, day: d })
            }}
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
