import { WorkspaceIdSchema } from '@brandfactory/shared'
import type { ExternalEvent } from '@brandfactory/shared'
import {
  EVENTS_MAX_RANGE_DAYS,
  EventsUnauthorizedError,
  EventsUnavailableError,
} from '@brandfactory/adapter-events'
import type { EventsSource } from '@brandfactory/adapter-events'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireWorkspaceAccess } from '../authz'
import type { AppEnv } from '../context'
import type { Db } from '../db'
import { HttpError, UnauthorizedError } from '../errors'

export interface CalendarEventsDeps {
  db: Db
  events: EventsSource
  /**
   * Whether a real source is behind the port.
   *
   * Passed in rather than sniffed off `events`, because the noop and the real
   * client are the same interface by design and telling them apart at runtime
   * would mean breaking that. `buildAdapters` knows the answer; this route
   * only reports it.
   */
  eventsConfigured: boolean
}

/** Whole days between two day keys, inclusive of both ends. */
export function rangeDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.floor((b - a) / 86_400_000) + 1
}

/**
 * Events from Mission Events, for the content calendar.
 *
 * **Read-through, never stored.** Nothing here writes to our database and
 * nothing caches in it; the adapter holds a short per-month cache and that is
 * the whole of it. A cancelled or deleted event is simply absent from the next
 * read, which is the property a copied table could not have — see the events
 * port for why.
 *
 * **Workspace-scoped, because the mapping is.** An event names an outlet in
 * another product, and `brands.events_outlet_id` is what turns that into a
 * brand of *this* workspace. Events whose outlet maps to no brand here are
 * dropped and counted, so a missing mapping shows up as a number on screen
 * rather than as an event that quietly never appears.
 */
export function createCalendarEventsRouter(deps: CalendarEventsDeps) {
  const WorkspaceParam = z.object({ workspaceId: WorkspaceIdSchema })
  const DayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  const Query = z
    .object({ from: DayKey, to: DayKey })
    .refine((q) => q.from <= q.to, { message: 'from must not be after to' })

  return new Hono<AppEnv>()
    .get(
      '/:workspaceId/calendar/entries',
      zValidator('param', WorkspaceParam),
      zValidator('query', Query),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { workspaceId } = c.req.valid('param')
        await requireWorkspaceAccess(userId, workspaceId, deps.db)
        const { from, to } = c.req.valid('query')
        // Scheduled entries only, across every brand. The unscheduled tray
        // stays a per-brand read: a grid cannot draw a dateless idea, and
        // seven brands' loose thoughts in one list is not a screen anybody
        // asked for.
        const entries = await deps.db.listSocialPostsByWorkspace(workspaceId, from, to)
        return c.json(entries)
      },
    )
    .get(
      '/:workspaceId/calendar/events',
      zValidator('param', WorkspaceParam),
      zValidator('query', Query),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { workspaceId } = c.req.valid('param')
        await requireWorkspaceAccess(userId, workspaceId, deps.db)
        const { from, to } = c.req.valid('query')

        const brands = await deps.db.listBrandsByWorkspace(workspaceId)
        // Outlet id → brand id. Built from what the workspace actually holds, so
        // an event for a concept this workspace has no brand for cannot be
        // attributed to one by accident.
        const brandByOutlet = new Map<string, string>()
        for (const brand of brands) {
          if (brand.eventsOutletId) brandByOutlet.set(brand.eventsOutletId, brand.id)
        }

        // Their own limit is 93 days. Refusing here means a caller learns that
        // from us rather than from a 422 it cannot interpret — and the one
        // screen that asks is a month grid of at most 42 days.
        if (rangeDays(from, to) > EVENTS_MAX_RANGE_DAYS) {
          throw new HttpError(
            400,
            'RANGE_TOO_LONG',
            `from..to must be at most ${EVENTS_MAX_RANGE_DAYS} days`,
          )
        }

        // One call for the whole window: the source takes a range, so a grid
        // no longer costs three round trips.
        let found: { events: ExternalEvent[] }
        try {
          found = await deps.events.listRange({ from, to })
        } catch (err) {
          // The distinction matters to whoever has to fix it: a refused service
          // key is somebody's settings and will not recover on its own, while
          // an unreachable source is worth another look in a minute. Neither is
          // an empty month — a calendar that drew "no events" for a broken feed
          // would tell a reader to stop worrying about Friday.
          if (err instanceof EventsUnauthorizedError) {
            throw new HttpError(
              502,
              'EVENTS_UNAUTHORIZED',
              'Mission Events refused the service key',
            )
          }
          if (err instanceof EventsUnavailableError) {
            throw new HttpError(502, 'EVENTS_UNAVAILABLE', 'Mission Events could not be reached')
          }
          throw err
        }

        const events: (ExternalEvent & { brandId: string })[] = []
        let unmappedOutlets = 0
        for (const event of found.events) {
          const brandId = brandByOutlet.get(event.outletId)
          if (!brandId) {
            unmappedOutlets += 1
            continue
          }
          events.push({ ...event, brandId })
        }

        // `configured` is what lets the screen say *the events layer is off*
        // rather than *the events team has nothing booked*. The two look
        // identical on a grid and mean opposite things.
        return c.json({ events, unmappedOutlets, configured: deps.eventsConfigured })
      },
    )
}
