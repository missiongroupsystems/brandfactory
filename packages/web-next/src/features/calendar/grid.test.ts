import type { SocialPost } from "@brandfactory/shared";
import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "./api";
import {
  entriesByDay,
  eventsByDay,
  gridRange,
  isEmptySlot,
  monthGridDays,
  shiftMonth,
  summarise,
} from "./grid";

// Every assertion here is timezone-agnostic: dates are built with the local
// `Date` constructor and compared to local day keys, which is what the grid
// itself does.

function entry(over: Partial<SocialPost> = {}): SocialPost {
  return {
    id: "sp-1" as SocialPost["id"],
    brandId: "br-1" as SocialPost["brandId"],
    kind: "post",
    platform: "instagram",
    scheduledAt: new Date(2026, 9, 20, 10, 0).toISOString(),
    body: "",
    status: "idea",
    createdBy: "user",
    format: null,
    hook: null,
    dish: null,
    talent: null,
    filmedBy: null,
    canvaUrl: null,
    shootId: null,
    eventsEventId: null,
    approvedAt: null,
    approvedBy: null,
    clearedWith: null,
    assetIds: [],
    deletedAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...over,
  };
}

function event(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "F1 terrace night",
    status: "confirmed",
    eventType: "private",
    start: new Date(2026, 9, 9, 19, 0).toISOString(),
    end: new Date(2026, 9, 9, 23, 0).toISOString(),
    allDay: false,
    outletId: "22222222-2222-4222-8222-222222222222",
    outletName: "temper. Duxton",
    roomName: null,
    brandId: "br-1",
    ...over,
  };
}

describe("monthGridDays", () => {
  it("starts on the Monday before the 1st and fills whole weeks", () => {
    // 1 October 2026 is a Thursday, so the grid opens on Monday 28 September.
    const days = monthGridDays(2026, 9);
    expect(days.length % 7).toBe(0);
    expect(days[0]?.getDay()).toBe(1);
    expect(days[0]?.getDate()).toBe(28);
    expect(days[0]?.getMonth()).toBe(8);
  });

  it("covers every day of the month it is asked for", () => {
    const own = monthGridDays(2026, 9).filter((d) => d.getMonth() === 9);
    expect(own).toHaveLength(31);
  });

  // A month that begins on a Monday needs no leading days, which is the case
  // most likely to be off by seven.
  it("adds no leading week when the 1st is already a Monday", () => {
    const days = monthGridDays(2026, 5); // 1 June 2026 is a Monday
    expect(days[0]?.getDate()).toBe(1);
  });
});

describe("shiftMonth", () => {
  it("wraps forward across the year boundary", () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
  });

  it("wraps backward across the year boundary", () => {
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });
});

describe("gridRange", () => {
  // The reads must cover the whole grid, not the month: an event in the first
  // or last row is as real as one in the middle, and asking for the month
  // alone is the off-by-one nobody sees.
  it("spans the grid's own first and last cell, not the month's", () => {
    expect(gridRange(2026, 9)).toEqual({ from: "2026-09-28", to: "2026-11-01" });
  });
});

describe("entriesByDay", () => {
  it("buckets by the reader's local day", () => {
    const byDay = entriesByDay([entry()]);
    expect(byDay.get("2026-10-20")).toHaveLength(1);
  });

  it("leaves an unscheduled entry out rather than filing it under a key", () => {
    expect(entriesByDay([entry({ scheduledAt: null })]).size).toBe(0);
  });
});

describe("eventsByDay", () => {
  it("puts a single evening booking in one cell", () => {
    const byDay = eventsByDay([event()]);
    expect(byDay.get("2026-10-09")).toHaveLength(1);
    expect(byDay.size).toBe(1);
  });

  // A ten-day festival that appeared only on the day it began would be absent
  // from the nine cells a reader is actually planning around.
  it("repeats a multi-day event in every cell it covers", () => {
    const byDay = eventsByDay([
      event({
        start: new Date(2026, 9, 2, 0, 0).toISOString(),
        end: new Date(2026, 9, 11, 23, 59).toISOString(),
        allDay: true,
      }),
    ]);
    expect(byDay.size).toBe(10);
    expect(byDay.get("2026-10-02")).toHaveLength(1);
    expect(byDay.get("2026-10-11")).toHaveLength(1);
  });

  it("truncates a range long enough to flood the grid", () => {
    const byDay = eventsByDay([
      event({
        start: new Date(2026, 0, 1).toISOString(),
        end: new Date(2027, 0, 1).toISOString(),
      }),
    ]);
    expect(byDay.size).toBe(40);
  });
});

describe("isEmptySlot", () => {
  it("reads a claimed date with nothing in it as a slot", () => {
    expect(isEmptySlot(entry())).toBe(true);
  });

  // A hook with no copy is somebody's half-finished thought, not a gap — and
  // showing it as a gap would tell them to start again.
  it("stops being a slot once anything is written", () => {
    expect(isEmptySlot(entry({ hook: "The pasta pull" }))).toBe(false);
    expect(isEmptySlot(entry({ body: "Draft copy." }))).toBe(false);
    expect(isEmptySlot(entry({ status: "approved" }))).toBe(false);
  });
});

describe("summarise", () => {
  it("counts the pipeline, the shoots, the events and the gaps", () => {
    const s = summarise(
      [
        entry(),
        entry({ kind: "shoot", status: "filming", hook: "Opening night" }),
        entry({ status: "posted", body: "Went out." }),
      ],
      [event()],
    );
    expect(s).toMatchObject({ entries: 3, shoots: 1, events: 1, emptySlots: 1 });
    expect(s.byStatus).toEqual({ idea: 1, approved: 0, filming: 1, editing: 0, posted: 1 });
  });
});
