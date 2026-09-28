import type { SocialPost } from "@brandfactory/shared";
import { describe, expect, it } from "vitest";

import { entriesToCsv, exportFilename } from "./csv";

function entry(over: Partial<SocialPost> = {}): SocialPost {
  return {
    id: "sp-1" as SocialPost["id"],
    brandId: "br-1" as SocialPost["brandId"],
    kind: "post",
    platform: "instagram",
    scheduledAt: new Date(2026, 9, 20, 10, 30).toISOString(),
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

const name = () => "Casa Vostra";
const rowsOf = (csv: string) => csv.split("\r\n");

describe("entriesToCsv", () => {
  it("writes a header and one row per entry", () => {
    const rows = rowsOf(entriesToCsv([entry(), entry()], name));
    expect(rows[0]).toMatch(/^Date,Time,Brand,Entry,Platform,Format,Hook,Dish,On camera,Filming,/);
    expect(rows).toHaveLength(3);
  });

  it("splits the slot into a local date and a local time", () => {
    const row = rowsOf(entriesToCsv([entry()], name))[1]!;
    expect(row.startsWith("2026-10-20,10:30,Casa Vostra,Post,Instagram")).toBe(true);
  });

  it("leaves the platform blank on a shoot, because a shoot has no destination", () => {
    const row = rowsOf(entriesToCsv([entry({ kind: "shoot" })], name))[1]!;
    expect(row).toContain(",Shoot,,");
  });

  // A hook with a comma in it is not an edge case, it is Tuesday.
  it("quotes a field holding a comma, and doubles an inner quote", () => {
    const row = rowsOf(entriesToCsv([entry({ hook: 'Coals catching, and the "pass" fills' })], name))[1]!;
    expect(row).toContain('"Coals catching, and the ""pass"" fills"');
  });

  it("keeps a newline inside copy rather than joining two sentences", () => {
    const csv = entriesToCsv([entry({ body: "Line one.\nLine two." })], name);
    expect(csv).toContain('"Line one.\nLine two."');
  });

  // A spreadsheet evaluates a leading =, +, - or @. That is an attack on
  // whoever opens the file, and far more often it is a hook beginning with a
  // dash rendering as #NAME? instead of as words.
  it.each(["=SUM(A1)", "+1 to that", "-Ten minutes", "@everyone"])(
    "defuses a field starting with %s",
    (hook) => {
      const row = rowsOf(entriesToCsv([entry({ hook })], name))[1]!;
      expect(row).toContain(`\t${hook}`);
    },
  );

  it("leaves an ordinary field untouched", () => {
    const row = rowsOf(entriesToCsv([entry({ hook: "The pasta pull" })], name))[1]!;
    expect(row).toContain(",The pasta pull,");
    expect(row).not.toContain("\tThe pasta pull");
  });

  it("writes an empty cell for a field nobody filled in", () => {
    const row = rowsOf(entriesToCsv([entry()], name))[1]!;
    // Format, Hook, Dish, On camera, Filming are all null on this fixture.
    expect(row).toContain(",,,,,");
  });

  it("writes an unscheduled entry with no date rather than inventing one", () => {
    const row = rowsOf(entriesToCsv([entry({ scheduledAt: null })], name))[1]!;
    expect(row.startsWith(",,Casa Vostra,")).toBe(true);
  });
});

describe("exportFilename", () => {
  it("names the brand and the range", () => {
    expect(exportFilename("Casa Vostra", "2026-10-01", "2026-10-31")).toBe(
      "Casa Vostra — content calendar 2026-10-01 to 2026-10-31.csv",
    );
  });

  it("replaces characters a filesystem will not take", () => {
    expect(exportFilename("Food/Drink: the brand", "2026-10-01", "2026-10-31")).toBe(
      "Food-Drink- the brand — content calendar 2026-10-01 to 2026-10-31.csv",
    );
  });
});
