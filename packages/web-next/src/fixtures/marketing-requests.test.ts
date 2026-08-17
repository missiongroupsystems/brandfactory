import { beforeEach, describe, expect, it } from "vitest";

import {
  addMarketingRequest,
  listMarketingRequests,
  setMarketingRequestStatus,
} from "./marketing-requests";

/**
 * The sample inbox is the one mutable fixture in the app, which makes it the one that can be
 * *wrong* rather than merely absent. Everything asserted here is invisible to a browser pass in
 * the way that matters: a mis-sorted list still looks like a list, a summary pulled from the
 * wrong key still renders a row, and a status write to a missing id still leaves the table
 * looking correct because SWR revalidates over the top of it.
 *
 * The module holds state across tests on purpose — it is a store, and a suite that reset it
 * would not be testing the thing the screen uses.
 */
describe("the sample request inbox", () => {
  it("lists newest first, so the inbox reads in arrival order", () => {
    const dates = listMarketingRequests().map((row) => row.created_at);
    expect(dates).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
  });

  it("seeds all three rungs, so every status view has rows to show", () => {
    const statuses = new Set(listMarketingRequests().map((row) => row.status));
    expect(statuses).toEqual(new Set(["new", "in_review", "resolved"]));
  });

  it("returns a copy, so a caller sorting the result cannot reorder the store", () => {
    const first = listMarketingRequests();
    first.reverse();
    expect(listMarketingRequests()[0]?.id).not.toBe(first[0]?.id);
  });
});

describe("accepting a request", () => {
  it("pulls the summary, submitter and outlet out of the payload by label", () => {
    const created = addMarketingRequest(
      {
        Summary: "Reprint the loyalty cards",
        "Requested by": "Wei Ling Chua",
        "Requesting outlet": "Kopi & Co — Tanjong Pagar",
        Priority: "Low",
      },
      "2026-08-18T01:00:00Z",
    );

    expect(created.summary).toBe("Reprint the loyalty cards");
    expect(created.submitter).toBe("Wei Ling Chua");
    expect(created.outlet_label).toBe("Kopi & Co — Tanjong Pagar");
    // Everything else stays in the payload for the detail sheet rather than being flattened.
    expect(created.payload.Priority).toBe("Low");
  });

  it("arrives as New, at the top of the list, with a fresh reference", () => {
    const before = listMarketingRequests();
    const created = addMarketingRequest({ Summary: "Second one" }, "2026-08-18T02:00:00Z");

    expect(created.status).toBe("new");
    expect(listMarketingRequests()[0]?.id).toBe(created.id);
    expect(listMarketingRequests()).toHaveLength(before.length + 1);
    expect(before.some((row) => row.reference === created.reference)).toBe(false);
  });

  it("survives a payload with nothing usable in it", () => {
    // The public page posts free text and the mock accepts any object. A row with no summary is
    // visible on screen and therefore findable; a crash in a fixture is neither.
    const created = addMarketingRequest({}, "2026-08-18T03:00:00Z");

    expect(created.summary).toBe("(no summary)");
    expect(created.submitter).toBeNull();
    expect(created.outlet_label).toBeNull();
  });

  it("treats a blank answer as no answer, not as an empty name", () => {
    const created = addMarketingRequest(
      { Summary: "Third", "Requested by": "   " },
      "2026-08-18T04:00:00Z",
    );

    // `""` is truthy enough to render, sorts before every real value and is invisible in a
    // cell — the reason `toNullable` exists on the write side.
    expect(created.submitter).toBeNull();
  });
});

describe("moving a request along the ladder", () => {
  let id: string;

  beforeEach(() => {
    id = addMarketingRequest({ Summary: "A request to move" }, "2026-08-18T05:00:00Z").id;
  });

  it("returns the updated row", () => {
    expect(setMarketingRequestStatus(id, "in_review")?.status).toBe("in_review");
    expect(listMarketingRequests().find((row) => row.id === id)?.status).toBe("in_review");
  });

  it("answers undefined for an id it does not hold, which the mock turns into a 404", () => {
    expect(setMarketingRequestStatus("MR-nope", "resolved")).toBeUndefined();
  });

  it("changes nothing but the status", () => {
    const before = listMarketingRequests().find((row) => row.id === id);
    const after = setMarketingRequestStatus(id, "resolved");

    expect(after).toEqual({ ...before, status: "resolved" });
  });
});
