import type { SocialPost } from "@brandfactory/shared";
import { localDayKey } from "@brandfactory/shared";

import type { CalendarEvent } from "./api";

// ---------------------------------------------------------------------------
// The grid's arithmetic, and the grouping the cells read
// ---------------------------------------------------------------------------
//
// Pure functions, in their own file and tested, because this is the part of the
// screen a browser pass cannot check: a cell that is one day out looks
// completely normal, and the person who would notice is the one whose shoot
// moved.
//
// `localDayKey` comes from `@brandfactory/shared` rather than being written
// again here — the same key the legacy calendar groups by, for the same
// reason: a calendar is local, and `toISOString().slice(0, 10)` is the shortest
// way to write the bug.

/** Monday-first, matching the header row. */
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/**
 * The days a month's grid renders: the 1st back to the preceding Monday, the
 * last day forward to the following Sunday, always whole weeks.
 *
 * `month` is **0-based**, like `Date.prototype.getMonth`, because every caller
 * gets its value from a `Date`.
 *
 * Days are added by day (`new Date(y, m, d + i)`), never by 86,400,000
 * milliseconds: the latter silently produces a 23- or 25-hour day twice a year
 * and duplicates or skips a cell.
 */
export function monthGridDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  // `getDay()` is Sunday-0; rotate to Monday-0.
  const leading = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Math.ceil((leading + daysInMonth) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => new Date(year, month, 1 - leading + i));
}

/** `{year, month}` moved by whole months, normalised across the year boundary. */
export function shiftMonth(
  cursor: { year: number; month: number },
  delta: number,
): { year: number; month: number } {
  const moved = new Date(cursor.year, cursor.month + delta, 1);
  return { year: moved.getFullYear(), month: moved.getMonth() };
}

/** `October 2026` — the navigator's label. */
export function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(
    new Date(year, month, 1),
  );
}

/**
 * The `from`/`to` the two reads are asked for: the whole grid, not the month.
 *
 * A "September" screen draws days of August and October, and an event in those
 * cells is as real as one in the middle of the month. Asking for the month
 * alone is the off-by-one nobody sees.
 */
export function gridRange(year: number, month: number): { from: string; to: string } {
  const days = monthGridDays(year, month);
  return { from: localDayKey(days[0]!), to: localDayKey(days[days.length - 1]!) };
}

/** Local midnight of the Monday on or before `date`. */
export function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** The seven days from a Monday, added by day for the same DST reason as the month grid. */
export function weekDays(monday: Date): Date[] {
  return Array.from(
    { length: 7 },
    (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i),
  );
}

/** A Monday moved by whole weeks. */
export function shiftWeek(monday: Date, delta: number): Date {
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + delta * 7);
}

/**
 * The month whose grid a week is read from: **the month its Thursday is in.**
 *
 * The two reads are asked for a month's grid range, and a month's grid holds every whole week
 * that touches it. A week's Thursday always lies in a month the week touches, so that month's
 * range always contains all seven days — including the week of 28 September to 4 October, which
 * the September grid holds and the October grid holds too. Choosing by Monday would be equally
 * safe here; Thursday is the ISO rule, and it keeps the label and the data on the same month.
 */
export function monthOfWeek(monday: Date): { year: number; month: number } {
  const thursday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3);
  return { year: thursday.getFullYear(), month: thursday.getMonth() };
}

/** `28 Sept – 4 Oct 2026`, or `12 – 18 Oct 2026` inside one month. */
export function weekLabel(monday: Date): string {
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric" });
  const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
  const full = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const start =
    monday.getMonth() === sunday.getMonth() && monday.getFullYear() === sunday.getFullYear()
      ? day.format(monday)
      : dayMonth.format(monday);
  return `${start} – ${full.format(sunday)}`;
}

/** Entries bucketed by local day key. Unscheduled rows are absent, not grouped under a key. */
export function entriesByDay(entries: SocialPost[]): Map<string, SocialPost[]> {
  const byDay = new Map<string, SocialPost[]>();
  for (const entry of entries) {
    if (entry.scheduledAt === null) continue;
    const key = localDayKey(new Date(entry.scheduledAt));
    if (!key) continue;
    const bucket = byDay.get(key);
    if (bucket) bucket.push(entry);
    else byDay.set(key, [entry]);
  }
  return byDay;
}

/**
 * Events bucketed by every local day they cover, so a ten-day festival appears
 * in ten cells rather than only on the day it began.
 *
 * Capped at 40 days per event: a run-away range in the source would otherwise
 * write into every cell of every month the reader visits. Nothing the events
 * team books is longer, and an event that is has a data problem worth seeing
 * truncated rather than a calendar worth flooding.
 */
export function eventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const byDay = new Map<string, CalendarEvent[]>();
  const push = (key: string, event: CalendarEvent) => {
    const bucket = byDay.get(key);
    if (bucket) bucket.push(event);
    else byDay.set(key, [event]);
  };
  for (const event of events) {
    const start = new Date(event.start);
    if (Number.isNaN(start.getTime())) continue;
    const end = event.end ? new Date(event.end) : start;
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = Number.isNaN(end.getTime()) ? cursor : end;
    for (let i = 0; i < 40; i += 1) {
      if (cursor.getTime() > last.getTime()) break;
      push(localDayKey(cursor), event);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return byDay;
}

/**
 * An entry with no copy and no plan is an **empty slot** — a date and a
 * platform somebody claimed so the gap shows three weeks out rather than the
 * night before.
 *
 * `body === ''` already meant this before the pipeline existed; the plan
 * fields join it, because a slot with a hook written into it is no longer
 * empty even if the copy is not drafted.
 */
export function isEmptySlot(entry: SocialPost): boolean {
  return (
    entry.status === "idea" &&
    entry.body.trim() === "" &&
    entry.hook === null &&
    entry.format === null &&
    entry.dish === null
  );
}

export interface MonthSummary {
  entries: number;
  shoots: number;
  events: number;
  emptySlots: number;
  /** Counted per status, in pipeline order, for the legend. */
  byStatus: Record<SocialPost["status"], number>;
}

/**
 * What the strip above the grid says.
 *
 * **Counts, never targets.** The workshop set no cadence and nobody has said
 * how many posts a brand owes in a week, so a number here that implied a quota
 * would be inventing a rule the team never agreed to.
 */
export function summarise(entries: SocialPost[], events: CalendarEvent[]): MonthSummary {
  const byStatus: MonthSummary["byStatus"] = {
    idea: 0,
    approved: 0,
    filming: 0,
    editing: 0,
    posted: 0,
  };
  let shoots = 0;
  let emptySlots = 0;
  for (const entry of entries) {
    byStatus[entry.status] += 1;
    if (entry.kind === "shoot") shoots += 1;
    if (isEmptySlot(entry)) emptySlots += 1;
  }
  return { entries: entries.length, shoots, events: events.length, emptySlots, byStatus };
}
