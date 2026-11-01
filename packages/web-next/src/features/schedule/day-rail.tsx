'use client'

import * as React from 'react'

export interface RailDay {
  date: string
  /** "Wed 7", said while the finger is on it and read out by a screen reader. */
  label: string
  /** Something is planned or out on it: its dot is darker. */
  busy: boolean
  today: boolean
}

/** One row of the rail, in px: the finger's place maps to a day by it. */
const ROW = 28

/** A short tick on a phone that has a motor; iOS Safari has none, and says nothing. */
function tick() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(6)
}

/**
 * The week as seven dots down the right edge, today's green. The day being read is a short bar
 * that grows out of its dot. A press on a dot goes to its day; a finger drawn along the dots runs through the
 * week, a tick at each day, with one pill beside the finger that slides with it and names the
 * day. It sits over the list, so the list keeps its width.
 */
export function DayRail({
  days,
  current,
  onPick,
}: {
  days: RailDay[]
  current: number
  onPick: (index: number) => void
}) {
  const rail = React.useRef<HTMLDivElement>(null)
  const [held, setHeld] = React.useState<number | null>(null)
  // The pill keeps its last day while it fades, so it never empties as it goes.
  const [named, setNamed] = React.useState(current)

  const at = (y: number) => {
    const top = rail.current!.getBoundingClientRect().top + 8
    return Math.max(0, Math.min(days.length - 1, Math.floor((y - top) / ROW)))
  }
  const go = (i: number) => {
    if (i === held) return
    setHeld(i)
    setNamed(i)
    tick()
    onPick(i)
  }
  const shown = held ?? current

  return (
    <div
      ref={rail}
      data-rail
      role="tablist"
      aria-label="Days of the week"
      aria-orientation="vertical"
      // The rail takes the finger whole: no scroll and no week swipe start on it.
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        go(at(e.clientY))
      }}
      onPointerMove={(e) => {
        if (held !== null) go(at(e.clientY))
      }}
      onPointerUp={(e) => {
        e.stopPropagation()
        setHeld(null)
      }}
      onPointerCancel={() => setHeld(null)}
      className="fixed top-1/2 right-0 z-30 flex -translate-y-1/2 flex-col py-2 pr-2.5 pl-4 md:hidden"
    >
      {/* A faint track behind the dots while a finger is on them. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 right-1 w-7 rounded-full bg-surface transition-opacity duration-200 ${held !== null ? 'opacity-100' : 'opacity-0'}`}
      />
      {days.map((d, i) => {
        const on = i === shown
        return (
          <button
            key={d.date}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={`${d.label}${d.today ? ', today' : ''}`}
            // The pointer handlers on the rail do the work; the keyboard uses the click.
            onClick={(e) => {
              if (e.detail === 0) onPick(i)
            }}
            className="relative flex items-center justify-end"
            style={{ height: ROW }}
          >
            <span
              aria-hidden="true"
              className={`block h-[5px] rounded-full transition-[width,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${on ? 'w-5 bg-ink' : `w-[5px] ${d.today ? 'bg-(--insight-5)' : d.busy ? 'bg-ink-4' : 'bg-line-strong'}`}`}
            />
          </button>
        )
      })}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute right-9 rounded-full bg-ink px-3 py-1.5 text-[13px] font-medium whitespace-nowrap text-page shadow-soft transition-[transform,opacity] duration-150 ease-out ${held !== null ? 'opacity-100' : 'opacity-0'}`}
        style={{ top: 8 + ROW / 2 - 15, transform: `translateY(${named * ROW}px)` }}
      >
        {days[named]?.label}
      </span>
    </div>
  )
}
