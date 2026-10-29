'use client'

import * as React from 'react'

import { Sheet } from '@/components/sheet'
import { usePhone } from '@/components/use-phone'
import type { Day, Week } from '@/data/demo'
import { monthTitle } from '@/features/schedule/month'
import { useBrand } from '@/features/schedule/posts-store'
import { dayNumber, mondayOf, MONTH_SHORT, monthOf, todayDate } from '@/lib/dates'

import { dayLabel } from './calendar-slot'

/** What the picker knows about a day: whether it can be picked, a mark, and a word on why. */
export interface DayInfo {
  disabled?: boolean
  /** A quiet dot: the day already holds a post, or a shoot. */
  dot?: boolean
  /** Read out with the day: "2 posts", "Shoot · Raffles City". */
  note?: string
}

/**
 * A day on the brand's calendar, and a time when the field has one: a small calendar in a popover,
 * or in the phone's sheet, one month at a time. Arrow keys move between days (into the next month
 * too), Enter picks, Escape closes and the field takes the focus back. The field reads as
 * "Tue 27 Oct, 12:00".
 */
export function DayPicker({
  label,
  value,
  onChange,
  infoOf,
  time,
  times,
  best,
  onTime,
  disabled = false,
  placeholder = 'Pick a day',
  shortcuts,
  onClear,
  prefix,
  down = false,
}: {
  label: string
  value: string | null
  onChange: (date: string) => void
  infoOf: (day: Day) => DayInfo
  time?: string
  times?: string[]
  /** The brand's best time, from Insights, marked in the list. */
  best?: string
  onTime?: (time: string) => void
  disabled?: boolean
  placeholder?: string
  /** Above the calendar: days worth a name of their own, the calendar's shoots for a shoot day. */
  shortcuts?: Array<{ key: string; label: string; date: string }>
  /** Lets the field be emptied again; absent when the field always holds a day. */
  onClear?: () => void
  /** A word in the field before the day, which says what the day is for: "Shoot", "Post". */
  prefix?: string
  /**
   * Always opens below the field, the page scrolling it into view: opened upward it covered
   * what sits above the field.
   */
  down?: boolean
}) {
  const phone = usePhone()
  const [open, setOpen] = React.useState(false)
  const field = React.useRef<HTMLButtonElement>(null)
  const pop = React.useRef<HTMLDivElement>(null)
  const id = React.useId()

  // The field takes the focus back: now, and again once the popover or the sheet has gone, since
  // the sheet hands the focus to what opened it, which was a day cell that is no longer there.
  const close = React.useCallback(() => {
    setOpen(false)
    field.current?.focus()
    requestAnimationFrame(() => field.current?.focus())
  }, [])

  // A click outside the popover closes it, as does Escape; the sheet closes itself.
  React.useEffect(() => {
    if (!open || phone) return
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (!pop.current?.contains(t) && !field.current?.contains(t)) close()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open, phone, close])

  // Near the foot of the window the popover opens upward; with room on neither side, the page
  // scrolls it into view. Below the field it was cut off at the window's edge.
  const [up, setUp] = React.useState(false)
  React.useLayoutEffect(() => {
    if (!open || phone) return
    const f = field.current?.getBoundingClientRect()
    const h = pop.current?.offsetHeight ?? 0
    if (!f) return
    const below = f.bottom + 8 + h <= window.innerHeight
    const above = f.top - 8 - h >= 0
    setUp(!down && !below && above)
    if (!below && (down || !above)) pop.current?.scrollIntoView({ block: 'nearest' })
  }, [open, phone, down])

  const text = value ? `${dayLabel(value)}${time ? `, ${time}` : ''}` : placeholder
  const body = (
    <Body
      value={value}
      infoOf={infoOf}
      time={time}
      times={times}
      best={best}
      shortcuts={shortcuts}
      onClear={
        onClear && value
          ? () => {
              onClear()
              close()
            }
          : undefined
      }
      onDay={(n) => {
        onChange(n)
        if (!times) close()
      }}
      onTime={(t) => {
        onTime?.(t)
        // A time before a day leaves the picker open: the day is still to pick.
        if (value) close()
      }}
    />
  )

  return (
    <span className="relative flex">
      <button
        ref={field}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-8 items-center gap-2 rounded-full bg-surface pr-3 pl-3 text-[13px] font-medium outline-none transition-colors hover:bg-paper focus-visible:shadow-[0_0_0_2px_var(--ink)] disabled:cursor-default disabled:opacity-50 ${value ? 'text-ink' : 'text-ink-3'}`}
      >
        <CalendarGlyph />
        {prefix && <span className="font-normal text-ink-3">{prefix}</span>}
        {text}
      </button>
      {open &&
        (phone ? (
          <Sheet title={label} onClose={close}>
            {body}
          </Sheet>
        ) : (
          <div
            ref={pop}
            id={id}
            role="dialog"
            aria-label={label}
            className={`bb-menu absolute left-0 z-20 w-[296px] ${up ? 'bottom-full mb-2' : 'top-full mt-2'} rounded-[16px] bg-page p-3 shadow-sheet ring-1 ring-(--cal-line)`}
          >
            {body}
          </div>
        ))}
    </span>
  )
}

type Month = { year: number; month: number }
const sameMonth = (a: Month, b: Month) => a.year === b.year && a.month === b.month

/** The months the brand's weeks start in, in order: the calendar's months. */
function monthsOf(weeks: Week[]): Month[] {
  const seen = new Map<string, Month>()
  for (const w of weeks) {
    const m = monthOf(w.days[0]!.date)
    seen.set(`${m.year}-${m.month}`, m)
  }
  return [...seen.values()]
}

/**
 * The brand's weeks a month at a time, starting at the month of `date`. A page holds every week
 * with a day in its month, so the 1st is always on its own month's page; the days on it that
 * belong to another month's page are `outside`. With the page: its title ("October", or "January
 * 2027" in another year), the page turner and `reveal`, which turns to a day unless it is on
 * the page already.
 */
export function useMonthPages(weeks: Week[], date: string) {
  const months = React.useMemo(() => monthsOf(weeks), [weeks])
  // A day's own month, or its week's when the calendar has no page for it (1 Nov in the demo).
  const pageOf = React.useCallback(
    (d: string) => {
      const own = months.findIndex((m) => sameMonth(m, monthOf(d)))
      return own >= 0
        ? own
        : Math.max(
            0,
            months.findIndex((m) => sameMonth(m, monthOf(mondayOf(d)))),
          )
    },
    [months],
  )
  const daysOf = React.useCallback(
    (page: number) => {
      const shown = months[Math.min(page, months.length - 1)]!
      return (
        weeks
          .filter((w) => w.days.some((d) => sameMonth(monthOf(d.date), shown)))
          .flatMap((w) => w.days)
          // A neighbouring month's day dims only when that month has a page of its own to pick it
          // on: the demo's 1 November, on October's page alone, looks like any other day.
          .map((d) => {
            const m = monthOf(d.date)
            const elsewhere = !sameMonth(m, shown) && months.some((x) => sameMonth(x, m))
            return elsewhere ? { ...d, outside: true } : d
          })
      )
    },
    [weeks, months],
  )
  const [page, setPage] = React.useState(() => pageOf(date))
  const days = React.useMemo(() => daysOf(page), [daysOf, page])
  const reveal = React.useCallback(
    (d: string) => setPage((p) => (daysOf(p).some((x) => x.date === d) ? p : pageOf(d))),
    [daysOf, pageOf],
  )
  const shown = months[Math.min(page, months.length - 1)]!
  const name = monthTitle(shown.year, shown.month).title
  const title = shown.year === monthOf(todayDate()).year ? name : `${name} ${shown.year}`
  return { count: months.length, page, setPage, reveal, days, title }
}

/** The arrows that turn a month page, shown only when there is more than one month. */
export function MonthArrows({
  count,
  page,
  setPage,
}: {
  count: number
  page: number
  setPage: (page: number) => void
}) {
  if (count < 2) return null
  return (
    <span className="flex items-center">
      <PageArrow
        label="Previous month"
        disabled={page === 0}
        onClick={() => setPage(page - 1)}
        flip
      />
      <PageArrow
        label="Next month"
        disabled={page === count - 1}
        onClick={() => setPage(page + 1)}
      />
    </span>
  )
}

/** A month as the calendar draws it, Monday first, and the times under it. */
function Body({
  value,
  infoOf,
  time,
  times,
  best,
  onDay,
  onTime,
  shortcuts,
  onClear,
}: {
  value: string | null
  infoOf: (day: Day) => DayInfo
  time?: string
  times?: string[]
  best?: string
  onDay: (date: string) => void
  onTime: (time: string) => void
  shortcuts?: Array<{ key: string; label: string; date: string }>
  onClear?: () => void
}) {
  const { weeks } = useBrand()
  const days = React.useMemo(
    () => weeks.flatMap((w) => w.days).map((d) => ({ day: d, info: infoOf(d) })),
    [weeks, infoOf],
  )
  // The day the arrow keys stand on: the picked one, else the first that can be picked.
  const [cursor, setCursor] = React.useState(
    () => value ?? days.find((d) => !d.info.disabled)?.day.date ?? days[0]!.day.date,
  )
  // The month on screen: the cursor's, until an arrow turns the page.
  const pages = useMonthPages(weeks, cursor)
  const { page, setPage, title } = pages
  const shownDays = React.useMemo(
    () =>
      pages.days.map((d) => ({
        day: d,
        info: days.find((x) => x.day.date === d.date)!.info,
      })),
    [pages.days, days],
  )
  // The cell Tab lands on: the cursor when it is on this page, else the first that can be picked.
  const tabStop = shownDays.some((d) => d.day.date === cursor)
    ? cursor
    : (shownDays.find((d) => !d.info.disabled) ?? shownDays[0])?.day.date
  const today = todayDate()
  const cells = React.useRef(new Map<string, HTMLButtonElement>())
  // Focus follows the first open and the arrow keys, not a page turned with the mouse.
  const moved = React.useRef(true)
  React.useEffect(() => {
    if (moved.current) cells.current.get(cursor)?.focus()
    moved.current = false
  }, [cursor, page])

  /** Moves the cursor by `by` days, then on past any day that cannot be picked. */
  function step(by: number) {
    const i = days.findIndex((d) => d.day.date === cursor)
    const dir = by < 0 ? -1 : 1
    for (let j = i + by; j >= 0 && j < days.length; j += dir) {
      if (!days[j]!.info.disabled) {
        const next = days[j]!.day.date
        moved.current = true
        pages.reveal(next)
        return setCursor(next)
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {shortcuts && shortcuts.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {shortcuts.map((s) => {
            const on = s.date === value
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => onDay(s.date)}
                className={`flex h-7 items-center rounded-full px-2.5 text-[13px] transition-colors ${on ? 'bg-ink text-page' : 'bg-surface text-ink-2 hover:text-ink'}`}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      )}
      <div role="group" aria-label={title} className="flex flex-col gap-1">
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="flex items-center gap-1">
            <span className="text-[13px] font-medium">{title}</span>
            <MonthArrows count={pages.count} page={page} setPage={setPage} />
          </span>
          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="text-[13px] text-ink-3 transition-colors hover:text-ink"
            >
              Clear
            </button>
          ) : (
            <span className="text-[13px] text-ink-4">
              Today {dayNumber(today)} {MONTH_SHORT[monthOf(today).month]}
            </span>
          )}
        </div>
        <div aria-hidden="true" className="grid grid-cols-7 text-center">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span key={i} className="text-[12px] text-ink-4">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {shownDays.map(({ day, info }) => {
            const on = day.date === value
            const label = `${dayLabel(day.date)}${day.today ? ', today' : ''}${info.note ? `, ${info.note}` : ''}`
            return (
              <button
                key={day.date}
                ref={(el) => {
                  if (el) cells.current.set(day.date, el)
                  else cells.current.delete(day.date)
                }}
                type="button"
                aria-label={label}
                aria-pressed={on}
                disabled={info.disabled}
                tabIndex={day.date === tabStop ? 0 : -1}
                onFocus={() => setCursor(day.date)}
                onKeyDown={(e) => {
                  const by = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
                  if (!by) return
                  e.preventDefault()
                  step(by)
                }}
                onClick={() => onDay(day.date)}
                className={`relative flex h-9 items-center justify-center rounded-[9px] text-[13px] tabular-nums transition-colors outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--ink)] max-md:h-10 max-md:text-[14px] ${
                  on
                    ? 'bg-ink text-page'
                    : info.disabled
                      ? 'text-ink-5'
                      : day.outside
                        ? 'text-ink-4 hover:bg-surface'
                        : day.today
                          ? 'font-semibold text-ink hover:bg-surface'
                          : 'text-ink hover:bg-surface'
                }`}
              >
                {dayNumber(day.date)}
                {day.today && !on && (
                  <span className="absolute top-1 right-1.5 size-1 rounded-full bg-ink" />
                )}
                {info.dot && !on && (
                  <span className="absolute bottom-1 size-1 rounded-full bg-ink-4" />
                )}
              </button>
            )
          })}
        </div>
      </div>
      {times && (
        <div
          role="radiogroup"
          aria-label="Time"
          className="flex flex-wrap gap-1 border-t border-(--cal-line) pt-3"
        >
          {times.map((t) => {
            const on = t === time
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onTime(t)}
                className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] tabular-nums transition-colors ${on ? 'bg-ink text-page' : 'bg-surface text-ink-2 hover:text-ink'}`}
              >
                {t}
                {t === best && (
                  <span className={`text-[12px] ${on ? 'text-page/70' : 'text-(--insight-6)'}`}>
                    Best
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PageArrow({
  label,
  onClick,
  disabled,
  flip = false,
}: {
  label: string
  onClick: () => void
  disabled: boolean
  flip?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-6 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <svg
        width="10"
        height="10"
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

function CalendarGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="9" height="8" rx="1.6" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M1.5 5h9M4 1.5v2M8 1.5v2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}
