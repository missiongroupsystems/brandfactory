'use client'

import * as React from 'react'

import { usePhone } from '@/components/use-phone'
import type { Day, Week } from '@/data/demo'
import { dayNumber } from '@/lib/dates'

import { DayRail } from './day-rail'

import { itemsOf } from './calendar-items'
import {
  EventChips,
  IdeaRow,
  LookBar,
  MenuChoice,
  PostRow,
  StoriesRow,
  TodayPill,
  useMovePost,
  useSwipe,
  type LookProps,
  WEEKDAY,
  eventsOn,
} from './look-parts'
import { MonthPicker } from './month-picker'
import { NewMenu } from './new-menu'
import { PhoneFilters } from './phone-filters'
import { useBrand } from './posts-store'
import { storiesOf } from './stories'

const reduced = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Scrolls the window to a place by easing a part of the way each frame, so a new place given
 * mid-way bends the motion instead of restarting it. A touch or a wheel on the page stops it.
 */
function useGlide() {
  const target = React.useRef(0)
  const frame = React.useRef(0)
  React.useEffect(() => {
    // The rail's own finger is what moves the target: only a touch elsewhere stops the glide.
    const stop = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('[data-rail]')) return
      cancelAnimationFrame(frame.current)
      frame.current = 0
    }
    window.addEventListener('wheel', stop, { passive: true })
    window.addEventListener('touchmove', stop, { passive: true })
    return () => {
      cancelAnimationFrame(frame.current)
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchmove', stop)
    }
  }, [])
  return React.useCallback((y: number) => {
    target.current = Math.max(0, Math.min(y, document.documentElement.scrollHeight - innerHeight))
    if (reduced()) return window.scrollTo(0, target.current)
    if (frame.current) return
    const step = () => {
      const now = window.scrollY
      const left = target.current - now
      if (Math.abs(left) < 0.5) {
        window.scrollTo(0, target.current)
        frame.current = 0
        return
      }
      window.scrollTo(0, now + left * 0.18)
      frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
  }, [])
}

/**
 * Look A, the agenda: the week as one list, a day after a day, each post a row with its time and
 * stage. Seven dots down the right edge are the week (`DayRail`): the day being read is a bar, a
 * press or a finger drawn along them goes to a day, a swipe on the list steps the week. The title switches to the whole month, which lists its days the same way.
 * There is no day view: a day is a section of the list.
 */
export function LookAgenda({
  weeks,
  week,
  day,
  view,
  title,
  monthPick,
  layers,
  stages,
  failed,
  atToday,
  onView,
  onSelect,
  onStep,
  onToday,
  onOpenPost,
  onNewPost,
  shootDay,
  onOpenStories,
  onStages,
  onLayers,
}: LookProps) {
  const { brand, library, byId } = useBrand()
  const items = (d: Day) => itemsOf(d, byId, stages)
  const stories = (d: Day) => storiesOf(d.date, items(d), brand.id, library, byId)
  // The agenda has no day view: a day is a section. The place still steps by week. Only a phone
  // shows this look, so only a phone moves the place.
  const phone = usePhone()
  React.useEffect(() => {
    if (phone && view === 'day') onView('week')
  }, [phone, view, onView])
  const whole = view === 'month'
  const shownWeek = weeks[Math.min(week, weeks.length - 1)]!
  const shown: Array<{ w: Week; wi: number }> = whole
    ? weeks.map((w, wi) => ({ w, wi }))
    : [{ w: shownWeek, wi: week }]
  const days = shown.flatMap((s) => s.w.days)
  const move = useMovePost(days, (d) => items(d).posts)
  const swipe = useSwipe(onStep, !move.moving)
  const sections = React.useRef(new Map<string, HTMLElement | null>())

  // While a finger runs down the rail the list keeps up at once; a lift or a press glides.
  const glide = useGlide()
  // Today, pressed from another week: once that week shows, the list goes to today.
  const toToday = React.useRef(false)
  React.useEffect(() => {
    if (!toToday.current) return
    toToday.current = false
    const today = shownWeek.days.find((d) => d.today)
    const el = today && sections.current.get(today.date)
    if (el) glide(el.getBoundingClientRect().top + window.scrollY - 8)
  }, [shownWeek, glide])
  // A press or a finger on the rail: the list glides to the day, and keeps gliding to the next
  // one while the finger moves on, rather than jumping from day to day.
  const jump = (wi: number, di: number, date: string) => {
    onSelect(wi, di)
    pinned.current = true
    readRef.current = di
    setReading(di)
    const el = sections.current.get(date)
    if (el) glide(el.getBoundingClientRect().top + window.scrollY - 8)
  }

  // The day being read: the last section whose heading has reached the top of the window.
  const [reading, setReading] = React.useState(day)
  const readRef = React.useRef(day)
  const readDay = shownWeek.days[reading] ?? shownWeek.days[day]!
  const pinned = React.useRef(false)
  React.useEffect(() => {
    const release = (e: Event) => {
      if (!(e.target as Element | null)?.closest?.('[data-rail]')) pinned.current = false
    }
    window.addEventListener('wheel', release, { passive: true })
    window.addEventListener('touchmove', release, { passive: true })
    return () => {
      window.removeEventListener('wheel', release)
      window.removeEventListener('touchmove', release)
    }
  }, [])
  React.useEffect(() => {
    if (whole) return
    let frame = 0
    const read = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        let at = 0
        shownWeek.days.forEach((d, di) => {
          const top = sections.current.get(d.date)?.getBoundingClientRect().top
          if (top !== undefined && top <= 140) at = di
        })
        // A day picked on the rail stays read while the list cannot bring it to the top (the
        // week's last days); the reader's own scroll lets it go.
        if (pinned.current) return
        if (at !== readRef.current) {
          readRef.current = at
          setReading(at)
        }
      })
    }
    read()
    window.addEventListener('scroll', read, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', read)
    }
  }, [whole, shownWeek])

  let i = 0
  const section = (d: Day, w: Week, wi: number, di: number) => {
    const it = items(d)
    const s = stories(d)
    const events = eventsOn(w, di, (e) => layers[e.layer])
    const empty = it.posts.length === 0 && it.ideas.length === 0 && s.length === 0
    const target = move.over === d.date && move.canTake(d)
    const delay = Math.min(i++, 8) * 35
    return (
      <section
        key={d.date}
        ref={(el) => {
          sections.current.set(d.date, el)
        }}
        data-drop={d.date}
        aria-label={`${WEEKDAY[di]} ${dayNumber(d.date)}`}
        className={`-mx-2 scroll-mt-2 rounded-[14px] px-2 transition-[background-color,box-shadow] ${empty ? 'py-1' : 'py-3'} ${target ? 'bg-(--cal-drop) shadow-[inset_0_0_0_1.5px_var(--ink)]' : ''}`}
      >
        {empty && !d.past ? (
          <button
            type="button"
            onClick={() => onNewPost(d.date)}
            aria-label={`${WEEKDAY[di]} ${dayNumber(d.date)}, nothing planned. New post`}
            className="bb-rise flex h-10 w-full items-center gap-2 text-[15px] font-medium text-ink-4"
            style={{ animationDelay: `${delay}ms` }}
          >
            {WEEKDAY[di]!.slice(0, 3)} {dayNumber(d.date)}
            {d.today && <span className="text-[13px] font-medium text-ink-4">Today</span>}
          </button>
        ) : (
          <h2
            className={`bb-rise flex h-10 items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] ${d.past ? 'text-ink-4' : ''} ${empty ? 'text-[15px] font-medium text-ink-4' : ''}`}
            style={{ animationDelay: `${delay}ms` }}
          >
            {WEEKDAY[di]!.slice(0, 3)} {dayNumber(d.date)}
            {d.today && <span className="text-[13px] font-medium text-ink-4">Today</span>}
          </h2>
        )}
        {(events.length > 0 || !empty) && (
          <div className="flex flex-col">
            {events.length > 0 && (
              <div className="bb-rise pt-0.5 pb-1.5" style={{ animationDelay: `${delay}ms` }}>
                <EventChips events={events} />
              </div>
            )}
            {it.posts.map((post) => (
              <PostRow
                key={post.id}
                post={post}
                dim={move.moving === post.id}
                landed={move.landed === post.id}
                delay={delay}
                onOpen={() => onOpenPost(post.id)}
                onPointerDown={move.lift(post, '[data-photo]')}
              />
            ))}
            <StoriesRow stories={s} delay={delay} onOpen={() => onOpenStories(d.date)} />
            {it.ideas.map((mark) => (
              <IdeaRow key={mark.hook} mark={mark} date={d.date} delay={delay} />
            ))}
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="flex flex-col">
      <LookBar
        title={title}
        label="Change the span or the month"
        menu={(close) => (
          <>
            <div role="menu" aria-label="Span" className="flex flex-col">
              <MenuChoice
                checked={!whole}
                onClick={() => {
                  onView('week')
                  close()
                }}
              >
                This week
              </MenuChoice>
              <MenuChoice
                checked={whole}
                onClick={() => {
                  onView('month')
                  close()
                }}
              >
                Whole month
              </MenuChoice>
            </div>
            <div className="mx-1.5 mt-1.5 border-t border-(--cal-line) px-1 pt-3 pb-2">
              <MonthPicker
                {...monthPick}
                onPick={(picked) => {
                  monthPick.onPick(picked)
                  close()
                }}
              />
            </div>
          </>
        )}
      >
        {!atToday && (
          <TodayPill
            onClick={() => {
              toToday.current = true
              onToday()
            }}
          />
        )}
        <PhoneFilters
          failed={failed}
          stages={stages}
          layers={layers}
          onStages={onStages}
          onLayers={onLayers}
        />
        <NewMenu
          compact
          onPost={(format) => onNewPost(readDay.past ? undefined : readDay.date, undefined, format)}
          shootDay={shootDay}
        />
      </LookBar>

      {!whole && (
        <DayRail
          days={shownWeek.days.map((d, di) => ({
            date: d.date,
            label: `${WEEKDAY[di]!.slice(0, 3)} ${dayNumber(d.date)}`,
            busy: items(d).posts.length > 0 || stories(d).length > 0 || items(d).ideas.length > 0,
            today: Boolean(d.today),
          }))}
          current={reading}
          onPick={(di) => jump(week, di, shownWeek.days[di]!.date)}
        />
      )}
      <div {...swipe} className={`flex flex-col pl-4 ${whole ? 'pr-4' : 'pr-11'}`}>
        <div
          key={`${view}-${weeks[0]!.label}-${whole ? '' : week}`}
          className="flex flex-col pt-1 pb-6"
        >
          {shown.map(({ w, wi }) => w.days.map((d, di) => section(d, w, wi, di)))}
        </div>
      </div>
    </div>
  )
}
