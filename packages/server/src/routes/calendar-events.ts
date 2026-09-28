import { WorkspaceIdSchema } from '@brandfactory/shared'
import type { ExternalEvent } from '@brandfactory/shared'
import { EventsUnauthorizedError, EventsUnavailableError } from '@brandfactory/adapter-events'
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

/**
 * The months a `[from, to]` day range touches, inclusive of both ends.
 *
 * The source answers one month at a time, and the calendar's month grid always
 * shows a few days of the month either side — so a "September" screen genuinely
 * needs August and October too. Exported for its test: an off-by-one here is a
 * silently missing event on the first or last row of the grid, which is the
 * one place a reader is least likely to notice it.
 */
export function monthsBetween(from: string, to: string): { year: number; month: number }[] {
  const [fy, fm] = from.split('-').map(Number) as [number, number]
  const [ty, tm] = to.split('-').map(Number) as [number, number]
  const out: { year: number; month: number }[] = []
  let year = fy
  let month = fm
  // The cap is a guard, not a product rule: three months covers any month grid
  // and a generous week view, and a caller asking for a decade would otherwise
  // spend the share link's whole rate limit in one request.
  while ((year < ty || (year === ty && month <= tm)) && out.length < 6) {
    out.push({ year, month })
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return out
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

  return new Hono<AppEnv>().get(
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

      let months: { events: ExternalEvent[] }[]
      try {
        months = await Promise.all(monthsBetween(from, to).map((m) => deps.events.listMonth(m)))
      } catch (err) {
        // The distinction matters to whoever has to fix it: a refused share
        // link is somebody's settings and will not recover on its own, while
        // an unreachable source is worth another look in a minute. Neither is
        // an empty month — a calendar that drew "no events" for a broken feed
        // would tell a reader to stop worrying about Friday.
        if (err instanceof EventsUnauthorizedError) {
          throw new HttpError(502, 'EVENTS_UNAUTHORIZED', 'Mission Events refused the share link')
        }
        if (err instanceof EventsUnavailableError) {
          throw new HttpError(502, 'EVENTS_UNAVAILABLE', 'Mission Events could not be reached')
        }
        throw err
      }

      // One event can be returned by two adjacent months; the id de-duplicates.
      const seen = new Set<string>()
      const events: (ExternalEvent & { brandId: string })[] = []
      let unmappedOutlets = 0
      for (const month of months) {
        for (const event of month.events) {
          if (seen.has(event.id)) continue
          seen.add(event.id)
          const brandId = brandByOutlet.get(event.outletId)
          if (!brandId) {
            unmappedOutlets += 1
            continue
          }
          events.push({ ...event, brandId })
        }
      }

      // `configured` is what lets the screen say *the events layer is off*
      // rather than *the events team has nothing booked*. The two look
      // identical on a grid and mean opposite things.
      return c.json({ events, unmappedOutlets, configured: deps.eventsConfigured })
    },
  )
}
