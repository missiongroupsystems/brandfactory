import type { ExternalEvent, SocialPost } from "@brandfactory/shared";

import { bf, callJson } from "@/lib/api/bf-client";

/**
 * The content calendar's two reads.
 *
 * **They are separate services because they have separate owners.** The entries are rows in this
 * product's database and a post edit invalidates them. The events belong to Mission Events, are
 * never written here, and are re-fetched on their own schedule. Folding them into one call would
 * mean every copy change re-asked another product for a month it already had, and a Mission Events
 * outage would take the calendar's own posts down with it.
 */

/** An event, plus the brand of *this* workspace its outlet maps to. */
export type CalendarEvent = ExternalEvent & { brandId: string };

export interface CalendarEventsResult {
  events: CalendarEvent[];
  /**
   * How many events were dropped because their outlet maps to no brand here.
   *
   * Rendered, not swallowed: an unmapped outlet is a setting somebody has to fix, and the
   * alternative is an event that silently never appears on a grid people are trusting.
   */
  unmappedOutlets: number;
  /**
   * Whether a real source is behind the port.
   *
   * The screen needs this to say *the events layer is off* rather than *the events team has
   * nothing booked*. The two look identical on a grid and mean opposite things.
   */
  configured: boolean;
}

export const calendarService = {
  /**
   * Scheduled posts and shoots across every brand, for a day range.
   *
   * Unscheduled entries are deliberately absent — a grid cannot draw a dateless idea, and the
   * per-brand tray is where those live.
   */
  listEntries: async (workspaceId: string, from: string, to: string): Promise<SocialPost[]> =>
    callJson<SocialPost[]>(
      await bf.workspaces[":workspaceId"].calendar.entries.$get({
        param: { workspaceId },
        query: { from, to },
      }),
    ),

  listEvents: async (
    workspaceId: string,
    from: string,
    to: string,
  ): Promise<CalendarEventsResult> =>
    callJson<CalendarEventsResult>(
      await bf.workspaces[":workspaceId"].calendar.events.$get({
        param: { workspaceId },
        query: { from, to },
      }),
    ),
};
