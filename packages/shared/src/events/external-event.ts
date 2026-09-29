import { z } from 'zod'

// ---------------------------------------------------------------------------
// ExternalEvent — an event as the content calendar draws it
// ---------------------------------------------------------------------------
//
// Mission Events owns these rows. This is the projection BrandFactory reads,
// and it is deliberately smaller than what the source could give: no revenue,
// no ticket price, no client contact, no internal notes, no deposits. A
// marketing calendar needs to know that something is happening, where and when
// — everything else on that record belongs to the events team.
//
// Nothing here is stored. There is no `ExternalEventId` branded type and no
// table, because the id names a row in another product's database; it exists so
// a post can point at an event (`socialPosts.eventsEventId`) and so the client
// can key a list.

/**
 * The three states a marketing reader cares about, which is fewer than the six
 * the source keeps.
 *
 * `inquiry`, `cancelled` and `lost` never arrive: the share link is scoped to
 * exclude them, because an event nobody has agreed to is not something to plan
 * a post around, and a cancelled one should vanish from the grid rather than
 * linger struck through.
 *
 * **`completed` is derived, not copied.** Nothing in Mission Events moves an
 * event to `completed` when its date passes — a person does it by hand, or an
 * order transition does. So a `confirmed` event that finished last month is
 * still `confirmed` at the source, and a calendar that showed it as upcoming
 * would be wrong about the past. The adapter folds it; see `foldStatus`.
 */
export const ExternalEventStatusSchema = z.enum(['tentative', 'confirmed', 'completed'])
export type ExternalEventStatus = z.infer<typeof ExternalEventStatusSchema>

export const ExternalEventSchema = z.object({
  /** The source's row id. A uuid, but not ours, so it carries no brand. */
  id: z.uuid(),
  name: z.string(),
  status: ExternalEventStatusSchema,
  /** The source's own vocabulary (`corporate`, `private`, …), passed through as text. */
  eventType: z.string().nullable(),

  /**
   * Start and end as ISO instants in UTC.
   *
   * The source stores naive timestamps that *hold* UTC and filters on UTC
   * days, which is not the same thing as storing an instant — see
   * `mission-events.ts` for what that costs at a month boundary.
   */
  start: z.iso.datetime(),
  end: z.iso.datetime().nullable(),

  /**
   * **Reported by the source, not inferred here.**
   *
   * The first cut of this adapter inferred it from a midnight start — in UTC,
   * which was wrong twice over. Mission Events stores naive UTC, so an all-day
   * event on 1 October Singapore time is `2026-09-30T16:00:00`: not midnight,
   * and not even the right day. The marker is midnight *Singapore* time, and
   * the source now computes it and sends it.
   */
  allDay: z.boolean(),

  /** The source's outlet — a concept, in its vocabulary. Maps to a brand through `brands.eventsOutletId`. */
  outletId: z.uuid(),
  outletName: z.string(),
  /** The space within the outlet, when the source names one. */
  roomName: z.string().nullable(),

  /**
   * Expected heads, when the events team has recorded a number.
   *
   * The one figure on that record a marketing reader has a use for — a shoot
   * planned around a 200-person party is a different shoot from one around a
   * table of eight. Everything else on the booking (revenue, pricing,
   * deposits, the client) is excluded by the endpoint and should stay that way.
   */
  guestCount: z.number().int().nullable(),
})
export type ExternalEvent = z.infer<typeof ExternalEventSchema>
