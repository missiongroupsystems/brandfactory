import type { CalendarEvent, Week } from '@/data/demo'
import type { CrewMember, Reply, Shoot } from '@/data/shoots'

/**
 * The shoot rules, apart from React: how a shoot reads on the calendar, which day a new one
 * takes, what a new start time does to its end, and how the crew answered the invite.
 */

/** "12:00–17:00". */
export const timeRange = (s: Pick<Shoot, 'start' | 'end'>) => `${s.start}–${s.end}`

/**
 * What the calendar prints: what it is, where, and when it starts, "Shoot · Raffles City · 12:00".
 * The place comes before the time so a narrow chip cuts the time, not the place; the call sheet
 * has the full range.
 */
export const eventText = (s: Shoot) => `Shoot · ${s.title} · ${s.start}`

const minutes = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h! * 60 + m!
}
const clock = (min: number) => {
  const m = Math.min(Math.max(min, 0), 23 * 60 + 30)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** A new start keeps the shoot's length: 12:00–17:00 moved to 14:00 ends at 19:00. */
export function moveStart(s: Pick<Shoot, 'start' | 'end'>, start: string) {
  return { start, end: clock(minutes(start) + minutes(s.end) - minutes(s.start)) }
}

/** An end at or before the start is no shoot: the end moves to an hour after the start. */
export function setEnd(s: Pick<Shoot, 'start'>, end: string) {
  return { end: minutes(end) > minutes(s.start) ? end : clock(minutes(s.start) + 60) }
}

/** The start times a picker offers, every half hour of a working day. */
export const SHOOT_TIMES = Array.from({ length: 31 }, (_, i) => clock(7 * 60 + i * 30))

/**
 * The month with the shoots as its Shoot events. The calendar's own Shoot events are the seed's;
 * the shoots replace them, so a shoot planned, moved or retimed shows where it is now, with its
 * time, and opens its call sheet.
 */
export function withShoots(weeks: Week[], shoots: Shoot[]): Week[] {
  return weeks.map((week) => {
    const here = shoots.flatMap((s): CalendarEvent[] => {
      const col = week.days.findIndex((d) => d.n === s.dayN && !d.outside)
      return col === -1
        ? []
        : [{ layer: 'shoot', text: eventText(s), col: col + 1, span: 1, shootId: s.id }]
    })
    return { ...week, events: [...week.events.filter((e) => e.layer !== 'shoot'), ...here] }
  })
}

/** The day a new shoot takes: the first day ahead with no shoot on it, else the last day. */
export function freeShootDay(weeks: Week[], shoots: Shoot[]): string {
  const ahead = weeks.flatMap((w) => w.days).filter((d) => !d.past && !d.today)
  const taken = new Set(shoots.map((s) => s.dayN))
  return (ahead.find((d) => !taken.has(d.n)) ?? ahead[ahead.length - 1]!).n
}

/**
 * The answers of the people invited, in one line: "2 going · 1 can't make it · 1 no reply". A
 * count of zero is left out, so a sheet everyone said yes to reads "4 going".
 */
export function replySummary(invited: string[], replies: Record<string, Reply>): string {
  const count = (reply?: Reply) => invited.filter((n) => replies[n] === reply).length
  const parts: Array<[number, string]> = [
    [count('going'), 'going'],
    [count('cant'), "can't make it"],
    [count(undefined), 'no reply'],
  ]
  return parts
    .filter(([n]) => n > 0)
    .map(([n, words]) => `${n} ${words}`)
    .join(' · ')
}

/**
 * Who came to the brand's shoots, as the crew field offers them: the most shoots first, each with
 * the role they had last, then the people of earlier months. It reads the live shoots, so a
 * person added today is offered on the next shoot.
 */
export function pastCrew(shoots: Shoot[], earlier: CrewMember[]) {
  const seen = new Map<string, CrewMember & { shoots: number }>()
  for (const c of shoots.flatMap((s) => s.crew)) {
    seen.set(c.name, { ...c, shoots: (seen.get(c.name)?.shoots ?? 0) + 1 })
  }
  for (const c of earlier) if (!seen.has(c.name)) seen.set(c.name, { ...c, shoots: 0 })
  return [...seen.values()].sort((a, b) => b.shoots - a.shoots)
}

/** The addresses shoots went to: the brand's own room, this month's places, then earlier ones. */
export function pastPlaces(home: string, shoots: Shoot[], earlier: string[]) {
  return [...new Set([home, ...shoots.map((s) => s.place), ...earlier])].map((place) => ({
    place,
    shoots: shoots.filter((s) => s.place === place).length,
  }))
}
