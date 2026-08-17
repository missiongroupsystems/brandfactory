import type {
  BrandGuidelineSection,
  BrandWithSections,
  ResearchJobSummary,
} from "@brandfactory/shared";
import { describe, expect, it } from "vitest";

import { toBrandProfile } from "./map";

/**
 * The mapper, which is where the page stops being a page and starts being the brand.
 *
 * Three rules are asserted here because none of them can be seen from a component: an instant
 * becomes the day the *server* named, a research date belongs only to a run that finished, and
 * the section kind comes from `shared` rather than from a second opinion held here.
 */

function section(over: Record<string, unknown> = {}): BrandGuidelineSection {
  return {
    id: "s1",
    brandId: "b1",
    label: "Voice & tone",
    body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Warm." }] }] },
    priority: 100,
    createdBy: "user",
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-12T09:00:00.000Z",
    ...over,
  } as unknown as BrandGuidelineSection;
}

function brand(over: Record<string, unknown> = {}): BrandWithSections {
  return {
    id: "b1",
    workspaceId: "w1",
    name: "Harbour Table",
    description: null,
    websiteUrl: "https://harbourtable.sg",
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-08-14T09:00:00.000Z",
    sections: [section()],
    ...over,
  } as unknown as BrandWithSections;
}

function job(over: Record<string, unknown> = {}): ResearchJobSummary {
  return {
    id: "j1",
    status: "COMPLETED",
    startedAt: "2026-08-10T09:00:00.000Z",
    completedAt: "2026-08-10T09:12:00.000Z",
    error: null,
    drafts: [],
    sourceCount: 14,
    ...over,
  } as unknown as ResearchJobSummary;
}

describe("toBrandProfile", () => {
  it("carries the brand's own fields across", () => {
    const profile = toBrandProfile(brand({ description: "Seafood, plainly done" }), null);
    expect(profile.id).toBe("b1");
    expect(profile.name).toBe("Harbour Table");
    expect(profile.description).toBe("Seafood, plainly done");
    expect(profile.websiteUrl).toBe("https://harbourtable.sg");
  });

  it("truncates an instant to the day the server named", () => {
    // Never parsed into a `Date`: 02:00 UTC is the previous day in New York, so a section edited
    // early would be dated yesterday for half the readers. Same rule as `lib/format.ts`.
    const profile = toBrandProfile(
      brand({
        updatedAt: "2026-08-14T02:00:00.000Z",
        sections: [section({ updatedAt: "2026-08-12T23:30:00.000Z" })],
      }),
      null,
    );
    expect(profile.updatedAt).toBe("2026-08-14");
    expect(profile.sections[0]?.updatedAt).toBe("2026-08-12");
  });

  it("flattens each section body and keeps its author", () => {
    const profile = toBrandProfile(brand({ sections: [section({ createdBy: "agent" })] }), null);
    expect(profile.sections[0]?.blocks).toEqual([{ kind: "paragraph", text: "Warm." }]);
    expect(profile.sections[0]?.createdBy).toBe("agent");
  });

  it("takes the section kind from the shared taxonomy", () => {
    const profile = toBrandProfile(
      brand({
        sections: [
          section({ id: "s1", label: "TL;DR" }),
          section({ id: "s2", label: "Voice & tone" }),
          section({ id: "s3", label: "Our Friday ritual" }),
        ],
      }),
      null,
    );
    // `synthesis` reads across the brand; `aspect` describes one facet — and a label the product
    // never proposed falls back to `aspect` rather than being rejected.
    expect(profile.sections.map((s) => s.kind)).toEqual(["synthesis", "aspect", "aspect"]);
  });

  it("keeps every section, written or not, in the order the API returned them", () => {
    const profile = toBrandProfile(
      brand({
        sections: [
          section({ id: "s1", label: "Target audience", body: { type: "doc", content: [{ type: "paragraph" }] } }),
          section({ id: "s2", label: "Voice & tone" }),
        ],
      }),
      null,
    );
    // An empty row is a real state the product creates on purpose, and `blocks: []` is it.
    expect(profile.sections.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(profile.sections[0]?.blocks).toEqual([]);
  });

  it("dates the research line from a finished run", () => {
    expect(toBrandProfile(brand(), job()).research).toEqual({ completedAt: "2026-08-10" });
    // A success that found nothing is still a run that ran.
    expect(toBrandProfile(brand(), job({ status: "NO_FINDINGS" })).research).toEqual({
      completedAt: "2026-08-10",
    });
  });

  it("says nothing about research that did not finish", () => {
    expect(toBrandProfile(brand(), null).research).toBeNull();
    expect(toBrandProfile(brand(), undefined).research).toBeNull();
    expect(toBrandProfile(brand(), job({ status: "IN_PROGRESS", completedAt: null })).research).toBeNull();
    // The status is tested as well as the field, so a stray timestamp on a failed row cannot
    // claim a run that produced nothing.
    expect(toBrandProfile(brand(), job({ status: "FAILED" })).research).toBeNull();
    expect(toBrandProfile(brand(), job({ status: "CANCELLED" })).research).toBeNull();
  });

  it("leaves the asset-backed fields empty, and does not pretend otherwise", () => {
    const profile = toBrandProfile(brand(), null);
    expect(profile.colours).toEqual([]);
    expect(profile.typefaces).toEqual([]);
  });

  it("maps a brand with no sections at all", () => {
    // The near-empty brand — the normal starting state, and the one most easily handled badly.
    const profile = toBrandProfile(brand({ sections: [], description: null }), null);
    expect(profile.sections).toEqual([]);
    expect(profile.description).toBeNull();
  });
});
