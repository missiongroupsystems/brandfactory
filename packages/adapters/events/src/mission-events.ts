import { type ExternalEvent, type ExternalEventStatus } from '@brandfactory/shared'
import {
  type EventsOutlet,
  type EventsRangeQuery,
  type EventsRangeResult,
  type EventsSource,
  EventsUnauthorizedError,
  EventsUnavailableError,
} from './port'

// ---------------------------------------------------------------------------
// Mission Events, through the service endpoint they built for this
// ---------------------------------------------------------------------------
//
// **This is the only file in the repository that knows Mission Events exists.**
// Everything above it sees `EventsSource`, per the no-vendor-in-domain-code rule
// the other five adapters follow.
//
// It reads two endpoints under `/api/v1/internal/marketing/`, guarded by
// `X-Service-Key` — the same shared-secret pattern their `internal.py` already
// used for cron. Purpose-built for this integration rather than borrowed from
// the public calendar share link, which exists so a venue can put a calendar on
// a website: its scope, projection and rate limit were designed for that reader,
// and it could be re-scoped by somebody with no idea we depended on it.
//
// **Nothing is stored.** The content calendar asks for the window it is drawing
// and renders the answer. That is not only simpler, it is the only correct
// option available: a soft-deleted event simply drops out of results and no
// endpoint reports tombstones, so a copy here could never learn that a booking
// had gone. Mission Events say so themselves, and add that some status-change
// paths do not touch `updated_at` — which is why the field is read and carried
// but **not** used to drive incremental reads.

const MAX_PAGE = 500

/** How long a range is reused before it is fetched again. */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000

/** How long the outlet list is reused. Outlets change when a venue opens. */
const OUTLETS_CACHE_TTL_MS = 60 * 60 * 1000

export interface MissionEventsConfig {
  /** The API origin, e.g. `https://supa-schedule-backend.fly.dev`. */
  baseUrl: string
  /** The `X-Service-Key`. A server secret — never serialised into a response. */
  serviceKey: string
  /** Injected in tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
  /** Injected in tests so the cache and the `completed` fold are deterministic. */
  now?: () => Date
  cacheTtlMs?: number
}

/**
 * The statuses we ask for, and the three the calendar draws.
 *
 * All three are requested explicitly rather than relying on the endpoint's
 * default, so a change to that default cannot silently alter what a marketing
 * reader sees. `completed` is asked for **because nothing auto-completes**:
 * Mission Events confirm a finished event stays `confirmed` until a person
 * moves it, so both have to arrive for the fold below to be able to do its job.
 */
const REQUESTED_STATUSES = ['tentative', 'confirmed', 'completed'] as const

type SourceStatus = 'inquiry' | 'tentative' | 'confirmed' | 'completed' | 'cancelled' | 'lost'

/**
 * `completed` is a fact about the calendar, not a column we can trust.
 *
 * Nothing in Mission Events moves an event to `completed` when its date passes
 * — a person does, or an order transition does, and they confirmed it. So a
 * `confirmed` event that finished last month is still `confirmed` at the
 * source, and a marketing calendar that drew it as upcoming would be
 * announcing a party that already happened.
 *
 * `tentative` is never folded. A tentative event in the past is not a thing
 * that happened, it is a thing that never firmed up, and that distinction is
 * the reason the team asked to see tentatives at all.
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
      // `inquiry`, `cancelled`, `lost` — outside what we asked for.
      return null
  }
}

/**
 * The source stores naive timestamps that hold UTC: `2026-10-09T19:00:00`, no
 * zone, meaning 19:00 UTC. `new Date('2026-10-09T19:00:00')` reads that as
 * *local* time, which is an eight-hour shift for a reader in Singapore.
 *
 * Appending `Z` when there is no offset is the whole fix, and it happens here
 * because there is exactly one place these strings enter.
 */
export function parseSourceInstant(value: string): Date | null {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
  const date = new Date(hasZone ? value : `${value}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

interface SourceEvent {
  id?: unknown
  name?: unknown
  status?: unknown
  event_type?: unknown
  date_start?: unknown
  date_end?: unknown
  is_all_day?: unknown
  outlet_id?: unknown
  outlet_slug?: unknown
  outlet_name?: unknown
  room_name?: unknown
  guest_count?: unknown
}

const asString = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const asInt = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null

/**
 * One source row to one `ExternalEvent`, or `null`.
 *
 * **A row we cannot read is dropped, never guessed at.** A malformed date or a
 * missing outlet id would become a marker on a day nobody can explain, and the
 * calendar's whole value is that a person can trust what is on it.
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
    // **Reported, not inferred.** The first cut of this adapter tested for a
    // midnight start in UTC, which would have called an all-day 1 October
    // event (stored `2026-09-30T16:00:00`) neither all-day nor October.
    allDay: row.is_all_day === true,
    outletId,
    outletName: asString(row.outlet_name) ?? asString(row.outlet_slug) ?? 'Unknown outlet',
    roomName: asString(row.room_name),
    guestCount: asInt(row.guest_count),
  }
}

/** The envelope every list endpoint there uses. */
interface Paginated {
  items: unknown[]
  total: number
  skip: number
  limit: number
}

function asPaginated(body: unknown): Paginated | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Partial<Paginated>
  if (!Array.isArray(b.items) || typeof b.total !== 'number') return null
  return { items: b.items, total: b.total, skip: b.skip ?? 0, limit: b.limit ?? b.items.length }
}

export function createMissionEventsSource(config: MissionEventsConfig): EventsSource {
  const baseUrl = config.baseUrl.replace(/\/+$/, '')
  const doFetch = config.fetchImpl ?? globalThis.fetch
  const now = config.now ?? (() => new Date())
  const ttl = config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
  const rangeCache = new Map<string, { at: number; result: EventsRangeResult }>()
  let outletsCache: { at: number; outlets: EventsOutlet[] } | null = null

  async function getJson(path: string): Promise<unknown> {
    let res: Response
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        headers: { accept: 'application/json', 'X-Service-Key': config.serviceKey },
      })
    } catch (cause) {
      throw new EventsUnavailableError(
        `Mission Events could not be reached: ${cause instanceof Error ? cause.message : 'unknown transport failure'}`,
      )
    }
    // 401/403 is a settings problem, and retrying will not fix it — kept apart
    // from the transient failures below for that reason. On production a 403
    // means *our key is wrong*: Mission Events confirmed on 30 September that
    // its org id is configured there, so the other cause is ruled out. On
    // staging a 403 can still mean their org id is missing, so check with them
    // before rotating a staging key.
    if (res.status === 403 || res.status === 401) {
      throw new EventsUnauthorizedError(
        `Mission Events refused the service key (HTTP ${res.status})`,
      )
    }
    // 422 means we sent a range it will not answer — reversed, or over 93 days.
    // A caller bug, but it arrives here, so it is named rather than swallowed.
    if (res.status === 422) {
      throw new EventsUnavailableError(
        'Mission Events refused the range (reversed, or over 93 days)',
      )
    }
    if (!res.ok) {
      throw new EventsUnavailableError(`Mission Events answered HTTP ${res.status}`)
    }
    try {
      return await res.json()
    } catch {
      throw new EventsUnavailableError('Mission Events answered with a body that is not JSON')
    }
  }

  /**
   * Reads every page.
   *
   * **Every list endpoint there paginates**, and a client that read page one
   * and stopped would draw a month that looked complete and was not — the worst
   * shape of wrong for a calendar. The loop is bounded so a `total` that never
   * agrees with the pages cannot spin forever.
   */
  async function readAllPages(path: string, query: string): Promise<unknown[]> {
    const rows: unknown[] = []
    let skip = 0
    for (let guard = 0; guard < 40; guard += 1) {
      const sep = query === '' ? '' : '&'
      const body = await getJson(`${path}?${query}${sep}skip=${skip}&limit=${MAX_PAGE}`)
      const page = asPaginated(body)
      if (!page)
        throw new EventsUnavailableError('Mission Events answered with an unexpected shape')
      rows.push(...page.items)
      skip += page.items.length
      // Their own stopping rule. `items.length === 0` also breaks, or a `total`
      // larger than the rows available would loop to the guard.
      if (page.items.length === 0 || skip >= page.total) break
    }
    return rows
  }

  return {
    async listRange({ from, to }: EventsRangeQuery): Promise<EventsRangeResult> {
      const key = `${from}..${to}`
      const hit = rangeCache.get(key)
      const nowMs = now().getTime()
      if (hit && nowMs - hit.at < ttl) return hit.result

      const statuses = REQUESTED_STATUSES.map((s) => `status=${s}`).join('&')
      const rows = await readAllPages(
        '/api/v1/internal/marketing/events',
        `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&${statuses}`,
      )

      const at = now()
      const events = (rows as SourceEvent[])
        .map((row) => toExternalEvent(row, at))
        .filter((e): e is ExternalEvent => e !== null)

      const result: EventsRangeResult = { events }
      rangeCache.set(key, { at: nowMs, result })
      return result
    },

    async listOutlets(): Promise<EventsOutlet[]> {
      const nowMs = now().getTime()
      if (outletsCache && nowMs - outletsCache.at < OUTLETS_CACHE_TTL_MS) {
        return outletsCache.outlets
      }
      const rows = await readAllPages('/api/v1/internal/marketing/outlets', '')
      const outlets = (rows as { id?: unknown; slug?: unknown; name?: unknown }[])
        .map((row) => {
          const id = asString(row.id)
          const slug = asString(row.slug)
          const name = asString(row.name)
          return id && slug ? { id, slug, name: name ?? slug } : null
        })
        .filter((o): o is EventsOutlet => o !== null)
      outletsCache = { at: nowMs, outlets }
      return outlets
    },
  }
}
