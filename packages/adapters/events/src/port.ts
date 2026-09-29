import type { ExternalEvent } from '@brandfactory/shared'

// ---------------------------------------------------------------------------
// The events port — one method, because the calendar asks one question
// ---------------------------------------------------------------------------
//
// The sixth adapter, following auth / storage / realtime / llm / research, and
// the first that reads another product's data rather than a vendor's service.
//
// **BrandFactory keeps no copy of an event.** The content calendar asks for the
// months it is drawing and renders what comes back; nothing is written to our
// database, and there is no sync, no cursor and no reconcile. That is not
// laziness, it is the only correct design available: in Mission Events a delete
// is soft, a soft delete does not bump `updated_at`, and no endpoint reports
// tombstones. A copy here could therefore never learn that an event had gone —
// it would show a cancelled party until somebody noticed. A read-through is
// right on the next read, for free.
//
// The cost of that choice is latency and a rate limit, which the caching
// implementation absorbs, and the benefit is that the hardest class of bug in
// this integration cannot be written.

/**
 * A date range, as **Singapore calendar days**, both ends inclusive.
 *
 * The timezone is the contract, not a detail: Mission Events stores naive UTC
 * and filters on Singapore days, so an all-day event on 1 October is stored
 * `2026-09-30T16:00:00`. A caller that sent UTC days would ask for the wrong
 * window and place the answers in the wrong cells.
 *
 * A range, not a month, because a month grid draws days either side of its own
 * month — asking per month meant three calls for one screen.
 */
export interface EventsRangeQuery {
  /** `YYYY-MM-DD`, Singapore. */
  from: string
  /** `YYYY-MM-DD`, Singapore. Inclusive. */
  to: string
}

/**
 * The longest range the source will answer, in days.
 *
 * Stated here as well as enforced there: a caller that learns the limit from a
 * 422 learns it in production, and the one screen that asks is a month grid of
 * at most 42 days.
 */
export const EVENTS_MAX_RANGE_DAYS = 93

/**
 * What a finder answers with.
 *
 * `events` is everything the source returned for the window, **unfiltered by
 * brand**: the mapping from an outlet to a BrandFactory brand lives in our
 * database, not in the source, so the route joins and this port does not.
 */
export interface EventsRangeResult {
  events: ExternalEvent[]
}

/**
 * An outlet as the source knows it — a *concept* in its vocabulary, where an
 * event names an outlet and no brand entity exists at all.
 *
 * Read so a person can set `brands.events_outlet_id` against a name rather
 * than a bare uuid. **Nothing maps automatically**: six of seven brands match
 * by slug today, and the seventh wrong match puts another brand's parties on
 * this brand's calendar.
 */
export interface EventsOutlet {
  id: string
  slug: string
  name: string
}

/**
 * Read-only, by construction. There is no `create`, no `update` and no
 * `delete`, and there never should be: Mission Events owns this data.
 */
export interface EventsSource {
  listRange(query: EventsRangeQuery): Promise<EventsRangeResult>
  /** Active outlets, for the brand mapping. */
  listOutlets(): Promise<EventsOutlet[]>
}

/**
 * The source is configured but refused us.
 *
 * Separate from a transport failure because the operator response differs: a
 * revoked or mistyped share-link token is a settings problem somebody must go
 * and fix, and it will not recover on its own no matter how long the calendar
 * retries.
 */
export class EventsUnauthorizedError extends Error {
  constructor(message = 'The Mission Events share link was refused') {
    super(message)
    this.name = 'EventsUnauthorizedError'
  }
}

/**
 * The source is configured and did not answer usefully — a network failure, a
 * 5xx, a rate-limit refusal, or a body that is not the shape we parse.
 *
 * **The calendar treats this as "events unavailable", never as "no events".**
 * An empty grid and a broken feed look identical to a reader, and only one of
 * them means they can stop worrying about the shoot on Friday.
 */
export class EventsUnavailableError extends Error {
  constructor(message = 'Mission Events could not be reached') {
    super(message)
    this.name = 'EventsUnavailableError'
  }
}
