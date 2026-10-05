import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CalendarEvent, CalendarEventsResult } from "../api";
import { useCalendarMonth } from "../hooks";
import { CalendarView } from "./calendar-view";

vi.mock("../hooks", () => ({
  useCalendarMonth: vi.fn(),
  useCalendarMutations: () => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), restore: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./entry-form", () => ({ EntryForm: () => null }));

const mockedUseCalendarMonth = vi.mocked(useCalendarMonth);

/**
 * The one screen test on this calendar, and the reason it exists is worth
 * stating: `CLAUDE.md` keeps `web-next` tests off the screens because a browser
 * pass covers them, and the pure logic lives in `grid.ts`. This change is a
 * `<div>` becoming a `<button>` — there is no pure logic to extract, and the
 * browser pass could not be run (the events feed is production-only
 * configuration). So the assertion lives here instead of nowhere.
 */
function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  // Today, so it lands in the month the screen opens on.
  const d = new Date();
  const iso = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 19, 0).toISOString();
  return {
    id: "e1",
    name: "Lunar New Year dinner",
    outletName: "Casa Vostra Tanjong Pagar",
    roomName: null,
    start: iso,
    end: iso,
    allDay: false,
    status: "confirmed",
    guestCount: 40,
    brandId: "b1",
    ...overrides,
  } as CalendarEvent;
}

function result(events: CalendarEvent[]): CalendarEventsResult {
  return { events, configured: true, unmappedOutlets: 0 } as CalendarEventsResult;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseCalendarMonth.mockReturnValue({
    entries: [],
    events: result([event()]),
    isLoading: false,
    entriesError: undefined,
    eventsError: undefined,
  });
});

function renderView() {
  return render(<CalendarView workspaceId="w1" brands={[{ id: "b1", name: "Casa Vostra" }]} />);
}

describe("an event on the month grid", () => {
  it("is a button, not an inert chip", () => {
    // The defect this change fixes: it was a `<div>` carrying a Link2 icon,
    // between entry chips that are real buttons, so it promised a destination
    // twice over and had none.
    renderView();
    const chip = screen.getByRole("button", { name: /Lunar New Year dinner/ });
    expect(chip).toBeTruthy();
  });

  it("opens the day plan, where the booking's detail already lived", () => {
    renderView();
    // The day plan is absent until a day is selected.
    expect(screen.queryByText(/the events module owns this booking/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Lunar New Year dinner/ }));
    // The card names the outlet and says who owns the booking.
    expect(screen.getByText(/the events module owns this booking/i)).toBeTruthy();
    expect(screen.getAllByText(/Casa Vostra Tanjong Pagar/).length).toBeGreaterThan(0);
  });

  it("keeps the event name as its accessible name", () => {
    // An `aria-label` would replace it and announce every chip in the month
    // identically — the lesson `CellTrigger` records.
    renderView();
    const chip = screen.getByRole("button", { name: /Lunar New Year dinner/ });
    expect(chip.getAttribute("aria-label")).toBeNull();
    expect(chip.textContent).toContain("Lunar New Year dinner");
  });

  it("still draws a tentative booking dashed", () => {
    // Unchanged by making it clickable: a solid chip would let somebody plan a
    // shoot around a booking nobody has confirmed.
    mockedUseCalendarMonth.mockReturnValue({
      entries: [],
      events: result([event({ status: "tentative" })]),
      isLoading: false,
      entriesError: undefined,
      eventsError: undefined,
    });
    renderView();
    const chip = screen.getByRole("button", { name: /Lunar New Year dinner/ });
    expect(chip.className).toContain("border-dashed");
  });
});
