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
/** The rail's own padding above the first row. */
const PAD = 8

/** A short tick on a phone that has a motor; iOS Safari has none, and says nothing. */
function tick() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(6)
}

/** How much a dot swells under the finger: most at the finger, back to none two rows away. */
const swell = (rows: number) => 1 + 0.7 * Math.exp(-(rows * rows) / 1.4)

/**
 * The week as seven dots down the right edge, today's green. The day being read is a short bar
 * that grows out of its dot. A press on a dot goes to its day; a finger drawn along the dots runs
 * through the week: the dots near the finger swell as it passes, a tick marks each day, and one
 * pill beside the finger springs from day to day and names it. Nothing frames it at rest.
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
  // Where the finger is, in rows from the first dot's middle: the dots swell around it.
  const [finger, setFinger] = React.useState<number | null>(null)
  // The pill keeps its last day while it fades, so it never empties as it goes.
  const [named, setNamed] = React.useState(current)

  const rowsAt = (y: number) => (y - rail.current!.getBoundingClientRect().top - PAD) / ROW - 0.5
  const go = (y: number) => {
    const rows = rowsAt(y)
    setFinger(rows)
    const i = Math.max(0, Math.min(days.length - 1, Math.round(rows)))
    if (i === held) return
    setHeld(i)
    setNamed(i)
    tick()
    onPick(i)
  }
  const end = () => {
    setHeld(null)
    setFinger(null)
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
      style={{ touchAction: 'none', paddingTop: PAD, paddingBottom: PAD }}
      onPointerDown={(e) => {
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        go(e.clientY)
      }}
      onPointerMove={(e) => {
        if (held !== null) go(e.clientY)
      }}
      onPointerUp={(e) => {
        e.stopPropagation()
        end()
      }}
      onPointerCancel={end}
      className="fixed top-1/2 right-0 z-30 flex -translate-y-1/2 flex-col pr-3 pl-5 md:hidden"
    >
      {days.map((d, i) => {
        const on = i === shown
        const grow = finger === null ? 1 : swell(i - finger)
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
            className="flex items-center justify-end"
            style={{ height: ROW }}
          >
            <span
              aria-hidden="true"
              className="flex origin-right justify-end transition-transform duration-150 ease-out motion-reduce:transition-none"
              style={{ transform: `scale(${grow})` }}
            >
              <span
                className={`block h-[6px] rounded-full transition-[width,background-color,opacity] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${on ? 'w-[22px] bg-ink' : `w-[6px] ${d.today ? 'bg-(--insight-5)' : d.busy ? 'bg-ink-3 opacity-70' : 'bg-ink-5 opacity-60'}`}`}
              />
            </span>
          </button>
        )
      })}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute right-12 rounded-full bg-ink/90 px-3.5 py-[7px] text-[13px] font-semibold tracking-[-0.01em] whitespace-nowrap text-page shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)] backdrop-blur-md transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] motion-reduce:transition-none ${held !== null ? 'opacity-100' : 'opacity-0'}`}
        style={{
          top: PAD + ROW / 2 - 15,
          transform: `translateY(${named * ROW}px) translateX(${held !== null ? 0 : 8}px) scale(${held !== null ? 1 : 0.92})`,
        }}
      >
        {days[named]?.label}
      </span>
    </div>
  )
}
