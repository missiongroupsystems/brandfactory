'use client'

import * as React from 'react'

import { Sheet } from '@/components/sheet'
import { usePhone } from '@/components/use-phone'
import type { Day } from '@/data/demo'
import { MONTH } from '@/data/demo'
import { useBrand } from '@/features/schedule/posts-store'

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
 * A day on the demo's month, and a time when the field has one: a small calendar in a popover, or
 * in the phone's sheet. Arrow keys move between days, Enter picks, Escape closes and the field
 * takes the focus back. The field reads as "Tue 27 Oct, 12:00".
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
}: {
  label: string
  value: string | null
  onChange: (dayN: string) => void
  infoOf: (day: Day) => DayInfo
  time?: string
  times?: string[]
  /** The brand's best time, from Insights, marked in the list. */
  best?: string
  onTime?: (time: string) => void
  disabled?: boolean
  placeholder?: string
  /** Above the calendar: days worth a name of their own, the calendar's shoots for a shoot day. */
  shortcuts?: Array<{ key: string; label: string; dayN: string }>
  /** Lets the field be emptied again; absent when the field always holds a day. */
  onClear?: () => void
}) {
  const { weeks } = useBrand()
  const phone = usePhone()
  const [open, setOpen] = React.useState(false)
  const field = React.useRef<HTMLButtonElement>(null)
  const pop = React.useRef<HTMLDivElement>(null)
  const id = React.useId()

  const close = React.useCallback(() => {
    setOpen(false)
    field.current?.focus()
  }, [])

  // A click outside the popover closes it, as does Escape; the sheet closes itself.
  React.useEffect(() => {
    if (!open || phone) return
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (!pop.current?.contains(t) && !field.current?.contains(t)) setOpen(false)
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

  const text = value ? `${dayLabel(weeks, value)}${time ? `, ${time}` : ''}` : placeholder
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
        className={`flex h-8 items-center gap-2 rounded-full bg-surface pr-3 pl-3 text-[12.5px] font-medium outline-none transition-colors hover:bg-paper focus-visible:shadow-[0_0_0_2px_var(--ink)] disabled:cursor-default disabled:opacity-50 ${value ? 'text-ink' : 'text-ink-3'}`}
      >
        <CalendarGlyph />
        {text}
      </button>
      {open &&
        (phone ? (
          <Sheet title={label} onClose={() => setOpen(false)}>
            {body}
          </Sheet>
        ) : (
          <div
            ref={pop}
            id={id}
            role="dialog"
            aria-label={label}
            className="bb-menu absolute top-full left-0 z-20 mt-2 w-[296px] rounded-[16px] bg-page p-3 shadow-sheet ring-1 ring-(--cal-line)"
          >
            {body}
          </div>
        ))}
    </span>
  )
}

/** The month as the calendar draws it, Monday first, and the times under it. */
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
  onDay: (dayN: string) => void
  onTime: (time: string) => void
  shortcuts?: Array<{ key: string; label: string; dayN: string }>
  onClear?: () => void
}) {
  const { weeks } = useBrand()
  const days = React.useMemo(
    () => weeks.flatMap((w) => w.days).map((d) => ({ day: d, info: infoOf(d) })),
    [weeks, infoOf],
  )
  // The day the arrow keys stand on: the picked one, else the first that can be picked.
  const [cursor, setCursor] = React.useState(
    () => value ?? days.find((d) => !d.info.disabled)?.day.n ?? days[0]!.day.n,
  )
  const cells = React.useRef(new Map<string, HTMLButtonElement>())
  React.useEffect(() => {
    cells.current.get(cursor)?.focus()
  }, [cursor])

  function step(by: number) {
    const i = days.findIndex((d) => d.day.n === cursor)
    const next = days[i + by]
    if (next) setCursor(next.day.n)
  }

  return (
    <div className="flex flex-col gap-3">
      {shortcuts && shortcuts.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {shortcuts.map((s) => {
            const on = s.dayN === value
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => onDay(s.dayN)}
                className={`flex h-7 items-center rounded-full px-2.5 text-[12px] transition-colors ${on ? 'bg-ink text-page' : 'bg-surface text-ink-2 hover:text-ink'}`}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      )}
      <div role="group" aria-label={MONTH.title} className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between px-1 pb-1">
          <span className="text-[13px] font-medium">{MONTH.title}</span>
          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="text-[12px] text-ink-3 transition-colors hover:text-ink"
            >
              Clear
            </button>
          ) : (
            <span className="font-mono text-[9.5px] tracking-[0.08em] text-ink-5 uppercase">
              Today 6 Oct
            </span>
          )}
        </div>
        <div aria-hidden="true" className="grid grid-cols-7 text-center">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span key={i} className="font-mono text-[9.5px] text-ink-5">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {days.map(({ day, info }) => {
            const on = day.n === value
            const label = `${dayLabel(weeks, day.n)}${day.today ? ', today' : ''}${info.note ? `, ${info.note}` : ''}`
            return (
              <button
                key={day.n}
                ref={(el) => {
                  if (el) cells.current.set(day.n, el)
                  else cells.current.delete(day.n)
                }}
                type="button"
                aria-label={label}
                aria-pressed={on}
                disabled={info.disabled}
                tabIndex={day.n === cursor ? 0 : -1}
                onFocus={() => setCursor(day.n)}
                onKeyDown={(e) => {
                  const by = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
                  if (!by) return
                  e.preventDefault()
                  step(by)
                }}
                onClick={() => onDay(day.n)}
                className={`relative flex h-9 items-center justify-center rounded-[9px] text-[12.5px] tabular-nums transition-colors outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--ink)] max-md:h-10 max-md:text-[14px] ${
                  on
                    ? 'bg-ink text-page'
                    : info.disabled
                      ? 'text-ink-5'
                      : day.today
                        ? 'font-semibold text-ink hover:bg-surface'
                        : 'text-ink hover:bg-surface'
                }`}
              >
                {day.n}
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
                className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] tabular-nums transition-colors ${on ? 'bg-ink text-page' : 'bg-surface text-ink-2 hover:text-ink'}`}
              >
                {t}
                {t === best && (
                  <span
                    className={`font-mono text-[8.5px] tracking-[0.08em] uppercase ${on ? 'text-page/70' : 'text-(--insight-6)'}`}
                  >
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
