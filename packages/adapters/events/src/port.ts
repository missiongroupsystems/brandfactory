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

/** A month, as the calendar names it: `month` is **1-based**, unlike `Date`. */
export interface EventsMonthQuery {
  year: number
  /** 1 = January. The wire and the UI both count months from one; only `Date` does not. */
  month: number
}

/**
 * What a finder answers with.
 *
 * `events` is everything the source returned for the window, **unfiltered by
 * brand**: the mapping from an outlet to a BrandFactory brand lives in our
 * database, not in the source, so the route joins and this port does not.
 */
export interface EventsMonthResult {
  events: ExternalEvent[]
}

/**
 * Read-only, by construction. There is no `create`, no `update` and no
 * `delete`, and there never should be: Mission Events owns this data, and the
 * agreed shape of the integration is that BrandFactory hides nothing and
 * enforces nothing — it reads.
 */
export interface EventsSource {
  listMonth(query: EventsMonthQuery): Promise<EventsMonthResult>
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
