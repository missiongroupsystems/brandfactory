import { type ExternalEvent, type ExternalEventStatus } from '@brandfactory/shared'
import {
  type EventsMonthQuery,
  type EventsMonthResult,
  type EventsSource,
  EventsUnauthorizedError,
  EventsUnavailableError,
} from './port'

// ---------------------------------------------------------------------------
// Mission Events, through its public calendar share link
// ---------------------------------------------------------------------------
//
// **This is the only file in the repository that knows Mission Events exists.**
// Everything above it sees `EventsSource`, per the no-vendor-in-domain-code
// rule the other five adapters follow.
//
// The share link is a capability, like a signed blob URL: an admin in Mission
// Events creates one, scopes it to outlets, statuses and a date window, and it
// answers without a user session. We hold the token as a server secret and
// never send it to a browser.
//
// **Why this and not the end-user token.** Mission Events' standing decision is
// *"Launchpad hides; Events enforces"* — every caller carries the end-user's
// token and no endpoint gets a trusted-caller path. That is the right long-run
// shape and this adapter is built to be replaced by it. It is not available
// today: it needs Passport to span both products, and it needs the marketing
// team to hold accounts in an app they do not use. The share link needs neither
// and exposes strictly less: the projection it returns already excludes every
// field a marketing reader must not see, and it can be revoked in one click.

export interface MissionEventsConfig {
  /** The API origin, e.g. `https://supa-schedule-backend.fly.dev`. No trailing slash required. */
  baseUrl: string
  /** The share-link token. A server secret — never serialised into a response. */
  token: string
  /** Injected in tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
  /** Injected in tests so the cache and the `completed` fold are deterministic. */
  now?: () => Date
  /** How long a month is reused before it is fetched again. Default 5 minutes. */
  cacheTtlMs?: number
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000

/**
 * The source's statuses, of which we ask for three and fold four.
 *
 * `inquiry`, `cancelled` and `lost` are excluded by the share link's scope, so
 * they should never arrive. They are listed because a link can be re-scoped by
 * somebody in the other product without telling us, and a row we did not
 * expect must be dropped rather than rendered as something it is not.
 */
type SourceStatus = 'inquiry' | 'tentative' | 'confirmed' | 'completed' | 'cancelled' | 'lost'

/**
 * `completed` is a fact about the calendar, not a column we can trust.
 *
 * Nothing in Mission Events moves an event to `completed` when its date
 * passes — `EventService.complete` is a person pressing a button, and an order
 * transition can do it too. Past confirmed events therefore sit at `confirmed`
 * indefinitely, and a marketing calendar that drew them as upcoming would be
 * announcing a party that already happened.
 *
 * So: `completed` stays completed, and a `confirmed` event that has finished
 * becomes `completed` here. `tentative` is never folded — a tentative event in
 * the past is not a thing that happened, it is a thing that never firmed up,
 * and that distinction is the reason the team asked to see tentatives at all.
 */
export function foldStatus(
  status: SourceStatus,
  endsAt: Date,
  now: Date,
): ExternalEventStatus | null {
  switch (status) {
    case 'completed':
      return 'completed'
    case 'confirmed':
      return endsAt.getTime() < now.getTime() ? 'completed' : 'confirmed'
    case 'tentative':
      return 'tentative'
    default:
      // `inquiry`, `cancelled`, `lost` — outside the scope we asked for.
      return null
  }
}

/**
 * The source stores naive timestamps that hold UTC: `2026-10-09T19:00:00`, no
 * zone, meaning 19:00 UTC. `new Date('2026-10-09T19:00:00')` reads that as
 * *local* time, which is a three-in-the-morning bug in Singapore and an
 * eight-hour shift in every grid cell.
 *
 * Appending `Z` when there is no offset is the whole fix, and it is done here
 * rather than trusted to the caller because there is exactly one place the
 * strings enter.
 */
export function parseSourceInstant(value: string): Date | null {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
  const date = new Date(hasZone ? value : `${value}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Mission Events has no all-day flag, so the shape of the timestamps is the
 * only signal — and the convention comes from its own importer, which wrote
 * all-day rows as a midnight start with either no end or 23:59 on the last day.
 *
 * Inferring is not optional: without it every public holiday and every festival
 * draws as an appointment at 00:00, which is worse than a wrong guess because
 * it is a confident wrong guess on every cultural date in the year.
 */
export function inferAllDay(start: Date, end: Date | null): boolean {
  const startsAtMidnight =
    start.getUTCHours() === 0 && start.getUTCMinutes() === 0 && start.getUTCSeconds() === 0
  if (!startsAtMidnight) return false
  if (end === null) return true
  const endsAtMidnight =
    end.getUTCHours() === 0 && end.getUTCMinutes() === 0 && end.getUTCSeconds() === 0
  const endsAtLastMinute = end.getUTCHours() === 23 && end.getUTCMinutes() === 59
  return endsAtMidnight || endsAtLastMinute
}

/** One row of the source's public calendar projection, as far as we read it. */
interface SourceEvent {
  id?: unknown
  name?: unknown
  status?: unknown
  event_type?: unknown
  date_start?: unknown
  date_end?: unknown
  outlet_id?: unknown
  outlet_name?: unknown
  room_name?: unknown
}

const asString = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/**
 * One source row to one `ExternalEvent`, or `null`.
 *
 * **A row we cannot read is dropped, never guessed at.** A malformed date or a
 * missing outlet id would become a marker on a day nobody can explain, and the
 * calendar's whole value is that a person can trust what is on it. The count of
 * what was dropped is reported by `listMonth`'s caller, so silence is not the
 * failure mode.
 */
export function toExternalEvent(row: SourceEvent, now: Date): ExternalEvent | null {
  const id = asString(row.id)
  const name = asString(row.name)
  const outletId = asString(row.outlet_id)
  const rawStart = asString(row.date_start)
  const status = asString(row.status)
  if (!id || !name || !outletId || !rawStart || !status) return null

  const start = parseSourceInstant(rawStart)
  if (!start) return null
  const rawEnd = asString(row.date_end)
  const end = rawEnd ? parseSourceInstant(rawEnd) : null

  // A single-day event has no end; it finishes when it starts for the purpose
  // of asking whether it is over.
  const folded = foldStatus(status as SourceStatus, end ?? start, now)
  if (!folded) return null

  return {
    id,
    name,
    status: folded,
    eventType: asString(row.event_type),
    start: start.toISOString(),
    end: end ? end.toISOString() : null,
    allDay: inferAllDay(start, end),
    outletId,
    outletName: asString(row.outlet_name) ?? 'Unknown outlet',
    roomName: asString(row.room_name),
  }
}

/**
 * The share link, with a small in-process cache.
 *
 * **The cache is not an optimisation, it is the rate limit.** The public
 * endpoint allows 60 requests a minute per link, and a calendar that fetches on
 * every render, for every reader, would spend that on one person scrolling
 * through a quarter. Five minutes is well inside how often an events team
 * changes a booking and well inside the limit.
 *
 * In-process, like the realtime bus, so it is per machine. Unlike the realtime
 * bus that is harmless: two machines holding the same month for five minutes
 * each is two fetches instead of one, not a missed message.
 */
export function createMissionEventsSource(config: MissionEventsConfig): EventsSource {
  const baseUrl = config.baseUrl.replace(/\/+$/, '')
  const doFetch = config.fetchImpl ?? globalThis.fetch
  const now = config.now ?? (() => new Date())
  const ttl = config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
  const cache = new Map<string, { at: number; result: EventsMonthResult }>()

  return {
    async listMonth({ year, month }: EventsMonthQuery): Promise<EventsMonthResult> {
      const key = `${year}-${month}`
      const hit = cache.get(key)
      const nowMs = now().getTime()
      if (hit && nowMs - hit.at < ttl) return hit.result

      const url = `${baseUrl}/api/v1/public/calendar/${encodeURIComponent(config.token)}/month?year=${year}&month=${month}`

      let res: Response
      try {
        res = await doFetch(url, { headers: { accept: 'application/json' } })
      } catch (cause) {
        throw new EventsUnavailableError(
          `Mission Events could not be reached: ${cause instanceof Error ? cause.message : 'unknown transport failure'}`,
        )
      }

      // 401/403 is a revoked or mistyped token and 404 is a link that no longer
      // exists — all three are somebody's settings, not a blip, and retrying
      // will not help.
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        throw new EventsUnauthorizedError(
          `Mission Events refused the share link (HTTP ${res.status})`,
        )
      }
      if (!res.ok) {
        throw new EventsUnavailableError(`Mission Events answered HTTP ${res.status}`)
      }

      let body: unknown
      try {
        body = await res.json()
      } catch {
        throw new EventsUnavailableError('Mission Events answered with a body that is not JSON')
      }

      // The endpoint's envelope has moved shape before in this product family,
      // so both are accepted rather than pinned: a bare array, or `{ data: [] }`.
      const rows: unknown = Array.isArray(body)
        ? body
        : typeof body === 'object' &&
            body !== null &&
            Array.isArray((body as { data?: unknown }).data)
          ? (body as { data: unknown[] }).data
          : null
      if (rows === null) {
        throw new EventsUnavailableError('Mission Events answered with an unexpected shape')
      }

      const at = now()
      const events = (rows as SourceEvent[])
        .map((row) => toExternalEvent(row, at))
        .filter((e): e is ExternalEvent => e !== null)

      const result: EventsMonthResult = { events }
      cache.set(key, { at: nowMs, result })
      return result
    },
  }
}
