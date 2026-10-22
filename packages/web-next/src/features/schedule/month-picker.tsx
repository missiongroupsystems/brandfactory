'use client'

import * as React from 'react'

import { MONTH_SHORT } from '@/lib/dates'

import { monthTitle } from './month'

/** A month of a year; the month is 0-based. */
export interface YearMonth {
  year: number
  month: number
}

/** What the title's month picker needs: the month shown, today's, the years and the jump. */
export interface MonthPick {
  shown: YearMonth
  today: YearMonth
  /** The first year to pick: the year of the brand's first post. */
  from: number
  /** The last year to pick: next year. */
  to: number
  onPick: (picked: YearMonth) => void
}

/**
 * A year stepper over the twelve months, four to a row. The arrow keys move between the months
 * and on into the year before or after; Enter picks. The year turns with the stepper too.
 */
export function MonthPicker({ shown, today, from, to, onPick }: MonthPick) {
  // A month shown outside the years (stepped past next year) opens the picker on the nearest end.
  const [cursor, setCursor] = React.useState<YearMonth>(() =>
    shown.year > to
      ? { year: to, month: 11 }
      : shown.year < from
        ? { year: from, month: 0 }
        : shown,
  )
  const cells = React.useRef<Array<HTMLButtonElement | null>>([])
  // Focus follows the first open and the arrow keys, not the stepper.
  const moved = React.useRef(true)
  React.useEffect(() => {
    if (moved.current) cells.current[cursor.month]?.focus()
    moved.current = false
  }, [cursor])

  function move(by: number) {
    const at = cursor.year * 12 + cursor.month + by
    const year = Math.floor(at / 12)
    if (year < from || year > to) return
    moved.current = true
    setCursor({ year, month: at - year * 12 })
  }
  const turn = (year: number) => setCursor((c) => ({ ...c, year }))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <YearArrow
          label="Previous year"
          disabled={cursor.year <= from}
          onClick={() => turn(cursor.year - 1)}
          flip
        />
        <span aria-live="polite" className="text-[13px] font-medium tabular-nums">
          {cursor.year}
        </span>
        <YearArrow
          label="Next year"
          disabled={cursor.year >= to}
          onClick={() => turn(cursor.year + 1)}
        />
      </div>
      <div role="group" aria-label={`Months of ${cursor.year}`} className="grid grid-cols-4 gap-1">
        {MONTH_SHORT.map((name, month) => {
          const on = shown.year === cursor.year && shown.month === month
          const now = today.year === cursor.year && today.month === month
          return (
            <button
              key={name}
              ref={(el) => {
                cells.current[month] = el
              }}
              type="button"
              aria-label={`${monthTitle(cursor.year, month).title} ${cursor.year}${now ? ', this month' : ''}`}
              aria-current={on ? 'date' : undefined}
              tabIndex={month === cursor.month ? 0 : -1}
              onFocus={() => setCursor((c) => (c.month === month ? c : { ...c, month }))}
              onKeyDown={(e) => {
                const by = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[e.key]
                if (!by) return
                e.preventDefault()
                move(by)
              }}
              onClick={() => onPick({ year: cursor.year, month })}
              className={`relative flex h-9 items-center justify-center rounded-[9px] text-[12.5px] transition-colors outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--ink)] max-md:h-10 max-md:text-[14px] ${
                on
                  ? 'bg-ink text-page'
                  : now
                    ? 'font-semibold text-ink hover:bg-surface'
                    : 'text-ink-2 hover:bg-surface hover:text-ink'
              }`}
            >
              {name}
              {now && !on && (
                <span className="absolute top-1 right-1.5 size-1 rounded-full bg-ink" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** The desktop title: it names the period and opens the month picker under it. */
export function TitleMonthPicker({ title, pick }: { title: string; pick: MonthPick }) {
  const [open, setOpen] = React.useState(false)
  const root = React.useRef<HTMLDivElement>(null)
  const button = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative">
      <h1 className="font-display text-[38px] leading-none tracking-[-0.035em]">
        <button
          ref={button}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`${title}. Pick a month`}
          onClick={() => setOpen((o) => !o)}
          className="-mx-1.5 rounded-[10px] px-1.5 py-0.5 outline-none transition-colors hover:bg-surface focus-visible:shadow-[0_0_0_2px_var(--ink)]"
        >
          {title}
        </button>
      </h1>
      {open && (
        <div
          role="dialog"
          aria-label="Pick a month"
          className="bb-menu absolute top-full left-0 z-30 mt-2 w-[264px] origin-top-left rounded-[16px] bg-page p-3 shadow-sheet ring-1 ring-(--cal-line)"
        >
          <MonthPicker
            {...pick}
            onPick={(picked) => {
              pick.onPick(picked)
              setOpen(false)
              button.current?.focus()
            }}
          />
        </div>
      )}
    </div>
  )
}

function YearArrow({
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
      className="flex size-7 items-center justify-center rounded-full text-ink-3 transition-colors outline-none hover:bg-surface hover:text-ink focus-visible:shadow-[0_0_0_1.5px_var(--ink)] disabled:opacity-30 disabled:hover:bg-transparent"
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
