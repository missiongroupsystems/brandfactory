"use client";

import type { SocialPost } from "@brandfactory/shared";
import * as React from "react";
import useSWR from "swr";

import { SCOPES } from "@/lib/api/cache";

import { type CalendarEventsResult, calendarService } from "./api";
import { gridRange } from "./grid";

/**
 * A month of the content calendar: this product's entries, and the events team's bookings.
 *
 * **Two SWR keys, not one.** The entries are ours and a write invalidates them; the events belong
 * to Mission Events and are re-read on their own schedule. One key would make every copy edit
 * re-ask another product for a month it already has — and would let a Mission Events outage take
 * this brand's own posts off the screen, which is the opposite of what a read-through is for.
 *
 * Both are asked for the **grid's** range rather than the month's, so an event in the first or last
 * row is as present as one in the middle.
 */
export function useCalendarMonth(
  workspaceId: string | undefined,
  year: number,
  month: number,
): {
  entries: SocialPost[];
  events: CalendarEventsResult | undefined;
  isLoading: boolean;
  entriesError: unknown;
  /** Kept apart from `entriesError`: a dead events feed must not blank the posts. */
  eventsError: unknown;
} {
  const { from, to } = React.useMemo(() => gridRange(year, month), [year, month]);

  const entries = useSWR<SocialPost[]>(
    workspaceId ? [SCOPES.bfCalendarEntries, workspaceId, from, to] : null,
    () => calendarService.listEntries(workspaceId!, from, to),
    { revalidateOnFocus: false },
  );

  const events = useSWR<CalendarEventsResult>(
    workspaceId ? [SCOPES.bfCalendarEvents, workspaceId, from, to] : null,
    () => calendarService.listEvents(workspaceId!, from, to),
    {
      revalidateOnFocus: false,
      // The events layer is a read-through to another product. One failed month
      // must not retry in a loop against a rate-limited share link.
      shouldRetryOnError: false,
    },
  );

  return {
    entries: entries.data ?? [],
    events: events.data,
    // Only the entries gate the screen. The calendar is this team's own plan
    // first; the events are an enrichment, and waiting on another product to
    // answer before drawing a single post would make their tool feel like it
    // belongs to somebody else.
    isLoading: entries.isLoading,
    entriesError: entries.error,
    eventsError: events.error,
  };
}
